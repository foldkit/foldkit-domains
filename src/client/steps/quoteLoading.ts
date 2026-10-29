import { Array, Option, Record, pipe } from 'effect'
import { AsyncData } from 'foldkit'

import {
  DomainCandidateRange,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../../shared/domain'
import { ReadSearchPlanningTime } from '../command'
import { makeCommandsStep, makeFieldsStep, makeStep } from '../definition'
import {
  DomainListing,
  isCompleteCatalogRequired,
  tldToMaybeDomainCandidateRange,
} from '../domain'
import { DomainsQuery, DomainsQueryArgs } from '../domainsQuery'
import {
  DomainListingGroup,
  RESULTS_GROUP_HEIGHT_PX,
  RESULTS_OVERSCAN_GROUPS,
  type ResultsListModel,
  estimateDomainListingGroupHeightPx,
  groupDomainListings,
} from '../resultsList'
import { routeToQuery } from '../route'
import { searchPresentation } from '../searchPresentation'
import { visibleResultListings } from '../visibleResultListings'

export const makeTrackDomainCandidateRangeStep = (
  range: DomainCandidateRange,
  nowMillis: number,
  isBlocked: boolean,
) =>
  makeFieldsStep(() => ({
    searchPlanningTimeMillis: () => nowMillis,
    domainCandidateRanges: ranges =>
      Array.some(
        ranges,
        existing =>
          existing.offset === range.offset && existing.limit === range.limit,
      )
        ? ranges
        : Array.append(ranges, range),
    maybeBlockedDomainCandidateRange: () =>
      isBlocked ? Option.some(range) : Option.none(),
  }))

export const makeUseCompleteCatalogRangeStep = (args: DomainsQueryArgs) =>
  makeFieldsStep(model =>
    args.offset === 0 &&
    args.limit === domainTlds.length &&
    AsyncData.isSuccess(DomainsQuery.read(model.domainsQuery, args))
      ? {
          domainCandidateRanges: () => [
            { offset: args.offset, limit: args.limit },
          ],
        }
      : {},
  )

export const makeRequestQuotesForRangeStep = (
  { offset, limit }: DomainCandidateRange,
  isForced = false,
) =>
  makeCommandsStep(model => [
    ReadSearchPlanningTime({
      searchGeneration: model.searchGeneration,
      offset,
      limit,
      isForced,
    }),
  ])

const findFirstPendingListingForViewport = (
  groups: ReadonlyArray<DomainListingGroup>,
  resultsList: ResultsListModel,
) => {
  const groupHeightPx = (group: DomainListingGroup) =>
    Record.get(resultsList.measuredRowHeights, group.id).pipe(
      Option.getOrElse(() =>
        estimateDomainListingGroupHeightPx(resultsList, group.listings.length),
      ),
    )

  const groupOffsetsPx = Array.scan(
    groups,
    0,
    (offsetPx, group) => offsetPx + groupHeightPx(group),
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
  const overscanHeightPx =
    estimateDomainListingGroupHeightPx(resultsList) * RESULTS_OVERSCAN_GROUPS
  const viewportStartPx = resultsList.scrollTop - overscanHeightPx
  const viewportEndPx =
    resultsList.scrollTop + viewportHeightPx + overscanHeightPx

  return pipe(
    groupsWithOffsets,
    Array.filter(
      ({ group, offsetPx }) =>
        offsetPx + groupHeightPx(group) >= viewportStartPx &&
        offsetPx <= viewportEndPx,
    ),
    Array.flatMap(({ group }) => group.listings),
    Array.findFirst(DomainListing.isAnyOf(['Pending'])),
  )
}

export const loadRequiredQuotesStep = makeStep(model => {
  const search = searchPresentation(model)

  if (search._tag !== 'Ready' || search.quoteRequest._tag === 'Loading') {
    return { model }
  }

  const isCatalogFullyChecked = search.domains.length === domainTlds.length

  if (isCatalogFullyChecked) {
    return { model }
  }

  if (isCompleteCatalogRequired(model.availabilityFilter, model.sortOrder)) {
    const hasCompleteCatalogRequestFailed = Option.exists(
      queryToMaybeDomainLabel(routeToQuery(model.route)),
      label =>
        AsyncData.hasError(
          DomainsQuery.read(model.domainsQuery, {
            mode: model.searchMode,
            label,
            offset: 0,
            limit: domainTlds.length,
          }),
        ),
    )

    if (
      hasCompleteCatalogRequestFailed ||
      Option.exists(
        model.maybeBlockedDomainCandidateRange,
        range => range.offset === 0 && range.limit === domainTlds.length,
      )
    ) {
      return { model }
    }

    return makeRequestQuotesForRangeStep({
      offset: 0,
      limit: domainTlds.length,
    })(model)
  }

  if (search.quoteRequest._tag === 'Failed') {
    return { model }
  }

  const maybeDomainCandidateRange = pipe(
    model,
    visibleResultListings,
    groupDomainListings,
    groups => findFirstPendingListingForViewport(groups, model.resultsList),
    Option.flatMap(listing => tldToMaybeDomainCandidateRange(listing.tld)),
  )

  return Option.match(maybeDomainCandidateRange, {
    onNone: () => ({ model }),
    onSome: range => makeRequestQuotesForRangeStep(range)(model),
  })
})
