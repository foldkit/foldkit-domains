import { Array, Option } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Domain } from '../../shared/domain'
import { makeDomainFixtures } from '../../shared/domain.fixture'
import {
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
  ReplaceSearchUrl,
} from '../command'
import { Message } from '../message'
import { emptyModel, readyModel, urlOrThrow } from '../model.fixture'
import { QuoteWindows } from '../quoteWindows'
import { ApplicationRoute, routeToQuery, searchHref } from '../route'
import { SearchPresentation, searchPresentation } from '../searchPresentation'
import { update } from '../update'
import {
  quoteFetch,
  resolveQuoteCancellation,
  resolveQuoteSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

test('typing synchronizes the URL before the route starts its quote request', () => {
  const args = { label: 'fresh', offset: 0, limit: 60 }

  story(
    update,
    given(emptyModel),
    message(Message.UpdatedSearch({ value: 'fresh' })),
    model(model => {
      expect(model.route).toEqual(emptyModel.route)
      expect(model.searchGeneration).toBe(1)
      expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
    }),
    Command.expectExact(ReplaceSearchUrl({ q: Option.some('fresh') })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('fresh') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=fresh') }),
    ),
    model(model => {
      expect(model.route).toEqual(
        ApplicationRoute.Search({ q: Option.some('fresh') }),
      )
      expect(model.searchGeneration).toBe(2)
      expect(searchPresentation(model)).toEqual(SearchPresentation.Loading())
    }),
    resolveSearchTime(2, 100),
    Command.expectHas(quoteFetch(args, 1)),
    resolveQuoteSuccess(
      args,
      1,
      Array.take(makeDomainFixtures('fresh'), 60),
      120,
    ),
    model(model => {
      expect(searchPresentation(model)._tag).toBe('Ready')
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

describe('domain validation', () => {
  test.each([
    { query: '  HTTPS://MiXeD-Name.dev/path  ', label: 'mixed-name' },
    { query: 'a', label: 'a' },
    { query: 'a'.repeat(63), label: 'a'.repeat(63) },
  ])('searches the normalized label for $query', ({ query, label }) => {
    const args = { label, offset: 0, limit: 60 }

    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow(`http://localhost${searchHref(query)}`),
        }),
      ),
      resolveSearchTime(1, 0),
      Command.expectHas(quoteFetch(args, 1)),
      resolveQuoteSuccess(args, 1, Array.take(makeDomainFixtures(label), 60)),
      model(model => {
        expect(routeToQuery(model.route)).toBe(query)
        expect(searchPresentation(model)._tag).toBe('Ready')
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test.each([
    'not a domain!',
    '-acme',
    'acme-',
    'under_score',
    'a'.repeat(64),
    '   ',
  ])('rejects %j without scheduling quote work', query => {
    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow(`http://localhost${searchHref(query)}`),
        }),
      ),
      model(model => {
        expect(searchPresentation(model)).toEqual(
          SearchPresentation.Failed({
            error:
              'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
          }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })
})

test('an unchanged input keeps its active Query request', () => {
  const args = { label: 'acme', offset: 0, limit: 60 }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(1, 0),
    Command.expectHas(quoteFetch(args, 1)),
    message(Message.UpdatedSearch({ value: 'acme' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('acme') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    model(model => {
      expect(model.searchGeneration).toBe(1)
      expect(QuoteWindows.pendingArgs(model.quoteWindows)).toEqual([args])
    }),
    resolveQuoteSuccess(
      args,
      1,
      Array.take(makeDomainFixtures('acme'), 60),
      10,
    ),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('a planning Clock from the previous route cannot start quote work', () => {
  const otherArgs = { label: 'other', offset: 0, limit: 60 }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=other') }),
    ),
    resolveSearchTime(1, 10),
    model(model => {
      expect(QuoteWindows.pendingArgs(model.quoteWindows)).toEqual([])
      expect(routeToQuery(model.route)).toBe('other')
    }),
    resolveSearchTime(2, 20),
    Command.expectHas(quoteFetch(otherArgs, 1)),
    resolveQuoteSuccess(
      otherArgs,
      1,
      Array.take(makeDomainFixtures('other'), 60),
      30,
    ),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('leaving search cancels its pending Query key', () => {
  const args = { label: 'acme', offset: 0, limit: 60 }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(1, 0),
    Command.expectHas(quoteFetch(args, 1)),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/missing') }),
    ),
    model(model => {
      expect(model.route).toEqual(
        ApplicationRoute.NotFound({ path: '/missing' }),
      )
      expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
      expect(QuoteWindows.pendingArgs(model.quoteWindows)).toEqual([])
    }),
    resolveQuoteCancellation(args, 1),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('clearing the input returns to the idle route and restores input focus', () => {
  story(
    update,
    given(readyModel('acme')),
    message(Message.ClickedClearSearch()),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.none() }),
      Message.CompletedReplaceSearchUrl(),
    ),
    Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
    message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
    model(model => {
      expect(model.route).toEqual(ApplicationRoute.Search({ q: Option.none() }))
      expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('unrelated URL changes do not restart a settled search', () => {
  const initialModel = readyModel('acme')

  story(
    update,
    given(initialModel),
    message(
      Message.ChangedUrl({
        url: urlOrThrow('http://localhost/?q=acme&utm_source=example#results'),
      }),
    ),
    model(model => {
      expect(model.searchGeneration).toBe(initialModel.searchGeneration)
      expect(model.quoteWindows).toBe(initialModel.quoteWindows)
      expect(searchPresentation(model)).toEqual(
        searchPresentation(initialModel),
      )
    }),
    Command.expectNone(),
  )
})

test('internal and external links use their respective navigation Commands', () => {
  story(
    update,
    given(emptyModel),
    message(
      Message.ClickedLink({
        request: UrlRequest.Internal({
          url: urlOrThrow('http://localhost/?q=acme'),
        }),
      }),
    ),
    Command.resolve(
      NavigateInternal({ url: 'http://localhost/?q=acme' }),
      Message.CompletedNavigateInternal(),
    ),
    message(
      Message.ClickedLink({
        request: UrlRequest.External({ href: 'https://vercel.com/login' }),
      }),
    ),
    Command.resolve(
      LoadExternal({ href: 'https://vercel.com/login' }),
      Message.CompletedLoadExternal(),
    ),
    Command.expectNone(),
  )
})

test('cart additions are unique and require confirmed availability', () => {
  const domain = Domain.Available({
    name: 'acme.com',
    tld: 'com',
    price: 12,
    renewalPrice: 12,
    years: 1,
    isPremium: false,
  })
  const unconfirmedDomain = Domain.Unconfirmed({
    name: 'foldkit.com',
    tld: 'com',
  })

  story(
    update,
    given(readyModel('acme')),
    message(Message.ClickedAddDomain({ domain })),
    message(Message.ClickedAddDomain({ domain })),
    message(Message.ClickedAddDomain({ domain: unconfirmedDomain })),
    message(Message.ClickedRemoveDomain({ name: 'missing.com' })),
    model(model => {
      expect(model.cart).toEqual([domain])
    }),
    message(Message.ClickedRemoveDomain({ name: domain.name })),
    message(Message.ClickedRemoveDomain({ name: domain.name })),
    model(model => {
      expect(model.cart).toEqual([])
    }),
    Command.expectNone(),
  )
})
