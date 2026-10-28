import {
  Array,
  Effect,
  Fiber,
  Number,
  Option,
  Result,
  Schema,
  pipe,
} from 'effect'
import { FetchHttpClient } from 'effect/http'

import { expect, test } from '@playwright/test'

import { DomainsClient, makeDomainsClientLayer } from '../src/client/rpc'
import { CoordinatedSearch, SearchOutcome } from '../src/server/coordination'
import { QuoteWindow } from '../src/shared/domain'
import { SearchError } from '../src/shared/domainsRpc'

const CLIENT_COUNT = 300
const Stats = Schema.Struct({
  instanceId: Schema.String,
  calls: Schema.Int,
  inFlight: Schema.Int,
  maximumInFlight: Schema.Int,
  aborted: Schema.Int,
  starts: Schema.Array(Schema.Number),
})

const search = (
  baseURL: string | undefined,
  label: string,
  client = '192.0.2.1',
  window: QuoteWindow = { offset: 0, limit: 60 },
  path = '/rpc',
  rpcHeaders: Readonly<Record<string, string>> = {},
) => {
  if (baseURL === undefined) {
    throw new Error('Capacity tests require the controlled Worker URL')
  }

  return Effect.scoped(
    Effect.gen(function* () {
      const rpc = yield* DomainsClient
      return yield* rpc.SearchDomains(
        { label, ...window },
        { headers: rpcHeaders },
      )
    }),
  ).pipe(
    Effect.provide(makeDomainsClientLayer(`${baseURL}${path}`)),
    Effect.provideService(FetchHttpClient.Fetch, (input, init) => {
      const request = new Request(input, init)
      request.headers.set('cf-connecting-ip', client)
      return globalThis.fetch(request)
    }),
    Effect.timeout('20 seconds'),
  )
}

const readStats = async (baseURL: string | undefined, path = '/stats') =>
  Schema.decodeUnknownSync(Stats)(
    await (await fetch(`${baseURL}${path}`)).json(),
  )

test('300 identical cold-window clients share one provider lookup and reuse completed quotes', async ({
  baseURL,
}, testInfo) => {
  const before = await readStats(baseURL)
  const started = performance.now()
  const domains = await Effect.runPromise(
    Effect.forEach(
      Array.range(1, CLIENT_COUNT),
      index => search(baseURL, 'shared-capacity', `2001:db8::${index}`),
      { concurrency: 'unbounded' },
    ),
  )
  const after = await readStats(baseURL)
  expect(domains).toHaveLength(CLIENT_COUNT)

  for (const result of domains) {
    expect(result).toHaveLength(60)
    expect(Option.getOrThrow(Array.head(result))).toEqual({
      _tag: 'Available',
      name: 'shared-capacity.com',
      tld: 'com',
      price: 13,
      renewalPrice: 14,
      years: 1,
      isPremium: false,
    })
  }

  expect(after.calls - before.calls).toBe(1)
  expect(await Effect.runPromise(search(baseURL, 'shared-capacity'))).toEqual(
    Option.getOrThrow(Array.head(domains)),
  )
  expect((await readStats(baseURL)).calls).toBe(after.calls)
  await testInfo.attach('identical-query-capacity', {
    body: JSON.stringify({
      clients: CLIENT_COUNT,
      providerCalls: after.calls - before.calls,
      totalMilliseconds: performance.now() - started,
    }),
    contentType: 'application/json',
  })
})

test('300 distinct-query clients complete within the configured provider budget', async ({
  baseURL,
}, testInfo) => {
  const before = await readStats(baseURL)
  const started = performance.now()
  const results = await Effect.runPromise(
    Effect.forEach(
      Array.range(1, CLIENT_COUNT),
      index =>
        search(
          baseURL,
          `distinct-capacity-${index}`,
          `2001:db8:1::${index}`,
        ).pipe(
          Effect.result,
          Effect.map(result => ({
            result,
            milliseconds: performance.now() - started,
          })),
        ),
      { concurrency: 'unbounded' },
    ),
  )
  const after = await readStats(baseURL)
  const failures = Array.filter(results, ({ result }) =>
    Result.isFailure(result),
  )
  expect(failures.length, JSON.stringify(Array.take(failures, 3))).toBe(0)
  expect(after.calls - before.calls).toBe(CLIENT_COUNT)
  expect(after.maximumInFlight).toBeLessThanOrEqual(24)
  const durations = pipe(
    results,
    Array.map(result => result.milliseconds),
    Array.sort(Number.Order),
  )
  const elapsed = performance.now() - started
  await testInfo.attach('distinct-query-capacity', {
    body: JSON.stringify({
      clients: CLIENT_COUNT,
      providerCalls: after.calls - before.calls,
      failures: failures.length,
      totalMilliseconds: elapsed,
      requestsPerSecond: CLIENT_COUNT / (elapsed / 1000),
      medianMilliseconds: Option.getOrThrow(Array.get(durations, 149)),
      p95Milliseconds: Option.getOrThrow(Array.get(durations, 284)),
      maximumProviderConcurrency: after.maximumInFlight,
      configuredProviderRequestsPerSecond: 1000,
      configuredProviderRequestsPerMinute: 60000,
      controlledProviderLatencyMilliseconds: 50,
    }),
    contentType: 'application/json',
  })
})

test('cancelling one shared client preserves the other lookup; cancelling the final client releases provider work', async ({
  baseURL,
}) => {
  const before = await readStats(baseURL)
  const cancelled = Effect.runFork(
    search(
      baseURL,
      'cancel-shared',
      '192.0.2.10',
      { offset: 0, limit: 60 },
      '/abort/rpc',
    ).pipe(Effect.result),
  )
  const other = Effect.runFork(search(baseURL, 'cancel-shared', '192.0.2.11'))
  expect(await Effect.runPromise(Fiber.join(other))).toHaveLength(60)
  await Effect.runPromise(Fiber.join(cancelled))
  expect((await readStats(baseURL)).calls - before.calls).toBe(1)
  expect((await readStats(baseURL)).aborted).toBe(before.aborted)

  const abandoned = Effect.runFork(
    search(
      baseURL,
      'cancel-abandoned',
      '192.0.2.12',
      { offset: 0, limit: 60 },
      '/abort/rpc',
    ).pipe(Effect.result),
  )
  await expect.poll(async () => (await readStats(baseURL)).inFlight).toBe(1)
  await Effect.runPromise(Fiber.join(abandoned))
  await expect
    .poll(async () => (await readStats(baseURL)).aborted)
    .toBe(before.aborted + 1)
  await expect.poll(async () => (await readStats(baseURL)).inFlight).toBe(0)
  expect(
    await Effect.runPromise(search(baseURL, 'after-abandon')),
  ).toHaveLength(60)
})

test('provider cooldown applies across labels and permits recovery after expiry', async ({
  baseURL,
}) => {
  const first = await Effect.runPromise(
    search(baseURL, 'throttle-shared').pipe(Effect.result),
  )
  expect(first).toEqual(
    Result.fail(
      SearchError.RateLimited({ source: 'Registrar', retryAfterSeconds: 1 }),
    ),
  )
  const before = await readStats(baseURL)
  const blocked = await Effect.runPromise(
    search(baseURL, 'another-label').pipe(Effect.result),
  )
  expect(blocked).toEqual(
    Result.fail(
      SearchError.RateLimited({ source: 'Registrar', retryAfterSeconds: 1 }),
    ),
  )
  expect((await readStats(baseURL)).calls).toBe(before.calls)
  await expect
    .poll(async () =>
      Result.isSuccess(
        await Effect.runPromise(
          search(baseURL, 'throttle-shared').pipe(Effect.result),
        ),
      ),
    )
    .toBe(true)
})

test('shared admission meters every batch and rejects excess work within a bounded queue deadline', async ({
  baseURL,
}) => {
  const before = await readStats(baseURL, '/low/stats')
  const results = await Effect.runPromise(
    Effect.forEach(
      Array.range(1, 12),
      index =>
        search(
          baseURL,
          `budget-${index}`,
          `2001:db8:2::${index}`,
          { offset: 0, limit: 556 },
          '/low/rpc',
        ).pipe(Effect.result),
      { concurrency: 'unbounded' },
    ),
  )
  const after = await readStats(baseURL, '/low/stats')
  expect(Array.some(results, Result.isFailure)).toBe(true)
  expect(after.maximumInFlight).toBeLessThanOrEqual(2)
  expect(after.calls - before.calls).toBeLessThanOrEqual(10)

  for (const result of results) {
    if (Result.isFailure(result)) {
      expect(result.failure).toEqual(
        SearchError.RateLimited({
          source: 'Application',
          retryAfterSeconds: 1,
        }),
      )
    }
  }

  await expect
    .poll(async () =>
      Result.isSuccess(
        await Effect.runPromise(
          search(
            baseURL,
            'budget-recovery',
            '192.0.2.15',
            { offset: 0, limit: 60 },
            '/low/rpc',
          ).pipe(Effect.result),
        ),
      ),
    )
    .toBe(true)
})

test('completed windows stay independent, expire, and failed lookups can retry', async ({
  baseURL,
  request,
}) => {
  const before = await readStats(baseURL)
  const first = await Effect.runPromise(search(baseURL, 'cache-windows'))
  const second = await Effect.runPromise(
    search(baseURL, 'cache-windows', '192.0.2.20', { offset: 60, limit: 60 }),
  )
  expect(Option.getOrThrow(Array.head(first)).name).toBe('cache-windows.com')
  expect(Option.getOrThrow(Array.head(second)).name).not.toBe(
    'cache-windows.com',
  )
  expect(await Effect.runPromise(search(baseURL, 'cache-windows'))).toEqual(
    first,
  )
  expect((await readStats(baseURL)).calls - before.calls).toBe(2)
  const reopened = await request.post('/reopen/cache-windows', {
    data: { label: 'cache-windows', offset: 0, limit: 60, client: 'local' },
  })
  expect(await reopened.json()).toEqual({ _tag: 'Success', domains: first })
  expect((await readStats(baseURL)).calls - before.calls).toBe(2)
  expect((await request.post('/expire/cache-windows')).status()).toBe(204)
  expect(await Effect.runPromise(search(baseURL, 'cache-windows'))).toEqual(
    first,
  )
  expect((await readStats(baseURL)).calls - before.calls).toBe(3)

  const failure = await Effect.runPromise(
    search(baseURL, 'failure-once-search').pipe(Effect.result),
  )
  expect(failure).toEqual(Result.fail(SearchError.Unavailable()))
  expect(
    await Effect.runPromise(search(baseURL, 'failure-once-search')),
  ).toHaveLength(60)
  expect((await readStats(baseURL)).calls - before.calls).toBe(5)
})

test('client admission uses the physical identity and completed quotes bypass exhausted quotas', async ({
  baseURL,
}) => {
  const client = '192.0.2.30'
  const before = await readStats(baseURL)
  const first = await Effect.runPromise(
    search(baseURL, 'client-budget-1', client),
  )
  await Effect.runPromise(
    Effect.forEach(
      Array.range(2, 30),
      index => search(baseURL, `client-budget-${index}`, client),
      { concurrency: 1 },
    ),
  )
  const blocked = await Effect.runPromise(
    search(
      baseURL,
      'client-budget-blocked',
      client,
      { offset: 0, limit: 60 },
      '/rpc',
      { 'cf-connecting-ip': '192.0.2.31' },
    ).pipe(Effect.result),
  )
  expect(Result.isFailure(blocked)).toBe(true)

  if (Result.isFailure(blocked)) {
    expect(blocked.failure).toMatchObject({
      _tag: 'RateLimited',
      source: 'Client',
    })
  }

  expect(
    await Effect.runPromise(search(baseURL, 'client-budget-1', client)),
  ).toEqual(first)
  expect((await readStats(baseURL)).calls - before.calls).toBe(30)
  expect(
    await Effect.runPromise(
      search(baseURL, 'client-budget-blocked', '192.0.2.31'),
    ),
  ).toHaveLength(60)
})

test('loads a slow later quote page and can request the following page', async ({
  baseURL,
}) => {
  const before = await readStats(baseURL)
  expect(
    await Effect.runPromise(search(baseURL, 'slow-page-prices')),
  ).toHaveLength(60)
  const later = await Effect.runPromise(
    search(baseURL, 'slow-page-prices', '192.0.2.40', {
      offset: 180,
      limit: 60,
    }),
  )
  expect(later).toHaveLength(60)
  expect(Option.getOrThrow(Array.head(later))).toMatchObject({
    name: 'slow-page-prices.eus',
    _tag: 'Available',
    price: 13,
  })
  expect(
    await Effect.runPromise(
      search(baseURL, 'slow-page-prices', '192.0.2.40', {
        offset: 240,
        limit: 60,
      }),
    ),
  ).toHaveLength(60)
  expect((await readStats(baseURL)).calls - before.calls).toBe(3)
})

for (const { name, label, initialTag, rateLimitSource } of [
  {
    name: 'quota',
    label: 'persist-quota',
    initialTag: 'Success',
    rateLimitSource: 'Application',
  },
  {
    name: 'cooldown',
    label: 'throttle-persist-cooldown',
    initialTag: 'Failure',
    rateLimitSource: 'Registrar',
  },
]) {
  test(`registrar ${name} survives a Durable Object restart`, async ({
    baseURL,
    request,
  }) => {
    const path = `/persistence/${name}`
    const query = CoordinatedSearch.make({
      label,
      offset: 0,
      limit: 60,
      client: '192.0.2.50',
    })
    const first = Schema.decodeUnknownSync(SearchOutcome)(
      await (await request.post(`${path}/search`, { data: query })).json(),
    )
    expect(first._tag).toBe(initialTag)
    const before = await readStats(baseURL, `${path}/stats`)
    expect(before.calls).toBe(1)
    expect(before.inFlight).toBe(0)

    expect((await request.post(`${path}/restart`)).status()).toBe(204)
    const restarted = await readStats(baseURL, `${path}/stats`)
    expect(restarted.instanceId).not.toBe(before.instanceId)
    expect(restarted.calls).toBe(0)

    const blocked = Schema.decodeUnknownSync(SearchOutcome)(
      await (
        await request.post(`${path}/search`, {
          data: { ...query, label: `after-restart-${name}` },
        })
      ).json(),
    )
    expect(blocked).toMatchObject({
      _tag: 'Failure',
      error: { _tag: 'RateLimited', source: rateLimitSource },
    })
    expect((await readStats(baseURL, `${path}/stats`)).calls).toBe(0)
  })
}
