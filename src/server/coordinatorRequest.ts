import { Effect } from 'effect'
import { HttpServerResponse } from 'effect/http'

import { Request as CoordinatorRequest } from '@alchemy.run/cloudflare/Workers/Request'

import type { Domain } from '../shared/domain'
import type { SearchError } from '../shared/domainsRpc'
import { type CoordinatedSearch, handleSearchRequest } from './coordination'
import { collectSearchTimings } from './searchTiming'

const awaitRequestAbort = (signal: AbortSignal) =>
  Effect.callback<void>(resume => {
    const onAbort = () => resume(Effect.void)

    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    return Effect.sync(() => signal.removeEventListener('abort', onAbort))
  })

export const handleCoordinatorRequest = <Requirements>(
  search: (
    query: CoordinatedSearch,
  ) => Effect.Effect<ReadonlyArray<Domain>, SearchError, Requirements>,
  phase: 'quotes' | 'registrar',
) =>
  Effect.gen(function* () {
    const request = yield* CoordinatorRequest
    const cancelledResponse = HttpServerResponse.empty({ status: 499 })

    if (request.signal.aborted) {
      return cancelledResponse
    }

    const response = handleSearchRequest(request, search)
    const measuredResponse =
      request.headers.get('x-domains-timing') === '1'
        ? collectSearchTimings(response, phase).pipe(
            Effect.map(measuredResponse =>
              HttpServerResponse.setHeader(
                HttpServerResponse.fromWeb(measuredResponse.value),
                'server-timing',
                measuredResponse.header,
              ),
            ),
          )
        : response.pipe(Effect.map(HttpServerResponse.fromWeb))

    return yield* Effect.raceFirst(
      measuredResponse,
      awaitRequestAbort(request.signal).pipe(Effect.as(cancelledResponse)),
    )
  })
