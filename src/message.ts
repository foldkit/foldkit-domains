import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { Availability, Domain, Sorting, Tld } from './domain'

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  SubmittedSearch: {},
  PressedEscape: {},
  ClickedClearSearch: {},
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  UpdatedTld: { value: Tld },
  UpdatedAvailability: { value: Availability },
  UpdatedSorting: { value: Sorting },
  ClickedAddDomain: { domain: Domain },
  ClickedRemoveDomain: { name: Schema.String },
  ClickedCart: {},
  ClickedCloseCart: {},
  ClickedRetrySearch: {},
  SucceededFetchDomains: {
    revision: Schema.Number,
    domains: Schema.Array(Domain),
  },
  FailedFetchDomains: { revision: Schema.Number, error: Schema.String },
  CompletedSyncSearchUrl: {},
  CompletedNavigate: {},
  CompletedFocusSearch: {},
  CompletedCancelSearch: {},
  CompletedReleaseEarlySearchListeners: {},
})
