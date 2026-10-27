import { Array, Option, Record, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { FetchDomains } from './command'
import { makeStep } from './definition'
import {
  QUOTE_PAGE_SIZE,
  QueryWindow,
  domainTlds,
  queryToMaybeDomainLabel,
} from './domain'
import { QuoteRequest, SearchState } from './model'
import { RESULTS_GROUP_HEIGHT_PX, groupResults } from './resultsList'
import { routeToQuery } from './route'
import { visibleResultListings } from './visibleResultListings'

const OVERSCAN_GROUPS = 2

export const makeRequestQuotesStep = ({
  offset,
  limit,
}: typeof QueryWindow.Type) =>
  makeStep(model => {
    const maybeLabel = queryToMaybeDomainLabel(routeToQuery(model.route))

    if (
      model.search._tag === 'Ready' &&
      model.search.quoteRequest._tag !== 'Loading' &&
      Option.isSome(maybeLabel)
    ) {
      const {
        search: { domains },
      } = model

      return {
        model: modifyFields(model, {
          search: () =>
            SearchState.Ready({
              domains,
              quoteRequest: QuoteRequest.Loading({ offset, limit }),
            }),
        }),
        commands: [
          FetchDomains({
            label: maybeLabel.value,
            searchGeneration: model.searchGeneration,
            offset,
            limit,
          }),
        ],
      }
    } else {
      return { model }
    }
  })

export const loadVisibleQuotesStep = makeStep(model => {
  if (
    // can we extract a const and give this a name?
    model.search._tag !== 'Ready' ||
    model.search.quoteRequest._tag !== 'Idle'
  ) {
    return { model }
  }

  const {
    search: { domains },
  } = model
  // what does this do?
  const isComplete = domains.length === domainTlds.length

  if (isComplete) {
    return { model }
  }

  if (model.sortOrder !== 'Relevance' || model.availabilityFilter !== 'All') {
    return makeRequestQuotesStep({ offset: 0, limit: domainTlds.length })
  }

  // from here down seems pretty messy -- should we add some blank lines or do
  // something else to clarify?
  const groups = pipe(model, visibleResultListings, groupResults)
  const groupHeight = (id: string) =>
    Record.get(model.resultsList.measuredRowHeights, id).pipe(
      Option.getOrElse(() => RESULTS_GROUP_HEIGHT_PX),
    )
  const offsets = Array.scan(
    groups,
    0,
    (offset, group) => offset + groupHeight(group.id),
  )
  const containerHeight =
    model.resultsList.measurement._tag === 'Measured'
      ? model.resultsList.measurement.containerHeight
      : RESULTS_GROUP_HEIGHT_PX
  const bufferHeight = RESULTS_GROUP_HEIGHT_PX * OVERSCAN_GROUPS
  const viewportStart = model.resultsList.scrollTop - bufferHeight
  const viewportEnd =
    model.resultsList.scrollTop + containerHeight + bufferHeight
  const maybePending = pipe(
    Array.zipWith(groups, offsets, (group, offset) => ({ group, offset })),
    Array.filter(
      ({ group, offset }) =>
        offset + groupHeight(group.id) >= viewportStart &&
        offset <= viewportEnd,
    ),
    Array.flatMap(({ group }) => group.domains),
    Array.findFirst(listing => listing._tag === 'Pending'),
  )

  return Option.match(maybePending, {
    onNone: () => ({ model }),
    onSome: listing => {
      const maybeIndex = Array.findFirstIndex(
        domainTlds,
        tld => tld === listing.tld,
      )

      return maybeIndex.pipe(
        Option.match({
          onNone: () => ({ model }),
          onSome: index =>
            makeRequestQuotesStep({
              offset: Math.floor(index / QUOTE_PAGE_SIZE) * QUOTE_PAGE_SIZE,
              limit: QUOTE_PAGE_SIZE,
            }),
        }),
      )
    },
  })
})
