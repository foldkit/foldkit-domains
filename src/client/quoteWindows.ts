import { Clock, Duration, Effect, Option, Schema } from 'effect'
import * as Query from 'foldkit/experimental/query'

import { Domain, DomainLabel, QuoteWindow } from '../shared/domain'
import { DomainsClient } from './rpc'
import { SearchCooldown, formatRateLimitMessage } from './searchCooldown'

const SEARCH_DEBOUNCE = '350 millis'
const SEARCH_TIMEOUT = '20 seconds'

export const QuoteWindowArgs = Schema.Struct({
  label: DomainLabel,
  ...QuoteWindow.fields,
})
export type QuoteWindowArgs = typeof QuoteWindowArgs.Type

export const QuoteFailure = Schema.Struct({
  error: Schema.String,
  maybeSearchCooldown: Schema.Option(SearchCooldown),
})
export type QuoteFailure = typeof QuoteFailure.Type

export const QuoteWindows = Query.define({
  name: 'QuoteWindows',
  args: QuoteWindowArgs.fields,
  data: Schema.Array(Domain),
  error: QuoteFailure,
  staleTime: '1 minute',
  maxSettledEntries: 100,
  notifyOnCompletion: true,
  handler: function* () {
    const client = yield* DomainsClient

    return args => {
      const unavailable = (error: string) =>
        Effect.fail(
          QuoteFailure.make({ error, maybeSearchCooldown: Option.none() }),
        )

      return Effect.gen(function* () {
        yield* Effect.sleep(SEARCH_DEBOUNCE)
        return yield* client.SearchDomains(args)
      }).pipe(
        Effect.timeout(SEARCH_TIMEOUT),
        Effect.catchTags({
          RateLimited: ({ source, retryAfterSeconds }) =>
            Effect.gen(function* () {
              const nowMillis = yield* Clock.currentTimeMillis
              return yield* Effect.fail(
                QuoteFailure.make({
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
          Schema.is(QuoteFailure)(error)
            ? Effect.fail(error)
            : unavailable('Could not search domains. Please try again.'),
        ),
        Effect.catchDefect(() =>
          unavailable('Could not search domains. Please try again.'),
        ),
      )
    }
  },
})
