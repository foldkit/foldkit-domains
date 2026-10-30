import { DateTime, Option } from 'effect'
import { Headers } from 'effect/http'
import { describe, expect, test } from 'vitest'

import { registrarResponseToRetryDelay } from './retryAfter'

const NOW_MILLIS = DateTime.toEpochMillis(
  Option.getOrThrow(DateTime.make('2026-10-27T15:00:00Z')),
)

describe('registrar retry delay', () => {
  test.each([
    {
      headers: { 'retry-after': '12' },
      seconds: 12,
      source: 'RetryAfterHeader',
    },
    {
      headers: { 'retry-after': '1.2' },
      seconds: 2,
      source: 'RetryAfterHeader',
    },
    {
      headers: { 'retry-after': '60' },
      seconds: 60,
      source: 'RetryAfterHeader',
    },
    {
      headers: { 'retry-after': 'Tue, 27 Oct 2026 15:00:15 GMT' },
      seconds: 15,
      source: 'RetryAfterHeader',
    },
    {
      headers: {
        'x-ratelimit-reset': globalThis.String(NOW_MILLIS / 1000 + 8),
      },
      seconds: 8,
      source: 'RateLimitResetHeader',
    },
    {
      headers: {
        'retry-after': '3',
        'x-ratelimit-reset': globalThis.String(NOW_MILLIS / 1000 + 20),
      },
      seconds: 3,
      source: 'RetryAfterHeader',
    },
    {
      headers: {
        'retry-after': 'garbage',
        'x-ratelimit-reset': globalThis.String(NOW_MILLIS / 1000 + 8),
      },
      seconds: 8,
      source: 'RateLimitResetHeader',
    },
    {
      headers: { 'retry-after': 'Tue, 27 Oct 2026 14:59:00 GMT' },
      seconds: 1,
      source: 'RetryAfterHeader',
    },
    { headers: { 'retry-after': 'garbage' }, seconds: 60, source: 'Fallback' },
    { headers: { 'retry-after': '-1' }, seconds: 60, source: 'Fallback' },
    { headers: { 'retry-after': 'NaN' }, seconds: 60, source: 'Fallback' },
    { headers: {}, seconds: 60, source: 'Fallback' },
  ])(
    'reads the retry window and source from $headers',
    ({ headers, seconds, source }) => {
      expect(
        registrarResponseToRetryDelay(
          Headers.fromInput(headers),
          undefined,
          NOW_MILLIS,
        ),
      ).toEqual({ retryAfterSeconds: seconds, source })
    },
  )

  test.each([
    {
      body: { retryAfter: { value: 12, str: '12s' } },
      seconds: 12,
      source: 'ResponseBody',
    },
    {
      body: { retryAfter: { value: 12000, str: '12s' } },
      seconds: 12,
      source: 'ResponseBody',
    },
    {
      body: { retryAfter: { value: 90, str: '1m 30s' } },
      seconds: 90,
      source: 'ResponseBody',
    },
    {
      body: { retryAfter: { value: -1, str: '-1s' } },
      seconds: 60,
      source: 'Fallback',
    },
    {
      body: { retryAfter: { value: 100, str: '20s' } },
      seconds: 60,
      source: 'Fallback',
    },
    { body: { retryAfter: { value: 12 } }, seconds: 60, source: 'Fallback' },
  ])(
    'returns $seconds seconds from $source for retry body $body',
    ({ body, seconds, source }) => {
      expect(
        registrarResponseToRetryDelay(Headers.empty, body, NOW_MILLIS),
      ).toEqual({
        retryAfterSeconds: seconds,
        source,
      })
    },
  )

  test('prefers the HTTP retry header over the response body', () => {
    expect(
      registrarResponseToRetryDelay(
        Headers.fromInput({ 'retry-after': '5' }),
        { retryAfter: { value: 60, str: '1m' } },
        NOW_MILLIS,
      ),
    ).toEqual({ retryAfterSeconds: 5, source: 'RetryAfterHeader' })
  })
})
