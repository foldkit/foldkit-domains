import { Array, Option, Order, Schema, String, pipe } from 'effect'
import { Url } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

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

export const Tld = Schema.Literals([
  'All',
  'Com',
  'Dev',
  'App',
  'Io',
  'Ai',
  'Org',
])
export const Availability = Schema.Literals(['All', 'Available'])
export const Sorting = Schema.Literals([
  'Relevance',
  'PriceAscending',
  'PriceDescending',
])

const extensions: ReadonlyArray<readonly [string, number]> = [
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

export const queryFromUrl = (url: Url.Url): string =>
  new URLSearchParams(Option.getOrElse(url.search, () => '')).get('q') ?? ''

export const searchHref = (query: string): string => {
  const parameters = new URLSearchParams()
  if (String.isNonEmpty(query)) {
    parameters.set('q', query)
  }
  const search = parameters.toString()
  return String.isEmpty(search)
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}?${search}`
}

export const domainLabel = (query: string): Option.Option<string> => {
  const label =
    query
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split(/[./]/)
      .at(0) ?? ''
  return Option.liftPredicate(label, value =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
  )
}

export const searchDomains = (
  label: string,
): ReadonlyArray<typeof Domain.Type> =>
  extensions.map(([tld, price]) =>
    Domain.make({
      name: `${label}.${tld}`,
      tld,
      price,
      isAvailable: !(
        ['vercel', 'google', 'github', 'foldkit'].includes(label) &&
        ['com', 'dev'].includes(tld)
      ),
    }),
  )

export const pendingDomains = (
  query: string,
): ReadonlyArray<typeof DomainListing.Pending.Type> => {
  const label = Option.getOrElse(domainLabel(query), () => '')

  return extensions.map(([tld]) =>
    DomainListing.Pending({ name: `${label}.${tld}`, tld }),
  )
}

export const visibleDomains = (
  domains: ReadonlyArray<typeof Domain.Type>,
  tld: typeof Tld.Type,
  availability: typeof Availability.Type,
  sorting: typeof Sorting.Type,
): ReadonlyArray<typeof Domain.Type> => {
  const filtered = domains.filter(
    domain =>
      (tld === 'All' || domain.tld === tld.toLowerCase()) &&
      (availability === 'All' || domain.isAvailable),
  )
  if (sorting === 'Relevance') {
    return filtered
  } else {
    const priceOrder = Order.mapInput(
      Order.Number,
      (domain: typeof Domain.Type) => domain.price,
    )
    return pipe(
      filtered,
      Array.sort(
        sorting === 'PriceAscending' ? priceOrder : Order.flip(priceOrder),
      ),
    )
  }
}

export const formatPrice = (price: number): string => `$${price.toFixed(2)}`
