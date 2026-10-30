import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Result,
} from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { TestClock } from 'effect/testing'
import { afterEach, describe, expect, test } from 'vitest'

import { DomainsRpcRoutes } from '../server/rpc'
import { DataSource } from '../shared/dataSource'
import { Domain, DomainCandidateRange, domainTlds } from '../shared/domain'
import { DomainsRpcs, SearchError } from '../shared/domainsRpc'
import {
  DomainsQuery,
  DomainsQueryArgs,
  DomainsQueryFailure,
  fetchDomains,
} from './domainsQuery'
import { makeDomainsClientLayer } from './rpc'
import { SearchCooldown } from './searchCooldown'
import { domainsRequestKey, makeDomainsFetch } from './story/test'

const availableDomain = Domain.Available({
  name: 'acme.dev',
  tld: 'dev',
  price: 13,
  renewalPrice: 14,
  years: 1,
  isPremium: false,
})
const args = DomainsQueryArgs.make({
  dataSource: DataSource.make('Demo'),
  label: 'acme',
  offset: 0,
  limit: 60,
})
const disposals: Array<() => Promise<void>> = []

const clientLayer = (fetch: typeof globalThis.fetch) =>
  makeDomainsClientLayer('http://localhost/rpc').pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  )

const queryLayer = (fetch: typeof globalThis.fetch) =>
  DomainsQuery.EffectsLayer.pipe(Layer.provide(clientLayer(fetch)))

const rpcTransport = (
  search: (
    label: string,
    range: DomainCandidateRange,
    dataSource: DataSource,
  ) => Effect.Effect<ReadonlyArray<Domain>, SearchError>,
  context = Context.empty(),
): typeof fetch => {
  const server = HttpRouter.toWebHandler(
    DomainsRpcRoutes.pipe(
      HttpRouter.provideRequest(
        DomainsRpcs.toLayer({
          SearchDomains: ({
            mode: dataSource = 'Demo',
            label,
            offset = 0,
            limit = domainTlds.length,
          }) => search(label, { offset, limit }, dataSource),
        }),
      ),
    ),
    { disableLogger: true },
  )
  disposals.push(server.dispose)
  return (input, init) => server.handler(new Request(input, init), context)
}

afterEach(async () => {
  await Promise.all(disposals.splice(0).map(dispose => dispose()))
})

const debounceCases = [
  { dataSource: DataSource.make('Demo'), debounceMillis: 150 },
  { dataSource: DataSource.make('Live'), debounceMillis: 350 },
]

describe('fetching domain results for candidate ranges', () => {
  test.each(debounceCases)(
    'the Query waits $debounceMillis ms before a $dataSource lookup and preserves its originating request',
    async ({ dataSource, debounceMillis }) => {
      const requestArgs = DomainsQueryArgs.make({ ...args, dataSource })
      let calls = 0
      const transport = rpcTransport((label, range, receivedDataSource) => {
        expect(receivedDataSource).toBe(dataSource)
        calls += 1
        expect(label).toBe('acme')
        expect(range).toEqual({ offset: 0, limit: 60 })
        return Effect.succeed([availableDomain])
      })
      const completed = await Effect.runPromise(
        Effect.gen(function* () {
          const fetch = yield* Effect.forkChild(
            makeDomainsFetch(requestArgs, 42).effect,
          )

          yield* TestClock.adjust(Duration.millis(debounceMillis - 1))
          expect(calls).toBe(0)

          yield* TestClock.adjust('1 millis')
          return yield* Fiber.join(fetch)
        }).pipe(Effect.provide([queryLayer(transport), TestClock.layer()])),
      )

      expect(calls).toBe(1)
      expect(completed).toEqual(
        DomainsQuery.Message.CompletedFetch({
          args: requestArgs,
          generation: 42,
          requestKey: domainsRequestKey(requestArgs),
          result: Result.succeed([availableDomain]),
          completedAtMillis: debounceMillis,
        }),
      )
    },
  )

  test.each(debounceCases)(
    'changing a $dataSource query during its $debounceMillis ms debounce cancels before any RPC',
    async ({ dataSource, debounceMillis }) => {
      const requestArgs = DomainsQueryArgs.make({ ...args, dataSource })
      let calls = 0
      const transport = rpcTransport(() => {
        calls += 1
        return Effect.succeed([availableDomain])
      })
      await Effect.runPromise(
        Effect.gen(function* () {
          const fetch = yield* Effect.forkChild(fetchDomains(requestArgs))

          yield* TestClock.adjust(Duration.millis(debounceMillis - 1))
          yield* Fiber.interrupt(fetch)
          yield* TestClock.adjust('1 second')
        }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
      )

      expect(calls).toBe(0)
    },
  )

  test.each(DataSource.literals)(
    'progressive %s ranges reach the RPC without an input debounce',
    async dataSource => {
      let calls = 0
      const transport = rpcTransport((_label, range) => {
        calls += 1
        expect(range).toEqual({ offset: 4, limit: 56 })
        return Effect.succeed([availableDomain])
      })
      const domains = await Effect.runPromise(
        fetchDomains({
          dataSource,
          label: 'acme',
          offset: 4,
          limit: 56,
        }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
      )

      expect(calls).toBe(1)
      expect(domains).toEqual([availableDomain])
    },
  )

  test.each([
    {
      failure: 'client rate limit',
      error: SearchError.RateLimited({
        source: 'Client',
        retryAfterSeconds: 30,
      }),
      expected: DomainsQueryFailure.make({
        error: 'Too many searches. Please try again in 30 seconds.',
        maybeSearchCooldown: Option.some(
          SearchCooldown.make({
            source: 'Client',
            expiresAtMillis: 30_150,
          }),
        ),
      }),
    },
    {
      failure: 'application rate limit',
      error: SearchError.RateLimited({
        source: 'Application',
        retryAfterSeconds: 1,
      }),
      expected: DomainsQueryFailure.make({
        error: 'Search is busy. Please try again in 1 second.',
        maybeSearchCooldown: Option.some(
          SearchCooldown.make({
            source: 'Application',
            expiresAtMillis: 1150,
          }),
        ),
      }),
    },
    {
      failure: 'registrar rate limit',
      error: SearchError.RateLimited({
        source: 'Registrar',
        retryAfterSeconds: 60,
      }),
      expected: DomainsQueryFailure.make({
        error: 'The domain provider is busy. Please try again in 60 seconds.',
        maybeSearchCooldown: Option.some(
          SearchCooldown.make({
            source: 'Registrar',
            expiresAtMillis: 60_150,
          }),
        ),
      }),
    },
    {
      failure: 'unavailable registrar',
      error: SearchError.Unavailable(),
      expected: DomainsQueryFailure.make({
        error: 'Could not check availability and prices. Please try again.',
        maybeSearchCooldown: Option.none(),
      }),
    },
  ])(
    'maps a $failure into a domain search failure and cooldown deadline',
    async ({ error, expected }) => {
      const transport = rpcTransport(() => Effect.fail(error))
      const domainsResult = await Effect.runPromise(
        Effect.gen(function* () {
          const fetch = yield* Effect.forkChild(
            fetchDomains(args).pipe(Effect.result),
          )

          yield* TestClock.adjust('150 millis')
          return yield* Fiber.join(fetch)
        }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
      )

      expect(domainsResult).toEqual(Result.fail(expected))
    },
  )

  test('turns a remote defect into a retriable domain search failure', async () => {
    const transport = rpcTransport(() =>
      Effect.die(new Error('unexpected provider defect')),
    )
    const domainsResult = await Effect.runPromise(
      Effect.gen(function* () {
        const fetch = yield* Effect.forkChild(
          fetchDomains(args).pipe(Effect.result),
        )

        yield* TestClock.adjust('150 millis')
        return yield* Fiber.join(fetch)
      }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
    )

    expect(domainsResult).toEqual(
      Result.fail(
        DomainsQueryFailure.make({
          error: 'Could not search domains. Please try again.',
          maybeSearchCooldown: Option.none(),
        }),
      ),
    )
  })

  test('aborts a stalled RPC at the 20 second deadline', async () => {
    let isAborted = false
    let markStarted = () => {}
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const transport: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            isAborted = true
            reject(new Error('aborted'))
          },
          { once: true },
        )
        markStarted()
      })
    const domainsResult = await Effect.runPromise(
      Effect.gen(function* () {
        const fetch = yield* Effect.forkChild(
          fetchDomains(args).pipe(Effect.result),
        )

        yield* TestClock.adjust('150 millis')
        yield* Effect.promise(() => started)
        yield* TestClock.adjust('19850 millis')
        return yield* Fiber.join(fetch)
      }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
    )

    expect(domainsResult).toEqual(
      Result.fail(
        DomainsQueryFailure.make({
          error: 'Could not search domains. Please try again.',
          maybeSearchCooldown: Option.none(),
        }),
      ),
    )
    expect(isAborted).toBe(true)
  })

  test('interrupting a domain lookup aborts the RPC without returning a result', async () => {
    let isAborted = false
    let markStarted = () => {}
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const transport: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            isAborted = true
            reject(new Error('aborted'))
          },
          { once: true },
        )
        markStarted()
      })
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const fetch = yield* Effect.forkChild(
          fetchDomains(args).pipe(Effect.result),
        )

        yield* TestClock.adjust('150 millis')
        yield* Effect.promise(() => started)
        yield* Fiber.interrupt(fetch)
        return yield* Fiber.await(fetch)
      }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
    )

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    )
    expect(isAborted).toBe(true)
  })
})
