import { Array, Option, Result, pipe } from 'effect'
import { AsyncData, Update } from 'foldkit'

import {
  DomainCandidateRange,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../../shared/domain'
import { ReadCurrentTime } from '../command'
import { DomainsQueryBinding } from '../composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from '../definition'
import { findNextDomainRangeToLoad } from '../domainPlanning'
import {
  DomainsQuery,
  DomainsQueryArgs,
  type DomainsQueryCompletedFetch,
} from '../domainsQuery'
import type { CompletedReadCurrentTimeMessage } from '../message'
import { routeToQuery } from '../route'
import { informResultsList } from './resultsList'

const trackDomainRange = (
  range: DomainCandidateRange,
  nowMillis: number,
  isBlocked: boolean,
) =>
  makeFieldsStep(() => ({
    searchPlanningTimeMillis: () => nowMillis,
    activeDomainCandidateRanges: ranges => {
      const isRangeActive = Array.some(
        ranges,
        existing =>
          existing.offset === range.offset && existing.limit === range.limit,
      )

      return isRangeActive ? ranges : Array.append(ranges, range)
    },
    maybeBlockedDomainCandidateRange: () =>
      isBlocked ? Option.some(range) : Option.none(),
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
      args =>
        args.dataSource === model.dataSource &&
        args.label === maybeDomainLabel.value,
    )

    if (isSearchPending) {
      return { model }
    }

    const range: DomainCandidateRange = {
      offset: message.offset,
      limit: message.limit,
    }
    const args = {
      dataSource: model.dataSource,
      label: maybeDomainLabel.value,
      ...range,
    }
    const isFetchRequired =
      message.isRefreshRequested ||
      !DomainsQuery.isFresh(model.domainsQuery, args, message.nowMillis)
    const isBlocked =
      model.dataSource === 'Live' &&
      isFetchRequired &&
      Option.exists(
        model.maybeSearchCooldown,
        cooldown => cooldown.expiresAtMillis > message.nowMillis,
      )

    const loadDomains = () => {
      if (isBlocked) {
        return makeNoopStep()
      } else if (message.isRefreshRequested) {
        return DomainsQueryBinding.requestRevalidationOrLoad(args)
      } else {
        return DomainsQueryBinding.requestLoadIfStale(args, message.nowMillis)
      }
    }

    return Update.combineSteps([
      trackDomainRange(range, message.nowMillis, isBlocked),
      loadDomains(),
      replaceActiveRangesWithFullCatalog(args),
      loadRequiredDomains,
      informResultsList,
    ])
  },
)

export const applyDomainResult = ({
  args,
  result,
  completedAtMillis,
}: DomainsQueryCompletedFetch) =>
  makeStep(model => {
    const isCurrentSearch =
      args.dataSource === model.dataSource &&
      Option.contains(
        queryToMaybeDomainLabel(routeToQuery(model.route)),
        args.label,
      )

    if (!isCurrentSearch) {
      return { model }
    }

    const isLiveSearchFailure =
      model.dataSource === 'Live' && Result.isFailure(result)

    return Update.combineSteps([
      makeFieldsStep(() => ({
        searchPlanningTimeMillis: time => completedAtMillis ?? time,
        maybeSearchCooldown: maybeCooldown =>
          isLiveSearchFailure
            ? Option.orElse(
                result.failure.maybeSearchCooldown,
                () => maybeCooldown,
              )
            : maybeCooldown,
      })),
      replaceActiveRangesWithFullCatalog(args),
      loadRequiredDomains,
      informResultsList,
    ])
  })
