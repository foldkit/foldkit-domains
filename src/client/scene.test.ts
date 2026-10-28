import { Array, Option, Result } from 'effect'
import {
  Command,
  Mount,
  Navigation,
  type SceneSimulation,
  all,
  change,
  click,
  expect,
  expectAll,
  expectHandled,
  filter,
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
  type,
  within,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { Dialog, DialogBlock, VirtualList } from '@foldkit/ui'

import { Domain, domainNames, domainTlds } from '../shared/domain'
import { makeDomainFixtures } from '../shared/domain.fixture'
import {
  DetermineSearchTime,
  DismissSearchKeyboard,
  FocusCartButton,
  FocusCartCloseButton,
  FocusSearchInput,
  ReplaceSearchUrl,
  ScrollPage,
} from './command'
import { CART_DIALOG_ID } from './composition'
import { Message } from './message'
import { emptyModel, readyModel, withQuotedWindow } from './model.fixture'
import { QuoteFailure, QuoteWindows } from './quoteWindows'
import { PageScrollKey, RESULTS_LIST_ID, ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'
import { update } from './update'
import { view } from './view'

const domainResults = role('region', { name: 'Domain results' })
const allDomainResults = role('list', { name: 'All domain results' })
const domainResultItems = filter(all.role('listitem'), { hasNot: role('list') })
const firstDomainResult = within(allDomainResults, first(domainResultItems))

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

const resolveSearchTime =
  (nowMillis = 0) =>
  <Model, Message_, OutMessage>(
    simulation: SceneSimulation<Model, Message_, OutMessage>,
  ): SceneSimulation<Model, Message_, OutMessage> =>
    Array.reduce(simulation.commands, simulation, (current, command) =>
      Option.match(Command.argsOf(DetermineSearchTime)(command), {
        onNone: () => current,
        onSome: args =>
          Command.resolve(
            DetermineSearchTime(args),
            Message.CompletedDetermineSearchTime({ ...args, nowMillis }),
          )(current),
      }),
    )

const resolveQuotes =
  (
    domainLabel: string,
    result: Result.Result<ReadonlyArray<Domain>, QuoteFailure>,
    offset = 0,
    limit = 60,
  ) =>
  <Model, Message_, OutMessage>(
    simulation: SceneSimulation<Model, Message_, OutMessage>,
  ) => {
    const args = Option.getOrThrow(
      Array.findFirst(
        Array.getSomes(
          Array.map(simulation.commands, Command.argsOf(QuoteWindows.Fetch)),
        ),
        fetch =>
          fetch.args.label === domainLabel &&
          fetch.args.offset === offset &&
          fetch.args.limit === limit,
      ),
    )

    return Command.resolve(
      QuoteWindows.Fetch(args),
      QuoteWindows.Message.CompletedFetch({
        ...args,
        result,
        completedAtMillis: 0,
      }),
    )(simulation)
  }

const measureResultsList = Mount.resolve(
  VirtualList.test.ObserveVirtualList({
    id: RESULTS_LIST_ID,
    scrollContainer: VirtualList.ScrollContainer.Window(),
  }),
  ResultsListBlock.Message.ResizedContainer({
    containerWidth: 1000,
    containerHeight: 400,
  }),
)

describe('domain search', () => {
  test('landing HTML renders skeletons without mounting virtual results', () => {
    scene(
      { update, view },
      given(emptyModel),
      expect(selector('.results-preview')).toExist(),
      expect(allDomainResults).toBeAbsent(),
      Mount.expectNone(),
    )
  })

  test('typing renders quotes only after URL delivery and fetch completion', () => {
    scene(
      { update, view, routing: { onUrlChange: Message.ChangedUrl } },
      given(emptyModel),
      type(label('Search domains'), 'acme'),
      Command.resolveAllExact([
        ReplaceSearchUrl({ q: Option.some('acme') }),
        Message.CompletedReplaceSearchUrl(),
      ]),
      Command.expectNone(),
      Navigation.changedUrl('/?q=acme'),
      Command.expectHas(
        DetermineSearchTime({
          searchGeneration: 2,
          offset: 0,
          limit: 60,
          isForced: false,
        }),
      ),
      resolveSearchTime(),
      measureResultsList,
      inside(domainResults, expect(text(/\$/)).toBeAbsent()),
      resolveQuotes(
        'acme',
        Result.succeed(Array.take(makeDomainFixtures('acme'), 60)),
      ),
      resolveResultsListScrolls,
      expect(label('Search domains')).toHaveValue('acme'),
      inside(allDomainResults, expect(text('acme.com')).toExist()),
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
      expect(
        text('60 of 556 domains checked · Registration prices in USD'),
      ).toExist(),
      Command.expectNone(),
    )
  })

  test('measuring results renders a bounded window of the catalog', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      inside(
        allDomainResults,
        expect(text('acme.com')).toExist(),
        expect(text('acme.zone')).toBeAbsent(),
      ),
      expect(allDomainResults).toHaveAttr('tabIndex', '0'),
      expect(text('556 domains · Registration prices in USD')).toExist(),
    )
  })

  test('refresh hides quotes and cart actions until the new result arrives', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      submit(role('search')),
      Command.resolve(
        DismissSearchKeyboard,
        Message.CompletedDismissSearchKeyboard(),
      ),
      resolveSearchTime(),
      resolveResultsListScrolls,
      inside(
        domainResults,
        expect(text(/\$/)).toBeAbsent(),
        expect(text('Not available')).toBeAbsent(),
        expect(role('button', { name: 'Add acme.com to cart' })).toBeAbsent(),
      ),
      resolveQuotes(
        'acme',
        Result.succeed(Array.take(makeDomainFixtures('acme'), 60)),
      ),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
      Command.expectNone(),
    )
  })

  test('filters and sorting control the same quoted results', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      change(label('Filter by TLD'), 'App'),
      resolveResultsListScrolls,
      inside(
        allDomainResults,
        expectAll(domainResultItems).toHaveCount(1),
        expect(text('acme.app')).toExist(),
      ),
      change(label('Filter by TLD'), 'All'),
      resolveResultsListScrolls,
      change(label('Sort results'), 'PriceDescending'),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('acme.ai')).toExist()),
      change(label('Sort results'), 'PriceAscending'),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('acme.space')).toExist()),
    )
  })

  test('failed searches expose a retriable alert without stale quotes', () => {
    scene(
      { update, view, routing: { onUrlChange: Message.ChangedUrl } },
      given(emptyModel),
      Navigation.changedUrl('/?q=acme'),
      resolveSearchTime(),
      measureResultsList,
      resolveQuotes(
        'acme',
        Result.fail(
          QuoteFailure.make({
            error: 'Search unavailable',
            maybeSearchCooldown: Option.none(),
          }),
        ),
      ),
      Mount.expectEnded(VirtualList.test.ObserveVirtualList),
      resolveResultsListScrolls,
      expect(role('alert')).toContainText('Search unavailable'),
      inside(domainResults, expect(text(/\$/)).toBeAbsent()),
      click(role('button', { name: 'Try again' })),
      Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
      resolveSearchTime(),
      measureResultsList,
      resolveQuotes(
        'acme',
        Result.succeed(Array.take(makeDomainFixtures('acme'), 60)),
      ),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
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
        allDomainResults,
        expect(role('button', { name: 'Remove acme.com from cart' })).toExist(),
        click(role('button', { name: 'Add acme.app to cart' })),
      ),
      click(role('button', { name: 'Cart, 2 domains' })),
      Command.resolve(
        Dialog.test.ShowDialog,
        DialogBlock.Message.SucceededShowDialog(),
      ),
      Mount.resolve(
        Dialog.test.AcquireResources({
          id: CART_DIALOG_ID,
          focusSelector: Dialog.initialFocusMarkerSelector,
        }),
        DialogBlock.Message.SucceededAcquireResources(),
      ),
      inside(
        role('region', { name: 'Your cart' }),
        expect(text('Registration total$21.99')).toExist(),
        click(role('button', { name: 'Remove acme.com' })),
        Command.resolve(
          FocusCartCloseButton,
          Message.CompletedFocusCartCloseButton(),
        ),
        expect(text('Registration total$9.99')).toExist(),
        click(role('button', { name: 'Close cart panel' })),
      ),
      Command.resolve(
        Dialog.test.CloseDialog,
        DialogBlock.Message.CompletedCloseDialog(),
      ),
      Command.resolve(FocusCartButton, Message.CompletedFocusCartButton()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role('button', { name: 'Cart, 1 domains' })).toExist(),
    )
  })

  test('unconfirmed domains expose no purchase action', () => {
    scene(
      { update, view },
      given(readyModel('foldkit')),
      measureResultsList,
      expect(role('button', { name: 'Add foldkit.com to cart' })).toBeAbsent(),
      expect(role('button', { name: 'Add foldkit.dev to cart' })).toBeAbsent(),
      inside(firstDomainResult, expect(text('Not available')).toExist()),
    )
  })
})

test('multi-year quotes display and sort by the full registration price', () => {
  const quotedModel = withQuotedWindow(
    readyModel('acme'),
    { label: 'acme', offset: 0, limit: domainTlds.length },
    Array.map(domainNames('acme'), candidate =>
      Option.getOrElse(
        Array.findFirst(
          [
            Domain.Unconfirmed({ name: 'acme.com', tld: 'com' }),
            Domain.Available({
              name: 'acme.ai',
              tld: 'ai',
              price: 160,
              renewalPrice: 170,
              years: 2,
              isPremium: true,
            }),
            Domain.Available({
              name: 'acme.dev',
              tld: 'dev',
              price: 13,
              renewalPrice: 14,
              years: 1,
              isPremium: false,
            }),
          ],
          quote => quote.name === candidate.name,
        ),
        () => Domain.Unconfirmed(candidate),
      ),
    ),
  )

  scene(
    { update, view },
    given(quotedModel),
    measureResultsList,
    expect(text('$160.00 / 2 years')).toExist(),
    change(label('Sort results'), 'PriceAscending'),
    resolveResultsListScrolls,
    inside(firstDomainResult, expect(text('acme.dev')).toExist()),
    change(label('Sort results'), 'PriceDescending'),
    resolveResultsListScrolls,
    inside(
      firstDomainResult,
      expect(text('acme.ai')).toExist(),
      expect(text('$160.00 / 2 years')).toExist(),
    ),
  )
})

describe('accessibility', () => {
  test('loading status is atomic and outside the busy results content', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      submit(role('search')),
      Command.resolve(
        DismissSearchKeyboard,
        Message.CompletedDismissSearchKeyboard(),
      ),
      resolveSearchTime(),
      resolveResultsListScrolls,
      expect(role('status', { name: 'Searching domains' })).toHaveText(
        'Checking availability and prices…',
      ),
      expect(role('status')).toHaveAttr('aria-atomic', 'true'),
      expect(selector('[aria-busy]')).toHaveAttr('aria-busy', 'true'),
      inside(selector('[aria-busy]'), expect(role('status')).toBeAbsent()),
      resolveQuotes(
        'acme',
        Result.succeed(Array.take(makeDomainFixtures('acme'), 60)),
      ),
      resolveResultsListScrolls,
      expect(selector('[aria-busy]')).toHaveAttr('aria-busy', 'false'),
    )
  })

  test('invalid input identifies the field and associates its error', () => {
    scene(
      { update, view },
      given(
        modifyFields(emptyModel, {
          route: () => ApplicationRoute.Search({ q: Option.some('bad!') }),
        }),
      ),
      expect(label('Search domains')).toHaveAttr('aria-invalid', 'true'),
      expect(label('Search domains')).toHaveAttr(
        'aria-describedby',
        'search-error',
      ),
      expect(selector('#search-error')).toHaveText(
        'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
      ),
    )
  })
})

test('End scrolls through the bound virtual list operation', () => {
  scene(
    { update, view },
    given(readyModel('acme')),
    measureResultsList,
    keydown(allDomainResults, 'End'),
    expectHandled(),
    Command.expectExact(VirtualList.test.ApplyScroll),
    resolveResultsListScrolls,
  )
})

test.each(PageScrollKey.literals)(
  '%s in the focused list requests an instant page scroll',
  key => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      keydown(allDomainResults, key),
      expectHandled(),
      Command.expectExact(ScrollPage({ key })),
      Command.resolve(ScrollPage({ key }), Message.CompletedScrollPage()),
    )
  },
)
