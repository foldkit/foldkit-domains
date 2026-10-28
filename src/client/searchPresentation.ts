import { Array, Duration, Effect, Option, Schema, String, pipe } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  Domain,
  DomainCandidateRange,
  queryToMaybeDomainLabel,
} from '../shared/domain'
import { mergeDomainsByName } from './domain'
import { DomainsQuery } from './domainsQuery'
import type { Model } from './model'
import { routeToQuery } from './route'
import { formatRateLimitMessage } from './searchCooldown'

export const QuoteRequestPresentation = defineTaggedUnion({
  Idle: {},
  Loading: DomainCandidateRange.fields,
  Failed: { ...DomainCandidateRange.fields, error: Schema.String },
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

  const rangeQueries = Array.map(model.domainCandidateRanges, range => ({
    range,
    data: DomainsQuery.read(model.domainsQuery, {
      mode: model.searchMode,
      label: maybeLabel.value,
      ...range,
    }),
  }))
  const domains = Array.reduce(
    rangeQueries,
    Array.empty<Domain>(),
    (quotes, { data }) =>
      AsyncData.isPending(data)
        ? quotes
        : Option.match(AsyncData.getData(data), {
            onNone: () => quotes,
            onSome: incoming => mergeDomainsByName(quotes, incoming),
          }),
  )
  const maybePendingRangeQuery = Array.findFirst(rangeQueries, ({ data }) =>
    AsyncData.isPending(data),
  )
  const maybeFailure = pipe(
    rangeQueries,
    Array.findLast(({ data }) => AsyncData.hasError(data)),
    Option.flatMap(({ range, data }) =>
      Option.map(AsyncData.getError(data), failure => ({
        ...range,
        error: failure.error,
      })),
    ),
    Option.orElse(() =>
      Option.map(model.maybeBlockedDomainCandidateRange, range => ({
        ...range,
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
                      cooldown.expiresAtMillis - model.searchPlanningTimeMillis,
                    ),
                  ),
                ),
              ),
            ),
        }),
      })),
    ),
  )
  const isAnyRangeChecked = Array.some(
    rangeQueries,
    ({ data }) => AsyncData.hasData(data) && !AsyncData.isPending(data),
  )

  if (!isAnyRangeChecked) {
    return Option.match(maybeFailure, {
      onNone: SearchPresentation.Loading,
      onSome: ({ error }) => SearchPresentation.Failed({ error }),
    })
  }

  const quoteRequest = Option.match(maybePendingRangeQuery, {
    onSome: ({ range }) => QuoteRequestPresentation.Loading(range),
    onNone: () =>
      Option.match(maybeFailure, {
        onNone: QuoteRequestPresentation.Idle,
        onSome: failure => QuoteRequestPresentation.Failed(failure),
      }),
  })

  return SearchPresentation.Ready({ domains, quoteRequest })
}
