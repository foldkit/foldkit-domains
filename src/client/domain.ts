import {
  Array,
  Match,
  Option,
  Order,
  Predicate,
  Record,
  Schema,
  String,
  pipe,
} from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  Domain,
  DomainName,
  QuoteWindow,
  domainNames,
  domainTlds,
  queryToMaybeDomainLabel,
} from '../shared/domain'

export const DomainListing = defineTaggedUnion({
  Pending: DomainName.fields,
  Ready: { ...DomainName.fields, domain: Domain },
})
export type DomainListing = typeof DomainListing.Type

export const domainToReadyListing = (domain: Domain) =>
  DomainListing.Ready({ name: domain.name, tld: domain.tld, domain })

export const TldFilter = Schema.Literals([
  'All',
  'Com',
  'Dev',
  'App',
  'Io',
  'Ai',
  'Org',
])
export type TldFilter = typeof TldFilter.Type
export const AvailabilityFilter = Schema.Literals(['All', 'Available'])
export type AvailabilityFilter = typeof AvailabilityFilter.Type
export const SortOrder = Schema.Literals([
  'Relevance',
  'PriceAscending',
  'PriceDescending',
])
export type SortOrder = typeof SortOrder.Type

export const QUOTE_PAGE_SIZE = 60

export const tldToMaybeQuoteWindow = (
  tld: string,
): Option.Option<QuoteWindow> =>
  pipe(
    domainTlds,
    Array.findFirstIndex(candidate => candidate === tld),
    Option.map(index =>
      QuoteWindow.make({
        offset: Math.floor(index / QUOTE_PAGE_SIZE) * QUOTE_PAGE_SIZE,
        limit: QUOTE_PAGE_SIZE,
      }),
    ),
  )

export const mergeDomainQuotes = (
  previous: ReadonlyArray<Domain>,
  incoming: ReadonlyArray<Domain>,
) =>
  pipe(
    previous,
    Array.filter(
      domain => !Array.some(incoming, quote => quote.name === domain.name),
    ),
    Array.appendAll(incoming),
  )

export const queryToDomainListings = (
  query: string,
  domains: ReadonlyArray<Domain>,
) => {
  const quotesByName = Record.fromIterableBy(domains, domain => domain.name)

  return Array.map(queryToPendingDomainListings(query), pending =>
    Record.get(quotesByName, pending.name).pipe(
      Option.match({ onNone: () => pending, onSome: domainToReadyListing }),
    ),
  )
}

// NOTE: Static landing HTML includes pending cards so bootstrap can fill
// query results before the client bundle runs.
export const queryToPendingDomainListings = (query: string) => {
  const label = Option.getOrElse(queryToMaybeDomainLabel(query), () => '')
  return Array.map(domainNames(label), DomainListing.Pending)
}

export const matchesTldFilter =
  (tldFilter: TldFilter) =>
  (domain: DomainName): boolean =>
    tldFilter === 'All' || domain.tld === String.toLowerCase(tldFilter)

const matchesAvailabilityFilter =
  (availabilityFilter: AvailabilityFilter) =>
  (domain: Domain): boolean =>
    Match.value(availabilityFilter).pipe(
      Match.when('All', () => true),
      Match.when('Available', () => domain._tag === 'Available'),
      Match.exhaustive,
    )

export const visibleDomains = (
  domains: ReadonlyArray<Domain>,
  tldFilter: TldFilter,
  availabilityFilter: AvailabilityFilter,
  sortOrder: SortOrder,
): ReadonlyArray<Domain> => {
  const filteredDomains = Array.filter(
    domains,
    Predicate.and(
      matchesTldFilter(tldFilter),
      matchesAvailabilityFilter(availabilityFilter),
    ),
  )
  const priceOrder = Order.mapInput(
    Order.Number,
    (domain: typeof Domain.Available.Type) => domain.price,
  )
  const available = Array.filter(filteredDomains, Domain.isAnyOf(['Available']))
  const unconfirmed = Array.filter(
    filteredDomains,
    Domain.isAnyOf(['Unconfirmed']),
  )

  return Match.value(sortOrder).pipe(
    Match.when('Relevance', () => filteredDomains),
    Match.when('PriceAscending', () =>
      Array.appendAll(Array.sort(available, priceOrder), unconfirmed),
    ),
    Match.when('PriceDescending', () =>
      Array.appendAll(
        Array.sort(available, Order.flip(priceOrder)),
        unconfirmed,
      ),
    ),
    Match.exhaustive,
  )
}

export const visibleDomainListings = (
  query: string,
  domains: ReadonlyArray<Domain>,
  tldFilter: TldFilter,
  availabilityFilter: AvailabilityFilter,
  sortOrder: SortOrder,
): ReadonlyArray<DomainListing> => {
  const listings = queryToDomainListings(query, domains)

  if (sortOrder === 'Relevance') {
    return Array.filter(
      listings,
      listing =>
        matchesTldFilter(tldFilter)(listing) &&
        (availabilityFilter === 'All' ||
          listing._tag === 'Pending' ||
          listing.domain._tag === 'Available'),
    )
  } else {
    return Array.appendAll(
      Array.map(
        visibleDomains(domains, tldFilter, availabilityFilter, sortOrder),
        domainToReadyListing,
      ),
      Array.filter(
        listings,
        listing =>
          listing._tag === 'Pending' && matchesTldFilter(tldFilter)(listing),
      ),
    )
  }
}

export const formatPrice = (price: number): string => `$${price.toFixed(2)}`

export const formatRegistrationPrice = (
  domain: typeof Domain.Available.Type,
): string =>
  domain.years === 1
    ? formatPrice(domain.price)
    : `${formatPrice(domain.price)} / ${domain.years} years`

export const formatRenewalPrice = (
  domain: typeof Domain.Available.Type,
): string =>
  `Renews at ${formatPrice(domain.renewalPrice)} for ${domain.years === 1 ? '1 year' : `${domain.years} years`}`
