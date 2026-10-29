import { Array, Option, Result, pipe } from 'effect'
import { AsyncData, Update } from 'foldkit'

import {
  DomainCandidateRange,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../../shared/domain'
import { ReadSearchPlanningTime } from '../command'
import { DomainsQueryBinding } from '../composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from '../definition'
import {
  DomainsQuery,
  DomainsQueryArgs,
  type DomainsQueryCompletedFetch,
} from '../domainsQuery'
import type { CompletedReadSearchPlanningTimeMessage } from '../message'
import { planRequiredDomainCandidateRange } from '../quotePlanning'
import { routeToQuery } from '../route'
import { informResultsListStep } from './resultsList'

const makeTrackDomainCandidateRangeStep = (
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

const makeUseCompleteCatalogRangeStep = (args: DomainsQueryArgs) =>
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

export const makeScheduleQuoteRequestStep = (
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

export const loadRequiredQuotesStep = makeStep(model =>
  Option.match(planRequiredDomainCandidateRange(model), {
    onNone: () => ({ model }),
    onSome: range => makeScheduleQuoteRequestStep(range)(model),
  }),
)

export const loadQuotesForRangeStep = makeStep(
  (model, message: CompletedReadSearchPlanningTimeMessage) => {
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

export const makeApplyQuoteCompletionStep = ({
  args,
  result,
  completedAtMillis,
}: DomainsQueryCompletedFetch) =>
  makeStep(model => {
    if (
      args.mode !== model.searchMode ||
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
          model.searchMode === 'Live' && Result.isFailure(result)
            ? Option.orElse(
                result.failure.maybeSearchCooldown,
                () => maybeCooldown,
              )
            : maybeCooldown,
      })),
      Result.isSuccess(result)
        ? makeUseCompleteCatalogRangeStep(args)
        : makeNoopStep(),
      loadRequiredQuotesStep,
      informResultsListStep,
    ])
  })
