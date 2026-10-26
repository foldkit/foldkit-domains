import {
  Command,
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
  submit,
  text,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { FetchDomains, cancelSearch } from './command'
import { searchDomains } from './domain'
import { Message } from './message'
import { emptyModel, readyModel } from './model.fixture'
import { ApplicationRoute } from './route'
import { update } from './update'
import { view } from './view'

describe('domain search', () => {
  test('hides prices and cart actions while refreshed domain prices are pending', () => {
    scene(
      { update, view },
      given(readyModel('fresh')),
      submit(role('search')),
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
      change(label('Filter availability'), 'Available'),
      change(label('Sort results'), 'PriceAscending'),
      inside(
        role('list'),
        expect(text('foldkit.com')).toBeAbsent(),
        inside(
          first(all.role('listitem')),
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
      click(role('button', { name: 'Add acme.com to cart' })),
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
