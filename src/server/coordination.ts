import { Effect, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Domain, DomainLabel, QueryWindow } from '../domain'
import { SearchError } from '../domainsRpc'

export const CoordinatedSearch = Schema.Struct({
  label: DomainLabel,
  ...QueryWindow.fields,
  client: Schema.String.check(Schema.isMaxLength(128)),
})

export const SearchOutcome = defineTaggedUnion({
  Success: { domains: Schema.Array(Domain) },
  Failure: { error: SearchError },
})

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

export const searchObject = (
  namespace: SearchNamespace,
  name: string,
  query: typeof CoordinatedSearch.Type,
) =>
  Effect.tryPromise(signal =>
    namespace.getByName(name).fetch(
      new Request('https://domains.internal/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(query),
        signal,
      }),
    ),
  ).pipe(
    Effect.flatMap(response =>
      response.ok
        ? Effect.tryPromise({
            try: () => response.json(),
            catch: () => SearchError.Unavailable(),
          })
        : Effect.fail(SearchError.Unavailable()),
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(SearchOutcome)),
    Effect.catch(() => Effect.fail(SearchError.Unavailable())),
    Effect.flatMap(
      SearchOutcome.match({
        Success: ({ domains }) => Effect.succeed(domains),
        Failure: ({ error }) => Effect.fail(error),
      }),
    ),
  )

export const readCoordinatedSearch = (request: Request) =>
  Effect.tryPromise(() => request.json()).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(CoordinatedSearch)),
  )

export const toSearchResponse = (
  search: Effect.Effect<
    ReadonlyArray<typeof Domain.Type>,
    typeof SearchError.Type
  >,
  signal: AbortSignal,
) =>
  Effect.runPromise(
    search.pipe(
      Effect.map(domains => SearchOutcome.Success({ domains })),
      Effect.catch(error => Effect.succeed(SearchOutcome.Failure({ error }))),
      Effect.map(outcome => Response.json(outcome)),
    ),
    { signal },
  )

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
