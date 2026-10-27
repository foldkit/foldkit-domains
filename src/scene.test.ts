import { Array, Option } from 'effect'
import {
  Command,
  Mount,
  type SceneSimulation,
  all,
  change,
  click,
  expect,
  expectAll,
  first,
  given,
  inside,
  keydown,
  label,
  role,
  scene,
  selector,
  submit,
  text,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { VirtualList } from '@foldkit/ui'

import {
  FetchDomains,
  FocusSearchInput,
  ReplaceSearchUrl,
  cancelSearch,
} from './command'
import { searchDomains } from './domain'
import { Message } from './message'
import { SearchState } from './model'
import { emptyModel, readyModel } from './model.fixture'
import { RESULTS_LIST_ID, ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'
import { update } from './update'
import { view } from './view'

const resolveResultsListScrolls = <Model, Message, OutMessage>(
  simulation: SceneSimulation<Model, Message, OutMessage>,
): SceneSimulation<Model, Message, OutMessage> =>
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

const measureResultsList = Mount.resolve(
  VirtualList.test.ObserveVirtualList({ id: RESULTS_LIST_ID }),
  ResultsListBlock.Message.ResizedContainer({
    containerWidth: 1000,
    containerHeight: 400,
  }),
)

describe('domain search', () => {
  test('renders a bounded window of the complete catalog after measurement', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      inside(
        role('list', { name: 'All domain results' }),
        expect(text('acme.com')).toExist(),
        expect(text('acme.zone')).toBeAbsent(),
      ),
      expect(selector('#domain-results')).toHaveAttr('tabIndex', '0'),
      expect(text('556 domains · Prices per year in USD')).toExist(),
    )
  })

  test('hides prices and cart actions while refreshed domain prices are pending', () => {
    scene(
      { update, view },
      given(readyModel('fresh')),
      measureResultsList,
      submit(role('search')),
      resolveResultsListScrolls,
      expect(role('status', { name: 'Searching domains' })).toExist(),
      expect(selector('.results')).toHaveAttr('aria-busy', 'true'),
      expectAll(all.selector('.results .price')).toHaveCount(0),
      expectAll(all.selector('.results .unavailable')).toHaveCount(0),
      expectAll(all.selector('.results button')).toHaveCount(0),
      inside(
        selector('#domain-results'),
        inside(
          first(all.selector('.domain-row')),
          expect(text('fresh.com')).toExist(),
        ),
      ),
      inside(
        first(all.role('article')),
        expect(text('fresh.com')).toExist(),
        expect(text('$12.00')).toBeAbsent(),
        expect(role('button', { name: 'Add fresh.com to cart' })).toBeAbsent(),
      ),
      Command.resolve(
        FetchDomains({ label: 'fresh', searchGeneration: 2 }),
        Message.SucceededFetchDomains({
          searchGeneration: 2,
          domains: searchDomains('fresh'),
        }),
      ),
      Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
      resolveResultsListScrolls,
      inside(
        first(all.role('article')),
        expect(text('fresh.com')).toExist(),
        expect(text('$12.00')).toExist(),
        expect(role('button', { name: 'Add fresh.com to cart' })).toExist(),
      ),
    )
  })

  test('filters unavailable domains and sorts the remaining results by price', () => {
    scene(
      { update, view },
      given(readyModel('foldkit')),
      measureResultsList,
      change(label('Filter availability'), 'Available'),
      resolveResultsListScrolls,
      change(label('Sort results'), 'PriceAscending'),
      resolveResultsListScrolls,
      inside(
        selector('#domain-results'),
        expect(text('foldkit.com')).toBeAbsent(),
        inside(
          first(all.selector('.domain-row')),
          expect(text('foldkit.space')).toExist(),
          expect(text('$1.99')).toExist(),
        ),
      ),
    )
  })

  test('adds a domain, shows it in the cart, and removes it', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      inside(
        first(all.role('article')),
        click(role('button', { name: 'Add acme.com to cart' })),
      ),
      expect(role('button', { name: 'Remove acme.com from cart' })).toExist(),
      click(role('button', { name: 'Cart, 1 domains' })),
      inside(
        role('region', { name: 'Your cart' }),
        expect(text('acme.com')).toExist(),
        expect(text('$12.00')).toExist(),
        click(role('button', { name: 'Remove acme.com' })),
        expect(
          text(
            'Your next idea starts with a name. Search for a domain to add it here.',
          ),
        ).toExist(),
        click(role('button', { name: 'Close cart panel' })),
      ),
      expect(role('region', { name: 'Your cart' })).toBeAbsent(),
      expect(role('button', { name: 'Cart, 0 domains' })).toExist(),
    )
  })
})

test('NotFound shows the path and a link back to domain search', () => {
  scene(
    { update, view },
    given(
      modifyFields(emptyModel, {
        route: () => ApplicationRoute.NotFound({ path: '/missing' }),
      }),
    ),
    expect(role('heading', { name: '404 — Page Not Found' })).toExist(),
    expect(text('The path "/missing" was not found.')).toExist(),
    expect(role('link', { name: '← Back to Domains' })).toExist(),
    expect(label('Search domains')).toBeAbsent(),
  )
})

describe('search recovery', () => {
  test('a failure offers retry and a successful retry restores prices and actions', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      submit(role('search')),
      resolveResultsListScrolls,
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 2 }),
        Message.FailedFetchDomains({
          searchGeneration: 2,
          error: 'Temporarily unavailable',
        }),
      ),
      expect(role('alert')).toContainText('Temporarily unavailable'),
      expect(selector('#domain-results')).toBeAbsent(),
      Mount.expectEnded(
        VirtualList.test.ObserveVirtualList({ id: RESULTS_LIST_ID }),
      ),
      Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
      click(role('button', { name: 'Try again' })),
      measureResultsList,
      resolveResultsListScrolls,
      expect(role('alert')).toBeAbsent(),
      expect(label('Search domains')).toHaveValue('acme'),
      expect(role('status', { name: 'Searching domains' })).toExist(),
      expectAll(all.selector('.results .price')).toHaveCount(0),
      Command.resolve(
        FetchDomains({ label: 'acme', searchGeneration: 3 }),
        Message.SucceededFetchDomains({
          searchGeneration: 3,
          domains: searchDomains('acme'),
        }),
      ),
      resolveResultsListScrolls,
      Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
      expect(selector('.results')).toHaveAttr('aria-busy', 'false'),
      inside(
        first(all.role('article')),
        expect(text('$12.00')).toExist(),
        expect(role('button', { name: 'Add acme.com to cart' })).toExist(),
      ),
    )
  })

  test('Escape requests clearing the URL and cancellation', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      keydown(label('Search domains'), 'Escape'),
      Command.expectExact(
        cancelSearch(),
        ReplaceSearchUrl({ q: Option.none() }),
      ),
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [
          ReplaceSearchUrl({ q: Option.none() }),
          Message.CompletedReplaceSearchUrl(),
        ],
      ),
    )
  })

  test('the clear button requests clearing the URL, cancellation, and input focus', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      click(role('button', { name: 'Clear search' })),
      Command.expectExact(
        cancelSearch(),
        ReplaceSearchUrl({ q: Option.none() }),
        FocusSearchInput(),
      ),
      Command.resolveAllExact(
        [cancelSearch(), Message.CompletedCancelSearch()],
        [
          ReplaceSearchUrl({ q: Option.none() }),
          Message.CompletedReplaceSearchUrl(),
        ],
        [FocusSearchInput(), Message.CompletedFocusSearchInput()],
      ),
    )
  })
})

describe('result controls', () => {
  test('combined filters can produce an empty result and recover without changing Top Results', () => {
    scene(
      { update, view },
      given(readyModel('foldkit')),
      measureResultsList,
      change(label('Filter by TLD'), 'Com'),
      resolveResultsListScrolls,
      expectAll(all.selector('#domain-results .domain-row')).toHaveCount(1),
      inside(
        selector('#domain-results'),
        expect(text('foldkit.com')).toExist(),
      ),
      change(label('Filter availability'), 'Available'),
      resolveResultsListScrolls,
      expect(role('status')).toContainText('No domains match your filters.'),
      expect(text('0 domains · Prices per year in USD')).toExist(),
      expect(selector('#domain-results')).toBeAbsent(),
      Mount.expectEnded(
        VirtualList.test.ObserveVirtualList({ id: RESULTS_LIST_ID }),
      ),
      expectAll(all.role('article')).toHaveCount(4),
      inside(first(all.role('article')), expect(text('foldkit.com')).toExist()),
      change(label('Filter by TLD'), 'App'),
      measureResultsList,
      resolveResultsListScrolls,
      expect(text('1 domains · Prices per year in USD')).toExist(),
      expectAll(all.selector('#domain-results .domain-row')).toHaveCount(1),
      inside(
        selector('#domain-results'),
        expect(text('foldkit.app')).toExist(),
      ),
    )
  })

  test('sorting supports both price directions and restores relevance order', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      change(label('Sort results'), 'PriceDescending'),
      resolveResultsListScrolls,
      inside(
        first(all.selector('#domain-results .domain-row')),
        expect(text('acme.ai')).toExist(),
        expect(text('$80.00')).toExist(),
      ),
      change(label('Sort results'), 'PriceAscending'),
      resolveResultsListScrolls,
      inside(
        first(all.selector('#domain-results .domain-row')),
        expect(text('acme.space')).toExist(),
        expect(text('$1.99')).toExist(),
      ),
      change(label('Sort results'), 'Relevance'),
      resolveResultsListScrolls,
      inside(
        first(all.selector('#domain-results .domain-row')),
        expect(text('acme.com')).toExist(),
      ),
      expect(text('556 domains · Prices per year in USD')).toExist(),
    )
  })

  test('pending availability is unknown and selected filters apply when the lookup finishes', () => {
    scene(
      { update, view },
      given(readyModel('foldkit')),
      measureResultsList,
      change(label('Filter by TLD'), 'Com'),
      resolveResultsListScrolls,
      change(label('Filter availability'), 'Available'),
      resolveResultsListScrolls,
      expect(selector('#domain-results')).toBeAbsent(),
      Mount.expectEnded(
        VirtualList.test.ObserveVirtualList({ id: RESULTS_LIST_ID }),
      ),
      submit(role('search')),
      Command.keepPending(
        FetchDomains({ label: 'foldkit', searchGeneration: 2 }),
      ),
      measureResultsList,
      resolveResultsListScrolls,
      change(label('Sort results'), 'PriceDescending'),
      resolveResultsListScrolls,
      expect(label('Filter by TLD')).toHaveValue('Com'),
      expect(label('Filter availability')).toHaveValue('Available'),
      expect(label('Sort results')).toHaveValue('PriceDescending'),
      expectAll(all.selector('#domain-results .domain-row')).toHaveCount(1),
      inside(
        selector('#domain-results'),
        expect(text('foldkit.com')).toExist(),
      ),
      expectAll(all.selector('.results .price')).toHaveCount(0),
      expectAll(all.selector('.results .unavailable')).toHaveCount(0),
      expectAll(all.selector('.results button')).toHaveCount(0),
      Command.resolve(
        FetchDomains({ label: 'foldkit', searchGeneration: 2 }),
        Message.SucceededFetchDomains({
          searchGeneration: 2,
          domains: searchDomains('foldkit'),
        }),
      ),
      resolveResultsListScrolls,
      expect(selector('#domain-results')).toBeAbsent(),
      Mount.expectEnded(
        VirtualList.test.ObserveVirtualList({ id: RESULTS_LIST_ID }),
      ),
      expect(text('0 domains · Prices per year in USD')).toExist(),
      Command.resolve(cancelSearch(), Message.CompletedCancelSearch()),
      change(label('Filter availability'), 'All'),
      measureResultsList,
      resolveResultsListScrolls,
      expectAll(all.selector('#domain-results .domain-row')).toHaveCount(1),
      inside(
        selector('#domain-results'),
        expect(text('Unavailable')).toExist(),
      ),
    )
  })

  test('the error state renders no stale prices or purchase actions', () => {
    scene(
      { update, view },
      given(
        modifyFields(readyModel('acme'), {
          search: () => SearchState.Failed({ error: 'Search unavailable' }),
        }),
      ),
      expect(role('alert')).toContainText('Search unavailable'),
      expectAll(all.selector('.results .price')).toHaveCount(0),
      expectAll(all.role('article')).toHaveCount(0),
      expect(selector('#domain-results')).toBeAbsent(),
    )
  })
})

describe('cart presentation', () => {
  test('card and list actions share cart state and totals follow removals', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      inside(
        first(all.role('article')),
        click(role('button', { name: 'Add acme.com to cart' })),
      ),
      inside(
        selector('#domain-results'),
        expect(role('button', { name: 'Remove acme.com from cart' })).toExist(),
      ),
      inside(
        selector('#domain-results'),
        click(role('button', { name: 'Add acme.app to cart' })),
      ),
      click(role('button', { name: 'Cart, 2 domains' })),
      inside(
        role('region', { name: 'Your cart' }),
        expect(selector('.cart-total')).toHaveText('Yearly total$21.99'),
        click(role('button', { name: 'Remove acme.com' })),
        expect(selector('.cart-total')).toHaveText('Yearly total$9.99'),
        click(role('button', { name: 'Close cart panel' })),
      ),
      inside(
        first(all.role('article')),
        expect(role('button', { name: 'Add acme.com to cart' })).toExist(),
      ),
      inside(
        selector('#domain-results'),
        expect(role('button', { name: 'Add acme.com to cart' })).toExist(),
      ),
      expect(role('button', { name: 'Cart, 1 domains' })).toExist(),
    )
  })

  test('unavailable domains have no cart action in cards or rows', () => {
    scene(
      { update, view },
      given(readyModel('foldkit')),
      measureResultsList,
      expect(role('button', { name: 'Add foldkit.com to cart' })).toBeAbsent(),
      expect(role('button', { name: 'Add foldkit.dev to cart' })).toBeAbsent(),
      inside(first(all.role('article')), expect(text('Unavailable')).toExist()),
      inside(
        first(all.selector('#domain-results .domain-row')),
        expect(text('Unavailable')).toExist(),
      ),
    )
  })
})
