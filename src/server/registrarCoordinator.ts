import { Effect, ManagedRuntime } from 'effect'

import type { DurableObjectState } from '@cloudflare/workers-types'

import {
  type SearchEnvironment,
  handleSearchRequest,
  respondToCancellation,
} from './coordination'
import { RegistrarSearch, makeRegistrarSearchLayer } from './registrarSearch'

export class RegistrarCoordinator {
  protected readonly fetchRegistrar: typeof globalThis.fetch = globalThis.fetch
  private readonly runtime: ManagedRuntime.ManagedRuntime<
    RegistrarSearch,
    never
  >

  constructor(state: DurableObjectState, environment: SearchEnvironment) {
    this.runtime = ManagedRuntime.make(
      makeRegistrarSearchLayer(state.storage, environment, (input, init) =>
        this.fetchRegistrar.call(globalThis, input, init),
      ),
    )
    void state.blockConcurrencyWhile(() =>
      this.runtime.context().then(() => undefined),
    )
  }

  fetch(request: Request): Promise<Response> {
    return respondToCancellation(
      this.runtime.runPromise(
        handleSearchRequest(request, query =>
          Effect.gen(function* () {
            const search = yield* RegistrarSearch
            return yield* search.search(query)
          }),
        ),
        { signal: request.signal },
      ),
      request.signal,
    )
  }
}
