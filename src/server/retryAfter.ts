import { Array, DateTime, Duration, Number, Option, Schema } from 'effect'
import { Headers } from 'effect/http'

const DEFAULT_RETRY_AFTER_SECONDS = 60
const MILLISECONDS_PER_SECOND = 1000

export const RegistrarRetryDelay = Schema.Struct({
  retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  source: Schema.Literals([
    'RetryAfterHeader',
    'RateLimitResetHeader',
    'ResponseBody',
    'Fallback',
  ]),
})
export type RegistrarRetryDelay = typeof RegistrarRetryDelay.Type

const parseSeconds = (value: string) =>
  Number.parse(value).pipe(
    Option.filter(
      seconds => globalThis.Number.isFinite(seconds) && seconds >= 0,
    ),
  )

const RateLimitBody = Schema.Struct({
  retryAfter: Schema.Struct({
    value: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    str: Schema.String,
  }),
})

const bodyToMaybeRetryAfterSeconds = (body: unknown) =>
  Schema.decodeUnknownOption(RateLimitBody)(body).pipe(
    Option.flatMap(({ retryAfter }) =>
      Array.findFirst(
        [Duration.seconds(retryAfter.value), Duration.millis(retryAfter.value)],
        duration => Duration.format(duration) === retryAfter.str,
      ),
    ),
    Option.map(Duration.toSeconds),
  )

const makeRetryDelay = (
  seconds: number,
  source: RegistrarRetryDelay['source'],
): RegistrarRetryDelay =>
  RegistrarRetryDelay.make({
    retryAfterSeconds: Math.max(1, Math.ceil(seconds)),
    source,
  })

export const registrarResponseToRetryDelay = (
  headers: Headers.Headers,
  body: unknown,
  nowMillis: number,
): RegistrarRetryDelay => {
  const maybeRetryAfter = Option.fromUndefinedOr(headers['retry-after']).pipe(
    Option.flatMap(value =>
      Number.parse(value).pipe(
        Option.match({
          onSome: () => parseSeconds(value),
          onNone: () =>
            DateTime.make(value).pipe(
              Option.map(
                dateTime =>
                  (DateTime.toEpochMillis(dateTime) - nowMillis) /
                  MILLISECONDS_PER_SECOND,
              ),
            ),
        }),
      ),
    ),
  )

  return maybeRetryAfter.pipe(
    Option.map(seconds => makeRetryDelay(seconds, 'RetryAfterHeader')),
    Option.orElse(() =>
      Option.fromUndefinedOr(headers['x-ratelimit-reset']).pipe(
        Option.flatMap(parseSeconds),
        Option.map(reset => reset - nowMillis / MILLISECONDS_PER_SECOND),
        Option.map(seconds => makeRetryDelay(seconds, 'RateLimitResetHeader')),
      ),
    ),
    Option.orElse(() =>
      bodyToMaybeRetryAfterSeconds(body).pipe(
        Option.map(seconds => makeRetryDelay(seconds, 'ResponseBody')),
      ),
    ),
    Option.getOrElse(() =>
      makeRetryDelay(DEFAULT_RETRY_AFTER_SECONDS, 'Fallback'),
    ),
  )
}
