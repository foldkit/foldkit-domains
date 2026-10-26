import { Option } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { Command, given, message, model, story } from 'foldkit/story'
import { expect, test } from 'vitest'

import {
  FetchDomains,
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
  ReplaceSearchUrl,
  cancelSearch,
} from './command'
import { searchDomains } from './domain'
import { Message } from './message'
import { SearchState } from './model'
import { emptyModel, readyModel, urlOrThrow } from './model.fixture'
import { ApplicationRoute, routeToQuery } from './route'
import { update } from './update'

test('only the current search can supply results when a query is repeated', () => {
  story(
    update,
    given(emptyModel),
    message(Message.UpdatedSearch({ value: 'acme' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('acme') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    message(Message.UpdatedSearch({ value: 'other' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('other') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=other') }),
    ),
    message(Message.UpdatedSearch({ value: 'acme' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('acme') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    Command.expectHas(
      FetchDomains({ label: 'acme', searchGeneration: 2 }),
      FetchDomains({ label: 'other', searchGeneration: 4 }),
      FetchDomains({ label: 'acme', searchGeneration: 6 }),
    ),
    Command.resolve(
      FetchDomains({ label: 'acme', searchGeneration: 2 }),
      Message.SucceededFetchDomains({
        searchGeneration: 2,
        domains: searchDomains('acme'),
      }),
    ),
    Command.resolve(
      FetchDomains({ label: 'other', searchGeneration: 4 }),
      Message.FailedFetchDomains({
        searchGeneration: 4,
        error: 'Search unavailable',
      }),
    ),
    model(model => {
      expect(routeToQuery(model.route)).toBe('acme')
      expect(model.search._tag).toBe('Loading')
    }),
    Command.resolve(
      FetchDomains({ label: 'acme', searchGeneration: 6 }),
      Message.SucceededFetchDomains({
        searchGeneration: 6,
        domains: searchDomains('acme'),
      }),
    ),
    model(model => {
      expect(model.search).toEqual(
        SearchState.Ready({ domains: searchDomains('acme') }),
      )
    }),
    Command.resolveAllExact(
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
    ),
  )
})

test('clearing the input prevents an in-flight search from reopening results', () => {
  story(
    update,
    given(emptyModel),
    message(Message.UpdatedSearch({ value: 'acme' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('acme') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    message(Message.ClickedClearSearch()),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.none() }),
      Message.CompletedReplaceSearchUrl(),
    ),
    Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
    message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
    model(model => {
      expect(routeToQuery(model.route)).toBe('')
      expect(model.search._tag).toBe('Idle')
    }),
    Command.resolve(
      FetchDomains({ label: 'acme', searchGeneration: 2 }),
      Message.SucceededFetchDomains({
        searchGeneration: 2,
        domains: searchDomains('acme'),
      }),
    ),
    model(model => {
      expect(routeToQuery(model.route)).toBe('')
      expect(model.search._tag).toBe('Idle')
    }),
    Command.resolveAllExact(
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
    ),
  )
})

test('typing requests URL synchronization before the new route starts a lookup', () => {
  story(
    update,
    given(emptyModel),
    message(Message.UpdatedSearch({ value: 'fresh' })),
    model(model => {
      expect(model.route).toEqual(emptyModel.route)
      expect(model.search).toEqual(emptyModel.search)
    }),
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
      expect(model.search._tag).toBe('Loading')
    }),
    Command.resolve(
      FetchDomains({ label: 'fresh', searchGeneration: 2 }),
      Message.SucceededFetchDomains({
        searchGeneration: 2,
        domains: searchDomains('fresh'),
      }),
    ),
    Command.resolveAllExact(
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
    ),
  )
})

test('an unknown path enters NotFound and cancels the search', () => {
  story(
    update,
    given(readyModel('acme')),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/missing') }),
    ),
    model(model => {
      expect(model.route).toEqual(
        ApplicationRoute.NotFound({ path: '/missing' }),
      )
      expect(model.search._tag).toBe('Idle')
    }),
    Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
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
  )
})

test('typing invalidates an in-flight result before the URL changes', () => {
  story(
    update,
    given(readyModel('acme')),
    message(Message.SubmittedSearch()),
    message(Message.UpdatedSearch({ value: 'fresh' })),
    Command.resolve(
      FetchDomains({ label: 'acme', searchGeneration: 2 }),
      Message.SucceededFetchDomains({
        searchGeneration: 2,
        domains: searchDomains('acme'),
      }),
    ),
    model(model => {
      expect(model.route).toEqual(
        ApplicationRoute.Search({ q: Option.some('acme') }),
      )
      expect(model.search._tag).toBe('Loading')
    }),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('fresh') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=fresh') }),
    ),
    Command.resolve(
      FetchDomains({ label: 'fresh', searchGeneration: 4 }),
      Message.SucceededFetchDomains({
        searchGeneration: 4,
        domains: searchDomains('fresh'),
      }),
    ),
    Command.resolveAllExact(
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
    ),
  )
})

test('clearing invalidates an in-flight result before the URL changes', () => {
  story(
    update,
    given(readyModel('acme')),
    message(Message.SubmittedSearch()),
    message(Message.ClickedClearSearch()),
    Command.resolve(
      FetchDomains({ label: 'acme', searchGeneration: 2 }),
      Message.SucceededFetchDomains({
        searchGeneration: 2,
        domains: searchDomains('acme'),
      }),
    ),
    model(model => {
      expect(model.search._tag).toBe('Loading')
    }),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.none() }),
      Message.CompletedReplaceSearchUrl(),
    ),
    Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
    message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
    model(model => {
      expect(model.route).toEqual(ApplicationRoute.Search({ q: Option.none() }))
      expect(model.search._tag).toBe('Idle')
    }),
    Command.resolveAllExact(
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
      [cancelSearch(), Message.CompletedCancelSearch()],
    ),
  )
})

test('an unchanged search value keeps its pending lookup', () => {
  story(
    update,
    given(readyModel('acme')),
    message(Message.SubmittedSearch()),
    message(Message.UpdatedSearch({ value: 'acme' })),
    Command.resolve(
      ReplaceSearchUrl({ q: Option.some('acme') }),
      Message.CompletedReplaceSearchUrl(),
    ),
    message(
      Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
    ),
    Command.resolve(
      FetchDomains({ label: 'acme', searchGeneration: 2 }),
      Message.SucceededFetchDomains({
        searchGeneration: 2,
        domains: searchDomains('acme'),
      }),
    ),
    model(model => {
      expect(model.search).toEqual(
        SearchState.Ready({ domains: searchDomains('acme') }),
      )
    }),
    Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
  )
})
