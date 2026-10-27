import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import { defineTaggedUnion } from 'foldkit/schema'

import { Domain, DomainLabel, QueryWindow } from './domain'

export const DOMAINS_RPC_PATH = '/rpc'

export const RateLimitSource = Schema.Literals([
  'Client',
  'Application',
  'Registrar',
])

export const SearchError = defineTaggedUnion({
  RateLimited: {
    source: RateLimitSource,
    retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
  Unavailable: {},
})

export const DomainsRpcs = RpcGroup.make(
  Rpc.make('SearchDomains', {
    payload: {
      label: DomainLabel,
      offset: Schema.optionalKey(QueryWindow.fields.offset),
      limit: Schema.optionalKey(QueryWindow.fields.limit),
    },
    success: Schema.Array(Domain),
    error: SearchError,
  }),
)
