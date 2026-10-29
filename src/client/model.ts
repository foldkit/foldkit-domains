import { Schema } from 'effect'

import { DialogBlock } from '@foldkit/ui'

import { Domain, DomainCandidateRange } from '../shared/domain'
import { SearchMode } from '../shared/searchMode'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { DomainsQuery } from './domainsQuery'
import {
  AvailabilityListboxBlock,
  SortListboxBlock,
  TldListboxBlock,
} from './filterListboxes'
import { ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'
import { SearchCooldown } from './searchCooldown'
import { SearchLayout } from './searchInput'
import { SearchModeControlBlock } from './searchModeControl'

export const Carts = Schema.Struct({
  Demo: Schema.Array(Domain.Available),
  Live: Schema.Array(Domain.Available),
})
export type Carts = typeof Carts.Type

export const Model = Schema.Struct({
  route: ApplicationRoute,
  searchLayout: SearchLayout,
  searchMode: SearchMode,
  liveWarningDialog: DialogBlock.Model,
  isLiveLatencyAccepted: Schema.Boolean,
  searchModeControl: SearchModeControlBlock.Model,
  searchGeneration: Schema.Number,
  searchPlanningTimeMillis: Schema.Number,
  domainCandidateRanges: Schema.Array(DomainCandidateRange),
  domainsQuery: DomainsQuery.Model,
  maybeBlockedDomainCandidateRange: Schema.Option(DomainCandidateRange),
  maybeSearchCooldown: Schema.Option(SearchCooldown),
  resultsList: ResultsListBlock.Model,
  tldListbox: TldListboxBlock.Model,
  availabilityListbox: AvailabilityListboxBlock.Model,
  sortListbox: SortListboxBlock.Model,
  tldFilter: TldFilter,
  availabilityFilter: AvailabilityFilter,
  sortOrder: SortOrder,
  carts: Carts,
  cartDialog: DialogBlock.Model,
  filtersDialog: DialogBlock.Model,
  tldDialog: DialogBlock.Model,
  tldSearchQuery: Schema.String,
})
export type Model = typeof Model.Type

export const activeCart = (model: Model) => model.carts[model.searchMode]

export const updateActiveCart = (
  model: Model,
  transform: (
    cart: ReadonlyArray<typeof Domain.Available.Type>,
  ) => ReadonlyArray<typeof Domain.Available.Type>,
): Carts => ({
  ...model.carts,
  [model.searchMode]: transform(activeCart(model)),
})
