import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { AvailabilityFilter, Domain, SortOrder, TldFilter } from './domain'
import { ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'

export const SearchState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ready: { domains: Schema.Array(Domain) },
  Failed: { error: Schema.String },
})

export const Model = Schema.Struct({
  route: ApplicationRoute,
  searchGeneration: Schema.Number,
  search: SearchState,
  resultsList: ResultsListBlock.Model,
  tldFilter: TldFilter,
  availabilityFilter: AvailabilityFilter,
  sortOrder: SortOrder,
  cart: Schema.Array(Domain),
  cartVisibility: Schema.Literals(['Closed', 'Open']),
})
