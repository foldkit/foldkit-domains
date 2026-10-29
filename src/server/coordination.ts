import { Cause, Context, Effect, Layer, Predicate, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Domain, DomainCandidateRange, DomainLabel } from '../shared/domain'
import { SearchError } from '../shared/domainsRpc'
import { isSearchTimingEnabled, mergeSearchTimings } from './searchTiming'

export const CoordinatedSearch = Schema.Struct({
  label: DomainLabel,
  ...DomainCandidateRange.fields,
  client: Schema.String.check(Schema.isMaxLength(128)),
})
export type CoordinatedSearch = typeof CoordinatedSearch.Type

export const SearchOutcome = defineTaggedUnion({
  Success: { domains: Schema.Array(Domain) },
  Failure: { error: SearchError },
})
export type SearchOutcome = typeof SearchOutcome.Type

export interface SearchNamespace {
  getByName(name: string): { fetch(request: Request): Promise<Response> }
}

const SearchNamespaceSchema = Schema.declare<SearchNamespace>(
  (value): value is SearchNamespace =>
    Predicate.isObject(value) &&
    'getByName' in value &&
    Predicate.isFunction(value.getByName),
)

export const SearchEnvironment = Schema.Struct({
  DOMAIN_QUOTES: SearchNamespaceSchema,
  REGISTRAR_BUDGET: SearchNamespaceSchema,
  VERCEL_API_TOKEN: Schema.optional(Schema.String),
  REGISTRAR_REQUESTS_PER_SECOND: Schema.optional(Schema.String),
  REGISTRAR_REQUESTS_PER_MINUTE: Schema.optional(Schema.String),
  REGISTRAR_MAX_CONCURRENT: Schema.optional(Schema.String),
})
export type SearchEnvironment = typeof SearchEnvironment.Type

export class CoordinatedSearchClient extends Context.Service<
  CoordinatedSearchClient,
  {
    readonly search: (
      query: CoordinatedSearch,
    ) => Effect.Effect<ReadonlyArray<Domain>, SearchError>
  }
>()('domains/CoordinatedSearchClient') {}

export const makeCoordinatedSearchClientLayer = (
  namespace: SearchNamespace,
  queryToObjectName: (query: CoordinatedSearch) => string,
) =>
  Layer.succeed(CoordinatedSearchClient, {
    search: query =>
      Effect.gen(function* () {
        const isTimingEnabled = yield* isSearchTimingEnabled
        const outcome = yield* Effect.gen(function* () {
          const response = yield* Effect.tryPromise(signal =>
            namespace.getByName(queryToObjectName(query)).fetch(
              new Request('https://domains.internal/search', {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  ...(isTimingEnabled ? { 'x-domains-timing': '1' } : {}),
                },
                body: JSON.stringify(query),
                signal,
              }),
            ),
          )

          if (!response.ok) {
            return yield* Effect.fail(SearchError.Unavailable())
          }

          yield* mergeSearchTimings(response.headers.get('server-timing'))
          const body = yield* Effect.tryPromise(() => response.json())
          return yield* Schema.decodeUnknownEffect(SearchOutcome)(body)
        }).pipe(Effect.catch(() => Effect.fail(SearchError.Unavailable())))

        return yield* SearchOutcome.match(outcome, {
          Success: ({ domains }) => Effect.succeed(domains),
          Failure: ({ error }) => Effect.fail(error),
        })
      }),
  })

export const readCoordinatedSearch = (request: Request) =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise(() => request.json())
    return yield* Schema.decodeUnknownEffect(CoordinatedSearch)(body)
  })

export const handleSearchRequest = <Requirements>(
  request: Request,
  search: (
    query: CoordinatedSearch,
  ) => Effect.Effect<ReadonlyArray<Domain>, SearchError, Requirements>,
) =>
  Effect.gen(function* () {
    const decoded = yield* readCoordinatedSearch(request).pipe(Effect.result)

    if (decoded._tag === 'Failure') {
      return new Response('Invalid search', { status: 400 })
    }

    const outcome = yield* search(decoded.success).pipe(
      Effect.map(domains => SearchOutcome.Success({ domains })),
      Effect.catch(error => Effect.succeed(SearchOutcome.Failure({ error }))),
      Effect.catchDefect(defect =>
        Effect.logError(
          'Coordinated domain search failed unexpectedly',
          Cause.die(defect),
        ).pipe(
          Effect.as(
            SearchOutcome.Failure({ error: SearchError.Unavailable() }),
          ),
        ),
      ),
    )

    return Response.json(outcome)
  })
