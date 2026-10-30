import { Array, Option, pipe } from 'effect'
import { AsyncData, Update } from 'foldkit'

import {
  DomainCandidateRange,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../../shared/domain'
import { ReadCurrentTime } from '../command'
import { DomainsQueryBinding } from '../composition'
import { makeCommandsStep, makeFieldsStep, makeStep } from '../definition'
import { findNextDomainRangeToLoad } from '../domainPlanning'
import {
  DomainsQuery,
  DomainsQueryArgs,
  type DomainsQueryCompletedFetch,
} from '../domainsQuery'
import type { CompletedReadCurrentTimeMessage } from '../message'
import { routeToQuery } from '../route'
import { informResultsList } from './resultsList'

const trackDomainRange = (range: DomainCandidateRange) =>
  makeFieldsStep(() => ({
    activeDomainCandidateRanges: ranges => {
      const isRangeActive = Array.some(
        ranges,
        existing =>
          existing.offset === range.offset && existing.limit === range.limit,
      )

      return isRangeActive ? ranges : Array.append(ranges, range)
    },
  }))

const replaceActiveRangesWithFullCatalog = (args: DomainsQueryArgs) =>
  makeFieldsStep(model => {
    const isFullCatalogRange =
      args.offset === 0 && args.limit === domainTlds.length
    const isFullCatalogChecked =
      isFullCatalogRange &&
      AsyncData.isSuccess(DomainsQuery.read(model.domainsQuery, args))

    return isFullCatalogChecked
      ? {
          activeDomainCandidateRanges: () => [
            { offset: args.offset, limit: args.limit },
          ],
        }
      : {}
  })

export const scheduleDomainRequest = (
  { offset, limit }: DomainCandidateRange,
  isRefreshRequested = false,
) =>
  makeCommandsStep(model => [
    ReadCurrentTime({
      searchGeneration: model.searchGeneration,
      offset,
      limit,
      isRefreshRequested,
    }),
  ])

export const loadRequiredDomains = makeStep(model =>
  Option.match(findNextDomainRangeToLoad(model), {
    onNone: () => ({ model }),
    onSome: range => scheduleDomainRequest(range)(model),
  }),
)

export const loadDomainsForRange = makeStep(
  (model, message: CompletedReadCurrentTimeMessage) => {
    if (message.searchGeneration !== model.searchGeneration) {
      return { model }
    }

    const maybeDomainLabel = pipe(
      model.route,
      routeToQuery,
      queryToMaybeDomainLabel,
    )

    if (Option.isNone(maybeDomainLabel)) {
      return { model }
    }

    const isSearchPending = Array.some(
      DomainsQuery.pendingArgs(model.domainsQuery),
      args => args.label === maybeDomainLabel.value,
    )

    if (isSearchPending) {
      return { model }
    }

    const range: DomainCandidateRange = {
      offset: message.offset,
      limit: message.limit,
    }
    const args = {
      label: maybeDomainLabel.value,
      ...range,
    }

    return Update.combineSteps([
      trackDomainRange(range),
      message.isRefreshRequested
        ? DomainsQueryBinding.requestRevalidationOrLoad(args)
        : DomainsQueryBinding.requestLoadIfStale(args, message.nowMillis),
      replaceActiveRangesWithFullCatalog(args),
      loadRequiredDomains,
      informResultsList,
    ])
  },
)

export const applyDomainResult = ({ args }: DomainsQueryCompletedFetch) =>
  makeStep(model => {
    const isCurrentSearch = Option.contains(
      queryToMaybeDomainLabel(routeToQuery(model.route)),
      args.label,
    )

    if (!isCurrentSearch) {
      return { model }
    }

    return Update.combineSteps([
      replaceActiveRangesWithFullCatalog(args),
      loadRequiredDomains,
      informResultsList,
    ])
  })
