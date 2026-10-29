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

export const DomainRequestPresentation = defineTaggedUnion({
  Idle: {},
  Loading: DomainCandidateRange.fields,
  Failed: { ...DomainCandidateRange.fields, error: Schema.String },
})
export type DomainRequestPresentation = typeof DomainRequestPresentation.Type

export const SearchPresentation = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ready: {
    domains: Schema.Array(Domain),
    domainRequest: DomainRequestPresentation.pipe(
      Schema.withConstructorDefault(
        Effect.succeed(DomainRequestPresentation.Idle()),
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

  const rangeQueries = Array.map(model.activeDomainCandidateRanges, range => ({
    range,
    data: DomainsQuery.read(model.domainsQuery, {
      dataSource: model.dataSource,
      label: maybeLabel.value,
      ...range,
    }),
  }))
  const domains = Array.reduce(
    rangeQueries,
    Array.empty<Domain>(),
    (checkedDomains, { data }) =>
      AsyncData.isPending(data)
        ? checkedDomains
        : Option.match(AsyncData.getData(data), {
            onNone: () => checkedDomains,
            onSome: incoming => mergeDomainsByName(checkedDomains, incoming),
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

  const domainRequest = Option.match(maybePendingRangeQuery, {
    onSome: ({ range }) => DomainRequestPresentation.Loading(range),
    onNone: () =>
      Option.match(maybeFailure, {
        onNone: DomainRequestPresentation.Idle,
        onSome: failure => DomainRequestPresentation.Failed(failure),
      }),
  })

  return SearchPresentation.Ready({ domains, domainRequest })
}
