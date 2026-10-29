import { DateTime, Option } from 'effect'
import { Headers } from 'effect/http'
import { describe, expect, test } from 'vitest'

import { registrarResponseToRetryAfterSeconds } from './retryAfter'

const NOW_MILLIS = DateTime.toEpochMillis(
  Option.getOrThrow(DateTime.make('2026-10-27T15:00:00Z')),
)

describe('registrar retry delay', () => {
  test.each([
    { headers: { 'retry-after': '12' }, seconds: 12 },
    { headers: { 'retry-after': '1.2' }, seconds: 2 },
    {
      headers: { 'retry-after': 'Tue, 27 Oct 2026 15:00:15 GMT' },
      seconds: 15,
    },
    {
      headers: {
        'x-ratelimit-reset': globalThis.String(NOW_MILLIS / 1000 + 8),
      },
      seconds: 8,
    },
    {
      headers: {
        'retry-after': '3',
        'x-ratelimit-reset': globalThis.String(NOW_MILLIS / 1000 + 20),
      },
      seconds: 3,
    },
    { headers: { 'retry-after': 'Tue, 27 Oct 2026 14:59:00 GMT' }, seconds: 1 },
    { headers: { 'retry-after': 'garbage' }, seconds: 60 },
    { headers: { 'retry-after': '-1' }, seconds: 60 },
    { headers: { 'retry-after': 'NaN' }, seconds: 60 },
    { headers: {}, seconds: 60 },
  ])('uses the provider retry window from $headers', ({ headers, seconds }) => {
    expect(
      registrarResponseToRetryAfterSeconds(
        Headers.fromInput(headers),
        undefined,
        NOW_MILLIS,
      ),
    ).toBe(seconds)
  })
  test.each([
    { body: { retryAfter: { value: 12, str: '12s' } }, seconds: 12 },
    { body: { retryAfter: { value: 12000, str: '12s' } }, seconds: 12 },
    { body: { retryAfter: { value: 90, str: '1m 30s' } }, seconds: 90 },
    { body: { retryAfter: { value: -1, str: '-1s' } }, seconds: 60 },
    { body: { retryAfter: { value: 100, str: '20s' } }, seconds: 60 },
    { body: { retryAfter: { value: 12 } }, seconds: 60 },
  ])('returns $seconds seconds for retry body $body', ({ body, seconds }) => {
    expect(
      registrarResponseToRetryAfterSeconds(Headers.empty, body, NOW_MILLIS),
    ).toBe(seconds)
  })

  test('prefers the HTTP retry header over the response body', () => {
    expect(
      registrarResponseToRetryAfterSeconds(
        Headers.fromInput({ 'retry-after': '5' }),
        { retryAfter: { value: 60, str: '1m' } },
        NOW_MILLIS,
      ),
    ).toBe(5)
  })
})
