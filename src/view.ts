import { Array, Option, Schema, String } from 'effect'
import { type Html } from 'foldkit/html'

import {
  ApplicationComposition,
  type ApplicationViewBuilder,
} from './composition'
import {
  Availability,
  Domain,
  DomainListing,
  DomainName,
  Sorting,
  Tld,
  formatPrice,
  pendingDomains,
  searchHref,
  visibleDomains,
} from './domain'
import { Message } from './message'
import { Model, SearchState } from './model'

const icon = (path: string, h: ApplicationViewBuilder): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.ViewBox('0 0 24 24'),
      h.Fill('none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('1.5'),
      h.Class('icon'),
    ],
    [h.path([h.D(path), h.StrokeLinecap('round'), h.StrokeLinejoin('round')])],
  )
const searchIcon = (h: ApplicationViewBuilder): Html =>
  icon('m21 21-5-5 M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15', h)
const cartIcon = (h: ApplicationViewBuilder): Html =>
  icon('M3 3h2l3 12h10l3-9H6 M9 20h.01 M18 20h.01 M14 2v6 M11 5h6', h)
const closeIcon = (h: ApplicationViewBuilder): Html =>
  icon('m6 6 12 12 M6 18 18 6', h)

const searchView = (
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
      searchIcon(h),
      h.input([
        h.Id('domain-search'),
        h.Type('search'),
        h.Name('q'),
        h.AriaLabel('Search domains'),
        h.Placeholder('Search for a domain'),
        h.Value(model.query),
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
        [h.kbd([], ['Esc']), closeIcon(h)],
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
      searchView(model, h),
      h.div(
        [h.Class('header-actions')],
        [
          h.button(
            [
              h.Class('button cart-button'),
              h.OnClick(Message.ClickedCart()),
              h.AriaLabel(`Cart, ${model.cart.length} domains`),
            ],
            [
              cartIcon(h),
              h.span([], ['Cart']),
              model.cart.length > 0
                ? h.span(
                    [h.Class('cart-count')],
                    [model.cart.length.toString()],
                  )
                : h.empty,
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
          ...['acme', 'your-next-idea', 'foldkit'].map(query =>
            h.a(
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
  const isInCart = model.cart.some(item => item.name === domain.name)
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
          [isInCart ? icon('m5 12 4 4L19 6', h) : cartIcon(h)],
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
  DomainListing.match<Html>(domain, {
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

const isUnavailable = DomainListing.match<boolean>({
  Pending: () => false,
  Ready: domain => !domain.isAvailable,
})

const domainNameView = (
  domain: typeof DomainName.Type,
  h: ApplicationViewBuilder,
): ReadonlyArray<Html | string> => [
  h.span(
    [h.DataAttribute('domain-label', '')],
    [domain.name.slice(0, -(domain.tld.length + 1))],
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
          h.Value(model.tld),
          h.OnChange(value =>
            Message.UpdatedTld({ value: Schema.decodeUnknownSync(Tld)(value) }),
          ),
        ],
        Tld.literals.map(value =>
          h.option(
            [h.Value(value)],
            [value === 'All' ? 'All TLDs' : `.${value.toLowerCase()}`],
          ),
        ),
      ),
      h.select(
        [
          h.AriaLabel('Filter availability'),
          h.Value(model.availability),
          h.OnChange(value =>
            Message.UpdatedAvailability({
              value: Schema.decodeUnknownSync(Availability)(value),
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
          h.Value(model.sorting),
          h.OnChange(value =>
            Message.UpdatedSorting({
              value: Schema.decodeUnknownSync(Sorting)(value),
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
        domains.slice(0, 4).map(domain => domainCardView(domain, model, h)),
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
        onNonEmpty: results =>
          h.ul(
            [h.Class('all-results')],
            results.map(domain => domainRowView(domain, model, h)),
          ),
      }),
    ],
  )

const pendingView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html => {
  const domains = pendingDomains(model.query)
  const results = domains.filter(
    domain => model.tld === 'All' || domain.tld === model.tld.toLowerCase(),
  )

  return h.div(
    [h.Class('loading-results')],
    [
      resultsGridView(domains, results, model, h),
      h.p(
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

const readyView = (
  domains: ReadonlyArray<typeof Domain.Type>,
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html => {
  const results = visibleDomains(
    domains,
    model.tld,
    model.availability,
    model.sorting,
  )

  return h.div(
    [],
    [
      resultsGridView(
        domains.map(domain => DomainListing.Ready(domain)),
        results.map(domain => DomainListing.Ready(domain)),
        model,
        h,
      ),
      h.p(
        [h.Class('result-count'), h.Role('status')],
        [`${results.length} domains · Prices per year in USD`],
      ),
    ],
  )
}

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
      SearchState.match(model.search, {
        Idle: () => pendingView(model, h),
        Loading: () => pendingView(model, h),
        Ready: ({ domains }) => readyView(domains, model, h),
        Failed: ({ error }) =>
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
          ),
      }),
    ],
  )

const cartView = (
  model: typeof Model.Type,
  h: ApplicationViewBuilder,
): Html => {
  if (model.cartVisibility === 'Closed') {
    return h.empty
  } else {
    const total = model.cart.reduce((sum, domain) => sum + domain.price, 0)
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
                  [closeIcon(h)],
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
                  domains.map(domain =>
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
                          [closeIcon(h)],
                        ),
                      ],
                    ),
                  ),
                ),
            }),
            h.div(
              [h.Class('cart-total')],
              [
                h.span([], ['Yearly total']),
                h.strong([], [formatPrice(total)]),
              ],
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
}

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

export const view = ApplicationComposition.makeView((model, h) => ({
  title: String.isEmpty(model.query)
    ? 'Domains | Foldkit'
    : `${model.query} | Domains | Foldkit`,
  body: h.div(
    [
      h.Id('domains-app'),
      h.Class('app'),
      h.DataAttribute(
        'search',
        String.isNonEmpty(model.query) ? 'active' : 'idle',
      ),
    ],
    [
      headerView(model, h),
      h.main([h.Id('main')], [heroView(h), resultsView(model, h)]),
      footerView(h),
      cartView(model, h),
    ],
  ),
}))
