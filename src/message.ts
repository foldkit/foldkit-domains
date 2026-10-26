import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { AvailabilityFilter, Domain, SortOrder, TldFilter } from './domain'

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  PressedEscape: {},
  ClickedClearSearch: {},
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  UpdatedTldFilter: { value: TldFilter },
  UpdatedAvailabilityFilter: { value: AvailabilityFilter },
  UpdatedSortOrder: { value: SortOrder },
  ClickedAddDomain: { domain: Domain },
  ClickedRemoveDomain: { name: Schema.String },
  ClickedCart: {},
  ClickedCloseCart: {},
  ClickedRetrySearch: {},
  SucceededFetchDomains: {
    searchGeneration: Schema.Number,
    domains: Schema.Array(Domain),
  },
  FailedFetchDomains: { searchGeneration: Schema.Number, error: Schema.String },
  CompletedReplaceSearchUrl: {},
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedFocusSearchInput: {},
  CompletedCancelSearch: {},
  CompletedReleaseEarlySearchListeners: {},
})
