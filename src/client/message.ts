import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { Domain, DomainCandidateRange } from '../shared/domain'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { ResultsListScrollKey } from './resultsList'

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  RequestedSearch: {},
  RequestedQuotes: DomainCandidateRange.fields,
  ReachedSearchCooldownExpiry: { nowMillis: Schema.Number },
  PressedEscape: {},
  FocusedResultsList: {},
  PressedResultsListScrollKey: { key: ResultsListScrollKey },
  ClickedClearSearch: {},
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  ClickedDomainsHome: {},
  ClickedSkipToMain: {},
  UpdatedTldFilter: { value: TldFilter },
  UpdatedAvailabilityFilter: { value: AvailabilityFilter },
  UpdatedSortOrder: { value: SortOrder },
  ClickedAddDomain: { domain: Domain },
  ClickedRemoveDomain: { name: Schema.String },
  ClickedRemoveCartDomain: { name: Schema.String },
  ClickedCart: {},
  ClickedFilters: {},
  ClickedTldFilter: {},
  UpdatedTldSearch: { value: Schema.String },
  ClickedTldOption: { value: TldFilter },
  ClickedAvailabilityOption: { value: AvailabilityFilter },
  ClickedSortOption: { value: SortOrder },
  ClickedRetrySearch: {},
  UpdatedLiveLatencyAcceptance: { isAccepted: Schema.Boolean },
  ClickedContinueToLive: {},
  CompletedFocusSearchModeButton: {},
  CompletedReadSearchPlanningTime: {
    searchGeneration: Schema.Number,
    nowMillis: Schema.Number,
    ...DomainCandidateRange.fields,
    isForced: Schema.Boolean,
  },

  CompletedReplaceSearchUrl: {},
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedFocusSearchInput: {},
  CompletedFocusCartButton: {},
  CompletedFocusFiltersButton: {},
  CompletedFocusTldFilterButton: {},
  CompletedFocusCartCloseButton: {},
  CompletedScrollPage: {},
  CompletedScrollPageToTop: {},
  CompletedRevealResultsListStart: {},
  CompletedDismissSearchKeyboard: {},
  CompletedReleaseEarlySearchListeners: { isSearchStarted: Schema.Boolean },
})
export type Message = typeof Message.Type
