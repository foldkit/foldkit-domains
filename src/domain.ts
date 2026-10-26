import {
  Array,
  Match,
  Option,
  Order,
  Schema,
  String,
  Tuple,
  pipe,
} from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { supportedTlds } from './tld'

export const DomainName = Schema.Struct({
  name: Schema.String,
  tld: Schema.String,
})

export const Domain = Schema.Struct({
  ...DomainName.fields,
  price: Schema.Number,
  isAvailable: Schema.Boolean,
})

export const DomainListing = defineTaggedUnion({
  Pending: DomainName.fields,
  Ready: Domain.fields,
})

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

const featuredExtensions: ReadonlyArray<readonly [string, number]> = [
  ['com', 12],
  ['dev', 12],
  ['app', 9.99],
  ['io', 34.99],
  ['ai', 80],
  ['xyz', 2.99],
  ['org', 9.99],
  ['me', 13.99],
  ['net', 13.5],
  ['tech', 7.99],
  ['space', 1.99],
  ['cloud', 7.99],
  ['studio', 21.99],
  ['sh', 33],
  ['design', 39.99],
  ['co', 25.99],
  ['site', 1.99],
  ['online', 3.99],
  ['store', 4.99],
  ['agency', 5.99],
  ['world', 3.99],
  ['run', 19.99],
  ['page', 9.99],
  ['tools', 24.99],
]

const DEFAULT_DEMO_PRICE = 19.99

const extensions = Array.appendAll(
  featuredExtensions,
  Array.map(
    Array.filter(
      supportedTlds,
      tld =>
        !Array.some(featuredExtensions, ([featuredTld]) => featuredTld === tld),
    ),
    tld => Tuple.make(tld, DEFAULT_DEMO_PRICE),
  ),
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

  return pipe(
    label,
    String.match(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
    Option.flatMap(Array.head),
  )
}

export const searchDomains = (
  label: string,
): ReadonlyArray<typeof Domain.Type> =>
  Array.map(extensions, ([tld, price]) => {
    const isAvailable = !(
      Array.contains(['vercel', 'google', 'github', 'foldkit'], label) &&
      Array.contains(['com', 'dev'], tld)
    )

    return Domain.make({ name: `${label}.${tld}`, tld, price, isAvailable })
  })

export const pendingDomains = (
  query: string,
): ReadonlyArray<typeof DomainListing.Pending.Type> => {
  const label = Option.getOrElse(queryToMaybeDomainLabel(query), () => '')

  return Array.map(extensions, ([tld]) =>
    DomainListing.Pending({ name: `${label}.${tld}`, tld }),
  )
}

export const matchesTldFilter = (
  domain: typeof DomainName.Type,
  tldFilter: typeof TldFilter.Type,
): boolean =>
  tldFilter === 'All' || domain.tld === String.toLowerCase(tldFilter)

const matchesAvailabilityFilter = (
  domain: typeof Domain.Type,
  availabilityFilter: typeof AvailabilityFilter.Type,
): boolean =>
  Match.value(availabilityFilter).pipe(
    Match.when('All', () => true),
    Match.when('Available', () => domain.isAvailable),
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
    domain =>
      matchesTldFilter(domain, tldFilter) &&
      matchesAvailabilityFilter(domain, availabilityFilter),
  )
  const priceOrder = Order.mapInput(
    Order.Number,
    (domain: typeof Domain.Type) => domain.price,
  )

  return Match.value(sortOrder).pipe(
    Match.when('Relevance', () => filteredDomains),
    Match.when('PriceAscending', () => Array.sort(filteredDomains, priceOrder)),
    Match.when('PriceDescending', () =>
      Array.sort(filteredDomains, Order.flip(priceOrder)),
    ),
    Match.exhaustive,
  )
}

export const formatPrice = (price: number): string => `$${price.toFixed(2)}`
