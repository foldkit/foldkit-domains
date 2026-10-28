import {
  Array,
  Clock,
  Context,
  Effect,
  Option,
  Ref,
  Schema,
  String,
  pipe,
} from 'effect'

export const SearchPhase = Schema.Literals([
  'rpc',
  'quotes',
  'registrar',
  'cache',
  'cache-write',
  'cache-hit',
  'cache-miss',
  'cache-shared',
  'lookup',
  'queue',
  'budget-persist',
  'provider',
  'demo',
])
export type SearchPhase = typeof SearchPhase.Type

export const SearchTiming = Schema.Struct({
  name: SearchPhase,
  durationMillis: Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
})
export type SearchTiming = typeof SearchTiming.Type

const SearchTimingHeader = Schema.Struct({
  name: SearchPhase,
  durationMillis: Schema.NumberFromString.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
})
const MAX_TIMING_ENTRIES = 64
const NANOSECONDS_PER_MILLISECOND = 1_000_000

class SearchTimings extends Context.Service<
  SearchTimings,
  Ref.Ref<ReadonlyArray<SearchTiming>>
>()('domains/SearchTimings') {}

export const parseSearchTimings = (
  header: string,
): ReadonlyArray<SearchTiming> =>
  pipe(
    String.split(header, ','),
    Array.take(MAX_TIMING_ENTRIES),
    Array.flatMap(segment =>
      pipe(
        String.match(/^([a-z-]+);dur=(\d+(?:\.\d+)?)$/)(String.trim(segment)),
        Option.flatMap(match =>
          Option.all({
            name: Array.get(match, 1),
            durationMillis: Array.get(match, 2),
          }),
        ),
        Option.flatMap(Schema.decodeUnknownOption(SearchTimingHeader)),
        Option.toArray,
      ),
    ),
  )

const appendSearchTimings = (entries: ReadonlyArray<SearchTiming>) =>
  Effect.gen(function* () {
    const maybeTimings = yield* Effect.serviceOption(SearchTimings)

    if (Option.isSome(maybeTimings)) {
      yield* Ref.update(maybeTimings.value, current =>
        Array.take(Array.appendAll(current, entries), MAX_TIMING_ENTRIES),
      )
    }
  })

export const recordSearchCacheResult = (
  name: 'cache-hit' | 'cache-miss' | 'cache-shared',
) => appendSearchTimings([SearchTiming.make({ name, durationMillis: 0 })])

export const isSearchTimingEnabled = Effect.map(
  Effect.serviceOption(SearchTimings),
  Option.isSome,
)

export const mergeSearchTimings = (header: string | null) =>
  header === null
    ? Effect.void
    : appendSearchTimings(parseSearchTimings(header))

export const timeSearchPhase =
  (name: SearchPhase) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const maybeTimings = yield* Effect.serviceOption(SearchTimings)

      if (Option.isNone(maybeTimings)) {
        return yield* effect
      }

      const startedAtNanos = yield* Clock.monotonicTimeNanos

      return yield* effect.pipe(
        Effect.onExit(() =>
          Effect.gen(function* () {
            const finishedAtNanos = yield* Clock.monotonicTimeNanos
            const durationMillis =
              globalThis.Number(finishedAtNanos - startedAtNanos) /
              NANOSECONDS_PER_MILLISECOND
            yield* appendSearchTimings([
              SearchTiming.make({ name, durationMillis }),
            ])
          }),
        ),
      )
    })

export const collectSearchTimings = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  phase: 'rpc' | 'quotes' | 'registrar',
) =>
  Effect.gen(function* () {
    const timings = yield* Ref.make<ReadonlyArray<SearchTiming>>([])
    const value = yield* effect.pipe(
      timeSearchPhase(phase),
      Effect.provideService(SearchTimings, timings),
    )
    const entries = yield* Ref.get(timings)
    const header = pipe(
      entries,
      Array.map(
        ({ name, durationMillis }) =>
          `${name};dur=${durationMillis.toFixed(2)}`,
      ),
      Array.join(', '),
    )

    return { value, header }
  })
