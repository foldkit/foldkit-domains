import { Clock, ConfigProvider, Effect, Layer, Option, Schema } from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/http'

import type { DurableObjectState } from '@cloudflare/workers-types'

import { SearchError } from '../domainsRpc'
import {
  type CoordinatedSearch,
  type SearchEnvironment,
  readCoordinatedSearch,
  respondToCancellation,
  toSearchResponse,
} from './coordination'
import {
  Registrar,
  RegistrarAdmission,
  type RegistrarBatch,
  RegistrarError,
  RegistrarLayer,
} from './registrar'

const MAX_QUEUED_BATCHES = 300
const MAX_QUEUE_MILLISECONDS = 2000
const CLIENT_BATCHES_PER_MINUTE = 30
const MAX_CLIENT_COUNTERS = 2000
const SECOND_MILLISECONDS = 1000
const MINUTE_MILLISECONDS = 60_000

const BudgetWindow = Schema.Struct({
  startsAt: Schema.Number,
  used: Schema.Int,
})
const RegistrarBudget = Schema.Struct({
  second: BudgetWindow,
  minute: BudgetWindow,
  readyAt: Schema.Number,
})

const positiveInteger = (
  value: string | undefined,
  fallback: number,
  maximum: number,
) => {
  const decoded = Schema.decodeUnknownOption(
    Schema.NumberFromString.check(
      Schema.isInt(),
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(maximum),
    ),
  )(value)
  return Option.getOrElse(decoded, () => fallback)
}

const refreshWindow = (
  window: typeof BudgetWindow.Type,
  nowMillis: number,
  durationMillis: number,
) =>
  window.startsAt + durationMillis <= nowMillis
    ? BudgetWindow.make({ startsAt: nowMillis, used: 0 })
    : window

type WaitingBatch = Readonly<{
  client: string
  deadline: number
  resolve: () => void
  reject: (error: typeof RegistrarError.Type) => void
  cleanup: () => void
}>

export class RegistrarCoordinator {
  protected readonly fetchRegistrar: typeof globalThis.fetch = globalThis.fetch
  private readonly state: DurableObjectState
  private readonly environment: SearchEnvironment
  private readonly clients = new Map<string, typeof BudgetWindow.Type>()
  private readonly requestsPerSecond: number
  private readonly requestsPerMinute: number
  private readonly maximumConcurrent: number
  private budget: typeof RegistrarBudget.Type
  private readonly waiting = new Map<symbol, WaitingBatch>()
  private wakeTimer: ReturnType<typeof setTimeout> | undefined
  private active = 0

  constructor(state: DurableObjectState, environment: SearchEnvironment) {
    this.state = state
    this.environment = environment
    this.requestsPerSecond = positiveInteger(
      environment.REGISTRAR_REQUESTS_PER_SECOND,
      10,
      1000,
    )
    this.requestsPerMinute = positiveInteger(
      environment.REGISTRAR_REQUESTS_PER_MINUTE,
      60,
      60_000,
    )
    this.maximumConcurrent = positiveInteger(
      environment.REGISTRAR_MAX_CONCURRENT,
      8,
      100,
    )
    const nowMillis = Effect.runSync(Clock.currentTimeMillis)
    this.budget = RegistrarBudget.make({
      second: { startsAt: nowMillis, used: 0 },
      minute: { startsAt: nowMillis, used: 0 },
      readyAt: nowMillis,
    })
    void state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get<unknown>('budget')
      const maybeBudget = Schema.decodeUnknownOption(RegistrarBudget)(stored)

      if (Option.isSome(maybeBudget)) {
        this.budget = maybeBudget.value
      }
    })
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
    const search = Effect.tryPromise({
      try: signal => this.lookup(query, signal),
      catch: error =>
        Schema.is(SearchError)(error) ? error : SearchError.Unavailable(),
    })
    return toSearchResponse(search, request.signal)
  }

  private acquire(client: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted()

      if (this.waiting.size >= MAX_QUEUED_BATCHES) {
        reject(
          RegistrarError.AdmissionLimited({
            source: 'Application',
            retryAfterSeconds: 1,
          }),
        )
        return
      }

      const key = Symbol()
      const deadline =
        Effect.runSync(Clock.currentTimeMillis) + MAX_QUEUE_MILLISECONDS
      const abort = () => {
        this.waiting.delete(key)
        cleanup()
        reject(signal.reason)
        this.drain()
      }
      const timer = setTimeout(() => this.drain(), MAX_QUEUE_MILLISECONDS)
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
      signal.addEventListener('abort', abort, { once: true })
      this.waiting.set(key, { client, deadline, resolve, reject, cleanup })
      this.drain()
    })
  }

  private drain(): void {
    clearTimeout(this.wakeTimer)
    this.wakeTimer = undefined
    const nowMillis = Effect.runSync(Clock.currentTimeMillis)
    this.budget = RegistrarBudget.make({
      ...this.budget,
      second: refreshWindow(this.budget.second, nowMillis, SECOND_MILLISECONDS),
      minute: refreshWindow(this.budget.minute, nowMillis, MINUTE_MILLISECONDS),
    })

    for (const [client, window] of this.clients) {
      if (window.startsAt + MINUTE_MILLISECONDS <= nowMillis) {
        this.clients.delete(client)
      }
    }

    for (const [key, batch] of this.waiting) {
      const clientWindow = this.clients.get(batch.client) ?? {
        startsAt: nowMillis,
        used: 0,
      }
      const secondOpensAt =
        this.budget.second.used < this.requestsPerSecond
          ? nowMillis
          : this.budget.second.startsAt + SECOND_MILLISECONDS
      const minuteOpensAt =
        this.budget.minute.used < this.requestsPerMinute
          ? nowMillis
          : this.budget.minute.startsAt + MINUTE_MILLISECONDS
      const opensAt = Math.max(secondOpensAt, minuteOpensAt)
      const reject = (error: typeof RegistrarError.Type) => {
        this.waiting.delete(key)
        batch.cleanup()
        batch.reject(error)
      }

      if (this.budget.readyAt > nowMillis) {
        reject(
          RegistrarError.RateLimited({
            retryAfterSeconds: Math.ceil(
              (this.budget.readyAt - nowMillis) / SECOND_MILLISECONDS,
            ),
          }),
        )
        continue
      }

      if (clientWindow.used >= CLIENT_BATCHES_PER_MINUTE) {
        reject(
          RegistrarError.AdmissionLimited({
            source: 'Client',
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(
                (clientWindow.startsAt + MINUTE_MILLISECONDS - nowMillis) /
                  SECOND_MILLISECONDS,
              ),
            ),
          }),
        )
        continue
      }

      if (
        batch.deadline <= nowMillis ||
        opensAt > batch.deadline ||
        (!this.clients.has(batch.client) &&
          this.clients.size >= MAX_CLIENT_COUNTERS)
      ) {
        reject(
          RegistrarError.AdmissionLimited({
            source: 'Application',
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((opensAt - nowMillis) / SECOND_MILLISECONDS),
            ),
          }),
        )
        continue
      }

      if (this.active >= this.maximumConcurrent) {
        break
      }

      if (opensAt > nowMillis) {
        this.wakeTimer = setTimeout(() => this.drain(), opensAt - nowMillis)
        break
      }

      this.waiting.delete(key)
      batch.cleanup()
      this.active += 1
      this.budget = RegistrarBudget.make({
        ...this.budget,
        second: { ...this.budget.second, used: this.budget.second.used + 1 },
        minute: { ...this.budget.minute, used: this.budget.minute.used + 1 },
      })
      this.clients.set(batch.client, {
        ...clientWindow,
        used: clientWindow.used + 1,
      })
      batch.resolve()
    }
  }

  private async admit(
    client: string,
    batch: RegistrarBatch,
    signal: AbortSignal,
  ) {
    await this.acquire(client, signal)

    try {
      await this.state.storage.put('budget', this.budget)
      signal.throwIfAborted()
      const result = await Effect.runPromise(batch.pipe(Effect.result), {
        signal,
      })

      if (result._tag === 'Success') {
        return result.success
      } else {
        const error = result.failure

        if (error._tag === 'RateLimited') {
          const nowMillis = Effect.runSync(Clock.currentTimeMillis)
          this.budget = RegistrarBudget.make({
            ...this.budget,
            readyAt: Math.max(
              this.budget.readyAt,
              nowMillis + error.retryAfterSeconds * SECOND_MILLISECONDS,
            ),
          })
          await this.state.storage.put('budget', this.budget)
        }

        throw error
      }
    } finally {
      this.active -= 1
      this.drain()
    }
  }

  private async lookup(
    query: typeof CoordinatedSearch.Type,
    signal: AbortSignal,
  ) {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const registrar = yield* Registrar
        return yield* registrar.search(query.label, query.offset, query.limit)
      }).pipe(
        Effect.provide(
          RegistrarLayer.pipe(
            Layer.provide(
              Layer.succeed(RegistrarAdmission, {
                run: batch =>
                  Effect.tryPromise({
                    try: signal => this.admit(query.client, batch, signal),
                    catch: error =>
                      Schema.is(RegistrarError)(error)
                        ? error
                        : RegistrarError.Unavailable(),
                  }),
              }),
            ),
            Layer.provide(FetchHttpClient.layer),
            Layer.provide(
              Layer.succeed(FetchHttpClient.Fetch, this.fetchRegistrar),
            ),
            Layer.provide(
              Layer.succeed(HttpClient.TracerPropagationEnabled, false),
            ),
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown(this.environment),
              ),
            ),
          ),
        ),
        Effect.result,
      ),
      { signal },
    )

    if (result._tag === 'Success') {
      return result.success
    } else {
      const error = RegistrarError.match<typeof SearchError.Type>(
        result.failure,
        {
          RateLimited: ({ retryAfterSeconds }) =>
            SearchError.RateLimited({ source: 'Registrar', retryAfterSeconds }),
          AdmissionLimited: ({ source, retryAfterSeconds }) =>
            SearchError.RateLimited({ source, retryAfterSeconds }),
          Unavailable: () => SearchError.Unavailable(),
        },
      )

      throw error
    }
  }
}
