import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { Domain, QuoteWindow } from '../shared/domain'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { ResultsListScrollKey } from './resultsList'

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  RequestedSearch: {},
  RequestedQuotes: QuoteWindow.fields,
  ReachedSearchCooldownExpiry: { nowMillis: Schema.Number },
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
  CompletedDetermineSearchTime: {
    searchGeneration: Schema.Number,
    nowMillis: Schema.Number,
    ...QuoteWindow.fields,
    isForced: Schema.Boolean,
  },

  CompletedReplaceSearchUrl: {},
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedFocusSearchInput: {},
  CompletedFocusCartButton: {},
  CompletedFocusCartCloseButton: {},
  CompletedScrollPage: {},
  CompletedDismissSearchKeyboard: {},
  CompletedReleaseEarlySearchListeners: {},
})
export type Message = typeof Message.Type
