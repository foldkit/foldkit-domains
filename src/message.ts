import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { AvailabilityFilter, Domain, SortOrder, TldFilter } from './domain'
import { ResultsListScrollKey } from './resultsList'

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  PressedEscape: {},
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
  CompletedFocusCartButton: {},
  CompletedFocusCartCloseButton: {},
  CompletedScrollResultsList: {},
  CompletedDismissSearchKeyboard: {},
  CompletedCancelSearch: {},
  CompletedReleaseEarlySearchListeners: {},
})
