import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { expect, test } from 'vitest'

import { domainTlds } from '../../shared/domain'
import { makeDomainFixtures } from '../../shared/domain.fixture'
import { Message } from '../message'
import { emptyModel, withQuotedWindow } from '../model.fixture'
import { QuoteFailure, QuoteWindows } from '../quoteWindows'
import { ApplicationRoute } from '../route'
import {
  QuoteRequestPresentation,
  SearchPresentation,
  searchPresentation,
} from '../searchPresentation'
import { update } from '../update'
import {
  changeSearchQuery,
  quoteFetch,
  resolveQuoteFailure,
  resolveQuoteSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

test('a normalized fresh label restores after another label fails', () => {
  const acmeArgs = { label: 'acme', offset: 0, limit: 60 }
  const otherArgs = { label: 'other', offset: 0, limit: 60 }
  const acmeQuotes = Array.take(makeDomainFixtures('acme'), 60)

  story(
    update,
    given(emptyModel),
    changeSearchQuery('Acme.dev', 2, 0),
    resolveQuoteSuccess(acmeArgs, 1, acmeQuotes, 100),
    changeSearchQuery('other.dev', 4, 200),
    resolveQuoteFailure(
      otherArgs,
      2,
      QuoteFailure.make({
        error: 'Provider unavailable',
        maybeSearchCooldown: Option.none(),
      }),
      220,
    ),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Failed({ error: 'Provider unavailable' }),
      )
    }),
    changeSearchQuery('Acme.de', 6, 300),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: acmeQuotes }),
      )
      expect(QuoteWindows.read(model.quoteWindows, otherArgs)._tag).toBe(
        'Failure',
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('a fresh hit touches recency without extending the completion deadline', () => {
  const acmeArgs = { label: 'acme', offset: 0, limit: 60 }
  const otherArgs = { label: 'other', offset: 0, limit: 60 }
  const acmeQuotes = Array.take(makeDomainFixtures('acme'), 60)
  const otherQuotes = Array.take(makeDomainFixtures('other'), 60)

  story(
    update,
    given(emptyModel),
    changeSearchQuery('acme', 2, 0),
    resolveQuoteSuccess(acmeArgs, 1, acmeQuotes, 100),
    changeSearchQuery('other', 4, 1_000),
    resolveQuoteSuccess(otherArgs, 2, otherQuotes, 1_000),
    changeSearchQuery('acme', 6, 60_099),
    model(model => {
      expect(QuoteWindows.isFresh(model.quoteWindows, acmeArgs, 60_099)).toBe(
        true,
      )
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({ domains: acmeQuotes }),
      )
    }),
    changeSearchQuery('other', 8, 60_099),
    changeSearchQuery('acme', 10, 60_100),
    Command.expectHas(quoteFetch(acmeArgs, 3)),
    model(model => {
      expect(searchPresentation(model)).toEqual(SearchPresentation.Loading())
      expect(QuoteWindows.read(model.quoteWindows, acmeArgs)._tag).toBe(
        'Refreshing',
      )
    }),
    resolveQuoteSuccess(acmeArgs, 3, acmeQuotes, 60_120),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('label, offset, and limit isolate quote windows used by the application', () => {
  const firstArgs = { label: 'acme', offset: 0, limit: 60 }
  const secondArgs = { label: 'acme', offset: 60, limit: 60 }
  const catalogArgs = {
    label: 'acme',
    offset: 0,
    limit: domainTlds.length,
  }
  const firstQuotes = Array.take(makeDomainFixtures('acme'), 60)
  const secondQuotes = Array.take(
    Array.drop(makeDomainFixtures('acme'), 60),
    60,
  )
  const partialModel = withQuotedWindow(
    modifyFields(emptyModel, {
      route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
      searchGeneration: () => 1,
    }),
    firstArgs,
    firstQuotes,
  )

  story(
    update,
    given(partialModel),
    message(Message.RequestedQuotes({ offset: 60, limit: 60 })),
    resolveSearchTime(1, 10, 60, 60),
    Command.expectHas(quoteFetch(secondArgs, 2)),
    resolveQuoteSuccess(secondArgs, 2, secondQuotes, 20),
    message(Message.UpdatedSortOrder({ value: 'PriceAscending' })),
    resolveSearchTime(1, 30, 0, domainTlds.length),
    Command.expectHas(quoteFetch(catalogArgs, 3)),
    model(model => {
      expect(QuoteWindows.read(model.quoteWindows, firstArgs)).toEqual(
        AsyncData.Success({ data: firstQuotes }),
      )
      expect(QuoteWindows.read(model.quoteWindows, secondArgs)).toEqual(
        AsyncData.Success({ data: secondQuotes }),
      )
      expect(QuoteWindows.read(model.quoteWindows, catalogArgs)._tag).toBe(
        'Loading',
      )
    }),
    resolveQuoteSuccess(catalogArgs, 3, makeDomainFixtures('acme'), 40),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('global criteria reuse a fresh catalog and prune an active failed page', () => {
  const firstArgs = { label: 'acme', offset: 0, limit: 60 }
  const secondArgs = { label: 'acme', offset: 60, limit: 60 }
  const catalogArgs = {
    label: 'acme',
    offset: 0,
    limit: domainTlds.length,
  }
  const allQuotes = makeDomainFixtures('acme')
  const firstQuotes = Array.take(allQuotes, 60)
  const cachedModel = modifyFields(
    withQuotedWindow(
      withQuotedWindow(
        modifyFields(emptyModel, {
          route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
          searchGeneration: () => 1,
        }),
        catalogArgs,
        allQuotes,
        100,
      ),
      firstArgs,
      firstQuotes,
      100,
    ),
    { quotePlan: () => [{ offset: 0, limit: 60 }] },
  )
  const pageFailure = QuoteFailure.make({
    error: 'Provider busy',
    maybeSearchCooldown: Option.none(),
  })

  story(
    update,
    given(cachedModel),
    message(Message.RequestedQuotes({ offset: 60, limit: 60 })),
    resolveSearchTime(1, 110, 60, 60),
    resolveQuoteFailure(secondArgs, 3, pageFailure, 115),
    model(model => {
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({
          domains: firstQuotes,
          quoteRequest: QuoteRequestPresentation.Failed({
            offset: 60,
            limit: 60,
            error: pageFailure.error,
          }),
        }),
      )
    }),
    message(Message.UpdatedAvailabilityFilter({ value: 'Available' })),
    resolveSearchTime(1, 120, 0, domainTlds.length),
    model(model => {
      expect(QuoteWindows.pendingArgs(model.quoteWindows)).toEqual([])
      expect(QuoteWindows.read(model.quoteWindows, secondArgs)._tag).toBe(
        'Failure',
      )
      expect(model.quotePlan).toEqual([{ offset: 0, limit: domainTlds.length }])
      expect(searchPresentation(model)).toEqual(
        SearchPresentation.Ready({
          domains: allQuotes,
          quoteRequest: QuoteRequestPresentation.Idle(),
        }),
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})
