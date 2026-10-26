import { Array, Match, Number, Option, Schema, String, pipe } from 'effect'
import { type Html, childAttributes } from 'foldkit/html'

import {
  ApplicationComposition,
  type ApplicationViewBuilder,
  ResultsListBinding,
} from './composition'
import {
  AvailabilityFilter,
  Domain,
  DomainListing,
  DomainName,
  SortOrder,
  TldFilter,
  formatPrice,
  pendingDomains,
} from './domain'
import * as Icon from './icon'
import { Message } from './message'
import { Model, SearchState } from './model'
import { visibleResultListings } from './results'
import { RESULTS_LIST_ID, groupResults } from './resultsList'
import { ApplicationRoute, routeToQuery, searchHref } from './route'

const TOP_RESULT_COUNT = 4
const PREVIEW_RESULT_COUNT = 36
const RESULTS_OVERSCAN = 2

const searchFormView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.form(
    [
      h.Class('search'),
      h.Role('search'),
      h.OnSubmit(Message.SubmittedSearch()),
    ],
    [
      Icon.search(),
      h.input([
        h.Id('domain-search'),
        h.Type('search'),
        h.Name('q'),
        h.AriaLabel('Search domains'),
        h.Placeholder('Search for a domain'),
        h.Value(routeToQuery(model.route)),
        h.Autocomplete('off'),
        h.Attribute('autocapitalize', 'none'),
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
          h.AriaLabel('Clear search'),
          h.OnClick(Message.ClickedClearSearch()),
        ],
        [h.kbd([], ['Esc']), Icon.close()],
      ),
    ],
  )

const headerView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.header(
    [h.Class('header')],
    [
      h.a(
        [h.Href(searchHref('')), h.Class('brand'), h.AriaLabel('Domains home')],
        [
          h.svg(
            [
              h.ViewBox('0 0 24 24'),
              h.Fill('currentColor'),
              h.Class('logo'),
              h.AriaHidden(true),
            ],
            [h.path([h.D('M12 3 24 24H0Z')])],
          ),
          h.span([h.Class('brand-divider')], ['/']),
          h.span([], ['Domains']),
        ],
      ),
      searchFormView(model, h),
      h.div(
        [h.Class('ml-auto flex items-center gap-2 max-[700px]:gap-1.5')],
        [
          h.button(
            [
              h.Class('button cart-button'),
              h.OnClick(Message.ClickedCart()),
              h.AriaLabel(`Cart, ${Array.length(model.cart)} domains`),
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
              [query, h.span([h.AriaHidden(true)], [' ↗'])],
            ),
          ),
        ],
      ),
    ],
  )

const readyDomainActionView = (
  domain: typeof Domain.Type,
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html => {
  const isInCart = Array.some(model.cart, item => item.name === domain.name)
  if (!domain.isAvailable) {
    return h.span([h.Class('unavailable')], ['Unavailable'])
  } else {
    return h.div(
      [h.Class('domain-action')],
      [
        h.span([h.Class('price')], [formatPrice(domain.price)]),
        h.button(
          [
            h.Class(`icon-button${isInCart ? ' is-added' : ''}`),
            h.AriaLabel(
              isInCart
                ? `Remove ${domain.name} from cart`
                : `Add ${domain.name} to cart`,
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
    )
  }
}

const domainActionView = (
  domain: typeof DomainListing.Type,
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  DomainListing.match(domain, {
    Pending: () =>
      h.div(
        [h.Class('domain-action'), h.AriaHidden(true)],
        [
          h.span([h.Class('skeleton skeleton-price')]),
          h.span([h.Class('skeleton skeleton-action')]),
        ],
      ),
    Ready: domain => readyDomainActionView(domain, model, h),
  })

const isUnavailable = DomainListing.match({
  Pending: () => false,
  Ready: domain => !domain.isAvailable,
})

const domainNameView = (
  domain: typeof DomainName.Type,
  h: ApplicationViewBuilder,
): ReadonlyArray<Html | string> => [
  h.span(
    [h.DataAttribute('domain-label', '')],
    [pipe(domain.name, String.slice(0, -(String.length(domain.tld) + 1)))],
  ),
  `.${domain.tld}`,
]

const domainCardView = (
  domain: typeof DomainListing.Type,
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.keyed('article')(
    domain.name,
    [h.Class(`domain-card${isUnavailable(domain) ? ' is-unavailable' : ''}`)],
    [h.h3([], domainNameView(domain, h)), domainActionView(domain, model, h)],
  )

const domainRowView = (
  domain: typeof DomainListing.Type,
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.keyed('li')(
    domain.name,
    [h.Class(`domain-row${isUnavailable(domain) ? ' is-unavailable' : ''}`)],
    [
      h.span([h.Class('domain-name')], domainNameView(domain, h)),
      domainActionView(domain, model, h),
    ],
  )

const filtersView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.div(
    [h.Class('filters')],
    [
      h.select(
        [
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
      h.select(
        [
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
      ),
      h.select(
        [
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
      ),
    ],
  )

const resultsListView = (
  results: ReadonlyArray<typeof DomainListing.Type>,
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.div(
    [h.Class('all-results')],
    [
      h.block(
        ResultsListBinding.embedView({
          slotId: RESULTS_LIST_ID,
          model: model.resultsList,
          viewInputs: {
            items: groupResults(results),
            itemToKey: row => row.id,
            itemToView: row =>
              h.ul(
                [h.Class('domain-row-group')],
                Array.map(row.domains, domain =>
                  domainRowView(domain, model, h),
                ),
              ),
            dynamicRowHeights: true,
            overscan: RESULTS_OVERSCAN,
            containerClassName: `results-viewport${Array.length(results) === 1 ? ' is-single-result' : ''}`,
            containerAttributes: childAttributes([
              h.AriaLabel('All domain results'),
              h.Tabindex(0),
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

const resultsGridView = (
  domains: ReadonlyArray<typeof DomainListing.Type>,
  results: ReadonlyArray<typeof DomainListing.Type>,
  model: typeof Model.Type,
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

const searchResultsView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html => {
  const results = visibleResultListings(model)
  const domains = SearchState.match(model.search, {
    Idle: () => pendingDomains(routeToQuery(model.route)),
    Loading: () => pendingDomains(routeToQuery(model.route)),
    Ready: ({ domains }) => Array.map(domains, DomainListing.Ready),
    Failed: () => [],
  })

  return h.div(
    [],
    [
      resultsGridView(domains, results, model, h),
      model.search._tag === 'Ready'
        ? h.p(
            [h.Class('result-count'), h.Role('status')],
            [`${Array.length(results)} domains · Prices per year in USD`],
          )
        : h.p(
            [
              h.Class('result-count'),
              h.Role('status'),
              h.AriaLabel('Searching domains'),
            ],
            ['Checking availability and prices…'],
          ),
    ],
  )
}

const searchErrorView = (error: string, h: ApplicationViewBuilder): Html =>
  h.div(
    [h.Class('search-error'), h.Role('alert')],
    [
      h.h2([], ['Let’s try that again']),
      h.p([], [error]),
      h.button(
        [h.Class('button'), h.OnClick(Message.ClickedRetrySearch())],
        ['Try again'],
      ),
    ],
  )

const resultsView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
  h.section(
    [
      h.Class('results'),
      h.AriaLabel('Domain results'),
      h.AriaBusy(model.search._tag === 'Loading'),
    ],
    [
      model.search._tag === 'Failed'
        ? searchErrorView(model.search.error, h)
        : searchResultsView(model, h),
    ],
  )

const openCartView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html => {
  const total = pipe(
    model.cart,
    Array.map(domain => domain.price),
    Number.sumAll,
  )

  return h.div(
    [h.Class('cart-overlay')],
    [
      h.button([
        h.Class('cart-backdrop'),
        h.AriaLabel('Close cart'),
        h.OnClick(Message.ClickedCloseCart()),
      ]),
      h.section(
        [h.Class('cart-panel'), h.AriaLabel('Your cart')],
        [
          h.div(
            [h.Class('cart-heading')],
            [
              h.h2([], ['Your cart']),
              h.button(
                [
                  h.Class('icon-button'),
                  h.AriaLabel('Close cart panel'),
                  h.OnClick(Message.ClickedCloseCart()),
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
                          h.span([], [`${formatPrice(domain.price)} / year`]),
                        ],
                      ),
                      h.button(
                        [
                          h.Class('icon-button'),
                          h.AriaLabel(`Remove ${domain.name}`),
                          h.OnClick(
                            Message.ClickedRemoveDomain({
                              name: domain.name,
                            }),
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
            [h.span([], ['Yearly total']), h.strong([], [formatPrice(total)])],
          ),
          h.p(
            [h.Class('demo-note')],
            [
              'Demo cart. Domain availability and prices are illustrative. No purchases are made.',
            ],
          ),
        ],
      ),
    ],
  )
}

const cartView = (model: typeof Model.Type, h: ApplicationViewBuilder): Html =>
  pipe(
    Match.value(model.cartVisibility),
    Match.when('Closed', () => h.empty),
    Match.when('Open', () => openCartView(model, h)),
    Match.exhaustive,
  )

const footerView = (h: ApplicationViewBuilder): Html =>
  h.footer(
    [h.Class('footer')],
    [
      h.span([], ['A Foldkit example']),
      h.span([], ['Demo availability & pricing']),
      h.a(
        [h.Href('https://github.com/foldkit/foldkit-domains')],
        ['View source ↗'],
      ),
    ],
  )

const searchPageView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html =>
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
      headerView(model, h),
      h.main(
        [h.Id('main'), h.Class('flex-1')],
        [heroView(h), resultsView(model, h)],
      ),
      footerView(h),
      cartView(model, h),
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
  body: ApplicationRoute.match<Html>(model.route, {
    Search: () => searchPageView(model, h),
    NotFound: ({ path }) => notFoundView(path, h),
  }),
}))
