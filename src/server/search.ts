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

import { DomainCandidateRange, domainTlds } from '../shared/domain'
import { DomainsRpcs, RateLimitSource, SearchError } from '../shared/domainsRpc'
import { searchDemoDomains } from './demoSearch'
import { Registrar, RegistrarError } from './registrar'
import { recordSearchCacheResult, timeSearchPhase } from './searchTiming'

const SearchQuery = Schema.Struct({
  label: Schema.String,
  ...DomainCandidateRange.fields,
})
type SearchQuery = typeof SearchQuery.Type
class SearchCacheKey extends Data.Class<SearchQuery> {}

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
      lookup: (query: Readonly<{ label: string }> & DomainCandidateRange) =>
        registrar.search(query.label, query.offset, query.limit),
    })

    const consume = (
      source: RateLimitSource,
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
      SearchDomains: ({
        mode: dataSource = 'Demo',
        label,
        offset = 0,
        limit = domainTlds.length,
      }) =>
        Effect.gen(function* () {
          if (dataSource === 'Demo') {
            return yield* searchDemoDomains(label, { offset, limit })
          }

          const query = new SearchCacheKey({ label, offset, limit })
          // NOTE: Workers requests cannot await another request's pending I/O; cache completed results only.
          const maybeCachedDomains = yield* Cache.getSuccess(cache, query).pipe(
            timeSearchPhase('cache'),
          )

          if (Option.isSome(maybeCachedDomains)) {
            yield* recordSearchCacheResult('cache-hit')
            return maybeCachedDomains.value
          } else {
            yield* recordSearchCacheResult('cache-miss')
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
                RegistrarError.match<Effect.Effect<never, SearchError>>(error, {
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

            yield* Cache.set(cache, query, domains).pipe(
              timeSearchPhase('cache-write'),
            )

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
