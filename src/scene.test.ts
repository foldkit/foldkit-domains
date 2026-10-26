import { Array, Option } from 'effect'
import {
  Command,
  Mount,
  type SceneSimulation,
  all,
  change,
  click,
  expect,
  first,
  given,
  inside,
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

import { FetchDomains, cancelSearch } from './command'
import { searchDomains } from './domain'
import { Message } from './message'
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
