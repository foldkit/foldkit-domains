import { Array, Number, Option, String } from 'effect'
import { Update } from 'foldkit'

import { DataSource } from '../../shared/dataSource'
import { domainTlds, queryToMaybeDomainLabel } from '../../shared/domain'
import { ReadSearchPlanningTime, ReplaceSearchUrl } from '../command'
import { DomainsQueryBinding, LiveWarningDialogBinding } from '../composition'
import { makeCommandsStep, makeFieldsStep, makeStep } from '../definition'
import { TOP_RESULT_COUNT, isCompleteCatalogRequired } from '../domain'
import { DomainsQuery } from '../domainsQuery'
import { routeToQuery } from '../route'
import { searchPresentation } from '../searchPresentation'
import { makeScheduleDomainRequestStep } from './domainLoading'
import { informResultsListStep, resetResultsListStep } from './resultsList'

export const cancelSearchStep = makeStep(model =>
  Update.combineSteps(
    Array.map(DomainsQuery.pendingArgs(model.domainsQuery), args =>
      DomainsQueryBinding.requestCancel(args),
    ),
  ),
)

export const makeSearchCurrentQueryStep = (isRefreshRequested = false) =>
  makeStep(model => {
    const nextSearchGeneration = Number.increment(model.searchGeneration)
    const maybeLabel = queryToMaybeDomainLabel(routeToQuery(model.route))

    return Update.combineSteps([
      cancelSearchStep,
      makeFieldsStep(() => ({
        searchGeneration: () => nextSearchGeneration,
        searchLayout: currentLayout =>
          String.isNonEmpty(routeToQuery(model.route))
            ? 'Search'
            : currentLayout,
        activeDomainCandidateRanges: () => [],
        maybeBlockedDomainCandidateRange: () => Option.none(),
      })),
      makeCommandsStep(() =>
        Option.match(maybeLabel, {
          onNone: () => [],
          onSome: () => [
            ReadSearchPlanningTime({
              searchGeneration: nextSearchGeneration,
              offset: 0,
              limit: TOP_RESULT_COUNT,
              isRefreshRequested,
            }),
          ],
        }),
      ),
      String.isEmpty(routeToQuery(model.route))
        ? resetResultsListStep
        : informResultsListStep,
    ])
  })

export const searchCurrentQueryStep = makeSearchCurrentQueryStep()

export const makeChangeSearchQueryStep = (query: string) =>
  makeStep(model => {
    const replaceSearchUrl = makeCommandsStep(() => [
      ReplaceSearchUrl({ q: Option.liftPredicate(query, String.isNonEmpty) }),
    ])

    if (query === routeToQuery(model.route)) {
      return replaceSearchUrl
    } else {
      return Update.combineSteps([
        cancelSearchStep,
        makeFieldsStep(() => ({
          searchGeneration: Number.increment,
          searchLayout: currentLayout =>
            String.isNonEmpty(query) ? 'Search' : currentLayout,
        })),
        replaceSearchUrl,
      ])
    }
  })

export const clearSearchStep = makeChangeSearchQueryStep('')

export const retrySearchStep = makeStep(model => {
  const search = searchPresentation(model)

  if (search._tag === 'Ready' && search.domainRequest._tag === 'Failed') {
    const range = isCompleteCatalogRequired(
      model.availabilityFilter,
      model.sortOrder,
    )
      ? { offset: 0, limit: domainTlds.length }
      : search.domainRequest

    return makeScheduleDomainRequestStep(range, true)
  } else {
    return makeSearchCurrentQueryStep(true)
  }
})

export const makeChangeDataSourceStep = (dataSource: DataSource) =>
  makeStep(model => {
    if (dataSource === model.dataSource) {
      return { model }
    }

    return Update.combineSteps([
      makeFieldsStep(() => ({ dataSource: () => dataSource })),
      searchCurrentQueryStep,
    ])
  })

export const makeRequestDataSourceStep = (dataSource: DataSource) =>
  makeStep(model => {
    if (dataSource === 'Live' && model.dataSource === 'Demo') {
      return Update.combineSteps([
        makeFieldsStep(() => ({ isLiveLatencyAccepted: () => false })),
        LiveWarningDialogBinding.requestOpen(),
      ])
    } else {
      return makeChangeDataSourceStep(dataSource)
    }
  })

export const continueToLiveStep = makeStep(model => {
  if (
    !model.liveWarningDialog.isOpen ||
    !model.isLiveLatencyAccepted ||
    model.dataSource !== 'Demo'
  ) {
    return { model }
  }

  return Update.combineSteps([
    makeChangeDataSourceStep('Live'),
    LiveWarningDialogBinding.requestClose(),
  ])
})
