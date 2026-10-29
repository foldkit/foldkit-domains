import {
  Array,
  Clock,
  Context,
  Effect,
  Fiber,
  Layer,
  MutableHashMap,
  Number,
  Option,
  Order,
  Schema,
  Semaphore,
  pipe,
} from 'effect'

import type { DurableObjectStorage } from '@cloudflare/workers-types'

import { Domain } from '../shared/domain'
import { SearchError } from '../shared/domainsRpc'
import { type CoordinatedSearch, CoordinatedSearchClient } from './coordination'
import { recordSearchCacheResult, timeSearchPhase } from './searchTiming'

const DOMAIN_RESULTS_TTL_MILLISECONDS = 60_000
const MAX_CACHED_RANGES = 100
const MAX_PENDING_RANGES = 16
const MAX_WAITERS_PER_RANGE = 1000

const CachedDomainResults = Schema.Struct({
  expiresAt: Schema.Number,
  domains: Schema.Array(Domain),
})
type CachedDomainResults = typeof CachedDomainResults.Type

type PendingSearch = Readonly<{
  fiber: Fiber.Fiber<ReadonlyArray<Domain>, SearchError>
  waiterCount: number
}>

export class DomainSearch extends Context.Service<
  DomainSearch,
  {
    readonly search: (
      query: CoordinatedSearch,
    ) => Effect.Effect<ReadonlyArray<Domain>, SearchError>
    readonly expireCachedDomains: Effect.Effect<void>
  }
>()('domains/DomainSearch') {}

export const makeDomainSearchLayer = (storage: DurableObjectStorage) =>
  Layer.effect(
    DomainSearch,
    Effect.gen(function* () {
      const client = yield* CoordinatedSearchClient
      // NOTE: Effect 4 HashMap hashes stored values; live Fiber handles need identity storage.
      const pendingSearches = yield* Effect.sync(() =>
        MutableHashMap.empty<string, PendingSearch>(),
      )
      const acquisitionLock = yield* Semaphore.make(1)
      const storageLock = yield* Semaphore.make(1)

      const saveDomains = (key: string, domains: ReadonlyArray<Domain>) =>
        storageLock
          .withPermit(
            Effect.gen(function* () {
              const nowMillis = yield* Clock.currentTimeMillis
              const entries = yield* Effect.promise(() =>
                storage.list<CachedDomainResults>(),
              )
              const expiredKeys = pipe(
                Array.fromIterable(entries),
                Array.filter(([, entry]) => entry.expiresAt <= nowMillis),
                Array.map(([entryKey]) => entryKey),
              )
              const maybeOldestKey = pipe(
                Array.fromIterable(entries),
                Array.filter(([, entry]) => entry.expiresAt > nowMillis),
                Array.sort(
                  Order.mapInput(Number.Order, ([, entry]) => entry.expiresAt),
                ),
                Array.head,
                Option.map(([entryKey]) => entryKey),
                Option.filter(
                  () => entries.size - expiredKeys.length >= MAX_CACHED_RANGES,
                ),
              )
              const obsoleteKeys = Option.match(maybeOldestKey, {
                onNone: () => expiredKeys,
                onSome: oldestKey => Array.append(expiredKeys, oldestKey),
              })

              if (Array.isArrayNonEmpty(obsoleteKeys)) {
                yield* Effect.promise(() => storage.delete(obsoleteKeys))
              }

              const expiresAt = nowMillis + DOMAIN_RESULTS_TTL_MILLISECONDS
              yield* Effect.promise(() =>
                storage.put(
                  key,
                  CachedDomainResults.make({ expiresAt, domains }),
                ),
              )
              const alarm = yield* Effect.promise(() => storage.getAlarm())

              if (alarm === null || alarm > expiresAt) {
                yield* Effect.promise(() => storage.setAlarm(expiresAt))
              }
            }),
          )
          .pipe(Effect.uninterruptible)

      const acquireSearch = (query: CoordinatedSearch) =>
        acquisitionLock.withPermit(
          Effect.gen(function* () {
            const key = `${query.label}:${query.offset}:${query.limit}`
            const nowMillis = yield* Clock.currentTimeMillis
            const cached = yield* Effect.promise(() =>
              storage.get<unknown>(key),
            )
            const maybeCached =
              Schema.decodeUnknownOption(CachedDomainResults)(cached)

            if (
              Option.isSome(maybeCached) &&
              maybeCached.value.expiresAt > nowMillis
            ) {
              yield* recordSearchCacheResult('cache-hit')
              return {
                key,
                fiber: yield* Effect.forkDetach(
                  Effect.succeed(maybeCached.value.domains),
                ),
              }
            }

            const maybePendingSearch = MutableHashMap.get(pendingSearches, key)

            if (Option.isSome(maybePendingSearch)) {
              const pendingSearch = maybePendingSearch.value
              yield* recordSearchCacheResult('cache-shared')

              if (pendingSearch.waiterCount >= MAX_WAITERS_PER_RANGE) {
                return yield* Effect.fail(
                  SearchError.RateLimited({
                    source: 'Application',
                    retryAfterSeconds: 1,
                  }),
                )
              }

              yield* Effect.sync(() =>
                MutableHashMap.set(pendingSearches, key, {
                  ...pendingSearch,
                  waiterCount: pendingSearch.waiterCount + 1,
                }),
              )
              return { key, fiber: pendingSearch.fiber }
            }

            if (MutableHashMap.size(pendingSearches) >= MAX_PENDING_RANGES) {
              return yield* Effect.fail(
                SearchError.RateLimited({
                  source: 'Application',
                  retryAfterSeconds: 1,
                }),
              )
            }

            yield* recordSearchCacheResult('cache-miss')

            const fiber = yield* Effect.forkDetach(
              client
                .search(query)
                .pipe(
                  Effect.tap(domains =>
                    saveDomains(key, domains).pipe(
                      timeSearchPhase('cache-write'),
                    ),
                  ),
                ),
              { uninterruptible: false },
            )
            yield* Effect.sync(() =>
              MutableHashMap.set(pendingSearches, key, {
                fiber,
                waiterCount: 1,
              }),
            )
            return { key, fiber }
          }),
        )

      const releaseSearch = ({
        key,
        fiber,
      }: Readonly<{ key: string; fiber: PendingSearch['fiber'] }>) =>
        Effect.gen(function* () {
          const isLastWaiter = yield* Effect.sync(() => {
            const maybePendingSearch = MutableHashMap.get(pendingSearches, key)

            if (
              Option.isNone(maybePendingSearch) ||
              maybePendingSearch.value.fiber !== fiber
            ) {
              return false
            }

            const pendingSearch = maybePendingSearch.value

            if (pendingSearch.waiterCount === 1) {
              MutableHashMap.remove(pendingSearches, key)
              return true
            } else {
              MutableHashMap.set(pendingSearches, key, {
                ...pendingSearch,
                waiterCount: pendingSearch.waiterCount - 1,
              })
              return false
            }
          })

          if (isLastWaiter) {
            yield* Fiber.interrupt(fiber)
          }
        })

      const expireCachedDomains = storageLock.withPermit(
        Effect.gen(function* () {
          const nowMillis = yield* Clock.currentTimeMillis
          const entries = yield* Effect.promise(() =>
            storage.list<CachedDomainResults>(),
          )
          const expiredKeys = pipe(
            Array.fromIterable(entries),
            Array.filter(([, entry]) => entry.expiresAt <= nowMillis),
            Array.map(([key]) => key),
          )

          if (Array.isArrayNonEmpty(expiredKeys)) {
            yield* Effect.promise(() => storage.delete(expiredKeys))
          }

          const maybeNextExpiry = pipe(
            Array.fromIterable(entries.values()),
            Array.filter(entry => entry.expiresAt > nowMillis),
            Array.map(entry => entry.expiresAt),
            Array.sort(Number.Order),
            Array.head,
          )

          if (Option.isSome(maybeNextExpiry)) {
            yield* Effect.promise(() => storage.setAlarm(maybeNextExpiry.value))
          }
        }),
      )

      return {
        search: (query: CoordinatedSearch) =>
          Effect.acquireUseRelease(
            acquireSearch(query).pipe(timeSearchPhase('cache')),
            ({ fiber }) => Fiber.join(fiber).pipe(timeSearchPhase('lookup')),
            releaseSearch,
          ),
        expireCachedDomains,
      }
    }),
  )
