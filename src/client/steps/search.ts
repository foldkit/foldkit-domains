import { Array, Number, Option, String, pipe } from 'effect'
import { Update } from 'foldkit'

import {
  DomainCandidateRange,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../../shared/domain'
import { SearchMode } from '../../shared/searchMode'
import { ReadSearchPlanningTime, ReplaceSearchUrl } from '../command'
import { DomainsQueryBinding, LiveWarningDialogBinding } from '../composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from '../definition'
import { TOP_RESULT_COUNT, isCompleteCatalogRequired } from '../domain'
import { DomainsQuery } from '../domainsQuery'
import { Message } from '../message'
import { routeToQuery } from '../route'
import { searchPresentation } from '../searchPresentation'
import {
  loadRequiredQuotesStep,
  makeRequestQuotesForRangeStep,
  makeTrackDomainCandidateRangeStep,
  makeUseCompleteCatalogRangeStep,
} from './quoteLoading'
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

    return makeRequestQuotesForRangeStep(range, true)
  } else {
    return makeSearchQueryStep(true)
  }
})

export const loadQuotesForRangeStep = makeStep(
  (model, message: typeof Message.CompletedReadSearchPlanningTime.Type) => {
    if (message.searchGeneration !== model.searchGeneration) {
      return { model }
    }

    const maybeLabel = pipe(model.route, routeToQuery, queryToMaybeDomainLabel)

    if (Option.isNone(maybeLabel)) {
      return { model }
    }

    if (
      Array.some(
        DomainsQuery.pendingArgs(model.domainsQuery),
        args =>
          args.mode === model.searchMode && args.label === maybeLabel.value,
      )
    ) {
      return { model }
    }

    const range: DomainCandidateRange = {
      offset: message.offset,
      limit: message.limit,
    }
    const args = { mode: model.searchMode, label: maybeLabel.value, ...range }
    const isBlocked =
      model.searchMode === 'Live' &&
      (message.isForced ||
        !DomainsQuery.isFresh(model.domainsQuery, args, message.nowMillis)) &&
      Option.exists(
        model.maybeSearchCooldown,
        cooldown => cooldown.expiresAtMillis > message.nowMillis,
      )

    const loadQuotesStep = (() => {
      if (isBlocked) {
        return makeNoopStep()
      } else if (message.isForced) {
        return DomainsQueryBinding.requestRevalidationOrLoad(args)
      } else {
        return DomainsQueryBinding.requestLoadIfStale(args, message.nowMillis)
      }
    })()

    return Update.combineSteps([
      makeTrackDomainCandidateRangeStep(range, message.nowMillis, isBlocked),
      loadQuotesStep,
      makeUseCompleteCatalogRangeStep(args),
      loadRequiredQuotesStep,
      informResultsListStep,
    ])
  },
)

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
