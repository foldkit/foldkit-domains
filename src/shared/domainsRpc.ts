import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import { defineTaggedUnion } from 'foldkit/schema'

import { Domain, DomainCandidateRange, DomainLabel } from './domain'
import { SearchMode } from './searchMode'

export const DOMAINS_RPC_PATH = '/rpc'

export const RateLimitSource = Schema.Literals([
  'Client',
  'Application',
  'Registrar',
])
export type RateLimitSource = typeof RateLimitSource.Type

export const SearchError = defineTaggedUnion({
  RateLimited: {
    source: RateLimitSource,
    retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
  Unavailable: {},
})
export type SearchError = typeof SearchError.Type

export const DomainsRpcs = RpcGroup.make(
  Rpc.make('SearchDomains', {
    payload: {
      mode: Schema.optionalKey(SearchMode),
      label: DomainLabel,
      offset: Schema.optionalKey(DomainCandidateRange.fields.offset),
      limit: Schema.optionalKey(DomainCandidateRange.fields.limit),
    },
    success: Schema.Array(Domain),
    error: SearchError,
  }),
)
