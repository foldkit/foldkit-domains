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
import { scheduleDomainRequest } from './domainLoading'
import { informResultsList, resetResultsList } from './resultsList'

export const cancelSearch = makeStep(model =>
  Update.combineSteps(
    Array.map(DomainsQuery.pendingArgs(model.domainsQuery), args =>
      DomainsQueryBinding.requestCancel(args),
    ),
  ),
)

export const searchQuery = (query: string, isRefreshRequested = false) =>
  makeStep(model => {
    const nextSearchGeneration = Number.increment(model.searchGeneration)
    const maybeDomainLabel = queryToMaybeDomainLabel(query)

    return Update.combineSteps([
      cancelSearch,
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
      String.isEmpty(query) ? resetResultsList : informResultsList,
    ])
  })

export const changeSearchQuery = (query: string) =>
  makeStep(model => {
    const isQueryChanged = query !== routeToQuery(model.route)

    return Update.combineSteps([
      ...(isQueryChanged
        ? [
            cancelSearch,
            makeFieldsStep(() => ({
              searchGeneration: Number.increment,
              searchLayout: currentLayout =>
                String.isNonEmpty(query) ? 'Search' : currentLayout,
            })),
          ]
        : []),
      makeCommandsStep(() => [
        ReplaceSearchUrl({ q: Option.liftPredicate(query, String.isNonEmpty) }),
      ]),
    ])
  })

export const clearSearch = changeSearchQuery('')

export const retrySearch = makeStep(model => {
  const search = searchViewState(model)

  if (search._tag === 'Ready' && search.domainRequest._tag === 'Failed') {
    const range = isCompleteCatalogRequired(
      model.availabilityFilter,
      model.sortOrder,
    )
      ? { offset: 0, limit: domainTlds.length }
      : search.domainRequest

    return scheduleDomainRequest(range, true)
  } else {
    return searchQuery(routeToQuery(model.route), true)
  }
})

export const changeDataSource = (dataSource: DataSource) =>
  makeStep(model => {
    if (dataSource === model.dataSource) {
      return { model }
    }

    return Update.combineSteps([
      makeFieldsStep(() => ({ dataSource: () => dataSource })),
      searchQuery(routeToQuery(model.route)),
    ])
  })

export const requestDataSource = (dataSource: DataSource) =>
  makeStep(model => {
    if (dataSource === 'Live' && model.dataSource === 'Demo') {
      return Update.combineSteps([
        makeFieldsStep(() => ({ isLiveLatencyAccepted: () => false })),
        LiveWarningDialogBinding.requestOpen(),
      ])
    } else {
      return changeDataSource(dataSource)
    }
  })
