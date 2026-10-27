import { Array, Option } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import {
  Command,
  type StorySimulation,
  given,
  message,
  model,
  story,
} from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { VirtualList } from '@foldkit/ui'

import {
  FetchDomains,
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
  ReleaseEarlySearchListeners,
  ReplaceSearchUrl,
  cancelSearch,
} from './command'
import { Domain, searchDomains } from './domain'
import { init } from './init'
import { Message } from './message'
import { SearchState } from './model'
import { emptyModel, readyModel, urlOrThrow } from './model.fixture'
import { ResultsListBlock } from './resultsList'
import { ApplicationRoute, routeToQuery, searchHref } from './route'
import { update } from './update'

const resolveResultsListScrolls = <Model, Message, OutMessage>(
  simulation: StorySimulation<Model, Message, OutMessage>,
): StorySimulation<Model, Message, OutMessage> =>
  Array.reduce(simulation.commands, simulation, (current, command) =>
    Option.match(Command.argsOf(VirtualList.test.ApplyScroll)(command), {
      onNone: () => current,
      onSome: args =>
        Command.resolve(
          VirtualList.test.ApplyScroll(args),
          ResultsListBlock.Message.CompletedApplyScroll({
            version: args.version,
            outcome: VirtualList.ApplyScrollOutcome.Skipped(),
          }),
        )(current),
    }),
  )

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
    resolveResultsListScrolls,
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
    resolveResultsListScrolls,
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
    resolveResultsListScrolls,
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
    resolveResultsListScrolls,
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
    resolveResultsListScrolls,
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
    resolveResultsListScrolls,
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
    resolveResultsListScrolls,
  )
})

describe('startup', () => {
  test.each([
    { path: '/', query: '', searchTag: 'Idle', fetches: [] },
    {
      path: '/?q=Acme.dev',
      query: 'Acme.dev',
      searchTag: 'Loading',
      fetches: [{ label: 'acme', searchGeneration: 1 }],
    },
    {
      path: '/?q=not%20a%20domain!',
      query: 'not a domain!',
      searchTag: 'Failed',
      fetches: [],
    },
    { path: '/?q=', query: '', searchTag: 'Idle', fetches: [] },
  ])(
    'initializes $path from the URL and schedules the bootstrap handoff',
    ({ path, query, searchTag, fetches }) => {
      const applicationInit = init(urlOrThrow(`http://localhost${path}`))

      expect(routeToQuery(applicationInit.model.route)).toBe(query)
      expect(applicationInit.model.search._tag).toBe(searchTag)
      expect(
        Array.getSomes(
          Array.map(
            applicationInit.commands ?? [],
            Command.argsOf(FetchDomains),
          ),
        ),
      ).toEqual(fetches)
      expect(
        Array.getSomes(
          Array.map(
            applicationInit.commands ?? [],
            Command.argsOf(ReleaseEarlySearchListeners),
          ),
        ),
      ).toHaveLength(1)
    },
  )
})

describe('domain validation', () => {
  test.each([
    { query: '  HTTPS://MiXeD-Name.dev/path  ', label: 'mixed-name' },
    { query: 'a', label: 'a' },
    { query: 'a'.repeat(63), label: 'a'.repeat(63) },
  ])('searches the normalized label for $query', ({ query, label }) => {
    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow(`http://localhost${searchHref(query)}`),
        }),
      ),
      model(model => {
        expect(routeToQuery(model.route)).toBe(query)
        expect(model.search._tag).toBe('Loading')
      }),
      Command.resolve(
        FetchDomains({ label, searchGeneration: 1 }),
        Message.SucceededFetchDomains({
          searchGeneration: 1,
          domains: searchDomains(label),
        }),
      ),
      resolveResultsListScrolls,
      Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
    )
  })

  test.each([
    'not a domain!',
    '-acme',
    'acme-',
    'under_score',
    'a'.repeat(64),
    '   ',
  ])('rejects %j without scheduling a lookup', query => {
    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow(`http://localhost${searchHref(query)}`),
        }),
      ),
      model(model => {
        expect(model.search).toEqual(
          SearchState.Failed({
            error:
              'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
          }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectExact(cancelSearch()),
      Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
    )
  })

  test('recovers from an invalid query when browser navigation supplies a valid one', () => {
    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=invalid!') }),
      ),
      model(model => {
        expect(model.search._tag).toBe('Failed')
      }),
      message(
        Message.ChangedUrl({
          url: urlOrThrow('http://localhost/?q=valid-domain'),
        }),
      ),
      model(model => {
        expect(model.search._tag).toBe('Loading')
      }),
      Command.resolve(
        FetchDomains({ label: 'valid-domain', searchGeneration: 2 }),
        Message.SucceededFetchDomains({
          searchGeneration: 2,
          domains: searchDomains('valid-domain'),
        }),
      ),
      model(model => {
        expect(model.search).toEqual(
          SearchState.Ready({ domains: searchDomains('valid-domain') }),
        )
      }),
      resolveResultsListScrolls,
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
      ),
    )
  })
})

describe('lookup completion order', () => {
  test.each([
    Message.SucceededFetchDomains({
      searchGeneration: 2,
      domains: searchDomains('outdated'),
    }),
    Message.FailedFetchDomains({
      searchGeneration: 2,
      error: 'Outdated failure',
    }),
  ])(
    'an older $_tag cannot replace a completed retry of the same query',
    completion => {
      story(
        update,
        given(readyModel('acme')),
        message(Message.SubmittedSearch()),
        message(Message.SubmittedSearch()),
        Command.resolve(
          FetchDomains({ label: 'acme', searchGeneration: 3 }),
          Message.SucceededFetchDomains({
            searchGeneration: 3,
            domains: searchDomains('acme'),
          }),
        ),
        resolveResultsListScrolls,
        Command.resolve(
          FetchDomains({ label: 'acme', searchGeneration: 2 }),
          completion,
        ),
        model(model => {
          expect(model.searchGeneration).toBe(3)
          expect(model.search).toEqual(
            SearchState.Ready({ domains: searchDomains('acme') }),
          )
        }),
        Command.resolveAllExact(
          [cancelSearch(), Message.CompletedCancelSearch()],
          [cancelSearch(), Message.CompletedCancelSearch()],
        ),
      )
    },
  )

  test('a current failure can be retried without changing the query', () => {
    story(
      update,
      given(readyModel('acme')),
      message(Message.SubmittedSearch()),
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 2 }),
        Message.FailedFetchDomains({
          searchGeneration: 2,
          error: 'Temporarily unavailable',
        }),
      ),
      model(model => {
        expect(model.search).toEqual(
          SearchState.Failed({ error: 'Temporarily unavailable' }),
        )
      }),
      message(Message.ClickedRetrySearch()),
      model(model => {
        expect(routeToQuery(model.route)).toBe('acme')
        expect(model.search._tag).toBe('Loading')
        expect(model.searchGeneration).toBe(3)
      }),
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 3 }),
        Message.SucceededFetchDomains({
          searchGeneration: 3,
          domains: searchDomains('acme'),
        }),
      ),
      model(model => {
        expect(model.search).toEqual(
          SearchState.Ready({ domains: searchDomains('acme') }),
        )
      }),
      resolveResultsListScrolls,
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
      ),
    )
  })

  test('leaving search rejects both late successes and late failures', () => {
    story(
      update,
      given(readyModel('acme')),
      message(Message.SubmittedSearch()),
      message(Message.SubmittedSearch()),
      message(
        Message.ChangedUrl({ url: urlOrThrow('http://localhost/missing') }),
      ),
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 2 }),
        Message.SucceededFetchDomains({
          searchGeneration: 2,
          domains: searchDomains('acme'),
        }),
      ),
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 3 }),
        Message.FailedFetchDomains({
          searchGeneration: 3,
          error: 'Outdated failure',
        }),
      ),
      model(model => {
        expect(model.route).toEqual(
          ApplicationRoute.NotFound({ path: '/missing' }),
        )
        expect(model.search._tag).toBe('Idle')
      }),
      resolveResultsListScrolls,
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
      ),
    )
  })

  test('history navigation starts a lookup for each changed query', () => {
    story(
      update,
      given(readyModel('acme')),
      message(
        Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=other') }),
      ),
      message(
        Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
      ),
      Command.resolve(
        FetchDomains({ label: 'other', searchGeneration: 2 }),
        Message.SucceededFetchDomains({
          searchGeneration: 2,
          domains: searchDomains('other'),
        }),
      ),
      model(model => {
        expect(routeToQuery(model.route)).toBe('acme')
        expect(model.search._tag).toBe('Loading')
      }),
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 3 }),
        Message.SucceededFetchDomains({
          searchGeneration: 3,
          domains: searchDomains('acme'),
        }),
      ),
      model(model => {
        expect(model.search).toEqual(
          SearchState.Ready({ domains: searchDomains('acme') }),
        )
      }),
      resolveResultsListScrolls,
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
      ),
    )
  })

  test('unrelated URL changes do not restart the current search', () => {
    const initialModel = readyModel('acme')

    story(
      update,
      given(initialModel),
      message(
        Message.ChangedUrl({
          url: urlOrThrow(
            'http://localhost/?q=acme&utm_source=example#results',
          ),
        }),
      ),
      model(model => {
        expect(model.searchGeneration).toBe(initialModel.searchGeneration)
        expect(model.search).toBe(initialModel.search)
      }),
      Command.expectNone(),
    )
  })
})

describe('cart invariants', () => {
  test('adding a domain is idempotent and unavailable domains cannot enter the cart', () => {
    const domain = Domain.make({
      name: 'acme.com',
      tld: 'com',
      price: 12,
      isAvailable: true,
    })
    const unavailableDomain = Domain.make({
      name: 'foldkit.com',
      tld: 'com',
      price: 12,
      isAvailable: false,
    })

    story(
      update,
      given(readyModel('acme')),
      message(Message.ClickedAddDomain({ domain })),
      message(Message.ClickedAddDomain({ domain })),
      message(Message.ClickedAddDomain({ domain: unavailableDomain })),
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

  test('filtering, sorting, searching, and clearing preserve cart selections', () => {
    const domain = Domain.make({
      name: 'acme.com',
      tld: 'com',
      price: 12,
      isAvailable: true,
    })

    story(
      update,
      given(readyModel('acme')),
      message(Message.ClickedAddDomain({ domain })),
      message(Message.UpdatedTldFilter({ value: 'App' })),
      message(Message.UpdatedAvailabilityFilter({ value: 'Available' })),
      message(Message.UpdatedSortOrder({ value: 'PriceDescending' })),
      message(
        Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=fresh') }),
      ),
      Command.resolve(
        FetchDomains({ label: 'fresh', searchGeneration: 2 }),
        Message.SucceededFetchDomains({
          searchGeneration: 2,
          domains: searchDomains('fresh'),
        }),
      ),
      message(Message.PressedEscape()),
      Command.resolve(
        ReplaceSearchUrl({ q: Option.none() }),
        Message.CompletedReplaceSearchUrl(),
      ),
      message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
      model(model => {
        expect(model.cart).toEqual([domain])
        expect(model.tldFilter).toBe('App')
        expect(model.availabilityFilter).toBe('Available')
        expect(model.sortOrder).toBe('PriceDescending')
        expect(model.search._tag).toBe('Idle')
      }),
      resolveResultsListScrolls,
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
        [cancelSearch(), Message.CompletedCancelSearch()],
      ),
    )
  })
})
