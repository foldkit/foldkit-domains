import { Array, Effect, Fiber, Result, Schema } from 'effect'

import { expect, test } from '@playwright/test'

import { DomainsClient, makeDomainsClientLayer } from '../src/client/rpc'
import { SearchError } from '../src/shared/domainsRpc'

const SEARCH_BURST_SIZE = 10

const Stats = Schema.Struct({
  calls: Schema.Int,
  inFlight: Schema.Int,
  maximumInFlight: Schema.Int,
})

const searchDomains = (baseURL: string | undefined, label: string) => {
  if (baseURL === undefined) {
    throw new Error('The Worker RPC regression requires a base URL')
  }

  return Effect.scoped(
    Effect.gen(function* () {
      const client = yield* DomainsClient
      return yield* client.SearchDomains({ mode: 'Live', label })
    }),
  ).pipe(
    Effect.provide(makeDomainsClientLayer(`${baseURL}/rpc`)),
    Effect.timeout('10 seconds'),
  )
}

test('overlapping HTTP requests use independent lookups and reuse completed quotes', async ({
  baseURL,
  request,
}) => {
  const readStats = async () =>
    Schema.decodeUnknownSync(Stats)(await (await request.get('/stats')).json())
  const before = await readStats()
  const [first, duplicate] = await Effect.runPromise(
    Effect.all(
      [searchDomains(baseURL, 'overlap'), searchDomains(baseURL, 'overlap')],
      { concurrency: 'unbounded' },
    ),
  )
  expect(first).toHaveLength(556)
  expect(duplicate).toEqual(first)
  expect((await readStats()).calls - before.calls).toBe(6)
  expect(await Effect.runPromise(searchDomains(baseURL, 'overlap'))).toEqual(
    first,
  )
  expect((await readStats()).calls - before.calls).toBe(6)
})

test('excess uncached searches fail promptly and recover after the admission window', async ({
  baseURL,
  request,
}) => {
  const searches = Effect.runPromise(
    Effect.all(
      Array.map(Array.range(1, SEARCH_BURST_SIZE), index =>
        searchDomains(baseURL, `capacity-${index}`),
      ),
      { concurrency: 'unbounded' },
    ),
  )
  await expect
    .poll(
      async () =>
        Schema.decodeUnknownSync(Stats)(
          await (await request.get('/stats')).json(),
        ).inFlight,
    )
    .toBe(SEARCH_BURST_SIZE * 2)
  const overloaded = await Effect.runPromise(
    searchDomains(baseURL, 'capacity-three').pipe(Effect.result),
  )
  expect(overloaded).toEqual(
    Result.fail(
      SearchError.RateLimited({ source: 'Application', retryAfterSeconds: 1 }),
    ),
  )
  for (const domains of await searches) {
    expect(domains).toHaveLength(556)
  }
  expect(
    await Effect.runPromise(searchDomains(baseURL, 'capacity-three')),
  ).toHaveLength(556)
  const stats = Schema.decodeUnknownSync(Stats)(
    await (await request.get('/stats')).json(),
  )
  expect(stats.maximumInFlight).toBe(SEARCH_BURST_SIZE * 2)
})

test('cancelled HTTP requests cannot leave admission permanently blocked', async ({
  baseURL,
  request,
}) => {
  const searches = Array.map(Array.range(1, SEARCH_BURST_SIZE), index =>
    Effect.runFork(searchDomains(baseURL, `cancelled-${index}`)),
  )

  try {
    await expect
      .poll(
        async () =>
          Schema.decodeUnknownSync(Stats)(
            await (await request.get('/stats')).json(),
          ).inFlight,
      )
      .toBe(SEARCH_BURST_SIZE * 2)
  } finally {
    await Effect.runPromise(
      Effect.all(Array.map(searches, Fiber.interrupt), {
        concurrency: 'unbounded',
      }),
    )
  }

  await expect
    .poll(
      async () => {
        const result = await Effect.runPromise(
          searchDomains(baseURL, 'after-cancel').pipe(Effect.result),
        )

        if (Result.isSuccess(result)) {
          expect(result.success).toHaveLength(556)
          return true
        } else {
          expect(result.failure).toEqual(
            SearchError.RateLimited({
              source: 'Application',
              retryAfterSeconds: 1,
            }),
          )
          return false
        }
      },
      { timeout: 5000 },
    )
    .toBe(true)
})
