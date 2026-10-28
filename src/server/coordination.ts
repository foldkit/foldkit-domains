import { Context, Effect, Layer, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Domain, DomainLabel, QuoteWindow } from '../shared/domain'
import { SearchError } from '../shared/domainsRpc'

export const CoordinatedSearch = Schema.Struct({
  label: DomainLabel,
  ...QuoteWindow.fields,
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

export interface SearchEnvironment {
  readonly DOMAIN_QUOTES: SearchNamespace
  readonly REGISTRAR_BUDGET: SearchNamespace
  readonly VERCEL_API_TOKEN?: string
  readonly REGISTRAR_REQUESTS_PER_SECOND?: string
  readonly REGISTRAR_REQUESTS_PER_MINUTE?: string
  readonly REGISTRAR_MAX_CONCURRENT?: string
}

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
        const outcome = yield* Effect.gen(function* () {
          const response = yield* Effect.tryPromise(signal =>
            namespace.getByName(queryToObjectName(query)).fetch(
              new Request('https://domains.internal/search', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(query),
                signal,
              }),
            ),
          )

          if (!response.ok) {
            return yield* Effect.fail(SearchError.Unavailable())
          }

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
      Effect.catchDefect(() =>
        Effect.succeed(
          SearchOutcome.Failure({ error: SearchError.Unavailable() }),
        ),
      ),
    )

    return Response.json(outcome)
  })

export const respondToCancellation = (
  response: Promise<Response>,
  signal: AbortSignal,
) =>
  response.catch(error => {
    if (signal.aborted) {
      return new Response(null, { status: 499 })
    } else {
      throw error
    }
  })
