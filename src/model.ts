import { Effect, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { DialogBlock } from '@foldkit/ui'

import {
  AvailabilityFilter,
  Domain,
  QueryWindow,
  SortOrder,
  TldFilter,
} from './domain'
import { ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'

export const QuoteRequest = defineTaggedUnion({
  Idle: {},
  Loading: QueryWindow.fields,
  Failed: { ...QueryWindow.fields, error: Schema.String },
})

export const SearchState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ready: {
    domains: Schema.Array(Domain),
    quoteRequest: QuoteRequest.pipe(
      Schema.withConstructorDefault(Effect.succeed(QuoteRequest.Idle())),
    ),
  },
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
  cart: Schema.Array(Domain.Available),
  cartDialog: DialogBlock.Model,
})
