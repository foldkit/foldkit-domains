import { Array, Option, Record, pipe } from 'effect'
import { AsyncData } from 'foldkit'

import {
  QuoteWindow,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../../shared/domain'
import { DetermineSearchTime } from '../command'
import { makeStep } from '../definition'
import { DomainListing, tldToMaybeQuoteWindow } from '../domain'
import { Model } from '../model'
import { QuoteWindows } from '../quoteWindows'
import {
  DomainListingGroup,
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_OVERSCAN_GROUPS,
  ResultsListBlock,
  groupDomainListings,
} from '../resultsList'
import { routeToQuery } from '../route'
import { searchPresentation } from '../searchPresentation'
import { visibleResultListings } from '../visibleResultListings'

export const makeRequestQuoteWindowStep = (
  { offset, limit }: QuoteWindow,
  isForced = false,
) =>
  makeStep(model => ({
    model,
    commands: [
      DetermineSearchTime({
        searchGeneration: model.searchGeneration,
        offset,
        limit,
        isForced,
      }),
    ],
  }))

type QuoteWindowRequestReturn = ReturnType<
  ReturnType<typeof makeRequestQuoteWindowStep>
>

const findFirstPendingListingForViewport = (
  groups: ReadonlyArray<DomainListingGroup>,
  resultsList: typeof ResultsListBlock.Model.Type,
) => {
  const groupHeightPx = (id: string) =>
    Record.get(resultsList.measuredRowHeights, id).pipe(
      Option.getOrElse(() => RESULTS_GROUP_HEIGHT_PX),
    )

  const groupOffsetsPx = Array.scan(
    groups,
    0,
    (offsetPx, group) => offsetPx + groupHeightPx(group.id),
  )

  const groupsWithOffsets: ReadonlyArray<{
    group: DomainListingGroup
    offsetPx: number
  }> = Array.zipWith(groups, groupOffsetsPx, (group, offsetPx) => ({
    group,
    offsetPx,
  }))

  const viewportHeightPx =
    resultsList.measurement._tag === 'Measured'
      ? resultsList.measurement.containerHeight
      : RESULTS_GROUP_HEIGHT_PX
  const overscanHeightPx = RESULTS_GROUP_HEIGHT_PX * RESULTS_OVERSCAN_GROUPS
  const viewportStartPx = resultsList.scrollTop - overscanHeightPx
  const viewportEndPx =
    resultsList.scrollTop + viewportHeightPx + overscanHeightPx

  return pipe(
    groupsWithOffsets,
    Array.filter(
      ({ group, offsetPx }) =>
        offsetPx + groupHeightPx(group.id) >= viewportStartPx &&
        offsetPx <= viewportEndPx,
    ),
    Array.flatMap(({ group }) => group.listings),
    Array.findFirst(DomainListing.isAnyOf(['Pending'])),
  )
}

const loadRequiredQuotes = (model: Model): QuoteWindowRequestReturn => {
  const search = searchPresentation(model)

  if (search._tag !== 'Ready' || search.quoteRequest._tag === 'Loading') {
    return { model }
  }

  const isCatalogFullyChecked = search.domains.length === domainTlds.length

  if (isCatalogFullyChecked) {
    return { model }
  }

  const isCompleteCatalogRequired =
    model.sortOrder !== 'Relevance' || model.availabilityFilter !== 'All'

  if (isCompleteCatalogRequired) {
    const isCatalogFailed = Option.exists(
      queryToMaybeDomainLabel(routeToQuery(model.route)),
      label =>
        AsyncData.hasError(
          QuoteWindows.read(model.quoteWindows, {
            label,
            offset: 0,
            limit: domainTlds.length,
          }),
        ),
    )

    if (
      isCatalogFailed ||
      Option.exists(
        model.maybeBlockedQuoteWindow,
        window => window.offset === 0 && window.limit === domainTlds.length,
      )
    ) {
      return { model }
    }

    return makeRequestQuoteWindowStep({ offset: 0, limit: domainTlds.length })(
      model,
    )
  }

  if (search.quoteRequest._tag === 'Failed') {
    return { model }
  }

  const maybeQuoteWindow = pipe(
    model,
    visibleResultListings,
    groupDomainListings,
    groups => findFirstPendingListingForViewport(groups, model.resultsList),
    Option.flatMap(listing => tldToMaybeQuoteWindow(listing.tld)),
  )

  return Option.match(maybeQuoteWindow, {
    onNone: () => ({ model }),
    onSome: window => makeRequestQuoteWindowStep(window)(model),
  })
}

export const loadRequiredQuotesStep = makeStep(loadRequiredQuotes)
