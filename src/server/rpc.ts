import { Effect, Layer, Stream, String } from 'effect'
import {
  FetchHttpClient,
  HttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http'
import { RpcSerialization, RpcServer } from 'effect/rpc'

import { DOMAINS_RPC_PATH, DomainsRpcs } from '../shared/domainsRpc'
import { makeCoordinatedSearchHandlersLayer } from './coordinatedSearch'
import type { SearchEnvironment } from './coordination'
import { RegistrarLayer } from './registrar'
import { SearchHandlersLayer, SearchRateLimiterLayer } from './search'
import { collectSearchTimings } from './searchTiming'

const MAX_RPC_REQUEST_BYTES = 1024

const noStore = HttpServerResponse.setHeader('cache-control', 'no-store')

const RequestBounds = HttpRouter.middleware(httpEffect =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    if (
      !String.startsWith('application/json')(
        request.headers['content-type'] ?? '',
      )
    ) {
      return noStore(HttpServerResponse.empty({ status: 415 }))
    }

    const boundedBody = yield* request.stream.pipe(
      Stream.flattenIterable,
      Stream.take(MAX_RPC_REQUEST_BYTES + 1),
      Stream.runCollect,
      Effect.result,
    )

    if (boundedBody._tag === 'Failure') {
      return noStore(HttpServerResponse.empty({ status: 400 }))
    }

    if (boundedBody.success.length > MAX_RPC_REQUEST_BYTES) {
      return noStore(HttpServerResponse.empty({ status: 413 }))
    }

    const webRequest = yield* HttpServerRequest.toWeb(request)
    const boundedRequest = HttpServerRequest.fromWeb(
      new Request(webRequest, {
        body: Uint8Array.from(boundedBody.success),
      }),
    )

    return yield* httpEffect.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        boundedRequest,
      ),
      Effect.map(noStore),
    )
  }),
)

const SearchTimingMiddleware = HttpRouter.middleware(httpEffect =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    if (request.headers['x-domains-timing'] !== '1') {
      return yield* httpEffect
    }

    const measuredResponse = yield* collectSearchTimings(httpEffect, 'rpc')
    return HttpServerResponse.setHeader(
      measuredResponse.value,
      'server-timing',
      measuredResponse.header,
    )
  }),
)

export const DomainsRpcRoutes = HttpRouter.add(
  'POST',
  DOMAINS_RPC_PATH,
  Effect.scoped(
    Effect.gen(function* () {
      const handleRequest = yield* RpcServer.toHttpEffect(DomainsRpcs)
      return yield* handleRequest
    }),
  ),
).pipe(
  HttpRouter.provideRequest(RpcSerialization.layerJson),
  Layer.provide([RequestBounds.layer, SearchTimingMiddleware.layer]),
)

export const DomainsRpcLayer = DomainsRpcRoutes.pipe(
  HttpRouter.provideRequest(
    SearchHandlersLayer.pipe(
      Layer.provide(
        RegistrarLayer.pipe(
          Layer.provide(FetchHttpClient.layer),
          Layer.provide(
            Layer.succeed(HttpClient.TracerPropagationEnabled, false),
          ),
        ),
      ),
      Layer.provide(SearchRateLimiterLayer),
    ),
  ),
)

export const domainsRpc = HttpRouter.toWebHandler(DomainsRpcLayer, {
  disableLogger: true,
})

export const makeCoordinatedDomainsRpc = (environment: SearchEnvironment) =>
  HttpRouter.toWebHandler(
    DomainsRpcRoutes.pipe(
      HttpRouter.provideRequest(
        makeCoordinatedSearchHandlersLayer(environment),
      ),
    ),
    { disableLogger: true },
  )
