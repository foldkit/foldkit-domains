import {
  Cache,
  Data,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Schema,
} from 'effect'
import { HttpServerRequest } from 'effect/http'
import { RateLimiter } from 'effect/persistence'

import { QueryWindow, domainTlds } from '../domain'
import { DomainsRpcs, RateLimitSource, SearchError } from '../domainsRpc'
import { Registrar, RegistrarError } from './registrar'

const SearchQuery = Schema.Struct({
  label: Schema.String,
  ...QueryWindow.fields,
})
class SearchCacheKey extends Data.Class<typeof SearchQuery.Type> {}

const SEARCH_CACHE_CAPACITY = 100
const SEARCH_CACHE_TTL = '1 minute'
const SEARCHES_PER_MINUTE = 30
const UNCACHED_SEARCHES_PER_SECOND = 10

export const SearchHandlersLayer = DomainsRpcs.toLayer(
  Effect.gen(function* () {
    const registrar = yield* Registrar
    const limiter = yield* RateLimiter.RateLimiter
    const cache = yield* Cache.make({
      capacity: SEARCH_CACHE_CAPACITY,
      timeToLive: SEARCH_CACHE_TTL,
      lookup: (query: Readonly<{ label: string }> & typeof QueryWindow.Type) =>
        registrar.search(query.label, query.offset, query.limit),
    })

    const consume = (
      source: typeof RateLimitSource.Type,
      key: string,
      limit: number,
      window: Duration.Input,
    ) =>
      limiter.consume({ key, limit, window, onExceeded: 'fail' }).pipe(
        Effect.catchTag('RateLimiterError', error =>
          Match.value(error.reason).pipe(
            Match.tagsExhaustive({
              RateLimitExceeded: ({ retryAfter }) =>
                Effect.fail(
                  SearchError.RateLimited({
                    source,
                    retryAfterSeconds: Math.max(
                      1,
                      Math.ceil(Duration.toSeconds(retryAfter)),
                    ),
                  }),
                ),
              RateLimitStoreError: () => Effect.fail(SearchError.Unavailable()),
            }),
          ),
        ),
      )

    return {
      SearchDomains: ({ label, offset = 0, limit = domainTlds.length }) =>
        Effect.gen(function* () {
          const query = new SearchCacheKey({ label, offset, limit })
          // NOTE: Workers requests cannot await another request's pending I/O; cache completed quotes only.
          const maybeCachedDomains = yield* Cache.getSuccess(cache, query)

          if (Option.isSome(maybeCachedDomains)) {
            return maybeCachedDomains.value
          } else {
            const maybeRequest = yield* Effect.serviceOption(
              HttpServerRequest.HttpServerRequest,
            )
            const clientIp = Option.match(maybeRequest, {
              onNone: () => 'local',
              onSome: request => request.headers['cf-connecting-ip'] ?? 'local',
            })
            yield* consume(
              'Client',
              `client:${clientIp}`,
              SEARCHES_PER_MINUTE,
              '1 minute',
            )
            yield* consume(
              'Application',
              'registrar',
              UNCACHED_SEARCHES_PER_SECOND,
              '1 second',
            )
            const domains = yield* registrar.search(label, offset, limit).pipe(
              Effect.catch(error =>
                RegistrarError.match<
                  Effect.Effect<never, typeof SearchError.Type>
                >(error, {
                  RateLimited: ({ retryAfterSeconds }) =>
                    Effect.fail(
                      SearchError.RateLimited({
                        source: 'Registrar',
                        retryAfterSeconds,
                      }),
                    ),
                  AdmissionLimited: ({ source, retryAfterSeconds }) =>
                    Effect.fail(
                      SearchError.RateLimited({ source, retryAfterSeconds }),
                    ),
                  Unavailable: () => Effect.fail(SearchError.Unavailable()),
                }),
              ),
            )
            yield* Cache.set(cache, query, domains)
            return domains
          }
        }).pipe(
          Effect.tapError(error =>
            error._tag === 'RateLimited'
              ? Effect.logWarning('Domain lookup throttled', {
                  source: error.source,
                  retryAfterSeconds: error.retryAfterSeconds,
                })
              : Effect.void,
          ),
        ),
    }
  }),
)

export const SearchRateLimiterLayer = RateLimiter.layer.pipe(
  Layer.provide(RateLimiter.layerStoreMemory),
)
