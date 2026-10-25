import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Availability, Domain, Sorting, Tld } from './domain'

export const SearchState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ready: { domains: Schema.Array(Domain) },
  Failed: { error: Schema.String },
})

export const Model = Schema.Struct({
  query: Schema.String,
  revision: Schema.Number,
  search: SearchState,
  tld: Tld,
  availability: Availability,
  sorting: Sorting,
  cart: Schema.Array(Domain),
  cartVisibility: Schema.Literals(['Closed', 'Open']),
})
