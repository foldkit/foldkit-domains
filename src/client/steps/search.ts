import { Array, Number, Option, String } from 'effect'
import { Update } from 'foldkit'

import { DataSource } from '../../shared/dataSource'
import { domainTlds, queryToMaybeDomainLabel } from '../../shared/domain'
import { ReadCurrentTime, ReplaceSearchUrl } from '../command'
import { DomainsQueryBinding, LiveWarningDialogBinding } from '../composition'
import { makeCommandsStep, makeFieldsStep, makeStep } from '../definition'
import { TOP_RESULT_COUNT, isCompleteCatalogRequired } from '../domain'
import { DomainsQuery } from '../domainsQuery'
import { routeToQuery } from '../route'
import { searchViewState } from '../searchViewState'
import { scheduleDomainRequestStep } from './domainLoading'
import { informResultsListStep, resetResultsListStep } from './resultsList'

export const cancelSearchStep = makeStep(model =>
  Update.combineSteps(
    Array.map(DomainsQuery.pendingArgs(model.domainsQuery), args =>
      DomainsQueryBinding.requestCancel(args),
    ),
  ),
)

export const searchQueryStep = (query: string, isRefreshRequested = false) =>
  makeStep(model => {
    const nextSearchGeneration = Number.increment(model.searchGeneration)
    const maybeDomainLabel = queryToMaybeDomainLabel(query)

    return Update.combineSteps([
      cancelSearchStep,
      makeFieldsStep(() => ({
        searchGeneration: () => nextSearchGeneration,
        searchLayout: currentLayout =>
          String.isNonEmpty(query) ? 'Search' : currentLayout,
        activeDomainCandidateRanges: () => [],
        maybeBlockedDomainCandidateRange: () => Option.none(),
      })),
      makeCommandsStep(() =>
        Array.filter(
          [
            ReadCurrentTime({
              searchGeneration: nextSearchGeneration,
              offset: 0,
              limit: TOP_RESULT_COUNT,
              isRefreshRequested,
            }),
          ],
          () => Option.isSome(maybeDomainLabel),
        ),
      ),
      String.isEmpty(query) ? resetResultsListStep : informResultsListStep,
    ])
  })

const replaceSearchUrlStep = (query: string) =>
  makeCommandsStep(() => [
    ReplaceSearchUrl({ q: Option.liftPredicate(query, String.isNonEmpty) }),
  ])

export const changeSearchQueryStep = (query: string) =>
  makeStep(model => {
    const isQueryChanged = query !== routeToQuery(model.route)

    return Update.combineSteps([
      ...(isQueryChanged
        ? [
            cancelSearchStep,
            makeFieldsStep(() => ({
              searchGeneration: Number.increment,
              searchLayout: currentLayout =>
                String.isNonEmpty(query) ? 'Search' : currentLayout,
            })),
          ]
        : []),
      replaceSearchUrlStep(query),
    ])
  })

export const clearSearchStep = changeSearchQueryStep('')

export const retrySearchStep = makeStep(model => {
  const search = searchViewState(model)

  if (search._tag === 'Ready' && search.domainRequest._tag === 'Failed') {
    const range = isCompleteCatalogRequired(
      model.availabilityFilter,
      model.sortOrder,
    )
      ? { offset: 0, limit: domainTlds.length }
      : search.domainRequest

    return scheduleDomainRequestStep(range, true)
  } else {
    return searchQueryStep(routeToQuery(model.route), true)
  }
})

export const changeDataSourceStep = (dataSource: DataSource) =>
  makeStep(model => {
    if (dataSource === model.dataSource) {
      return { model }
    }

    return Update.combineSteps([
      makeFieldsStep(() => ({ dataSource: () => dataSource })),
      searchQueryStep(routeToQuery(model.route)),
    ])
  })

export const requestDataSourceStep = (dataSource: DataSource) =>
  makeStep(model => {
    if (dataSource === 'Live' && model.dataSource === 'Demo') {
      return Update.combineSteps([
        makeFieldsStep(() => ({ isLiveLatencyAccepted: () => false })),
        LiveWarningDialogBinding.requestOpen(),
      ])
    } else {
      return changeDataSourceStep(dataSource)
    }
  })

export const continueToLiveStep = makeStep(() =>
  Update.combineSteps([
    changeDataSourceStep('Live'),
    LiveWarningDialogBinding.requestClose(),
  ]),
)
