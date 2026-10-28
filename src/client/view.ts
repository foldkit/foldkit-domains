import { Array, Number, Option, Schema, String, pipe } from 'effect'
import { type Html, childAttributes } from 'foldkit/html'

import type { RenderInfo as DialogRenderInfo } from '@foldkit/ui/dialog'

import {
  Domain,
  DomainName,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../shared/domain'
import {
  ApplicationComposition,
  type ApplicationViewBuilder,
  CART_DIALOG_ID,
  CartDialogBinding,
  FILTERS_DIALOG_ID,
  FiltersDialogBinding,
  ResultsListBinding,
} from './composition'
import {
  AvailabilityFilter,
  DomainListing,
  SortOrder,
  TldFilter,
  formatPrice,
  formatRegistrationPrice,
  formatRenewalPrice,
  queryToDomainListings,
  queryToPendingDomainListings,
} from './domain'
import * as Icon from './icon'
import { Message } from './message'
import { Model } from './model'
import {
  RESULTS_LIST_ID,
  RESULTS_OVERSCAN_GROUPS,
  ResultsListScrollKey,
  estimateDomainListingGroupHeightPx,
  groupDomainListings,
} from './resultsList'
import { ApplicationRoute, routeToQuery, searchHref } from './route'
import { SEARCH_INPUT_SELECTOR, searchInputConfig } from './searchInput'
import { SearchPresentation, searchPresentation } from './searchPresentation'
import { visibleResultListings } from './visibleResultListings'

const TOP_RESULT_COUNT = 4
const PREVIEW_RESULT_COUNT = 36

const searchFormView = (model: Model, h: ApplicationViewBuilder): Html => {
  const search = searchPresentation(model)

  return h.form(
    [
      h.Class('search'),
      h.Role('search'),
      h.OnSubmit(Message.SubmittedSearch()),
    ],
    [
      Icon.search(),
      h.input([
        h.Id(searchInputConfig.id),
        h.Type('search'),
        h.Name('q'),
        h.AriaLabel('Search domains'),
        h.AriaInvalid(
          String.isNonEmpty(routeToQuery(model.route)) &&
            Option.isNone(queryToMaybeDomainLabel(routeToQuery(model.route))),
        ),
        ...(search._tag === 'Failed'
          ? [h.AriaDescribedBy('search-error')]
          : []),
        h.Placeholder('Search for a domain'),
        h.Value(routeToQuery(model.route)),
        h.Autocomplete('off'),
        h.Attribute('autocapitalize', 'none'),
        h.Attribute('enterkeyhint', 'search'),
        h.Spellcheck(false),
        h.OnInput(value => Message.UpdatedSearch({ value })),
        h.OnKeyDownPreventDefault(key =>
          key === 'Escape'
            ? Option.some(Message.PressedEscape())
            : Option.none(),
        ),
      ]),
      h.button(
        [
          h.Type('button'),
          h.Class('clear-search'),
          h.AriaLabel('Clear search, Esc'),
          h.AriaKeyshortcuts('Escape'),
          h.OnClick(Message.ClickedClearSearch()),
        ],
        [h.kbd([h.AriaHidden(true)], ['Esc']), Icon.close()],
      ),
    ],
  )
}

const headerView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.header(
    [h.Class('header')],
    [
      h.a(
        [
          h.Href(searchHref('')),
          h.Class('brand'),
          h.AriaLabel('Domains home'),
          h.OnClick(Message.ClickedDomainsHome(), {
            focusSelector: SEARCH_INPUT_SELECTOR,
          }),
        ],
        [
          h.svg(
            [
              h.Width('20'),
              h.Height('20'),
              h.ViewBox('0 0 200 200'),
              h.Fill('currentColor'),
              h.Class('logo'),
              h.AriaHidden(true),
            ],
            [
              h.rect([h.Width('92.3077'), h.Height('200')]),
              h.rect([h.X('107.692'), h.Width('92.3077'), h.Height('38.4615')]),
              h.rect([
                h.X('107.692'),
                h.Y('53.8461'),
                h.Width('92.3077'),
                h.Height('38.4615'),
              ]),
            ],
          ),
          h.span([h.Class('brand-divider')], ['/']),
          h.span([], ['Domains']),
        ],
      ),
      h.div(
        [h.Class('ml-auto flex items-center gap-2 max-[700px]:gap-1.5')],
        [
          h.button(
            [
              h.Id('cart-button'),
              h.Class('button cart-button'),
              h.OnClick(Message.ClickedCart()),
              h.AriaLabel(`Cart, ${Array.length(model.cart)} domains`),
              h.AriaHasPopup('dialog'),
              h.AriaControls(CART_DIALOG_ID),
            ],
            [
              Icon.cart(),
              h.span([], ['Cart']),
              Array.match(model.cart, {
                onEmpty: () => h.empty,
                onNonEmpty: cart =>
                  h.span(
                    [h.Class('cart-count')],
                    [Array.length(cart).toString()],
                  ),
              }),
            ],
          ),
          h.a(
            [h.Href('https://vercel.com/login'), h.Class('button login')],
            ['Login'],
          ),
          h.a(
            [
              h.Href('https://vercel.com/signup'),
              h.Class('button primary signup'),
            ],
            ['Sign Up'],
          ),
        ],
      ),
      h.p(
        [
          h.Id('cart-announcement'),
          h.Class('sr-only'),
          h.AriaLive('polite'),
          h.AriaAtomic(true),
        ],
        [
          Array.match(model.cart, {
            onEmpty: () => 'Your cart is empty.',
            onNonEmpty: cart =>
              `${Array.length(cart)} ${Array.length(cart) === 1 ? 'domain' : 'domains'} in your cart.`,
          }),
        ],
      ),
    ],
  )

const heroView = (h: ApplicationViewBuilder): Html =>
  h.section(
    [h.Class('hero'), h.AriaLabel('Find your domain')],
    [
      h.h1(
        [],
        ['Find a domain for', h.br([]), h.span([], ['your next big idea.'])],
      ),
      h.p(
        [],
        [
          'Fast. At-cost. Private. ',
          h.a(
            [h.Href('https://vercel.com/domains/pricing')],
            ['View pricing.'],
          ),
        ],
      ),
      h.div([h.Class('hero-search-space')]),
      h.div(
        [h.Class('suggestions')],
        [
          h.span([], ['Try a name:']),
          ...Array.map(['acme', 'your-next-idea', 'foldkit'], query =>
            h.keyed('a')(
              query,
              [h.Href(searchHref(query))],
              [query, Icon.arrowUpRight()],
            ),
          ),
        ],
      ),
    ],
  )

const readyDomainActionView = (
  domain: Domain,
  model: Model,
  h: ApplicationViewBuilder,
): Html => {
  const isInCart = Array.some(model.cart, item => item.name === domain.name)
  return Domain.match(domain, {
    Unconfirmed: () =>
      h.div(
        [h.Class('domain-action')],
        [
          h.span(
            [
              h.Class('unavailable'),
              h.Title(
                'The registrar reports this domain unavailable or could not confirm availability.',
              ),
            ],
            ['Not available'],
          ),
        ],
      ),
    Available: domain =>
      h.div(
        [h.Class('domain-action')],
        [
          h.span(
            [
              h.Class('price'),
              h.Title(
                `${domain.isPremium ? 'Premium domain. ' : ''}${formatRenewalPrice(domain)}`,
              ),
            ],
            [formatRegistrationPrice(domain)],
          ),
          h.button(
            [
              h.Class(`icon-button${isInCart ? ' is-added' : ''}`),
              h.AriaLabel(
                isInCart
                  ? `Remove ${domain.name} from cart`
                  : `Add ${domain.name} to cart`,
              ),
              h.AriaDescription(
                `${formatRegistrationPrice(domain)}. ${domain.isPremium ? 'Premium domain. ' : ''}${formatRenewalPrice(domain)}`,
              ),
              h.OnClick(
                isInCart
                  ? Message.ClickedRemoveDomain({ name: domain.name })
                  : Message.ClickedAddDomain({ domain }),
              ),
            ],
            [isInCart ? Icon.check() : Icon.cart()],
          ),
        ],
      ),
  })
}

const domainActionView = (
  listing: DomainListing,
  model: Model,
  h: ApplicationViewBuilder,
): Html =>
  DomainListing.match(listing, {
    Pending: () =>
      h.div(
        [h.Class('domain-action'), h.AriaHidden(true)],
        [
          h.span([h.Class('skeleton skeleton-price')]),
          h.span([h.Class('skeleton skeleton-action')]),
        ],
      ),
    Ready: ({ domain }) => readyDomainActionView(domain, model, h),
  })

const isUnconfirmedListing = DomainListing.match({
  Pending: () => false,
  Ready: ({ domain }) => domain._tag === 'Unconfirmed',
})

const domainNameView = (
  domain: DomainName,
  h: ApplicationViewBuilder,
): ReadonlyArray<Html | string> => [
  h.span(
    [h.DataAttribute('domain-label', '')],
    [pipe(domain.name, String.slice(0, -(String.length(domain.tld) + 1)))],
  ),
  `.${domain.tld}`,
]

const domainCardView = (
  listing: DomainListing,
  model: Model,
  h: ApplicationViewBuilder,
): Html =>
  h.keyed('article')(
    listing.name,
    [
      h.Class(
        `domain-card${isUnconfirmedListing(listing) ? ' is-unavailable' : ''}`,
      ),
    ],
    [h.h3([], domainNameView(listing, h)), domainActionView(listing, model, h)],
  )

const domainRowView = (
  listing: DomainListing,
  model: Model,
  h: ApplicationViewBuilder,
): Html =>
  h.keyed('li')(
    listing.name,
    [
      h.Class(
        `domain-row${isUnconfirmedListing(listing) ? ' is-unavailable' : ''}`,
      ),
    ],
    [
      h.span([h.Class('domain-name')], domainNameView(listing, h)),
      domainActionView(listing, model, h),
    ],
  )

const availabilityFilterView = (
  model: Model,
  h: ApplicationViewBuilder,
): Html =>
  h.select(
    [
      h.Class('filter-select'),
      h.AriaLabel('Filter availability'),
      h.Value(model.availabilityFilter),
      h.OnChange(value =>
        Message.UpdatedAvailabilityFilter({
          value: Schema.decodeUnknownSync(AvailabilityFilter)(value),
        }),
      ),
    ],
    [
      h.option([h.Value('All')], ['Show All']),
      h.option([h.Value('Available')], ['Available']),
    ],
  )

const sortOrderView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.select(
    [
      h.Class('filter-select'),
      h.AriaLabel('Sort results'),
      h.Value(model.sortOrder),
      h.OnChange(value =>
        Message.UpdatedSortOrder({
          value: Schema.decodeUnknownSync(SortOrder)(value),
        }),
      ),
    ],
    [
      h.option([h.Value('Relevance')], ['Relevance']),
      h.option([h.Value('PriceAscending')], ['Price: Low to High']),
      h.option([h.Value('PriceDescending')], ['Price: High to Low']),
    ],
  )

const filtersView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.div(
    [h.Class('filters')],
    [
      h.select(
        [
          h.Class('filter-select'),
          h.AriaLabel('Filter by TLD'),
          h.Value(model.tldFilter),
          h.OnChange(value =>
            Message.UpdatedTldFilter({
              value: Schema.decodeUnknownSync(TldFilter)(value),
            }),
          ),
        ],
        Array.map(TldFilter.literals, value =>
          h.keyed('option')(
            value,
            [h.Value(value)],
            [value === 'All' ? 'All TLDs' : `.${String.toLowerCase(value)}`],
          ),
        ),
      ),
      h.div(
        [h.Class('desktop-filters')],
        [availabilityFilterView(model, h), sortOrderView(model, h)],
      ),
      h.button(
        [
          h.Id('filters-button'),
          h.Class(
            `filters-button${model.availabilityFilter !== 'All' || model.sortOrder !== 'Relevance' ? ' has-active-filters' : ''}`,
          ),
          h.AriaLabel('Filters and sort'),
          h.AriaHasPopup('dialog'),
          h.AriaControls(FILTERS_DIALOG_ID),
          h.OnClick(Message.ClickedFilters()),
        ],
        [Icon.filter()],
      ),
    ],
  )

const filtersDialogView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.block(
    FiltersDialogBinding.embedView({
      slotId: model.filtersDialog.id,
      model: model.filtersDialog,
      viewInputs: {
        hasDescription: false,
        toView: render =>
          h.dialog(
            [...render.dialog, h.Class('dialog-overlay')],
            render.isVisible
              ? [
                  h.div([
                    ...render.backdrop,
                    h.Class('dialog-backdrop'),
                    h.AriaHidden(true),
                  ]),
                  h.section(
                    [...render.panel, h.Class('filters-panel')],
                    [
                      h.div(
                        [h.Class('filters-panel-heading')],
                        [
                          h.h2([...render.title], ['Filters and sort']),
                          h.button(
                            [
                              ...render.closeButton,
                              ...render.initialFocus,
                              h.Class('icon-button'),
                              h.AriaLabel('Close filters and sort'),
                            ],
                            [Icon.close()],
                          ),
                        ],
                      ),
                      h.label(
                        [h.Class('filter-field')],
                        [
                          h.span([], ['Availability']),
                          availabilityFilterView(model, h),
                        ],
                      ),
                      h.label(
                        [h.Class('filter-field')],
                        [h.span([], ['Sort by']), sortOrderView(model, h)],
                      ),
                      h.button(
                        [...render.closeButton, h.Class('button filters-done')],
                        ['Done'],
                      ),
                    ],
                  ),
                ]
              : undefined,
          ),
      },
    }),
  )

const resultsListView = (
  results: ReadonlyArray<DomainListing>,
  model: Model,
  h: ApplicationViewBuilder,
): Html => {
  const search = searchPresentation(model)

  return h.div(
    [h.Class('all-results')],
    [
      search._tag === 'Idle'
        ? h.empty
        : h.block(
            ResultsListBinding.embedView({
              slotId: RESULTS_LIST_ID,
              model: model.resultsList,
              viewInputs: {
                items: groupDomainListings(results),
                itemToKey: row => row.id,
                itemToView: row =>
                  h.ul(
                    [h.Class('domain-row-group')],
                    Array.map(row.listings, listing =>
                      domainRowView(listing, model, h),
                    ),
                  ),
                dynamicRowHeights: true,
                itemToEstimatedRowHeightPx: group =>
                  estimateDomainListingGroupHeightPx(
                    model.resultsList,
                    group.listings.length,
                  ),
                rowLayout: 'Absolute',
                overscan: RESULTS_OVERSCAN_GROUPS,
                containerClassName: `results-viewport${Array.length(results) === 1 ? ' is-single-result' : ''}`,
                containerAttributes: childAttributes([
                  h.AriaLabel('All domain results'),
                  h.AriaDescription(
                    `${results.length} domains. Use arrow keys, Page Up, Page Down, Home, and End to scroll the page.`,
                  ),
                  h.Tabindex(0),
                  h.OnFocus(Message.FocusedResultsList()),
                  h.OnKeyDownSelfPreventDefault(key =>
                    Option.map(
                      Option.liftPredicate(
                        key,
                        Schema.is(ResultsListScrollKey),
                      ),
                      key => Message.PressedResultsListScrollKey({ key }),
                    ),
                  ),
                ]),
              },
            }),
          ),
      h.ul(
        [h.Class('results-preview'), h.AriaHidden(true)],
        Array.map(Array.take(results, PREVIEW_RESULT_COUNT), domain =>
          domainRowView(
            DomainListing.Pending({
              name: domain.name,
              tld: domain.tld,
            }),
            model,
            h,
          ),
        ),
      ),
    ],
  )
}

const resultsGridView = (
  domains: ReadonlyArray<DomainListing>,
  results: ReadonlyArray<DomainListing>,
  model: Model,
  h: ApplicationViewBuilder,
): Html =>
  h.div(
    [],
    [
      h.h2([], ['Top Results']),
      h.div(
        [h.Class('top-results')],
        pipe(
          domains,
          Array.take(TOP_RESULT_COUNT),
          Array.map(domain => domainCardView(domain, model, h)),
        ),
      ),
      h.div(
        [h.Class('results-heading')],
        [h.h2([], ['All Results']), filtersView(model, h)],
      ),
      Array.match(results, {
        onEmpty: () =>
          h.p(
            [h.Class('empty-results'), h.Role('status')],
            [
              'No domains match your filters. Try another extension or show all domains.',
            ],
          ),
        onNonEmpty: results => resultsListView(results, model, h),
      }),
    ],
  )

const resultCountText = (
  model: Model,
  results: ReadonlyArray<DomainListing>,
) => {
  const search = searchPresentation(model)

  if (search._tag === 'Ready' && search.domains.length < domainTlds.length) {
    return `${search.domains.length} of ${domainTlds.length} domains checked · Registration prices in USD`
  } else {
    return `${results.length} domains · Registration prices in USD`
  }
}

const searchResultsView = (model: Model, h: ApplicationViewBuilder): Html => {
  const search = searchPresentation(model)
  const results = visibleResultListings(model)
  const domains = SearchPresentation.match(search, {
    Idle: () => queryToPendingDomainListings(routeToQuery(model.route)),
    Loading: () => queryToPendingDomainListings(routeToQuery(model.route)),
    Ready: ({ domains }) =>
      queryToDomainListings(routeToQuery(model.route), domains),
    Failed: () => [],
  })

  return h.div(
    [],
    [
      h.div(
        [
          h.Class('results-content'),
          h.AriaBusy(
            search._tag === 'Loading' ||
              (search._tag === 'Ready' &&
                search.quoteRequest._tag === 'Loading'),
          ),
        ],
        [resultsGridView(domains, results, model, h)],
      ),
      search._tag === 'Ready' && search.quoteRequest._tag === 'Failed'
        ? h.div(
            [
              h.Class(
                'sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-md border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300',
              ),
              h.Role('alert'),
            ],
            [
              h.p([], [search.quoteRequest.error]),
              h.button(
                [h.Class('button'), h.OnClick(Message.ClickedRetrySearch())],
                ['Try again'],
              ),
            ],
          )
        : h.empty,
      h.p(
        [
          h.Class('result-count'),
          h.Role('status'),
          h.AriaAtomic(true),
          ...(search._tag === 'Ready'
            ? []
            : [h.AriaLabel('Searching domains')]),
        ],
        [
          search._tag === 'Ready'
            ? resultCountText(model, results)
            : 'Checking availability and prices…',
        ],
      ),
    ],
  )
}

const searchErrorView = (error: string, h: ApplicationViewBuilder): Html =>
  h.div(
    [h.Class('search-error'), h.Role('alert')],
    [
      h.h2([], ['Let’s try that again']),
      h.p([h.Id('search-error')], [error]),
      h.button(
        [h.Class('button'), h.OnClick(Message.ClickedRetrySearch())],
        ['Try again'],
      ),
    ],
  )

const resultsView = (model: Model, h: ApplicationViewBuilder): Html => {
  const search = searchPresentation(model)

  return h.section(
    [h.Class('results'), h.AriaLabel('Domain results')],
    [
      search._tag === 'Failed'
        ? searchErrorView(search.error, h)
        : searchResultsView(model, h),
    ],
  )
}

const cartPanelView = (
  model: Model,
  render: DialogRenderInfo,
  h: ApplicationViewBuilder,
): Html => {
  const total = pipe(
    model.cart,
    Array.map(domain => domain.price),
    Number.sumAll,
  )

  return h.section(
    [...render.panel, h.Class('cart-panel'), h.AriaLabel('Your cart')],
    [
      h.div(
        [h.Class('cart-heading')],
        [
          h.h2([...render.title], ['Your cart']),
          h.button(
            [
              ...render.closeButton,
              ...render.initialFocus,
              h.Class('icon-button'),
              h.AriaLabel('Close cart panel'),
            ],
            [Icon.close()],
          ),
        ],
      ),
      Array.match(model.cart, {
        onEmpty: () =>
          h.p(
            [h.Class('empty-cart')],
            [
              'Your next idea starts with a name. Search for a domain to add it here.',
            ],
          ),
        onNonEmpty: domains =>
          h.ul(
            [h.Class('cart-items')],
            Array.map(domains, domain =>
              h.keyed('li')(
                domain.name,
                [],
                [
                  h.div(
                    [],
                    [
                      h.strong([], [domain.name]),
                      h.span([], [formatRegistrationPrice(domain)]),
                      h.span(
                        [h.Class('mt-1 block text-xs text-gray-400')],
                        [formatRenewalPrice(domain)],
                      ),
                    ],
                  ),
                  h.button(
                    [
                      h.Class('icon-button'),
                      h.AriaLabel(`Remove ${domain.name}`),
                      h.OnClick(
                        Message.ClickedRemoveCartDomain({ name: domain.name }),
                      ),
                    ],
                    [Icon.close()],
                  ),
                ],
              ),
            ),
          ),
      }),
      h.div(
        [h.Class('cart-total')],
        [
          h.span([], ['Registration total']),
          h.strong([], [formatPrice(total)]),
        ],
      ),
      h.p(
        [...render.description, h.Class('demo-note')],
        [
          'Demo cart. Live registrar quotes may change; adding a domain does not reserve it. No purchases are made.',
        ],
      ),
    ],
  )
}

const cartView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.block(
    CartDialogBinding.embedView({
      slotId: model.cartDialog.id,
      model: model.cartDialog,
      viewInputs: {
        hasDescription: true,
        toView: render =>
          h.dialog(
            [...render.dialog, h.Class('dialog-overlay')],
            render.isVisible
              ? [
                  h.div([
                    ...render.backdrop,
                    h.Class('dialog-backdrop'),
                    h.AriaHidden(true),
                  ]),
                  cartPanelView(model, render, h),
                ]
              : undefined,
          ),
      },
    }),
  )

const footerView = (h: ApplicationViewBuilder): Html =>
  h.footer(
    [h.Class('footer')],
    [
      h.span([], ['A Foldkit example']),
      h.span([], ['Live data from Vercel · Demo cart']),
      h.a(
        [h.Href('https://github.com/foldkit/foldkit-domains')],
        ['View source', Icon.arrowUpRight()],
      ),
    ],
  )

const searchPageView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.div(
    [
      h.Id('domains-app'),
      h.Class('app'),
      h.DataAttribute(
        'search',
        String.isNonEmpty(routeToQuery(model.route)) ? 'active' : 'idle',
      ),
    ],
    [
      h.a(
        [
          h.Href('#main'),
          h.Class('skip-link'),
          h.OnClick(Message.ClickedSkipToMain(), {
            defaultAction: 'Prevent',
            focusSelector: '#main',
          }),
        ],
        ['Skip to main content'],
      ),
      headerView(model, h),
      searchFormView(model, h),
      h.main(
        [
          h.Id('main'),
          h.Tabindex(-1),
          h.Class('flex-1 scroll-mt-20 focus:outline-none'),
        ],
        [
          h.h1([h.Class('search-page-heading')], ['Domain search']),
          heroView(h),
          resultsView(model, h),
        ],
      ),
      footerView(h),
      cartView(model, h),
      filtersDialogView(model, h),
    ],
  )

const notFoundView = (path: string, h: ApplicationViewBuilder): Html =>
  h.main(
    [
      h.Class(
        'mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-6',
      ),
    ],
    [
      h.h1(
        [h.Class('text-4xl font-semibold tracking-tight')],
        ['404 — Page Not Found'],
      ),
      h.p([h.Class('text-gray-300')], [`The path "${path}" was not found.`]),
      h.a(
        [h.Href(searchHref('')), h.Class('w-fit underline underline-offset-4')],
        ['← Back to Domains'],
      ),
    ],
  )

const routeTitle = ApplicationRoute.match<string>({
  Search: route => {
    const query = routeToQuery(route)

    return String.isEmpty(query)
      ? 'Domains | Foldkit'
      : `${query} | Domains | Foldkit`
  },
  NotFound: () => 'Not Found | Domains | Foldkit',
})

export const view = ApplicationComposition.makeView((model, h) => ({
  title: routeTitle(model.route),
  body: ApplicationRoute.match(model.route, {
    Search: () => searchPageView(model, h),
    NotFound: ({ path }) => notFoundView(path, h),
  }),
}))
