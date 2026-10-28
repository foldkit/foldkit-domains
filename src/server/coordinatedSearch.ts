import { Effect, Layer, Option } from 'effect'
import { HttpServerRequest } from 'effect/http'

import { domainTlds } from '../shared/domain'
import { DomainsRpcs } from '../shared/domainsRpc'
import {
  CoordinatedSearchClient,
  type SearchEnvironment,
  makeCoordinatedSearchClientLayer,
} from './coordination'

export const makeCoordinatedSearchHandlersLayer = (
  environment: SearchEnvironment,
) =>
  DomainsRpcs.toLayer({
    SearchDomains: ({ label, offset = 0, limit = domainTlds.length }) =>
      Effect.gen(function* () {
        const search = yield* CoordinatedSearchClient
        const maybeRequest = yield* Effect.serviceOption(
          HttpServerRequest.HttpServerRequest,
        )

        const client = Option.match(maybeRequest, {
          onNone: () => 'local',
          onSome: request => request.headers['cf-connecting-ip'] ?? 'local',
        })

        return yield* search.search({ label, offset, limit, client })
      }),
  }).pipe(
    Layer.provide(
      makeCoordinatedSearchClientLayer(
        environment.DOMAIN_QUOTES,
        query => query.label,
      ),
    ),
  )
