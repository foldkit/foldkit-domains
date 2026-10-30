import { Schema } from 'effect'

import { DialogBlock } from '@foldkit/ui'

import { DataSource } from '../shared/dataSource'
import { DomainCandidateRange } from '../shared/domain'
import { DataSourceControlBlock } from './dataSourceControl'
import { AvailabilityFilter, Cart, SortOrder, TldFilter } from './domain'
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

export const Model = Schema.Struct({
  route: ApplicationRoute,
  searchLayout: SearchLayout,
  dataSource: DataSource,
  liveWarningDialog: DialogBlock.Model,
  isLiveLatencyAccepted: Schema.Boolean,
  dataSourceControl: DataSourceControlBlock.Model,
  searchGeneration: Schema.Number,
  searchPlanningTimeMillis: Schema.Number,
  activeDomainCandidateRanges: Schema.Array(DomainCandidateRange),
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
  carts: Cart.Carts,
  cartDialog: DialogBlock.Model,
  filtersDialog: DialogBlock.Model,
  tldDialog: DialogBlock.Model,
  tldSearchQuery: Schema.String,
})
export type Model = typeof Model.Type
