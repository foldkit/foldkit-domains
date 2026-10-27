import { Effect, Option } from 'effect'
import { HttpServerRequest } from 'effect/http'

import { domainTlds } from '../domain'
import { DomainsRpcs } from '../domainsRpc'
import { type SearchEnvironment, searchObject } from './coordination'

export const makeSharedSearchHandlersLayer = (environment: SearchEnvironment) =>
  DomainsRpcs.toLayer({
    SearchDomains: ({ label, offset = 0, limit = domainTlds.length }) =>
      Effect.gen(function* () {
        const maybeRequest = yield* Effect.serviceOption(
          HttpServerRequest.HttpServerRequest,
        )
        const client = Option.match(maybeRequest, {
          onNone: () => 'local',
          onSome: request => request.headers['cf-connecting-ip'] ?? 'local',
        })
        return yield* searchObject(environment.DOMAIN_QUOTES, label, {
          label,
          offset,
          limit,
          client,
        })
      }),
  })
