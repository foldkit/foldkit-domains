import {
  Cause,
  Context,
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
import { Domain, QuoteWindow, domainTlds } from '../shared/domain'
import { DomainsRpcs, SearchError } from '../shared/domainsRpc'
import {
  QuoteFailure,
  QuoteWindowArgs,
  QuoteWindows,
  makeFetchQuoteWindow,
} from './quoteWindows'
import { makeDomainsClientLayer } from './rpc'
import { SearchCooldown } from './searchCooldown'
import { quoteFetch, quoteRequestKey } from './story/test'

const quotedDomain = Domain.Available({
  name: 'acme.dev',
  tld: 'dev',
  price: 13,
  renewalPrice: 14,
  years: 1,
  isPremium: false,
})
const args = QuoteWindowArgs.make({ label: 'acme', offset: 0, limit: 60 })
const disposals: Array<() => Promise<void>> = []

const clientLayer = (fetch: typeof globalThis.fetch) =>
  makeDomainsClientLayer('http://localhost/rpc').pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  )

const queryLayer = (fetch: typeof globalThis.fetch) =>
  QuoteWindows.EffectsLayer.pipe(Layer.provide(clientLayer(fetch)))

const rpcTransport = (
  search: (
    label: string,
    window: QuoteWindow,
  ) => Effect.Effect<ReadonlyArray<Domain>, SearchError>,
  context = Context.empty(),
): typeof fetch => {
  const server = HttpRouter.toWebHandler(
    DomainsRpcRoutes.pipe(
      HttpRouter.provideRequest(
        DomainsRpcs.toLayer({
          SearchDomains: ({ label, offset = 0, limit = domainTlds.length }) =>
            search(label, { offset, limit }),
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

describe('quote window fetching', () => {
  test('the Query wires a debounced lookup to its originating request', async () => {
    let calls = 0
    const transport = rpcTransport((label, window) => {
      calls += 1
      expect(label).toBe('acme')
      expect(window).toEqual({ offset: 0, limit: 60 })
      return Effect.succeed([quotedDomain])
    })
    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const fetch = yield* Effect.forkChild(quoteFetch(args, 42).effect)

        yield* TestClock.adjust('349 millis')
        expect(calls).toBe(0)

        yield* TestClock.adjust('1 millis')
        return yield* Fiber.join(fetch)
      }).pipe(Effect.provide([queryLayer(transport), TestClock.layer()])),
    )

    expect(calls).toBe(1)
    expect(completed).toEqual(
      QuoteWindows.Message.CompletedFetch({
        args,
        generation: 42,
        requestKey: quoteRequestKey(args),
        result: Result.succeed([quotedDomain]),
        completedAtMillis: 350,
      }),
    )
  })

  test.each([
    {
      failure: 'client rate limit',
      error: SearchError.RateLimited({
        source: 'Client',
        retryAfterSeconds: 30,
      }),
      expected: QuoteFailure.make({
        error: 'Too many searches. Please try again in 30 seconds.',
        maybeSearchCooldown: Option.some(
          SearchCooldown.make({
            source: 'Client',
            expiresAtMillis: 30_350,
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
      expected: QuoteFailure.make({
        error: 'Search is busy. Please try again in 1 second.',
        maybeSearchCooldown: Option.some(
          SearchCooldown.make({
            source: 'Application',
            expiresAtMillis: 1350,
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
      expected: QuoteFailure.make({
        error: 'The domain provider is busy. Please try again in 60 seconds.',
        maybeSearchCooldown: Option.some(
          SearchCooldown.make({
            source: 'Registrar',
            expiresAtMillis: 60_350,
          }),
        ),
      }),
    },
    {
      failure: 'unavailable registrar',
      error: SearchError.Unavailable(),
      expected: QuoteFailure.make({
        error: 'Could not check availability and prices. Please try again.',
        maybeSearchCooldown: Option.none(),
      }),
    },
  ])(
    'maps a $failure into a quote failure and cooldown deadline',
    async ({ error, expected }) => {
      const transport = rpcTransport(() => Effect.fail(error))
      const quoteWindowResult = await Effect.runPromise(
        Effect.gen(function* () {
          const fetch = yield* Effect.forkChild(
            makeFetchQuoteWindow().pipe(
              Effect.flatMap(fetchQuoteWindow => fetchQuoteWindow(args)),
              Effect.result,
            ),
          )

          yield* TestClock.adjust('350 millis')
          return yield* Fiber.join(fetch)
        }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
      )

      expect(quoteWindowResult).toEqual(Result.fail(expected))
    },
  )

  test('turns a remote defect into a retriable quote failure', async () => {
    const transport = rpcTransport(() =>
      Effect.die(new Error('unexpected provider defect')),
    )
    const quoteWindowResult = await Effect.runPromise(
      Effect.gen(function* () {
        const fetch = yield* Effect.forkChild(
          makeFetchQuoteWindow().pipe(
            Effect.flatMap(fetchQuoteWindow => fetchQuoteWindow(args)),
            Effect.result,
          ),
        )

        yield* TestClock.adjust('350 millis')
        return yield* Fiber.join(fetch)
      }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
    )

    expect(quoteWindowResult).toEqual(
      Result.fail(
        QuoteFailure.make({
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
    const quoteWindowResult = await Effect.runPromise(
      Effect.gen(function* () {
        const fetch = yield* Effect.forkChild(
          makeFetchQuoteWindow().pipe(
            Effect.flatMap(fetchQuoteWindow => fetchQuoteWindow(args)),
            Effect.result,
          ),
        )

        yield* TestClock.adjust('350 millis')
        yield* Effect.promise(() => started)
        yield* TestClock.adjust('19650 millis')
        return yield* Fiber.join(fetch)
      }).pipe(Effect.provide([clientLayer(transport), TestClock.layer()])),
    )

    expect(quoteWindowResult).toEqual(
      Result.fail(
        QuoteFailure.make({
          error: 'Could not search domains. Please try again.',
          maybeSearchCooldown: Option.none(),
        }),
      ),
    )
    expect(isAborted).toBe(true)
  })

  test('interrupting a quote lookup aborts the RPC without returning a result', async () => {
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
          makeFetchQuoteWindow().pipe(
            Effect.flatMap(fetchQuoteWindow => fetchQuoteWindow(args)),
            Effect.result,
          ),
        )

        yield* TestClock.adjust('350 millis')
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
