import {
  Clock,
  ConfigProvider,
  Context,
  Duration,
  Effect,
  HashMap,
  HashSet,
  Layer,
  Option,
  Ref,
  Schema,
  Semaphore,
} from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/http'

import type { DurableObjectStorage } from '@cloudflare/workers-types'

import type { Domain } from '../shared/domain'
import { SearchError } from '../shared/domainsRpc'
import type { CoordinatedSearch, SearchEnvironment } from './coordination'
import {
  Registrar,
  RegistrarAdmission,
  type RegistrarBatch,
  RegistrarError,
  RegistrarLayer,
} from './registrar'
import { timeSearchPhase } from './searchTiming'

const MAX_QUEUED_BATCHES = 300
const CLIENT_BATCHES_PER_MINUTE = 30
const MAX_CLIENT_COUNTERS = 2000
const SECOND_MILLISECONDS = 1000
const MINUTE_MILLISECONDS = 60_000

export const RegistrarQueueDuration = Context.Reference(
  'domains/RegistrarQueueDuration',
  { defaultValue: () => Duration.seconds(2) },
)

const BudgetWindow = Schema.Struct({
  startsAt: Schema.Number,
  used: Schema.Int,
})
type BudgetWindow = typeof BudgetWindow.Type
const RegistrarBudget = Schema.Struct({
  second: BudgetWindow,
  minute: BudgetWindow,
  readyAt: Schema.Number,
})
type RegistrarBudget = typeof RegistrarBudget.Type

const positiveInteger = (
  value: string | undefined,
  fallback: number,
  maximum: number,
) =>
  Option.getOrElse(
    Schema.decodeUnknownOption(
      Schema.NumberFromString.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(maximum),
      ),
    )(value),
    () => fallback,
  )

const refreshWindow = (
  window: BudgetWindow,
  nowMillis: number,
  durationMillis: number,
) =>
  window.startsAt + durationMillis <= nowMillis
    ? BudgetWindow.make({ startsAt: nowMillis, used: 0 })
    : window

const applicationLimit = () =>
  RegistrarError.AdmissionLimited({
    source: 'Application',
    retryAfterSeconds: 1,
  })

export class RegistrarSearch extends Context.Service<
  RegistrarSearch,
  {
    readonly search: (
      query: CoordinatedSearch,
    ) => Effect.Effect<ReadonlyArray<Domain>, SearchError>
  }
>()('domains/RegistrarSearch') {}

export const makeRegistrarSearchLayer = (
  storage: DurableObjectStorage,
  environment: SearchEnvironment,
  fetchRegistrar: typeof globalThis.fetch,
) =>
  Layer.effect(
    RegistrarSearch,
    Effect.gen(function* () {
      const registrar = yield* Registrar.pipe(
        Effect.provide(
          RegistrarLayer.pipe(
            Layer.provide(FetchHttpClient.layer),
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchRegistrar)),
            Layer.provide(
              Layer.succeed(HttpClient.TracerPropagationEnabled, false),
            ),
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromUnknown(environment)),
            ),
          ),
        ),
      )

      const requestsPerSecond = positiveInteger(
        environment.REGISTRAR_REQUESTS_PER_SECOND,
        10,
        1000,
      )
      const requestsPerMinute = positiveInteger(
        environment.REGISTRAR_REQUESTS_PER_MINUTE,
        60,
        60_000,
      )
      const maximumConcurrent = positiveInteger(
        environment.REGISTRAR_MAX_CONCURRENT,
        8,
        100,
      )
      const maximumQueueDuration = yield* RegistrarQueueDuration
      const maximumQueueMilliseconds = Duration.toMillis(maximumQueueDuration)
      const nowMillis = yield* Clock.currentTimeMillis
      const stored = yield* Effect.promise(() => storage.get<unknown>('budget'))
      const budgetRef = yield* Ref.make(
        Option.getOrElse(
          Schema.decodeUnknownOption(RegistrarBudget)(stored),
          () =>
            RegistrarBudget.make({
              second: BudgetWindow.make({ startsAt: nowMillis, used: 0 }),
              minute: BudgetWindow.make({ startsAt: nowMillis, used: 0 }),
              readyAt: nowMillis,
            }),
        ),
      )
      const clientsRef = yield* Ref.make(HashMap.empty<string, BudgetWindow>())
      const queuedRef = yield* Ref.make(HashSet.empty<symbol>())
      const budgetLock = yield* Semaphore.make(1)
      const concurrency = yield* Semaphore.make(maximumConcurrent)
      const persistCurrentBudget = Effect.gen(function* () {
        const budget = yield* Ref.get(budgetRef)
        yield* Effect.promise(() => storage.put('budget', budget))
      }).pipe(Effect.uninterruptible, timeSearchPhase('budget-persist'))

      const reserveBudget = (
        client: string,
        deadlineMillis: number,
      ): Effect.Effect<void, RegistrarError> =>
        Effect.gen(function* () {
          const maybeWaitMillis = yield* budgetLock.withPermit(
            Effect.gen(function* () {
              const nowMillis = yield* Clock.currentTimeMillis
              const currentBudget = yield* Ref.get(budgetRef)
              const budget = RegistrarBudget.make({
                ...currentBudget,
                second: refreshWindow(
                  currentBudget.second,
                  nowMillis,
                  SECOND_MILLISECONDS,
                ),
                minute: refreshWindow(
                  currentBudget.minute,
                  nowMillis,
                  MINUTE_MILLISECONDS,
                ),
              })
              const clients = yield* Ref.updateAndGet(clientsRef, clients =>
                HashMap.size(clients) >= MAX_CLIENT_COUNTERS
                  ? HashMap.filter(
                      clients,
                      window =>
                        window.startsAt + MINUTE_MILLISECONDS > nowMillis,
                    )
                  : clients,
              )
              const clientWindow = refreshWindow(
                Option.getOrElse(HashMap.get(clients, client), () =>
                  BudgetWindow.make({ startsAt: nowMillis, used: 0 }),
                ),
                nowMillis,
                MINUTE_MILLISECONDS,
              )

              if (budget.readyAt > nowMillis) {
                return yield* Effect.fail(
                  RegistrarError.RateLimited({
                    retryAfterSeconds: Math.ceil(
                      (budget.readyAt - nowMillis) / SECOND_MILLISECONDS,
                    ),
                  }),
                )
              }

              if (clientWindow.used >= CLIENT_BATCHES_PER_MINUTE) {
                return yield* Effect.fail(
                  RegistrarError.AdmissionLimited({
                    source: 'Client',
                    retryAfterSeconds: Math.max(
                      1,
                      Math.ceil(
                        (clientWindow.startsAt +
                          MINUTE_MILLISECONDS -
                          nowMillis) /
                          SECOND_MILLISECONDS,
                      ),
                    ),
                  }),
                )
              }

              const secondOpensAt =
                budget.second.used < requestsPerSecond
                  ? nowMillis
                  : budget.second.startsAt + SECOND_MILLISECONDS
              const minuteOpensAt =
                budget.minute.used < requestsPerMinute
                  ? nowMillis
                  : budget.minute.startsAt + MINUTE_MILLISECONDS
              const opensAtMillis = Math.max(secondOpensAt, minuteOpensAt)

              if (
                nowMillis >= deadlineMillis ||
                opensAtMillis > deadlineMillis ||
                (!HashMap.has(clients, client) &&
                  HashMap.size(clients) >= MAX_CLIENT_COUNTERS)
              ) {
                return yield* Effect.fail(
                  RegistrarError.AdmissionLimited({
                    source: 'Application',
                    retryAfterSeconds: Math.max(
                      1,
                      Math.ceil(
                        (opensAtMillis - nowMillis) / SECOND_MILLISECONDS,
                      ),
                    ),
                  }),
                )
              }

              if (opensAtMillis > nowMillis) {
                return Option.some(opensAtMillis - nowMillis)
              }

              const nextBudget = RegistrarBudget.make({
                ...budget,
                second: BudgetWindow.make({
                  ...budget.second,
                  used: budget.second.used + 1,
                }),
                minute: BudgetWindow.make({
                  ...budget.minute,
                  used: budget.minute.used + 1,
                }),
              })
              yield* Ref.set(budgetRef, nextBudget)
              yield* Ref.update(
                clientsRef,
                HashMap.set(
                  client,
                  BudgetWindow.make({
                    ...clientWindow,
                    used: clientWindow.used + 1,
                  }),
                ),
              )
              return Option.none<number>()
            }).pipe(Effect.uninterruptible),
          )

          if (Option.isNone(maybeWaitMillis)) {
            yield* persistCurrentBudget
          }

          if (Option.isSome(maybeWaitMillis)) {
            yield* Effect.sleep(Duration.millis(maybeWaitMillis.value))
            yield* reserveBudget(client, deadlineMillis)
          }
        })

      const rememberCooldown = (error: RegistrarError) => {
        if (error._tag !== 'RateLimited') {
          return Effect.void
        }

        return budgetLock.withPermit(
          Effect.gen(function* () {
            const nowMillis = yield* Clock.currentTimeMillis
            yield* Ref.update(budgetRef, budget =>
              RegistrarBudget.make({
                ...budget,
                readyAt: Math.max(
                  budget.readyAt,
                  nowMillis + error.retryAfterSeconds * SECOND_MILLISECONDS,
                ),
              }),
            )
            yield* persistCurrentBudget
          }).pipe(Effect.uninterruptible),
        )
      }

      const joinQueue = Effect.gen(function* () {
        const key = Symbol()
        const isAccepted = yield* Ref.modify(queuedRef, queued => {
          if (HashSet.size(queued) >= MAX_QUEUED_BATCHES) {
            return [false, queued]
          } else {
            return [true, HashSet.add(queued, key)]
          }
        })

        if (!isAccepted) {
          return yield* Effect.fail(applicationLimit())
        }

        return key
      })

      const admit = (client: string, batch: RegistrarBatch) =>
        Effect.scoped(
          Effect.gen(function* () {
            const startedAtMillis = yield* Clock.currentTimeMillis
            const deadlineMillis = startedAtMillis + maximumQueueMilliseconds
            const queueKey = yield* Effect.acquireRelease(joinQueue, key =>
              Ref.update(queuedRef, HashSet.remove(key)),
            )
            yield* Effect.gen(function* () {
              yield* Effect.acquireRelease(
                concurrency.take(1).pipe(
                  Effect.timeoutOrElse({
                    duration: maximumQueueDuration,
                    orElse: () => Effect.fail(applicationLimit()),
                  }),
                ),
                () => concurrency.release(1),
                { interruptible: true },
              )
              yield* reserveBudget(client, deadlineMillis)
              yield* Ref.update(queuedRef, HashSet.remove(queueKey))
            }).pipe(timeSearchPhase('queue'))
            return yield* batch.pipe(Effect.tapError(rememberCooldown))
          }),
        )

      return {
        search: (query: CoordinatedSearch) =>
          registrar.search(query.label, query.offset, query.limit).pipe(
            Effect.provideService(RegistrarAdmission, {
              run: batch => admit(query.client, batch),
            }),
            Effect.mapError(
              RegistrarError.match<SearchError>({
                RateLimited: ({ retryAfterSeconds }) =>
                  SearchError.RateLimited({
                    source: 'Registrar',
                    retryAfterSeconds,
                  }),
                AdmissionLimited: ({ source, retryAfterSeconds }) =>
                  SearchError.RateLimited({ source, retryAfterSeconds }),
                Unavailable: () => SearchError.Unavailable(),
              }),
            ),
          ),
      }
    }),
  )
