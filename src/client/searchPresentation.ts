import { Array, Duration, Effect, Option, Schema, String, pipe } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

import { Domain, QuoteWindow, queryToMaybeDomainLabel } from '../shared/domain'
import { mergeDomainQuotes } from './domain'
import type { Model } from './model'
import { QuoteWindows } from './quoteWindows'
import { routeToQuery } from './route'
import { formatRateLimitMessage } from './searchCooldown'

export const QuoteRequestPresentation = defineTaggedUnion({
  Idle: {},
  Loading: QuoteWindow.fields,
  Failed: { ...QuoteWindow.fields, error: Schema.String },
})
export type QuoteRequestPresentation = typeof QuoteRequestPresentation.Type

export const SearchPresentation = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ready: {
    domains: Schema.Array(Domain),
    quoteRequest: QuoteRequestPresentation.pipe(
      Schema.withConstructorDefault(
        Effect.succeed(QuoteRequestPresentation.Idle()),
      ),
    ),
  },
  Failed: { error: Schema.String },
})
export type SearchPresentation = typeof SearchPresentation.Type

export const searchPresentation = (model: Model): SearchPresentation => {
  const query = routeToQuery(model.route)

  if (String.isEmpty(query)) {
    return SearchPresentation.Idle()
  }

  const maybeLabel = queryToMaybeDomainLabel(query)

  if (Option.isNone(maybeLabel)) {
    return SearchPresentation.Failed({
      error:
        'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
    })
  }

  const windows = Array.map(model.quotePlan, window => ({
    window,
    data: QuoteWindows.read(model.quoteWindows, {
      label: maybeLabel.value,
      ...window,
    }),
  }))
  const domains = Array.reduce(
    windows,
    Array.empty<Domain>(),
    (quotes, { data }) =>
      AsyncData.isPending(data)
        ? quotes
        : Option.match(AsyncData.getData(data), {
            onNone: () => quotes,
            onSome: incoming => mergeDomainQuotes(quotes, incoming),
          }),
  )
  const maybePending = Array.findFirst(windows, ({ data }) =>
    AsyncData.isPending(data),
  )
  const maybeFailure = pipe(
    windows,
    Array.findLast(({ data }) => AsyncData.hasError(data)),
    Option.flatMap(({ window, data }) =>
      Option.map(AsyncData.getError(data), failure => ({
        ...window,
        error: failure.error,
      })),
    ),
    Option.orElse(() =>
      Option.map(model.maybeBlockedQuoteWindow, window => ({
        ...window,
        error: Option.match(model.maybeSearchCooldown, {
          onNone: () => 'Please try again.',
          onSome: cooldown =>
            formatRateLimitMessage(
              cooldown.source,
              Math.max(
                1,
                Math.ceil(
                  Duration.toSeconds(
                    Duration.millis(
                      cooldown.expiresAtMillis - model.searchTimeMillis,
                    ),
                  ),
                ),
              ),
            ),
        }),
      })),
    ),
  )
  const isAnyWindowChecked = Array.some(
    windows,
    ({ data }) => AsyncData.hasData(data) && !AsyncData.isPending(data),
  )

  if (!isAnyWindowChecked) {
    return Option.match(maybeFailure, {
      onNone: SearchPresentation.Loading,
      onSome: ({ error }) => SearchPresentation.Failed({ error }),
    })
  }

  const quoteRequest = Option.match(maybePending, {
    onSome: ({ window }) => QuoteRequestPresentation.Loading(window),
    onNone: () =>
      Option.match(maybeFailure, {
        onNone: QuoteRequestPresentation.Idle,
        onSome: failure => QuoteRequestPresentation.Failed(failure),
      }),
  })

  return SearchPresentation.Ready({ domains, quoteRequest })
}
