import { Array, Option, Record, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { FetchDomains } from './command'
import { makeStep } from './definition'
import {
  DomainListing,
  QueryWindow,
  domainTlds,
  queryToMaybeDomainLabel,
  tldToMaybeQuoteWindow,
} from './domain'
import { QuoteRequest, SearchState } from './model'
import {
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_OVERSCAN_GROUPS,
  ResultGroup,
  ResultsListBlock,
  groupResults,
} from './resultsList'
import { routeToQuery } from './route'
import { visibleResultListings } from './visibleResultListings'

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

const findPendingListingInViewport = (
  groups: ReadonlyArray<typeof ResultGroup.Type>,
  resultsList: typeof ResultsListBlock.Model.Type,
) => {
  const groupHeight = (id: string) =>
    Record.get(resultsList.measuredRowHeights, id).pipe(
      Option.getOrElse(() => RESULTS_GROUP_HEIGHT_PX),
    )

  const offsets = Array.scan(
    groups,
    0,
    (offset, group) => offset + groupHeight(group.id),
  )

  const groupsWithOffsets = Array.zipWith(groups, offsets, (group, offset) => ({
    group,
    offset,
  }))

  const containerHeight =
    resultsList.measurement._tag === 'Measured'
      ? resultsList.measurement.containerHeight
      : RESULTS_GROUP_HEIGHT_PX
  const bufferHeight = RESULTS_GROUP_HEIGHT_PX * RESULTS_OVERSCAN_GROUPS
  const viewportStart = resultsList.scrollTop - bufferHeight
  const viewportEnd = resultsList.scrollTop + containerHeight + bufferHeight

  return pipe(
    groupsWithOffsets,
    Array.filter(
      ({ group, offset }) =>
        offset + groupHeight(group.id) >= viewportStart &&
        offset <= viewportEnd,
    ),
    Array.flatMap(({ group }) => group.domains),
    Array.findFirst(DomainListing.isAnyOf(['Pending'])),
  )
}

export const loadVisibleQuotesStep = makeStep(model => {
  const isReadyToLoadQuotes =
    model.search._tag === 'Ready' && model.search.quoteRequest._tag === 'Idle'

  if (!isReadyToLoadQuotes) {
    return { model }
  }

  const isCatalogFullyChecked =
    model.search.domains.length === domainTlds.length

  if (isCatalogFullyChecked) {
    return { model }
  }

  const isCompleteCatalogRequired =
    model.sortOrder !== 'Relevance' || model.availabilityFilter !== 'All'

  if (isCompleteCatalogRequired) {
    return makeRequestQuotesStep({ offset: 0, limit: domainTlds.length })
  }

  const maybeQuoteWindow = pipe(
    model,
    visibleResultListings,
    groupResults,
    groups => findPendingListingInViewport(groups, model.resultsList),
    Option.flatMap(listing => tldToMaybeQuoteWindow(listing.tld)),
  )

  return Option.match(maybeQuoteWindow, {
    onNone: () => ({ model }),
    onSome: makeRequestQuotesStep,
  })
})
