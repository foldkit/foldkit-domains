import { Schema } from 'effect'

import { DialogBlock } from '@foldkit/ui'

import { Domain, QuoteWindow } from '../shared/domain'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { QuoteWindows } from './quoteWindows'
import { ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'
import { SearchCooldown } from './searchCooldown'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  searchGeneration: Schema.Number,
  searchTimeMillis: Schema.Number,
  quotePlan: Schema.Array(QuoteWindow),
  quoteWindows: QuoteWindows.Model,
  maybeBlockedQuoteWindow: Schema.Option(QuoteWindow),
  maybeSearchCooldown: Schema.Option(SearchCooldown),
  resultsList: ResultsListBlock.Model,
  tldFilter: TldFilter,
  availabilityFilter: AvailabilityFilter,
  sortOrder: SortOrder,
  cart: Schema.Array(Domain.Available),
  cartDialog: DialogBlock.Model,
})
export type Model = typeof Model.Type
