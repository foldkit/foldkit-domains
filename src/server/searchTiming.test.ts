import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, test } from 'vitest'

import {
  collectSearchTimings,
  mergeSearchTimings,
  parseSearchTimings,
  recordSearchCacheResult,
  timeSearchPhase,
} from './searchTiming'

describe('search request timings', () => {
  test('measures failed phases and merges coordinator timings without crossing request scopes', async () => {
    const measured = await Effect.runPromise(
      collectSearchTimings(
        Effect.gen(function* () {
          yield* recordSearchCacheResult('cache-miss')
          yield* mergeSearchTimings('queue;dur=12.5, registrar;dur=62.5')
          return yield* TestClock.adjust('50 millis').pipe(
            Effect.andThen(Effect.fail('provider unavailable')),
            timeSearchPhase('provider'),
            Effect.result,
          )
        }),
        'rpc',
      ).pipe(Effect.provide(TestClock.layer())),
    )

    expect(measured.value._tag).toBe('Failure')
    expect(parseSearchTimings(measured.header)).toEqual([
      { name: 'cache-miss', durationMillis: 0 },
      { name: 'queue', durationMillis: 12.5 },
      { name: 'registrar', durationMillis: 62.5 },
      { name: 'provider', durationMillis: 50 },
      { name: 'rpc', durationMillis: 50 },
    ])

    const nextRequest = await Effect.runPromise(
      collectSearchTimings(recordSearchCacheResult('cache-hit'), 'rpc'),
    )
    expect(
      parseSearchTimings(nextRequest.header).map(({ name }) => name),
    ).toEqual(['cache-hit', 'rpc'])
  })

  test('ignores malformed, unknown, and nonfinite upstream timing entries', () => {
    expect(
      parseSearchTimings(
        'provider;dur=25.5, domain-secret;dur=12, queue;dur=-1, cache;dur=Infinity, rpc;dur=NaN, provider;dur=1e999, quotes;dur=4',
      ),
    ).toEqual([
      { name: 'provider', durationMillis: 25.5 },
      { name: 'quotes', durationMillis: 4 },
    ])
  })
})
