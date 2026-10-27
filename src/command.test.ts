import { Cause, Clock, Context, Effect, Exit, Fiber, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { TestClock } from 'effect/testing'
import { afterEach, describe, expect, test } from 'vitest'

import { FetchDomains, cancelSearch } from './command'
import { Domain } from './domain'
import { DomainsRpcs, SearchError } from './domainsRpc'
import { Message } from './message'
import { makeDomainsClientLayer } from './rpc'
import { DomainsRpcRoutes } from './server/rpc'

const quotedDomain = Domain.Available({
  name: 'acme.dev',
  tld: 'dev',
  price: 13,
  renewalPrice: 14,
  years: 1,
  isPremium: false,
})
const disposals: Array<() => Promise<void>> = []

const commandLayer = (fetch: typeof globalThis.fetch) =>
  FetchDomains.layer.pipe(
    Layer.provide(
      makeDomainsClientLayer('http://localhost/rpc').pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      ),
    ),
  )

const rpcTransport = (
  search: (
    label: string,
  ) => Effect.Effect<
    ReadonlyArray<typeof Domain.Type>,
    typeof SearchError.Type
  >,
  context = Context.empty(),
): typeof globalThis.fetch => {
  const server = HttpRouter.toWebHandler(
    DomainsRpcRoutes.pipe(
      HttpRouter.provideRequest(
        DomainsRpcs.toLayer({ SearchDomains: ({ label }) => search(label) }),
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

describe('FetchDomains execution', () => {
  test('debounces the RPC and maps its decoded quotes to the originating generation', async () => {
    let calls = 0
    const transport = rpcTransport(label => {
      calls += 1
      expect(label).toBe('acme')
      return Effect.succeed([quotedDomain])
    })
    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 42,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('349 millis')
        expect(calls).toBe(0)
        yield* TestClock.adjust('1 millis')
        return yield* Fiber.join(search)
      }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
    )
    expect(calls).toBe(1)
    expect(completed).toEqual(
      Message.SucceededFetchDomains({
        searchGeneration: 42,
        domains: [quotedDomain],
      }),
    )
  })

  test('allows a slow server response to complete before the Command deadline', async () => {
    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* Clock.Clock
        const transport = rpcTransport(
          () => Effect.sleep('14 seconds').pipe(Effect.as([quotedDomain])),
          Context.make(Clock.Clock, clock),
        )
        const search = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 42,
            offset: 0,
            limit: 60,
          }).effect.pipe(Effect.provide(commandLayer(transport))),
        )
        yield* TestClock.adjust('350 millis')
        yield* TestClock.adjust('14 seconds')
        return yield* Fiber.join(search)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(completed).toEqual(
      Message.SucceededFetchDomains({
        searchGeneration: 42,
        domains: [quotedDomain],
      }),
    )
  })

  test.each([
    {
      error: SearchError.RateLimited({
        source: 'Client',
        retryAfterSeconds: 30,
      }),
      message: 'Too many searches. Please try again in 30 seconds.',
    },
    {
      error: SearchError.RateLimited({
        source: 'Application',
        retryAfterSeconds: 1,
      }),
      message: 'Search is busy. Please try again in 1 second.',
    },
    {
      error: SearchError.RateLimited({
        source: 'Registrar',
        retryAfterSeconds: 60,
      }),
      message: 'The domain provider is busy. Please try again in 60 seconds.',
    },
    {
      error: SearchError.Unavailable(),
      message: 'Could not check availability and prices. Please try again.',
    },
  ])(
    'maps declared $error._tag RPC failures into a retriable Message',
    async ({ error, message }) => {
      const transport = rpcTransport(() => Effect.fail(error))
      const completed = await Effect.runPromise(
        Effect.gen(function* () {
          const search = yield* Effect.forkChild(
            FetchDomains({
              label: 'acme',
              searchGeneration: 42,
              offset: 0,
              limit: 60,
            }).effect,
          )
          yield* TestClock.adjust('350 millis')
          return yield* Fiber.join(search)
        }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
      )
      expect(completed).toEqual(
        Message.FailedFetchDomains({
          searchGeneration: 42,
          error: message,
        }),
      )
    },
  )

  test('keeps typing local during a retry window and resumes requests after it expires', async () => {
    let calls = 0
    const transport = rpcTransport(() => {
      calls += 1
      return calls === 1
        ? Effect.fail(
            SearchError.RateLimited({
              source: 'Registrar',
              retryAfterSeconds: 10,
            }),
          )
        : Effect.succeed([quotedDomain])
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const firstSearch = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 1,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('350 millis')
        expect((yield* Fiber.join(firstSearch))._tag).toBe('FailedFetchDomains')
        const nextSearch = yield* Effect.forkChild(
          FetchDomains({
            label: 'other',
            searchGeneration: 2,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('350 millis')
        expect(yield* Fiber.join(nextSearch)).toEqual(
          Message.FailedFetchDomains({
            searchGeneration: 2,
            error:
              'The domain provider is busy. Please try again in 10 seconds.',
          }),
        )
        expect(calls).toBe(1)
        yield* TestClock.adjust('10 seconds')
        const retry = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 3,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('350 millis')
        expect(yield* Fiber.join(retry)).toEqual(
          Message.SucceededFetchDomains({
            searchGeneration: 3,
            domains: [quotedDomain],
          }),
        )
        expect(calls).toBe(2)
      }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
    )
  })

  test('turns a remote defect into a failure Message instead of crashing the Runtime', async () => {
    const transport = rpcTransport(() =>
      Effect.die(new Error('unexpected provider defect')),
    )
    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 42,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('350 millis')
        return yield* Fiber.join(search)
      }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
    )
    expect(completed).toEqual(
      Message.FailedFetchDomains({
        searchGeneration: 42,
        error: 'Could not search domains. Please try again.',
      }),
    )
  })

  test('cancels a superseded debounce before it sends an RPC request', async () => {
    let calls = 0
    const transport = rpcTransport(() => {
      calls += 1
      return Effect.succeed([quotedDomain])
    })
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 1,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('200 millis')
        yield* cancelSearch().effect
        yield* TestClock.adjust('350 millis')
        return yield* Fiber.await(search)
      }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
    )
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    )
    expect(calls).toBe(0)
  })

  test('cancels an in-flight RPC without producing a failure Message', async () => {
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
        const search = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 42,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('350 millis')
        yield* Effect.promise(() => started)
        yield* cancelSearch().effect
        return yield* Fiber.await(search)
      }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
    )
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    )
    expect(isAborted).toBe(true)
  })

  test('aborts a stalled RPC at the Command deadline and reports a retriable failure', async () => {
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
    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* Effect.forkChild(
          FetchDomains({
            label: 'acme',
            searchGeneration: 42,
            offset: 0,
            limit: 60,
          }).effect,
        )
        yield* TestClock.adjust('350 millis')
        yield* Effect.promise(() => started)
        yield* TestClock.adjust('19650 millis')
        return yield* Fiber.join(search)
      }).pipe(Effect.provide([commandLayer(transport), TestClock.layer()])),
    )
    expect(completed).toEqual(
      Message.FailedFetchDomains({
        searchGeneration: 42,
        error: 'Could not search domains. Please try again.',
      }),
    )
    expect(isAborted).toBe(true)
  })
})
