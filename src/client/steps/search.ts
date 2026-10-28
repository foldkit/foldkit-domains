import { Array, Number, Option, String } from 'effect'
import { AsyncData, Update } from 'foldkit'

import { domainTlds, queryToMaybeDomainLabel } from '../../shared/domain'
import { DetermineSearchTime, ReplaceSearchUrl } from '../command'
import { QuoteWindowsBinding } from '../composition'
import {
  makeCommandsStep,
  makeFieldsStep,
  makeNoopStep,
  makeStep,
} from '../definition'
import { QUOTE_PAGE_SIZE } from '../domain'
import { Message } from '../message'
import { QuoteWindows } from '../quoteWindows'
import { routeToQuery } from '../route'
import { searchPresentation } from '../searchPresentation'
import {
  loadRequiredQuotesStep,
  makeRequestQuoteWindowStep,
} from './quoteLoading'
import { informResultsListStep } from './resultsList'

export const cancelSearchStep = makeStep(model =>
  Update.combineSteps(
    Array.map(QuoteWindows.pendingArgs(model.quoteWindows), args =>
      QuoteWindowsBinding.requestCancel(args),
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
        quotePlan: () => [],
        maybeBlockedQuoteWindow: () => Option.none(),
      })),
      makeCommandsStep(() =>
        Option.match(maybeLabel, {
          onNone: () => [],
          onSome: () => [
            DetermineSearchTime({
              searchGeneration: nextSearchGeneration,
              offset: 0,
              limit: QUOTE_PAGE_SIZE,
              isForced,
            }),
          ],
        }),
      ),
      informResultsListStep,
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
        makeFieldsStep(() => ({ searchGeneration: Number.increment })),
        replaceSearchUrl,
      ])
    }
  })

export const clearSearchStep = makeChangeSearchQueryStep('')

export const retrySearchStep = makeStep(model => {
  const search = searchPresentation(model)

  if (search._tag === 'Ready' && search.quoteRequest._tag === 'Failed') {
    const window =
      model.sortOrder !== 'Relevance' || model.availabilityFilter !== 'All'
        ? { offset: 0, limit: domainTlds.length }
        : search.quoteRequest

    return makeRequestQuoteWindowStep(window, true)
  } else {
    return makeSearchQueryStep(true)
  }
})

export const startQuoteWindowStep = makeStep(
  (model, message: typeof Message.CompletedDetermineSearchTime.Type) => {
    if (message.searchGeneration !== model.searchGeneration) {
      return { model }
    }

    const maybeLabel = queryToMaybeDomainLabel(routeToQuery(model.route))

    if (Option.isNone(maybeLabel)) {
      return { model }
    }

    if (
      Array.some(
        QuoteWindows.pendingArgs(model.quoteWindows),
        args => args.label === maybeLabel.value,
      )
    ) {
      return { model }
    }

    const window = { offset: message.offset, limit: message.limit }
    const args = { label: maybeLabel.value, ...window }
    const isBlocked =
      (message.isForced ||
        !QuoteWindows.isFresh(model.quoteWindows, args, message.nowMillis)) &&
      Option.exists(
        model.maybeSearchCooldown,
        cooldown => cooldown.expiresAtMillis > message.nowMillis,
      )

    const loadWindowStep = () => {
      if (isBlocked) {
        return makeNoopStep()
      } else if (message.isForced) {
        return QuoteWindowsBinding.requestRevalidationOrLoad(args)
      } else {
        return QuoteWindowsBinding.requestLoadIfStale(args, message.nowMillis)
      }
    }

    return Update.combineSteps([
      makeFieldsStep(() => ({
        searchTimeMillis: () => message.nowMillis,
        quotePlan: windows =>
          Array.some(
            windows,
            existing =>
              existing.offset === window.offset &&
              existing.limit === window.limit,
          )
            ? windows
            : Array.append(windows, window),
        maybeBlockedQuoteWindow: () =>
          isBlocked ? Option.some(window) : Option.none(),
      })),
      loadWindowStep(),
      makeFieldsStep(stepModel =>
        window.offset === 0 &&
        window.limit === domainTlds.length &&
        AsyncData.isSuccess(QuoteWindows.read(stepModel.quoteWindows, args))
          ? { quotePlan: () => [window] }
          : {},
      ),
      loadRequiredQuotesStep,
      informResultsListStep,
    ])
  },
)
