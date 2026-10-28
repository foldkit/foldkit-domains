import { Effect, Layer, ManagedRuntime } from 'effect'

import type { DurableObjectState } from '@cloudflare/workers-types'

import {
  type SearchEnvironment,
  handleSearchRequest,
  makeCoordinatedSearchClientLayer,
  respondToCancellation,
} from './coordination'
import { DomainSearch, makeDomainSearchLayer } from './domainSearch'

export class DomainSearchCoordinator {
  private readonly runtime: ManagedRuntime.ManagedRuntime<DomainSearch, never>

  constructor(state: DurableObjectState, environment: SearchEnvironment) {
    this.runtime = ManagedRuntime.make(
      makeDomainSearchLayer(state.storage).pipe(
        Layer.provide(
          makeCoordinatedSearchClientLayer(
            environment.REGISTRAR_BUDGET,
            () => 'vercel',
          ),
        ),
      ),
    )
  }

  fetch(request: Request): Promise<Response> {
    return respondToCancellation(
      this.runtime.runPromise(
        handleSearchRequest(request, query =>
          Effect.gen(function* () {
            const search = yield* DomainSearch
            return yield* search.search(query)
          }),
        ),
        { signal: request.signal },
      ),
      request.signal,
    )
  }

  alarm(): Promise<void> {
    return this.runtime.runPromise(
      Effect.gen(function* () {
        const search = yield* DomainSearch
        yield* search.expireQuotes
      }),
    )
  }
}
