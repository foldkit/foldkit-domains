import {
  Array,
  Clock,
  Effect,
  Number,
  Option,
  Order,
  Schema,
  pipe,
} from 'effect'

import type { DurableObjectState } from '@cloudflare/workers-types'

import { Domain } from '../domain'
import { SearchError } from '../domainsRpc'
import {
  type CoordinatedSearch,
  type SearchEnvironment,
  SearchOutcome,
  readCoordinatedSearch,
  respondToCancellation,
  searchObject,
} from './coordination'

const QUOTE_TTL_MILLISECONDS = 60_000
const MAX_CACHED_WINDOWS = 100
const MAX_PENDING_WINDOWS = 16
const MAX_WAITERS_PER_WINDOW = 1000

const CachedQuotes = Schema.Struct({
  expiresAt: Schema.Number,
  domains: Schema.Array(Domain),
})

type PendingSearch = {
  readonly controller: AbortController
  readonly result: Promise<typeof SearchOutcome.Type>
  waiters: number
}

const waitForSearch = (result: PendingSearch['result'], signal: AbortSignal) =>
  new Promise<typeof SearchOutcome.Type>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    const removeListener = () => signal.removeEventListener('abort', abort)

    if (signal.aborted) {
      reject(signal.reason)
    } else {
      signal.addEventListener('abort', abort, { once: true })
      result.then(
        outcome => {
          removeListener()
          resolve(outcome)
        },
        error => {
          removeListener()
          reject(error)
        },
      )
    }
  })

export class DomainSearchCoordinator {
  private readonly state: DurableObjectState
  private readonly environment: SearchEnvironment
  private readonly pending = new Map<string, PendingSearch>()

  constructor(state: DurableObjectState, environment: SearchEnvironment) {
    this.state = state
    this.environment = environment
  }

  fetch(request: Request): Promise<Response> {
    return respondToCancellation(this.respond(request), request.signal)
  }

  private async respond(request: Request): Promise<Response> {
    const decoded = await Effect.runPromise(
      readCoordinatedSearch(request).pipe(Effect.result),
      { signal: request.signal },
    )

    if (decoded._tag === 'Failure') {
      return new Response('Invalid search', { status: 400 })
    }

    const query = decoded.success
    const key = `${query.label}:${query.offset}:${query.limit}`
    const nowMillis = Effect.runSync(Clock.currentTimeMillis)
    const cached = await this.state.storage.get<unknown>(key)
    const maybeCached = Schema.decodeUnknownOption(CachedQuotes)(cached)

    if (Option.isSome(maybeCached) && maybeCached.value.expiresAt > nowMillis) {
      return Response.json(
        SearchOutcome.Success({ domains: maybeCached.value.domains }),
      )
    }

    const existing = this.pending.get(key)

    if (
      (existing === undefined && this.pending.size >= MAX_PENDING_WINDOWS) ||
      (existing !== undefined && existing.waiters >= MAX_WAITERS_PER_WINDOW)
    ) {
      return Response.json(
        SearchOutcome.Failure({
          error: SearchError.RateLimited({
            source: 'Application',
            retryAfterSeconds: 1,
          }),
        }),
      )
    }

    const pending = existing ?? this.startSearch(key, query)
    pending.waiters += 1

    try {
      return Response.json(await waitForSearch(pending.result, request.signal))
    } finally {
      pending.waiters -= 1

      if (pending.waiters === 0 && this.pending.get(key) === pending) {
        this.pending.delete(key)
        pending.controller.abort()
      }
    }
  }

  private startSearch(
    key: string,
    query: typeof CoordinatedSearch.Type,
  ): PendingSearch {
    const controller = new AbortController()
    const search = searchObject(
      this.environment.REGISTRAR_BUDGET,
      'vercel',
      query,
    ).pipe(
      Effect.flatMap(domains =>
        Effect.gen({ self: this }, function* () {
          const nowMillis = yield* Clock.currentTimeMillis
          const entries = yield* Effect.promise(() =>
            this.state.storage.list<typeof CachedQuotes.Type>(),
          )
          const obsolete = pipe(
            Array.fromIterable(entries),
            Array.filter(([, entry]) => entry.expiresAt <= nowMillis),
            Array.map(([entryKey]) => entryKey),
          )

          if (entries.size - obsolete.length >= MAX_CACHED_WINDOWS) {
            const maybeOldest = pipe(
              Array.fromIterable(entries),
              Array.sort(
                Order.mapInput(Number.Order, ([, entry]) => entry.expiresAt),
              ),
              Array.head,
            )

            if (Option.isSome(maybeOldest)) {
              const [oldestKey] = maybeOldest.value
              obsolete.push(oldestKey)
            }
          }

          if (Array.isArrayNonEmpty(obsolete)) {
            yield* Effect.promise(() => this.state.storage.delete(obsolete))
          }

          const expiresAt = nowMillis + QUOTE_TTL_MILLISECONDS
          yield* Effect.promise(() =>
            this.state.storage.put(key, { expiresAt, domains }),
          )
          const maybeAlarm = yield* Effect.promise(() =>
            this.state.storage.getAlarm(),
          )

          if (maybeAlarm === null || maybeAlarm > expiresAt) {
            yield* Effect.promise(() => this.state.storage.setAlarm(expiresAt))
          }

          return SearchOutcome.Success({ domains })
        }),
      ),
      Effect.catch(error => Effect.succeed(SearchOutcome.Failure({ error }))),
    )
    const pending: PendingSearch = {
      controller,
      result: Effect.runPromise(search, { signal: controller.signal }),
      waiters: 0,
    }
    this.pending.set(key, pending)
    const forget = () => {
      if (this.pending.get(key) === pending) {
        this.pending.delete(key)
      }
    }
    void pending.result.then(forget, forget)
    return pending
  }

  async alarm(): Promise<void> {
    const nowMillis = Effect.runSync(Clock.currentTimeMillis)
    const entries = await this.state.storage.list<typeof CachedQuotes.Type>()
    const expired = pipe(
      Array.fromIterable(entries),
      Array.filter(([, entry]) => entry.expiresAt <= nowMillis),
      Array.map(([key]) => key),
    )

    if (Array.isArrayNonEmpty(expired)) {
      await this.state.storage.delete(expired)
    }

    const maybeNextExpiry = pipe(
      Array.fromIterable(entries.values()),
      Array.filter(entry => entry.expiresAt > nowMillis),
      Array.map(entry => entry.expiresAt),
      Array.sort(Number.Order),
      Array.head,
    )

    if (Option.isSome(maybeNextExpiry)) {
      await this.state.storage.setAlarm(maybeNextExpiry.value)
    }
  }
}
