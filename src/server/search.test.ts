import {
  Array,
  Cause,
  Clock,
  ConfigProvider,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  Option,
  Result,
  Schema,
} from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'
import { TestClock } from 'effect/testing'
import { afterEach, describe, expect, test } from 'vitest'

import { DomainsClient, makeDomainsClientLayer } from '../client/rpc'
import {
  DomainCandidateRange,
  domainCandidates,
  domainTlds,
} from '../shared/domain'
import { SearchError } from '../shared/domainsRpc'
import {
  Registrar,
  RegistrarAdmission,
  RegistrarError,
  RegistrarLayer,
} from './registrar'
import { DomainsRpcLayer } from './rpc'

const SEARCH_BURST_SIZE = 10

const RegistrarRequest = Schema.Struct({ domains: Schema.Array(Schema.String) })
const disposals: Array<() => Promise<void>> = []

const makeApi = (
  fetch: typeof globalThis.fetch,
  configProvider = ConfigProvider.fromUnknown({}),
) => {
  const api = HttpRouter.toWebHandler(
    DomainsRpcLayer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      Layer.provide(ConfigProvider.layer(configProvider)),
    ),
    { disableLogger: true },
  )
  disposals.push(api.dispose)
  return api.handler
}

const callSearch = (
  handler: ReturnType<typeof makeApi>,
  label = 'acme',
  ip = '192.0.2.1',
  context = Context.empty(),
  rpcHeaders: Readonly<Record<string, string>> = {},
  range: DomainCandidateRange = { offset: 0, limit: 556 },
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* DomainsClient
      return yield* client.SearchDomains(
        { mode: 'Live', label, ...range },
        { headers: rpcHeaders },
      )
    }),
  ).pipe(
    Effect.provide(makeDomainsClientLayer('http://localhost/rpc')),
    Effect.provideService(FetchHttpClient.Fetch, (input, init) => {
      const request = new Request(input, init)
      request.headers.set('cf-connecting-ip', ip)
      return handler(request, context)
    }),
  )

const rawRequest = (payload: Readonly<Record<string, unknown>>) =>
  new Request('http://localhost/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      _tag: 'Request',
      id: '0',
      tag: 'SearchDomains',
      payload: { mode: 'Live', ...payload },
      headers: [],
    }),
  })

const readNames = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  expect(request.url).toBe('https://api.vercel.com/v1/registrar/domains/search')
  expect(request.method).toBe('POST')
  expect(request.headers.has('authorization')).toBe(false)
  return Schema.decodeUnknownSync(RegistrarRequest)(await request.json())
    .domains
}

const registrarResponse = (names: ReadonlyArray<string>) => ({
  results: Array.map(names, domain =>
    domain === 'acme.com'
      ? { domain, available: false }
      : {
          domain,
          available: true,
          years: 2,
          price: 160,
          renewalPrice: 170,
          premium: true,
        },
  ),
})
const successfulFetch: typeof globalThis.fetch = async (input, init) =>
  Response.json(registrarResponse(await readNames(input, init)))

afterEach(async () => {
  await Promise.all(disposals.splice(0).map(dispose => dispose()))
})

describe('domain search RPC', () => {
  test('checks every candidate in bounded batches and preserves quotes and compound TLDs through the typed client', async () => {
    const batches: Array<ReadonlyArray<string>> = []
    const handler = makeApi(async (input, init) => {
      const names = await readNames(input, init)
      batches.push(names)
      return Response.json(registrarResponse(names))
    })
    const domains = await Effect.runPromise(callSearch(handler))
    expect(batches.map(batch => batch.length)).toEqual([200, 200, 156])
    expect(domains).toHaveLength(556)
    expect(Option.getOrThrow(Array.head(domains))).toEqual({
      _tag: 'Unconfirmed',
      name: 'acme.com',
      tld: 'com',
    })
    expect(
      Option.getOrThrow(
        Array.findFirst(domains, domain => domain.name === 'acme.co.il'),
      ),
    ).toEqual({
      _tag: 'Available',
      name: 'acme.co.il',
      tld: 'co.il',
      price: 160,
      renewalPrice: 170,
      years: 2,
      isPremium: true,
    })
    expect(Option.getOrThrow(Array.last(domains)).name).toBe('acme.zone')
  })

  test('looks up only the selected page and isolates its completed cache entry from other ranges', async () => {
    const batches: Array<ReadonlyArray<string>> = []
    const handler = makeApi(async (input, init) => {
      const names = await readNames(input, init)
      batches.push(names)
      return Response.json(registrarResponse(names))
    })
    const first = await Effect.runPromise(
      callSearch(
        handler,
        'acme',
        '192.0.2.1',
        Context.empty(),
        {},
        { offset: 0, limit: 60 },
      ),
    )
    const second = await Effect.runPromise(
      callSearch(
        handler,
        'acme',
        '192.0.2.1',
        Context.empty(),
        {},
        { offset: 60, limit: 60 },
      ),
    )
    expect(first.map(domain => domain.name)).toEqual(
      Array.take(domainCandidates('acme'), 60).map(domain => domain.name),
    )
    expect(second.map(domain => domain.name)).toEqual(
      Array.take(Array.drop(domainCandidates('acme'), 60), 60).map(
        domain => domain.name,
      ),
    )
    expect(
      await Effect.runPromise(
        callSearch(
          handler,
          'acme',
          '192.0.2.1',
          Context.empty(),
          {},
          { offset: 0, limit: 60 },
        ),
      ),
    ).toEqual(first)
    expect(batches.map(batch => batch.length)).toEqual([60, 60])
  })

  test('sends configured registrar credentials only on the server-to-provider request', async () => {
    const credential = 'test-only-registrar-credential'
    const handler = makeApi(
      async (input, init) => {
        const request = new Request(input, init)
        expect(request.url).toBe(
          'https://api.vercel.com/v1/registrar/domains/search',
        )
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${credential}`,
        )
        const { domains } = Schema.decodeUnknownSync(RegistrarRequest)(
          await request.json(),
        )
        return Response.json(registrarResponse(domains))
      },
      ConfigProvider.fromUnknown({ VERCEL_API_TOKEN: credential }),
    )
    const domains = await Effect.runPromise(callSearch(handler))
    expect(domains).toHaveLength(556)
    expect(JSON.stringify(domains)).not.toContain(credential)
  })

  test.each(['', 'UPPERCASE', 'not a name!', '-bad', 'a'.repeat(64)])(
    'rejects invalid label %j in server RPC decoding before contacting the registrar',
    async label => {
      let calls = 0
      const handler = makeApi(async (...args) => {
        calls += 1
        return successfulFetch(...args)
      })
      const response = await handler(rawRequest({ label }))
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.text()).toContain('Failure')
      expect(calls).toBe(0)
    },
  )

  test.each([
    { name: 'negative offset', range: { offset: -1, limit: 4 } },
    {
      name: 'offset beyond the catalog',
      range: { offset: domainTlds.length, limit: 4 },
    },
    { name: 'fractional offset', range: { offset: 0.5, limit: 4 } },
    { name: 'empty range', range: { offset: 0, limit: 0 } },
    {
      name: 'limit beyond the catalog',
      range: { offset: 0, limit: domainTlds.length + 1 },
    },
    { name: 'fractional limit', range: { offset: 0, limit: 1.5 } },
  ])('rejects $name before contacting the registrar', async ({ range }) => {
    let calls = 0
    const handler = makeApi(async (...args) => {
      calls += 1
      return successfulFetch(...args)
    })
    const response = await handler(rawRequest({ label: 'acme', ...range }))

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toContain('Failure')
    expect(calls).toBe(0)
  })

  test('rejects malformed JSON, oversized streamed bodies, and non-JSON content', async () => {
    let calls = 0
    const handler = makeApi(async (...args) => {
      calls += 1
      return successfulFetch(...args)
    })
    const malformed = await handler(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    )
    expect(await malformed.text()).toContain('Defect')
    const oversized = await handler(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'x'.repeat(2000),
      }),
    )
    expect(oversized.status).toBe(413)
    expect(oversized.headers.get('cache-control')).toBe('no-store')
    const nonJson = await handler(
      new Request('http://localhost/rpc', { method: 'POST', body: '{}' }),
    )
    expect(nonJson.status).toBe(415)
    expect(calls).toBe(0)
  })

  test.each([
    {
      name: 'provider failure',
      response: () => new Response('private provider details', { status: 503 }),
      error: SearchError.Unavailable(),
    },
    {
      name: 'rate limit',
      response: () => new Response('private provider details', { status: 429 }),
      error: SearchError.RateLimited({
        source: 'Registrar',
        retryAfterSeconds: 60,
      }),
    },
    {
      name: 'malformed JSON',
      response: () => new Response('{'),
      error: SearchError.Unavailable(),
    },
    {
      name: 'partial results',
      response: () => Response.json({ results: [] }),
      error: SearchError.Unavailable(),
    },
    {
      name: 'mismatched name',
      response: () =>
        Response.json({ results: [{ domain: 'wrong.com', available: false }] }),
      error: SearchError.Unavailable(),
    },
  ])(
    'decodes a typed failure for $name without fabricated quotes or provider details',
    async ({ response, error }) => {
      const handler = makeApi(async () => response())
      const result = await Effect.runPromise(
        callSearch(handler).pipe(Effect.result),
      )
      expect(result).toEqual(Result.fail(error))
      expect(JSON.stringify(result)).not.toContain('private provider details')
    },
  )

  test.each([
    'negative price',
    'missing renewal price',
    'duplicate names',
    'reordered names',
  ])('rejects a full registrar response containing %s', async variant => {
    const handler = makeApi(async (input, init) => {
      const names = await readNames(input, init)
      const data = registrarResponse(names)
      if (variant === 'duplicate names') {
        return Response.json({
          results: Array.map(data.results, () =>
            Option.getOrThrow(Array.head(data.results)),
          ),
        })
      } else if (variant === 'reordered names') {
        return Response.json({ results: Array.reverse(data.results) })
      } else {
        return Response.json({
          results: Array.map(names, domain => ({
            domain,
            available: true,
            years: 1,
            premium: false,
            price: variant === 'negative price' ? -1 : 12,
            renewalPrice: variant === 'missing renewal price' ? undefined : 12,
          })),
        })
      }
    })
    expect(
      await Effect.runPromise(callSearch(handler).pipe(Effect.result)),
    ).toEqual(Result.fail(SearchError.Unavailable()))
  })

  test('bounds batch concurrency and rejects excess uncached searches without waiting', async () => {
    let inFlight = 0
    let maximumInFlight = 0
    let releaseRequests = () => {}
    let reachedLimit = () => {}
    const gate = new Promise<void>(resolve => {
      releaseRequests = resolve
    })
    const limitReached = new Promise<void>(resolve => {
      reachedLimit = resolve
    })
    const handler = makeApi(async (...args) => {
      inFlight += 1
      maximumInFlight = Math.max(maximumInFlight, inFlight)
      if (inFlight === SEARCH_BURST_SIZE * 2) {
        reachedLimit()
      }
      await gate
      try {
        return await successfulFetch(...args)
      } finally {
        inFlight -= 1
      }
    })
    const searches = Promise.all(
      Array.map(Array.range(1, SEARCH_BURST_SIZE), index =>
        Effect.runPromise(callSearch(handler, `search-${index}`)),
      ),
    )
    await limitReached
    try {
      expect(
        await Effect.runPromise(
          callSearch(handler, 'third').pipe(Effect.result),
        ),
      ).toEqual(
        Result.fail(
          SearchError.RateLimited({
            source: 'Application',
            retryAfterSeconds: 1,
          }),
        ),
      )
    } finally {
      releaseRequests()
    }
    expect((await searches).map(domains => domains.length)).toEqual(
      Array.replicate(556, SEARCH_BURST_SIZE),
    )
    expect(maximumInFlight).toBe(SEARCH_BURST_SIZE * 2)
  })

  test('admits uncached searches after the burst window expires', async () => {
    const handler = makeApi(successfulFetch)
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* Clock.Clock
        const context = Context.make(Clock.Clock, clock)
        for (const index of Array.range(1, SEARCH_BURST_SIZE)) {
          yield* callSearch(handler, `search-${index}`, '192.0.2.1', context)
        }
        expect(
          yield* callSearch(handler, 'third', '192.0.2.1', context).pipe(
            Effect.result,
          ),
        ).toEqual(
          Result.fail(
            SearchError.RateLimited({
              source: 'Application',
              retryAfterSeconds: 1,
            }),
          ),
        )
        yield* TestClock.adjust('1 second')
        expect(
          yield* callSearch(handler, 'third', '192.0.2.1', context),
        ).toHaveLength(556)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })

  test('runs overlapping lookups independently and caches only completed quotes', async () => {
    let calls = 0
    let releaseRequests = () => {}
    let markStarted = () => {}
    const gate = new Promise<void>(resolve => {
      releaseRequests = resolve
    })
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const handler = makeApi(async (...args) => {
      calls += 1
      if (calls === 4) {
        markStarted()
      }
      await gate
      return successfulFetch(...args)
    })
    const searches = Promise.all([
      Effect.runPromise(callSearch(handler)),
      Effect.runPromise(callSearch(handler)),
    ])
    await started
    releaseRequests()
    const results = await searches
    expect(results.map(domains => domains.length)).toEqual([556, 556])
    expect(calls).toBe(6)
    await Effect.runPromise(callSearch(handler))
    expect(calls).toBe(6)
  })

  test('reuses a fresh quote and returns the changed provider price at expiry', async () => {
    let calls = 0
    let price = 160
    const handler = makeApi(async (input, init) => {
      calls += 1
      const data = registrarResponse(await readNames(input, init))

      return Response.json({
        results: Array.map(data.results, result =>
          result.available ? { ...result, price } : result,
        ),
      })
    })

    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* Clock.Clock
        const context = Context.make(Clock.Clock, clock)
        const lookup = callSearch(
          handler,
          'acme',
          '192.0.2.1',
          context,
          {},
          {
            offset: 0,
            limit: 4,
          },
        )

        expect(yield* lookup).toContainEqual(
          expect.objectContaining({ name: 'acme.dev', price: 160 }),
        )
        price = 200
        yield* TestClock.adjust('59999 millis')
        expect(yield* lookup).toContainEqual(
          expect.objectContaining({ name: 'acme.dev', price: 160 }),
        )
        expect(calls).toBe(1)

        yield* TestClock.adjust('1 millis')
        expect(yield* lookup).toContainEqual(
          expect.objectContaining({ name: 'acme.dev', price: 200 }),
        )
        expect(calls).toBe(2)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })

  test('does not cache registrar failures, so retry can recover', async () => {
    let isFailing = true
    const handler = makeApi(async (...args) =>
      isFailing ? new Response('', { status: 503 }) : successfulFetch(...args),
    )
    expect(
      await Effect.runPromise(callSearch(handler).pipe(Effect.result)),
    ).toEqual(Result.fail(SearchError.Unavailable()))
    isFailing = false
    expect(await Effect.runPromise(callSearch(handler))).toHaveLength(556)
  })

  test('serves completed quotes without consuming the uncached search budget', async () => {
    let calls = 0
    const handler = makeApi(async (...args) => {
      calls += 1
      return successfulFetch(...args)
    })
    for (const _index of Array.range(1, 40)) {
      expect(await Effect.runPromise(callSearch(handler))).toHaveLength(556)
    }
    expect(await Effect.runPromise(callSearch(handler, 'other'))).toHaveLength(
      556,
    )
    expect(calls).toBe(6)
  })

  test('limits uncached searches by the physical HTTP client and ignores forged RPC identity headers', async () => {
    const handler = makeApi(successfulFetch)
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* Clock.Clock
        const context = Context.make(Clock.Clock, clock)
        for (const index of Array.range(1, 30)) {
          yield* callSearch(handler, `client-${index}`, '192.0.2.1', context)
          yield* TestClock.adjust('1 second')
        }
        const blocked = yield* callSearch(
          handler,
          'uncached',
          '192.0.2.1',
          context,
          {
            'cf-connecting-ip': '192.0.2.2',
          },
        ).pipe(Effect.result)
        expect(
          Result.isFailure(blocked) &&
            blocked.failure._tag === 'RateLimited' &&
            blocked.failure.source === 'Client',
        ).toBe(true)
        expect(
          yield* callSearch(handler, 'uncached', '192.0.2.2', context),
        ).toHaveLength(556)
        yield* TestClock.adjust('1 minute')
        expect(
          yield* callSearch(handler, 'recovered', '192.0.2.1', context),
        ).toHaveLength(556)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })

  test.each([
    {
      source: 'RetryAfterHeader',
      headers: { 'retry-after': '60' },
      body: {},
      retryAfterSeconds: 60,
    },
    {
      source: 'RateLimitResetHeader',
      headers: { 'x-ratelimit-reset': '60' },
      body: {},
      retryAfterSeconds: 60,
    },
    {
      source: 'ResponseBody',
      headers: {},
      body: { retryAfter: { value: 12, str: '12s' } },
      retryAfterSeconds: 12,
    },
    {
      source: 'Fallback',
      headers: {},
      body: {},
      retryAfterSeconds: 60,
    },
  ])(
    'logs $source once per registrar 429 without exposing provider details',
    async ({ source, headers, body, retryAfterSeconds }) => {
      const messages: Array<unknown> = []
      const logger = Logger.make(options => messages.push(options.message))
      let calls = 0
      const fetch: typeof globalThis.fetch = async () => {
        calls += 1
        return Response.json(
          { ...body, private: 'private-provider-details' },
          { status: 429, headers },
        )
      }
      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const registrar = yield* Registrar
          const first = yield* registrar
            .search('acme', 0, 4)
            .pipe(Effect.result)
          const second = yield* registrar
            .search('other', 0, 4)
            .pipe(Effect.result)

          return [first, second]
        }).pipe(
          Effect.provide(
            RegistrarLayer.pipe(Layer.provide(FetchHttpClient.layer)),
          ),
          Effect.provideService(FetchHttpClient.Fetch, fetch),
          Effect.provide([Logger.layer([logger]), TestClock.layer()]),
        ),
      )

      expect(results).toEqual([
        Result.fail(RegistrarError.RateLimited({ retryAfterSeconds })),
        Result.fail(RegistrarError.RateLimited({ retryAfterSeconds })),
      ])
      expect(calls).toBe(1)
      expect(messages).toHaveLength(1)
      expect(messages).toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({
            retryAfterSeconds,
            retryAfterSource: source,
          }),
        ]),
      )
      expect(JSON.stringify(messages)).not.toContain('private-provider-details')
    },
  )

  test('honors the registrar cooldown across requests and recovers when it expires', async () => {
    let calls = 0
    let isLimited = true
    const handler = makeApi(async (...args) => {
      calls += 1
      return isLimited
        ? new Response('', { status: 429, headers: { 'retry-after': '10' } })
        : successfulFetch(...args)
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* Clock.Clock
        const context = Context.make(Clock.Clock, clock)
        expect(
          yield* callSearch(handler, 'acme', '192.0.2.1', context).pipe(
            Effect.result,
          ),
        ).toEqual(
          Result.fail(
            SearchError.RateLimited({
              source: 'Registrar',
              retryAfterSeconds: 10,
            }),
          ),
        )
        const throttledCalls = calls
        isLimited = false
        yield* TestClock.adjust('4 seconds')
        expect(
          yield* callSearch(handler, 'other', '192.0.2.1', context).pipe(
            Effect.result,
          ),
        ).toEqual(
          Result.fail(
            SearchError.RateLimited({
              source: 'Registrar',
              retryAfterSeconds: 6,
            }),
          ),
        )
        expect(calls).toBe(throttledCalls)
        yield* TestClock.adjust('6 seconds')
        expect(
          yield* callSearch(handler, 'other', '192.0.2.1', context),
        ).toHaveLength(556)
        expect(calls).toBe(throttledCalls + 3)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })

  test('one registrar instance keeps concurrent admission policies isolated', async () => {
    const requestedNames: Array<ReadonlyArray<string>> = []
    const denied = RegistrarError.AdmissionLimited({
      source: 'Client',
      retryAfterSeconds: 1,
    })
    const transport: typeof globalThis.fetch = async (input, init) => {
      const names = await readNames(input, init)
      requestedNames.push(names)
      return Response.json(registrarResponse(names))
    }
    const searches = await Effect.runPromise(
      Effect.gen(function* () {
        const registrar = yield* Registrar

        return yield* Effect.all(
          [
            registrar.search('denied', 0, 4).pipe(
              Effect.provideService(RegistrarAdmission, {
                run: () => Effect.fail(denied),
              }),
              Effect.result,
            ),
            registrar.search('acme', 0, 4).pipe(
              Effect.provideService(RegistrarAdmission, {
                run: batch => batch,
              }),
              Effect.result,
            ),
          ],
          { concurrency: 'unbounded' },
        )
      }).pipe(
        Effect.provide(
          RegistrarLayer.pipe(Layer.provide(FetchHttpClient.layer)),
        ),
        Effect.provideService(FetchHttpClient.Fetch, transport),
      ),
    )

    expect(Array.head(searches)).toEqual(Option.some(Result.fail(denied)))
    expect(Array.map(searches, Result.isSuccess)).toEqual([false, true])
    expect(requestedNames).toEqual([
      Array.map(Array.take(domainCandidates('acme'), 4), domain => domain.name),
    ])
  })

  test('waits for slow registrar quotes on later catalog pages', async () => {
    const domains = await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* Clock.Clock
        const delayedFetch: typeof globalThis.fetch = (input, init) =>
          Effect.runPromise(
            Effect.sleep('9 seconds').pipe(
              Effect.andThen(
                Effect.promise(() => successfulFetch(input, init)),
              ),
              Effect.provideService(Clock.Clock, clock),
            ),
            { signal: init?.signal ?? undefined },
          )
        const search = yield* Effect.forkChild(
          Effect.gen(function* () {
            const registrar = yield* Registrar
            return yield* registrar.search('acme', 180, 60)
          }).pipe(
            Effect.provide(
              RegistrarLayer.pipe(Layer.provide(FetchHttpClient.layer)),
            ),
            Effect.provideService(FetchHttpClient.Fetch, delayedFetch),
          ),
        )
        yield* TestClock.adjust('9 seconds')
        return yield* Fiber.join(search)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(domains).toHaveLength(60)
    expect(Array.map(domains, domain => domain.name)).toEqual(
      Array.take(Array.drop(domainCandidates('acme'), 180), 60).map(
        domain => domain.name,
      ),
    )
  })

  test('times out stalled registrar calls and aborts their transport', async () => {
    let abortCount = 0
    const fetch: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            abortCount += 1
            reject(new Error('aborted'))
          },
          { once: true },
        )
      })
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const registrar = yield* Registrar
        const search = yield* Effect.forkChild(
          registrar.search('acme').pipe(Effect.result),
        )
        yield* TestClock.adjust('15 seconds')
        return yield* Fiber.join(search)
      }).pipe(
        Effect.provide(
          RegistrarLayer.pipe(Layer.provide(FetchHttpClient.layer)),
        ),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
        Effect.provide(TestClock.layer()),
      ),
    )
    expect(result._tag).toBe('Failure')
    expect(abortCount).toBe(2)
  })

  test('interrupting an RPC aborts its HTTP request', async () => {
    let isAborted = false
    let markStarted = () => {}
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const fetch: typeof globalThis.fetch = (_input, init) =>
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
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* DomainsClient
          const search = yield* Effect.forkChild(
            client.SearchDomains({ mode: 'Live', label: 'acme' }),
          )
          yield* Effect.promise(() => started)
          yield* Fiber.interrupt(search)
          return yield* Fiber.await(search)
        }),
      ).pipe(
        Effect.provide(makeDomainsClientLayer('http://localhost/rpc')),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    )
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    )
    expect(isAborted).toBe(true)
  })
})

test('default and explicit Demo requests return deterministic sample quotes without external API calls', async () => {
  let providerCalls = 0
  const handler = makeApi(async () => {
    providerCalls += 1
    throw new Error('Demo mode must not call the registrar')
  })
  const domains = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* DomainsClient
        const defaults = yield* client.SearchDomains({
          label: 'acme',
          offset: 0,
          limit: 4,
        })
        const explicit = yield* client.SearchDomains({
          mode: 'Demo',
          label: 'acme',
          offset: 0,
          limit: 4,
        })
        expect(explicit).toEqual(defaults)
        return defaults
      }),
    ).pipe(
      Effect.provide(makeDomainsClientLayer('http://localhost/rpc')),
      Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
        handler(new Request(input, init)),
      ),
    ),
  )
  expect(Array.head(domains).pipe(Option.getOrThrow)).toMatchObject({
    name: 'acme.com',
    price: 12,
  })
  expect(domains).toHaveLength(4)
  expect(providerCalls).toBe(0)
})
