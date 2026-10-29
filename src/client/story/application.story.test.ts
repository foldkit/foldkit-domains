import { Array, Option } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { Command, given, message, model, story } from 'foldkit/story'
import { toParentMessage } from 'foldkit/test'
import { describe, expect, test } from 'vitest'

import { VirtualList } from '@foldkit/ui'

import { DataSource } from '../../shared/dataSource'
import { Domain } from '../../shared/domain'
import { makeDomainFixtures } from '../../shared/domain.fixture'
import {
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
  ReplaceSearchUrl,
  ScrollPageToTop,
} from '../command'
import { ResultsListBinding } from '../composition'
import { DomainsQuery } from '../domainsQuery'
import { Message } from '../message'
import { emptyModel, readyModel, urlOrThrow } from '../model.fixture'
import { ResultsListBlock } from '../resultsList'
import { ApplicationRoute, routeToQuery, searchHref } from '../route'
import { SearchPresentation, searchPresentation } from '../searchPresentation'
import { update } from '../update'
import {
  makeDomainsFetch,
  resolveDomainsCancellation,
  resolveDomainsSuccess,
  resolveRemainingFirstPageDomains,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

test('typing synchronizes the URL before the route starts its domain request', () => {
  const args = {
    dataSource: DataSource.make('Demo'),
    label: 'fresh',
    offset: 0,
    limit: 4,
  }

  story(
    update,
    given(emptyModel),
    message(Message.UpdatedSearch({ value: 'fresh' })),
    model(model => {
      expect(model.route).toEqual(emptyModel.route)
      expect(model.searchGeneration).toBe(1)
      expect(model.searchLayout).toBe('Search')
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
    Command.expectHas(makeDomainsFetch(args, 1)),
    resolveDomainsSuccess(
      args,
      1,
      Array.take(makeDomainFixtures('fresh'), 4),
      120,
    ),
    model(model => {
      expect(searchPresentation(model)._tag).toBe('Ready')
    }),
    resolveRemainingFirstPageDomains(
      'fresh',
      2,
      2,
      Array.take(Array.drop(makeDomainFixtures('fresh'), 4), 56),
      120,
    ),
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
    const args = {
      dataSource: DataSource.make('Demo'),
      label,
      offset: 0,
      limit: 4,
    }

    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow(`http://localhost${searchHref(query)}`),
        }),
      ),
      resolveSearchTime(1, 0),
      Command.expectHas(makeDomainsFetch(args, 1)),
      resolveDomainsSuccess(args, 1, Array.take(makeDomainFixtures(label), 4)),
      model(model => {
        expect(routeToQuery(model.route)).toBe(query)
        expect(searchPresentation(model)._tag).toBe('Ready')
      }),
      resolveRemainingFirstPageDomains(
        label,
        1,
        2,
        Array.take(Array.drop(makeDomainFixtures(label), 4), 56),
      ),
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
  ])('rejects %j without scheduling domain lookups', query => {
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
  const args = {
    dataSource: DataSource.make('Demo'),
    label: 'acme',
    offset: 0,
    limit: 4,
  }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(1, 0),
    Command.expectHas(makeDomainsFetch(args, 1)),
    message(Message.UpdatedSearch({ value: 'acme' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('acme') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    model(model => {
      expect(model.searchGeneration).toBe(1)
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([args])
    }),
    resolveDomainsSuccess(
      args,
      1,
      Array.take(makeDomainFixtures('acme'), 4),
      10,
    ),
    resolveRemainingFirstPageDomains(
      'acme',
      1,
      2,
      Array.take(Array.drop(makeDomainFixtures('acme'), 4), 56),
      10,
    ),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('a planning Clock from the previous route cannot start domain lookups', () => {
  const otherArgs = {
    dataSource: DataSource.make('Demo'),
    label: 'other',
    offset: 0,
    limit: 4,
  }

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
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
      expect(routeToQuery(model.route)).toBe('other')
    }),
    resolveSearchTime(2, 20),
    Command.expectHas(makeDomainsFetch(otherArgs, 1)),
    resolveDomainsSuccess(
      otherArgs,
      1,
      Array.take(makeDomainFixtures('other'), 4),
      30,
    ),
    resolveRemainingFirstPageDomains(
      'other',
      2,
      2,
      Array.take(Array.drop(makeDomainFixtures('other'), 4), 56),
      30,
    ),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('leaving search cancels its pending Query key', () => {
  const args = {
    dataSource: DataSource.make('Demo'),
    label: 'acme',
    offset: 0,
    limit: 4,
  }

  story(
    update,
    given(emptyModel),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    resolveSearchTime(1, 0),
    Command.expectHas(makeDomainsFetch(args, 1)),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/missing') }),
    ),
    model(model => {
      expect(model.route).toEqual(
        ApplicationRoute.NotFound({ path: '/missing' }),
      )
      expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
    }),
    resolveDomainsCancellation(args, 1),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('clearing the input returns to the idle route, restores focus, and scrolls to the top', () => {
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
    Command.resolve(ScrollPageToTop, Message.CompletedScrollPageToTop()),
    model(model => {
      expect(model.route).toEqual(ApplicationRoute.Search({ q: Option.none() }))
      expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
      expect(model.searchLayout).toBe('Search')
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('backspacing to an empty query scrolls to the top after the route changes', () => {
  story(
    update,
    given(readyModel('a')),
    message(Message.UpdatedSearch({ value: '' })),
    Command.expectExact(ReplaceSearchUrl({ q: Option.none() })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.none() }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
    model(model => {
      expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
      expect(model.searchLayout).toBe('Search')
    }),
    Command.resolve(ScrollPageToTop, Message.CompletedScrollPageToTop()),
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
      expect(model.domainsQuery).toBe(initialModel.domainsQuery)
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
      expect(model.carts.Demo).toEqual([domain])
    }),
    message(Message.ClickedRemoveDomain({ name: domain.name })),
    message(Message.ClickedRemoveDomain({ name: domain.name })),
    model(model => {
      expect(model.carts.Demo).toEqual([])
    }),
    Command.expectNone(),
  )
})

test('clearing a scrolled search discards its virtual viewport before another search', () => {
  story(
    update,
    given(readyModel('acme')),
    message(
      toParentMessage(
        ResultsListBinding,
        ResultsListBlock.Message.ObservedContainerScroll({
          scrollTop: 1300,
          scrollHeight: 12000,
          containerHeight: 400,
          anchor: VirtualList.ObservedAnchor.Row({
            key: 'acme.studio',
            index: 2,
            viewportOffset: -20,
          }),
        }),
      ),
    ),
    model(model => {
      expect(model.resultsList.scrollTop).toBe(1300)
      expect(model.resultsList.viewportAnchor._tag).toBe('Row')
    }),
    message(Message.UpdatedSearch({ value: '' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.none() }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
    Command.resolve(ScrollPageToTop, Message.CompletedScrollPageToTop()),
    model(model => {
      expect(model.resultsList.scrollTop).toBe(0)
      expect(model.resultsList.viewportAnchor).toEqual({
        _tag: 'Offset',
        scrollTop: 0,
      })
      expect(model.resultsList.measurement._tag).toBe('Unmeasured')
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test.each([true, false])(
  'the early search handoff preserves an opened search: %s',
  isSearchStarted => {
    story(
      update,
      given(emptyModel),
      message(
        Message.CompletedReleaseEarlySearchListeners({ isSearchStarted }),
      ),
      model(model => {
        expect(model.searchLayout).toBe(isSearchStarted ? 'Search' : 'Landing')
        expect(searchPresentation(model)).toEqual(SearchPresentation.Idle())
      }),
      Command.expectNone(),
    )
  },
)
