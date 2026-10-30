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
import { informResultsListStep } from './resultsList'

const trackDomainRangeStep = (
  range: DomainCandidateRange,
  nowMillis: number,
  isBlocked: boolean,
) =>
  makeFieldsStep(() => ({
    searchPlanningTimeMillis: () => nowMillis,
    activeDomainCandidateRanges: ranges =>
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

const useFullCatalogStep = (args: DomainsQueryArgs) =>
  makeFieldsStep(model =>
    args.offset === 0 &&
    args.limit === domainTlds.length &&
    AsyncData.isSuccess(DomainsQuery.read(model.domainsQuery, args))
      ? {
          activeDomainCandidateRanges: () => [
            { offset: args.offset, limit: args.limit },
          ],
        }
      : {},
  )

export const scheduleDomainRequestStep = (
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

export const loadRequiredDomainsStep = makeStep(model =>
  Option.match(findNextDomainRangeToLoad(model), {
    onNone: () => ({ model }),
    onSome: range => scheduleDomainRequestStep(range)(model),
  }),
)

export const loadDomainsForRangeStep = makeStep(
  (model, message: CompletedReadCurrentTimeMessage) => {
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
          args.dataSource === model.dataSource &&
          args.label === maybeLabel.value,
      )
    ) {
      return { model }
    }

    const range: DomainCandidateRange = {
      offset: message.offset,
      limit: message.limit,
    }
    const args = {
      dataSource: model.dataSource,
      label: maybeLabel.value,
      ...range,
    }
    const isBlocked =
      model.dataSource === 'Live' &&
      (message.isRefreshRequested ||
        !DomainsQuery.isFresh(model.domainsQuery, args, message.nowMillis)) &&
      Option.exists(
        model.maybeSearchCooldown,
        cooldown => cooldown.expiresAtMillis > message.nowMillis,
      )

    const loadDomainsStep = (() => {
      if (isBlocked) {
        return makeNoopStep()
      } else if (message.isRefreshRequested) {
        return DomainsQueryBinding.requestRevalidationOrLoad(args)
      } else {
        return DomainsQueryBinding.requestLoadIfStale(args, message.nowMillis)
      }
    })()

    return Update.combineSteps([
      trackDomainRangeStep(range, message.nowMillis, isBlocked),
      loadDomainsStep,
      useFullCatalogStep(args),
      loadRequiredDomainsStep,
      informResultsListStep,
    ])
  },
)

export const applyDomainResultStep = ({
  args,
  result,
  completedAtMillis,
}: DomainsQueryCompletedFetch) =>
  makeStep(model => {
    if (
      args.dataSource !== model.dataSource ||
      !Option.contains(
        queryToMaybeDomainLabel(routeToQuery(model.route)),
        args.label,
      )
    ) {
      return { model }
    }

    return Update.combineSteps([
      makeFieldsStep(() => ({
        searchPlanningTimeMillis: time => completedAtMillis ?? time,
        maybeSearchCooldown: maybeCooldown =>
          model.dataSource === 'Live' && Result.isFailure(result)
            ? Option.orElse(
                result.failure.maybeSearchCooldown,
                () => maybeCooldown,
              )
            : maybeCooldown,
      })),
      useFullCatalogStep(args),
      loadRequiredDomainsStep,
      informResultsListStep,
    ])
  })
