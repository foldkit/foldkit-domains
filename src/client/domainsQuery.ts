import { Cause, Clock, Duration, Effect, Option, Schema } from 'effect'
import * as Query from 'foldkit/experimental/query'

import { DataSource } from '../shared/dataSource'
import { Domain, DomainCandidateRange, DomainLabel } from '../shared/domain'
import { DomainsClient } from './rpc'
import { SearchCooldown, formatRateLimitMessage } from './searchCooldown'

const SEARCH_DEBOUNCE = '150 millis'
const SEARCH_TIMEOUT = '20 seconds'

export const DomainsQueryArgs = Schema.Struct({
  dataSource: DataSource,
  label: DomainLabel,
  ...DomainCandidateRange.fields,
})
export type DomainsQueryArgs = typeof DomainsQueryArgs.Type

export const DomainsQueryFailure = Schema.Struct({
  error: Schema.String,
  maybeSearchCooldown: Schema.Option(SearchCooldown),
})
export type DomainsQueryFailure = typeof DomainsQueryFailure.Type

export const fetchDomains = (args: DomainsQueryArgs) => {
  const unavailable = (error: string) =>
    Effect.fail(
      DomainsQueryFailure.make({ error, maybeSearchCooldown: Option.none() }),
    )

  return Effect.gen(function* () {
    const client = yield* DomainsClient

    if (args.offset === 0) {
      yield* Effect.sleep(SEARCH_DEBOUNCE)
    }

    return yield* client.SearchDomains({
      mode: args.dataSource,
      label: args.label,
      offset: args.offset,
      limit: args.limit,
    })
  }).pipe(
    Effect.timeout(SEARCH_TIMEOUT),
    Effect.catchTags({
      RateLimited: ({ source, retryAfterSeconds }) =>
        Effect.gen(function* () {
          const nowMillis = yield* Clock.currentTimeMillis
          return yield* Effect.fail(
            DomainsQueryFailure.make({
              error: formatRateLimitMessage(source, retryAfterSeconds),
              maybeSearchCooldown: Option.some(
                SearchCooldown.make({
                  source,
                  expiresAtMillis:
                    nowMillis +
                    Duration.toMillis(Duration.seconds(retryAfterSeconds)),
                }),
              ),
            }),
          )
        }),
      Unavailable: () =>
        unavailable(
          'Could not check availability and prices. Please try again.',
        ),
    }),
    Effect.catch(error =>
      Schema.is(DomainsQueryFailure)(error)
        ? Effect.fail(error)
        : unavailable('Could not search domains. Please try again.'),
    ),
    Effect.catchDefect(defect =>
      Effect.logError(
        'Domain lookup failed unexpectedly',
        Cause.die(defect),
      ).pipe(
        Effect.andThen(
          unavailable('Could not search domains. Please try again.'),
        ),
      ),
    ),
  )
}

export const DomainsQuery = Query.define({
  name: 'DomainsQuery',
  args: DomainsQueryArgs.fields,
  data: Schema.Array(Domain),
  error: DomainsQueryFailure,
  staleTime: '1 minute',
  maxSettledEntries: 100,
  notifyOnCompletion: true,
  handler: function* () {
    const client = yield* DomainsClient

    return args =>
      fetchDomains(args).pipe(Effect.provideService(DomainsClient, client))
  },
})

export type DomainsQueryCompletedFetch =
  typeof DomainsQuery.OutMessage.CompletedFetch.Type
