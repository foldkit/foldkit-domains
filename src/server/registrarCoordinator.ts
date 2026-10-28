import { Effect } from 'effect'

import { DurableObjectState } from '@alchemy.run/cloudflare/Workers/DurableObjectState'

import type { SearchEnvironment } from './coordination'
import { handleCoordinatorRequest } from './coordinatorRequest'
import { RegistrarSearch, makeRegistrarSearchLayer } from './registrarSearch'

export const makeRegistrarCoordinatorImplementation = (
  environment: SearchEnvironment,
  fetchRegistrar: typeof globalThis.fetch = globalThis.fetch,
) =>
  Effect.gen(function* () {
    const state = yield* DurableObjectState

    return yield* Effect.gen(function* () {
      const search = yield* RegistrarSearch

      return { fetch: handleCoordinatorRequest(search.search, 'registrar') }
    }).pipe(
      Effect.provide(
        makeRegistrarSearchLayer(
          state.raw.storage,
          environment,
          (input, init) => fetchRegistrar.call(globalThis, input, init),
        ),
      ),
    )
  })
