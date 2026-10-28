import { Effect, Schema } from 'effect'

import { DurableObject } from '@alchemy.run/cloudflare/Workers/DurableObject'
import {
  Worker,
  WorkerEnvironment,
} from '@alchemy.run/cloudflare/Workers/Worker'

import { SearchEnvironment } from './coordination'
import { makeDomainSearchCoordinatorImplementation } from './domainSearchCoordinator'
import { makeRegistrarCoordinatorImplementation } from './registrarCoordinator'

export const coordinatorRuntime = Worker(
  'Website',
  {},
  Effect.gen(function* () {
    const environment = yield* Schema.decodeUnknownEffect(SearchEnvironment)(
      yield* WorkerEnvironment,
    ).pipe(Effect.orDie)

    yield* DurableObject(
      'DOMAIN_QUOTES',
      Effect.succeed(makeDomainSearchCoordinatorImplementation(environment)),
    )
    yield* DurableObject(
      'REGISTRAR_BUDGET',
      Effect.succeed(makeRegistrarCoordinatorImplementation(environment)),
    )

    return {}
  }),
)
