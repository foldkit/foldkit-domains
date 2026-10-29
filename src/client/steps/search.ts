import { Array, Number, Option, String } from 'effect'
import { Update } from 'foldkit'

import { domainTlds, queryToMaybeDomainLabel } from '../../shared/domain'
import { SearchMode } from '../../shared/searchMode'
import { ReadSearchPlanningTime, ReplaceSearchUrl } from '../command'
import { DomainsQueryBinding, LiveWarningDialogBinding } from '../composition'
import { makeCommandsStep, makeFieldsStep, makeStep } from '../definition'
import { TOP_RESULT_COUNT, isCompleteCatalogRequired } from '../domain'
import { DomainsQuery } from '../domainsQuery'
import { routeToQuery } from '../route'
import { searchPresentation } from '../searchPresentation'
import { makeScheduleQuoteRequestStep } from './quoteLoading'
import { informResultsListStep, resetResultsListStep } from './resultsList'

export const cancelSearchStep = makeStep(model =>
  Update.combineSteps(
    Array.map(DomainsQuery.pendingArgs(model.domainsQuery), args =>
      DomainsQueryBinding.requestCancel(args),
    ),
  ),
)

export const makeSearchQueryStep = (isForced = false) =>
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
        domainCandidateRanges: () => [],
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
              isForced,
            }),
          ],
        }),
      ),
      String.isEmpty(routeToQuery(model.route))
        ? resetResultsListStep
        : informResultsListStep,
    ])
  })

export const searchQueryStep = makeSearchQueryStep()

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

  if (search._tag === 'Ready' && search.quoteRequest._tag === 'Failed') {
    const range = isCompleteCatalogRequired(
      model.availabilityFilter,
      model.sortOrder,
    )
      ? { offset: 0, limit: domainTlds.length }
      : search.quoteRequest

    return makeScheduleQuoteRequestStep(range, true)
  } else {
    return makeSearchQueryStep(true)
  }
})

export const makeChangeSearchModeStep = (mode: SearchMode) =>
  makeStep(model => {
    if (mode === model.searchMode) {
      return { model }
    }

    return Update.combineSteps([
      makeFieldsStep(() => ({ searchMode: () => mode })),
      searchQueryStep,
    ])
  })

export const makeRequestSearchModeStep = (mode: SearchMode) =>
  makeStep(model => {
    if (mode === 'Live' && model.searchMode === 'Demo') {
      return Update.combineSteps([
        makeFieldsStep(() => ({ isLiveLatencyAccepted: () => false })),
        LiveWarningDialogBinding.requestOpen(),
      ])
    } else {
      return makeChangeSearchModeStep(mode)
    }
  })

export const continueToLiveStep = makeStep(model => {
  if (
    !model.liveWarningDialog.isOpen ||
    !model.isLiveLatencyAccepted ||
    model.searchMode !== 'Demo'
  ) {
    return { model }
  }

  return Update.combineSteps([
    makeChangeSearchModeStep('Live'),
    LiveWarningDialogBinding.requestClose(),
  ])
})
