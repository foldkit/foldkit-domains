import { Array, Number, Option, Schema, String, pipe } from 'effect'
import { type Html, childAttributes } from 'foldkit/html'

import * as Checkbox from '@foldkit/ui/checkbox'
import type { RenderInfo as DialogRenderInfo } from '@foldkit/ui/dialog'
import type * as Listbox from '@foldkit/ui/listbox'

import {
  Domain,
  DomainName,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../shared/domain'
import {
  ApplicationComposition,
  type ApplicationViewBuilder,
  AvailabilityListboxBinding,
  CART_DIALOG_ID,
  CartDialogBinding,
  DataSourceBinding,
  FILTERS_DIALOG_ID,
  FiltersDialogBinding,
  LiveWarningDialogBinding,
  ResultsListBinding,
  SortListboxBinding,
  TLD_DIALOG_ID,
  TldDialogBinding,
  TldListboxBinding,
} from './composition'
import { DATA_SOURCE_CONTROL_ID } from './dataSourceControl'
import {
  AvailabilityFilter,
  DomainListing,
  SortOrder,
  TOP_RESULT_COUNT,
  TldFilter,
  formatPrice,
  formatRegistrationPrice,
  formatRenewalPrice,
  queryToDomainListings,
  queryToPendingDomainListings,
} from './domain'
import * as Icon from './icon'
import { Message } from './message'
import { Model, activeCart } from './model'
import { resultListings } from './resultListings'
import {
  RESULTS_LIST_ID,
  RESULTS_OVERSCAN_GROUPS,
  ResultsListScrollKey,
  estimateDomainListingGroupHeightPx,
  groupDomainListings,
} from './resultsList'
import {
  ApplicationRoute,
  routeToCanonicalUrl,
  routeToQuery,
  searchHref,
} from './route'
import { SEARCH_INPUT_SELECTOR, searchInputConfig } from './searchInput'
import { SearchPresentation, searchPresentation } from './searchPresentation'

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

const dataSourceView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.block(
    DataSourceBinding.embedView({
      slotId: DATA_SOURCE_CONTROL_ID,
      model: model.dataSourceControl,
      viewInputs: {
        items: ['Demo', 'Live'],
        maybeSelectedValue: Option.some(model.dataSource),
        ariaLabel: `Data source: ${model.dataSource}`,
        anchor: { placement: 'bottom-end', gap: 8, padding: 16, portal: true },
        className: 'data-source',
        buttonClassName: 'button data-source-trigger',
        buttonAttributes: childAttributes([
          h.AriaDescribedBy('data-source-description'),
        ]),
        itemsClassName: 'data-source-options',
        backdropClassName: 'filter-backdrop',
        buttonContent: h.span(
          [h.Class('data-source-trigger-content')],
          [
            h.span(
              [h.Class('data-source-trigger-copy')],
              [
                h.span([h.Class('data-source-caption')], ['Data source ']),
                h.span([h.Class('data-source-current')], [model.dataSource]),
              ],
            ),
            Icon.chevronDown(),
          ],
        ),
        itemToConfig: value => ({
          className: 'data-source-option',
          content: h.span(
            [h.Class('data-source-option-content')],
            [
              h.span(
                [h.Class('data-source-option-copy')],
                [
                  h.span([h.Class('data-source-option-label')], [value]),
                  h.span(
                    [h.Class('data-source-option-description')],
                    [
                      value === 'Demo'
                        ? 'Sample prices and availability.'
                        : 'Real quotes from Vercel.',
                    ],
                  ),
                ],
              ),
              h.span([h.Class('data-source-option-check')], [Icon.check()]),
            ],
          ),
        }),
      },
    }),
  )

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
          dataSourceView(model, h),
          h.button(
            [
              h.Id('cart-button'),
              h.Class('button cart-button'),
              h.OnClick(Message.ClickedCart()),
              h.AriaLabel(`Cart, ${Array.length(activeCart(model))} domains`),
              h.AriaHasPopup('dialog'),
              h.AriaControls(CART_DIALOG_ID),
            ],
            [
              Icon.cart(),
              h.span([], ['Cart']),
              Array.match(activeCart(model), {
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
          Array.match(activeCart(model), {
            onEmpty: () => 'Your cart is empty.',
            onNonEmpty: cart =>
              `${Array.length(cart)} ${Array.length(cart) === 1 ? 'domain' : 'domains'} in your cart.`,
          }),
        ],
      ),
    ],
  )

const heroView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.section(
    [h.Class('hero'), h.AriaLabel('Find your domain')],
    [
      h.h1(
        [],
        ['Find a domain for', h.br([]), h.span([], ['the next viral idea.'])],
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
      searchFormView(model, h),
      h.div([h.Class('hero-search-space')]),
    ],
  )

const beginSearchView = (h: ApplicationViewBuilder): Html =>
  h.section(
    [h.Class('begin-search'), h.AriaLabel('Begin your search')],
    [
      h.div(
        [h.Class('begin-search-copy')],
        [
          h.div([h.Class('begin-search-icon')], [Icon.search()]),
          h.h2([], ['Begin your search']),
          h.p(
            [],
            [
              'Enter a domain name to find available domains for your next project.',
            ],
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
  const isInCart = Array.some(
    activeCart(model),
    item => item.name === domain.name,
  )
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

const availabilityFilterLabels: Readonly<
  globalThis.Record<AvailabilityFilter, string>
> = {
  All: 'Show All',
  Available: 'Available',
}

const sortOrderLabels: Readonly<globalThis.Record<SortOrder, string>> = {
  Relevance: 'Relevance',
  Length: 'Length',
  Alphabetical: 'Alphabetical',
  PriceAscending: 'Price: Low to High',
  PriceDescending: 'Price: High to Low',
}

const tldFilterLabel = (value: TldFilter) =>
  value === 'All' ? 'All TLDs' : `.${String.toLowerCase(value)}`

const FILTER_LISTBOX_ANCHOR: Listbox.AnchorConfig = {
  placement: 'bottom-end',
  portal: false,
  gap: 6,
  padding: 8,
}

const filterListboxInputs = <Value extends string>(
  selectedValue: Value,
  items: ReadonlyArray<Value>,
  itemToLabel: (value: Value) => string,
  ariaLabel: string,
  h: ApplicationViewBuilder,
  itemToSearchText: (value: Value) => string = itemToLabel,
): Listbox.ViewInputs<Value, Value> => ({
  items,
  itemToValue: value => value,
  itemToSearchText,
  maybeSelectedValue: Option.some(selectedValue),
  ariaLabel: `${ariaLabel}: ${itemToLabel(selectedValue)}`,
  anchor: FILTER_LISTBOX_ANCHOR,
  className: 'filter-listbox',
  buttonClassName: 'filter-trigger',
  itemsClassName: 'filter-options',
  itemsAttributes: childAttributes([h.Tabindex(0)]),
  backdropClassName: 'filter-backdrop',
  buttonContent: h.span(
    [h.Class('filter-trigger-content')],
    [
      h.span([h.Class('filter-trigger-label')], [itemToLabel(selectedValue)]),
      Icon.chevronDown(),
    ],
  ),
  itemToConfig: value => ({
    className: 'filter-option',
    content: h.span(
      [h.Class('filter-option-content')],
      [
        h.span([h.Class('filter-option-check')], [Icon.check()]),
        h.span([], [itemToLabel(value)]),
      ],
    ),
  }),
})

const availabilityFilterView = (
  model: Model,
  h: ApplicationViewBuilder,
): Html =>
  h.block(
    AvailabilityListboxBinding.embedView({
      slotId: model.availabilityListbox.id,
      model: model.availabilityListbox,
      viewInputs: filterListboxInputs(
        model.availabilityFilter,
        AvailabilityFilter.literals,
        value => availabilityFilterLabels[value],
        'Filter availability',
        h,
      ),
    }),
  )

const sortOrderView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.block(
    SortListboxBinding.embedView({
      slotId: model.sortListbox.id,
      model: model.sortListbox,
      viewInputs: filterListboxInputs(
        model.sortOrder,
        SortOrder.literals,
        value => sortOrderLabels[value],
        'Sort results',
        h,
      ),
    }),
  )

const filtersView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.div(
    [h.Class('filters')],
    [
      h.div(
        [h.Class('desktop-tld-filter')],
        [
          h.block(
            TldListboxBinding.embedView({
              slotId: model.tldListbox.id,
              model: model.tldListbox,
              viewInputs: filterListboxInputs(
                model.tldFilter,
                TldFilter.literals,
                tldFilterLabel,
                'Filter by TLD',
                h,
                value =>
                  value === 'All'
                    ? tldFilterLabel(value)
                    : String.toLowerCase(value),
              ),
            }),
          ),
        ],
      ),
      h.button(
        [
          h.Id('mobile-tld-filter'),
          h.Type('button'),
          h.Class('filter-trigger mobile-tld-filter'),
          h.AriaLabel(`Filter by TLD: ${tldFilterLabel(model.tldFilter)}`),
          h.AriaHasPopup('dialog'),
          h.AriaControls(TLD_DIALOG_ID),
          h.OnClick(Message.ClickedTldFilter()),
        ],
        [
          h.span(
            [h.Class('filter-trigger-content')],
            [
              h.span(
                [h.Class('filter-trigger-label')],
                [tldFilterLabel(model.tldFilter)],
              ),
              Icon.chevronDown(),
            ],
          ),
        ],
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

const visibleTldFilters = (query: string): ReadonlyArray<TldFilter> => {
  const search = pipe(
    query,
    String.trim,
    String.toLowerCase,
    String.replace(/^\./, ''),
  )
  const extensions = pipe(
    TldFilter.literals,
    Array.filter(value => value !== 'All'),
    Array.sort(String.Order),
  )

  const filters: ReadonlyArray<TldFilter> = ['All', ...extensions]

  return Array.filter(filters, value =>
    pipe(tldFilterLabel(value), String.toLowerCase, String.includes(search)),
  )
}

const tldDialogView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.block(
    TldDialogBinding.embedView({
      slotId: model.tldDialog.id,
      model: model.tldDialog,
      viewInputs: {
        hasDescription: false,
        toView: render =>
          h.dialog(
            [...render.dialog, h.Class('dialog-overlay')],
            render.isVisible
              ? [
                  h.div([
                    ...render.backdrop,
                    h.Class('dialog-backdrop filters-backdrop'),
                    h.AriaHidden(true),
                  ]),
                  h.section(
                    [...render.panel, h.Class('filters-panel tld-panel')],
                    [
                      h.h2(
                        [...render.title, h.Class('sr-only')],
                        ['Filter by TLD'],
                      ),
                      h.div(
                        [h.Class('tld-search')],
                        [
                          Icon.search(),
                          h.input([
                            ...render.initialFocus,
                            h.Type('search'),
                            h.AriaLabel('Search TLDs'),
                            h.Placeholder('Search TLDs...'),
                            h.Autocomplete('off'),
                            h.Value(model.tldSearchQuery),
                            h.OnInput(value =>
                              Message.UpdatedTldSearch({ value }),
                            ),
                          ]),
                        ],
                      ),
                      h.div(
                        [h.Class('tld-options')],
                        Array.match(visibleTldFilters(model.tldSearchQuery), {
                          onEmpty: () => [
                            h.p(
                              [h.Role('status'), h.Class('tld-no-results')],
                              ['No TLDs found.'],
                            ),
                          ],
                          onNonEmpty: values =>
                            Array.map(values, value =>
                              h.keyed('button')(
                                value,
                                [
                                  h.Type('button'),
                                  h.Class('filter-choice'),
                                  h.AriaPressed(
                                    value === model.tldFilter
                                      ? 'true'
                                      : 'false',
                                  ),
                                  h.OnClick(
                                    Message.ClickedTldOption({ value }),
                                  ),
                                ],
                                filterChoiceContent(tldFilterLabel(value), h),
                              ),
                            ),
                        }),
                      ),
                      h.button(
                        [
                          ...render.closeButton,
                          h.Class('filters-close'),
                          h.AriaLabel('Close TLD filter'),
                        ],
                        [Icon.close()],
                      ),
                    ],
                  ),
                ]
              : undefined,
          ),
      },
    }),
  )

const MOBILE_SORT_ORDERS: ReadonlyArray<SortOrder> = [
  'Relevance',
  'Length',
  'PriceAscending',
  'Alphabetical',
]

const filterChoiceContent = (
  label: string,
  h: ApplicationViewBuilder,
): ReadonlyArray<Html> => [
  h.span([], [label]),
  h.span([h.Class('filter-choice-check'), h.AriaHidden(true)], [Icon.check()]),
]

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
                    h.Class('dialog-backdrop filters-backdrop'),
                    h.AriaHidden(true),
                  ]),
                  h.section(
                    [...render.panel, h.Class('filters-panel')],
                    [
                      h.h2(
                        [...render.title, h.Class('sr-only')],
                        ['Filters and sort'],
                      ),
                      h.div(
                        [
                          h.Role('group'),
                          h.AriaLabelledBy('availability-filter-heading'),
                        ],
                        [
                          h.h3(
                            [
                              h.Id('availability-filter-heading'),
                              h.Class('filter-group-label'),
                            ],
                            ['Filter by'],
                          ),
                          ...Array.map(AvailabilityFilter.literals, value =>
                            h.keyed('button')(
                              value,
                              [
                                h.Type('button'),
                                h.Class('filter-choice'),
                                h.AriaPressed(
                                  value === model.availabilityFilter
                                    ? 'true'
                                    : 'false',
                                ),
                                ...(value === model.availabilityFilter
                                  ? render.initialFocus
                                  : []),
                                h.OnClick(
                                  Message.ClickedAvailabilityOption({ value }),
                                ),
                              ],
                              filterChoiceContent(
                                availabilityFilterLabels[value],
                                h,
                              ),
                            ),
                          ),
                        ],
                      ),
                      h.hr([h.Class('filter-group-divider')]),
                      h.div(
                        [
                          h.Role('group'),
                          h.AriaLabelledBy('sort-order-heading'),
                        ],
                        [
                          h.h3(
                            [
                              h.Id('sort-order-heading'),
                              h.Class('filter-group-label'),
                            ],
                            ['Sort by'],
                          ),
                          ...Array.map(MOBILE_SORT_ORDERS, value =>
                            h.keyed('button')(
                              value,
                              [
                                h.Type('button'),
                                h.Class('filter-choice'),
                                h.AriaPressed(
                                  value === model.sortOrder ||
                                    (value === 'PriceAscending' &&
                                      model.sortOrder === 'PriceDescending')
                                    ? 'true'
                                    : 'false',
                                ),
                                h.OnClick(Message.ClickedSortOption({ value })),
                              ],
                              filterChoiceContent(
                                value === 'PriceAscending'
                                  ? 'Price'
                                  : sortOrderLabels[value],
                                h,
                              ),
                            ),
                          ),
                        ],
                      ),
                      h.button(
                        [
                          ...render.closeButton,
                          h.Class('filters-close'),
                          h.AriaLabel('Close filters and sort'),
                        ],
                        [Icon.close()],
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
      h.div(
        [h.Class('top-results-heading')],
        [
          h.h2([], ['Top Results']),
          h.span(
            [h.Class('data-source-label')],
            [model.dataSource === 'Demo' ? 'Sample data' : 'Live · Vercel'],
          ),
        ],
      ),
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
  const results = resultListings(model)
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
                search.domainRequest._tag === 'Loading'),
          ),
        ],
        [resultsGridView(domains, results, model, h)],
      ),
      search._tag === 'Ready' && search.domainRequest._tag === 'Failed'
        ? h.div(
            [
              h.Class(
                'sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-md border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300',
              ),
              h.Role('alert'),
            ],
            [
              h.p([], [search.domainRequest.error]),
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
    activeCart(model),
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
      Array.match(activeCart(model), {
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
          model.dataSource === 'Demo'
            ? 'Demo cart with sample prices and availability. No domains are reserved. No purchases are made.'
            : 'Demo cart. Live registrar quotes may change; adding a domain does not reserve it. No purchases are made.',
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

const liveWarningView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.block(
    LiveWarningDialogBinding.embedView({
      slotId: model.liveWarningDialog.id,
      model: model.liveWarningDialog,
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
                  h.section(
                    [...render.panel, h.Class('live-warning-panel')],
                    [
                      h.h2([...render.title], ['Before you go Live']),
                      h.p(
                        [...render.description, h.Class('live-warning-copy')],
                        [
                          'Live availability and pricing depend on Vercel’s Domains API, so results can take a moment. By continuing, you solemnly promise not to blame the CAFE stack for the wait.',
                        ],
                      ),
                      Checkbox.view(
                        {
                          id: 'live-latency-acceptance',
                          isChecked: model.isLiveLatencyAccepted,
                          onToggle: isAccepted =>
                            Message.UpdatedLiveLatencyAcceptance({
                              isAccepted,
                            }),
                          toView: attributes =>
                            h.div(
                              [h.Class('live-warning-acceptance')],
                              [
                                h.button(
                                  [
                                    ...attributes.checkbox,
                                    ...render.initialFocus,
                                    h.Class('live-warning-checkbox'),
                                  ],
                                  model.isLiveLatencyAccepted
                                    ? [Icon.check()]
                                    : undefined,
                                ),
                                h.span([...attributes.label], ['I promise']),
                              ],
                            ),
                        },
                        h,
                      ),
                      h.p(
                        [h.Class('live-warning-footnote')],
                        ['Not legally binding. Please do report actual bugs.'],
                      ),
                      h.div(
                        [h.Class('live-warning-actions')],
                        [
                          h.button(
                            [...render.closeButton, h.Class('button')],
                            ['Stay in Demo'],
                          ),
                          h.button(
                            [
                              h.Class('button primary live-warning-continue'),
                              h.Disabled(!model.isLiveLatencyAccepted),
                              h.OnClick(Message.ClickedContinueToLive()),
                            ],
                            ['Continue to Live'],
                          ),
                        ],
                      ),
                    ],
                  ),
                ]
              : undefined,
          ),
      },
    }),
  )

const footerView = (model: Model, h: ApplicationViewBuilder): Html =>
  h.footer(
    [h.Class('footer')],
    [
      h.span([], ['A Foldkit example']),
      h.span(
        [],
        [
          model.dataSource === 'Demo'
            ? 'Sample data · Demo cart'
            : 'Live data from Vercel · Demo cart',
        ],
      ),
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
      h.DataAttribute('data-source', model.dataSource),
      h.DataAttribute('search-layout', model.searchLayout),
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
      h.p(
        [
          h.Id('data-source-description'),
          h.Class('sr-only'),
          h.AriaLive('polite'),
        ],
        [
          model.dataSource === 'Demo'
            ? 'Demo dataSource uses sample prices and availability. No live domain checks are made.'
            : 'Live dataSource checks prices and availability with Vercel. The cart is a demo.',
        ],
      ),
      h.main(
        [
          h.Id('main'),
          h.Tabindex(-1),
          h.Class('flex-1 scroll-mt-20 focus:outline-none'),
        ],
        [
          h.h1([h.Class('search-page-heading')], ['Domain search']),
          heroView(model, h),
          beginSearchView(h),
          resultsView(model, h),
        ],
      ),
      footerView(model, h),
      cartView(model, h),
      liveWarningView(model, h),
      filtersDialogView(model, h),
      tldDialogView(model, h),
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
  canonical: routeToCanonicalUrl(model.route),
  ogUrl: routeToCanonicalUrl(model.route),
  body: ApplicationRoute.match(model.route, {
    Search: () => searchPageView(model, h),
    NotFound: ({ path }) => notFoundView(path, h),
  }),
}))
