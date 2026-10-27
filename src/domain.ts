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

import { supportedTlds } from './tld'

export const DomainName = Schema.Struct({
  name: Schema.String,
  tld: Schema.String,
})

const Price = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

export const DomainQuote = Schema.Struct({
  price: Price,
  renewalPrice: Price,
  years: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
  isPremium: Schema.Boolean,
})

export const Domain = defineTaggedUnion({
  Available: { ...DomainName.fields, ...DomainQuote.fields },
  Unconfirmed: DomainName.fields,
})

export const DomainListing = defineTaggedUnion({
  Pending: DomainName.fields,
  Ready: { ...DomainName.fields, domain: Domain },
})

export const domainToListing = (domain: typeof Domain.Type) =>
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
export const AvailabilityFilter = Schema.Literals(['All', 'Available'])
export const SortOrder = Schema.Literals([
  'Relevance',
  'PriceAscending',
  'PriceDescending',
])

const featuredTlds = [
  'com',
  'dev',
  'app',
  'io',
  'ai',
  'xyz',
  'org',
  'me',
  'net',
  'tech',
  'space',
  'cloud',
  'studio',
  'sh',
  'design',
  'co',
  'site',
  'online',
  'store',
  'agency',
  'world',
  'run',
  'page',
  'tools',
]

export const domainTlds = Array.appendAll(
  featuredTlds,
  Array.filter(supportedTlds, tld => !Array.contains(featuredTlds, tld)),
)

export const QUOTE_PAGE_SIZE = 60

export const QueryWindow = Schema.Struct({
  offset: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: domainTlds.length - 1 }),
  ),
  limit: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: domainTlds.length }),
  ),
})

export const mergeDomainQuotes = (
  previous: ReadonlyArray<typeof Domain.Type>,
  incoming: ReadonlyArray<typeof Domain.Type>,
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
  domains: ReadonlyArray<typeof Domain.Type>,
) => {
  const quotesByName = Record.fromIterableBy(domains, domain => domain.name)

  return Array.map(queryToPendingDomains(query), pending =>
    Record.get(quotesByName, pending.name).pipe(
      Option.match({ onNone: () => pending, onSome: domainToListing }),
    ),
  )
}

export const DomainLabel = Schema.String.check(
  Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
)

export const domainNames = (label: string) =>
  Array.map(domainTlds, tld =>
    DomainName.make({ name: `${label}.${tld}`, tld }),
  )

export const queryToMaybeDomainLabel = (
  query: string,
): Option.Option<string> => {
  const label = pipe(
    query,
    String.trim,
    String.toLowerCase,
    String.replace(/^https?:\/\//, ''),
    String.split(/[./]/),
    Array.headNonEmpty,
  )

  return Schema.decodeOption(DomainLabel)(label)
}

// NOTE: Static landing HTML includes pending cards so bootstrap can fill query results before the client bundle runs.
export const queryToPendingDomains = (query: string) => {
  const label = Option.getOrElse(queryToMaybeDomainLabel(query), () => '')
  return Array.map(domainNames(label), DomainListing.Pending)
}

export const matchesTldFilter =
  (tldFilter: typeof TldFilter.Type) =>
  (domain: typeof DomainName.Type): boolean =>
    tldFilter === 'All' || domain.tld === String.toLowerCase(tldFilter)

const matchesAvailabilityFilter =
  (availabilityFilter: typeof AvailabilityFilter.Type) =>
  (domain: typeof Domain.Type): boolean =>
    Match.value(availabilityFilter).pipe(
      Match.when('All', () => true),
      Match.when('Available', () => domain._tag === 'Available'),
      Match.exhaustive,
    )

export const visibleDomains = (
  domains: ReadonlyArray<typeof Domain.Type>,
  tldFilter: typeof TldFilter.Type,
  availabilityFilter: typeof AvailabilityFilter.Type,
  sortOrder: typeof SortOrder.Type,
): ReadonlyArray<typeof Domain.Type> => {
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
