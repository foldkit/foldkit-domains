import { Effect, Layer } from 'effect'

import { DurableObjectState } from '@alchemy.run/cloudflare/Workers/DurableObjectState'

import {
  type SearchEnvironment,
  makeCoordinatedSearchClientLayer,
} from './coordination'
import { handleCoordinatorRequest } from './coordinatorRequest'
import { DomainSearch, makeDomainSearchLayer } from './domainSearch'

export const makeDomainSearchCoordinatorImplementation = (
  environment: SearchEnvironment,
) =>
  Effect.gen(function* () {
    const state = yield* DurableObjectState

    return yield* Effect.gen(function* () {
      const search = yield* DomainSearch

      return {
        fetch: handleCoordinatorRequest(search.search, 'quotes'),
        alarm: () => search.expireQuotes,
      }
    }).pipe(
      Effect.provide(
        makeDomainSearchLayer(state.raw.storage).pipe(
          Layer.provide(
            makeCoordinatedSearchClientLayer(
              environment.REGISTRAR_BUDGET,
              () => 'vercel',
            ),
          ),
        ),
      ),
    )
  })
