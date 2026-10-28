import { DurableObject as NativeDurableObject } from 'cloudflare:workers'
import { Array, Clock, Effect, Schema } from 'effect'
import { HttpServerResponse } from 'effect/http'

import { DurableObject } from '@alchemy.run/cloudflare/Workers/DurableObject'
import {
  type DurableObjectBridgeConstructor,
  makeDurableObjectBridge,
} from '@alchemy.run/cloudflare/Workers/DurableObjectBridge'
import { DurableObjectState } from '@alchemy.run/cloudflare/Workers/DurableObjectState'
import { Request as CoordinatorRequest } from '@alchemy.run/cloudflare/Workers/Request'
import {
  Worker,
  WorkerEnvironment,
} from '@alchemy.run/cloudflare/Workers/Worker'

import type { SearchEnvironment } from '../../src/server/coordination'
import { makeDomainSearchCoordinatorImplementation } from '../../src/server/domainSearchCoordinator'
import { makeRegistrarCoordinatorImplementation } from '../../src/server/registrarCoordinator'
import { makeCoordinatedDomainsRpc } from '../../src/server/rpc'

const RegistrarRequest = Schema.Struct({ domains: Schema.Array(Schema.String) })

interface FixtureEnvironment extends SearchEnvironment {
  readonly LOW_QUOTES: SearchEnvironment['DOMAIN_QUOTES']
  readonly LOW_BUDGET: SearchEnvironment['REGISTRAR_BUDGET']
  readonly PERSISTENCE_BUDGET: SearchEnvironment['REGISTRAR_BUDGET']
}

const readFixtureEnvironment = Effect.map(
  WorkerEnvironment,
  (environment): FixtureEnvironment => ({
    DOMAIN_QUOTES: environment.DOMAIN_QUOTES,
    REGISTRAR_BUDGET: environment.REGISTRAR_BUDGET,
    LOW_QUOTES: environment.LOW_QUOTES,
    LOW_BUDGET: environment.LOW_BUDGET,
    PERSISTENCE_BUDGET: environment.PERSISTENCE_BUDGET,
    VERCEL_API_TOKEN: environment.VERCEL_API_TOKEN,
    REGISTRAR_REQUESTS_PER_SECOND: environment.REGISTRAR_REQUESTS_PER_SECOND,
    REGISTRAR_REQUESTS_PER_MINUTE: environment.REGISTRAR_REQUESTS_PER_MINUTE,
    REGISTRAR_MAX_CONCURRENT: environment.REGISTRAR_MAX_CONCURRENT,
  }),
)

const withNativeFetchReceiver = (
  execute: typeof globalThis.fetch,
): typeof globalThis.fetch =>
  function (this: unknown, input, init) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation')
    }

    return execute(input, init)
  }

const makeFixtureDomainSearchImplementation = (
  environment: SearchEnvironment,
) =>
  Effect.gen(function* () {
    const state = yield* DurableObjectState
    const implementation =
      yield* makeDomainSearchCoordinatorImplementation(environment)

    return {
      ...implementation,
      fetch: Effect.gen(function* () {
        const request = yield* CoordinatorRequest

        if (request.url.endsWith('/expire')) {
          const entries = yield* Effect.promise(() =>
            state.raw.storage.list<{ expiresAt: number }>(),
          )
          const nowMillis = yield* Clock.currentTimeMillis

          for (const [key, entry] of entries) {
            yield* Effect.promise(() =>
              state.raw.storage.put(key, {
                ...entry,
                expiresAt: nowMillis - 1,
              }),
            )
          }

          const coordinator = new FixtureDomainSearchCoordinator(
            state.raw,
            environment,
          )
          yield* Effect.promise(() => coordinator.alarm())
          return HttpServerResponse.empty({ status: 204 })
        } else if (request.url.endsWith('/reopen')) {
          const coordinator = new FixtureDomainSearchCoordinator(
            state.raw,
            environment,
          )
          const response = yield* Effect.promise(() =>
            coordinator.fetch(
              new Request('https://domains.internal/search', request),
            ),
          )
          return HttpServerResponse.fromWeb(response)
        } else {
          return yield* implementation.fetch
        }
      }),
    }
  })

const makeFixtureRegistrarImplementation = (environment: SearchEnvironment) =>
  Effect.gen(function* () {
    const state = yield* DurableObjectState
    const stats = {
      instanceId: crypto.randomUUID(),
      calls: 0,
      inFlight: 0,
      maximumInFlight: 0,
      aborted: 0,
      starts: Array.empty<number>(),
    }
    const failed = new Set<string>()
    const throttled = new Set<string>()
    const fetchRegistrar = withNativeFetchReceiver(async (input, init) => {
      const request = new Request(input, init)
      const { domains } = Schema.decodeUnknownSync(RegistrarRequest)(
        await request.json(),
      )
      const firstName = domains.join(',')
      const isSlow = Array.some(domains, domain => domain.startsWith('cancel-'))
      const isSlowRegistry = Array.some(
        domains,
        domain => domain.startsWith('slow-page-') && domain.endsWith('.eus'),
      )
      const providerDelay = () => {
        if (isSlowRegistry) {
          return '9 seconds'
        } else if (isSlow) {
          return '6 seconds'
        } else {
          return '50 millis'
        }
      }
      const isThrottled = Array.some(domains, domain =>
        domain.startsWith('throttle-'),
      )
      stats.calls += 1
      stats.inFlight += 1
      stats.maximumInFlight = Math.max(stats.maximumInFlight, stats.inFlight)
      stats.starts.push(Effect.runSync(Clock.currentTimeMillis))

      try {
        if (
          Array.some(domains, domain => domain.startsWith('failure-once-')) &&
          !failed.has(firstName)
        ) {
          failed.add(firstName)
          return new Response(null, { status: 503 })
        }

        if (isThrottled && !throttled.has(firstName)) {
          throttled.add(firstName)
          return Response.json(
            {},
            {
              status: 429,
              headers: {
                'retry-after': Array.some(domains, domain =>
                  domain.startsWith('throttle-persist-'),
                )
                  ? '60'
                  : '1',
              },
            },
          )
        }

        try {
          await Effect.runPromise(Effect.sleep(providerDelay()), {
            signal: request.signal,
          })
        } catch (error) {
          if (request.signal.aborted) {
            stats.aborted += 1
          }
          throw error
        }

        return Response.json({
          results: Array.map(domains, domain => ({
            domain,
            available: true,
            years: 1,
            price: 13,
            renewalPrice: 14,
            premium: false,
          })),
        })
      } finally {
        stats.inFlight -= 1
      }
    })
    const implementation = yield* makeRegistrarCoordinatorImplementation(
      environment,
      fetchRegistrar,
    )

    return {
      ...implementation,
      fetch: Effect.gen(function* () {
        const request = yield* CoordinatorRequest

        if (request.url.endsWith('/restart')) {
          yield* state.abort('Restarting registrar test instance')
          return HttpServerResponse.empty({ status: 204 })
        } else if (request.url.endsWith('/stats')) {
          return HttpServerResponse.fromWeb(Response.json(stats))
        } else {
          return yield* implementation.fetch
        }
      }),
    }
  })

const fixtureEntrypoint = Worker(
  'Website',
  {},
  Effect.gen(function* () {
    const environment = yield* readFixtureEnvironment

    yield* DurableObject(
      'DOMAIN_QUOTES',
      Effect.succeed(makeFixtureDomainSearchImplementation(environment)),
    )
    yield* DurableObject(
      'REGISTRAR_BUDGET',
      Effect.succeed(makeFixtureRegistrarImplementation(environment)),
    )
    yield* DurableObject(
      'LOW_QUOTES',
      Effect.succeed(
        makeFixtureDomainSearchImplementation({
          ...environment,
          REGISTRAR_BUDGET: environment.LOW_BUDGET,
        }),
      ),
    )
    yield* DurableObject(
      'LOW_BUDGET',
      Effect.succeed(
        makeFixtureRegistrarImplementation({
          ...environment,
          REGISTRAR_REQUESTS_PER_SECOND: '2',
          REGISTRAR_REQUESTS_PER_MINUTE: '100',
          REGISTRAR_MAX_CONCURRENT: '2',
        }),
      ),
    )
    yield* DurableObject(
      'PERSISTENCE_BUDGET',
      Effect.succeed(
        makeFixtureRegistrarImplementation({
          ...environment,
          REGISTRAR_REQUESTS_PER_SECOND: '1000',
          REGISTRAR_REQUESTS_PER_MINUTE: '1',
        }),
      ),
    )

    return {}
  }),
)

const bridge: (className: string) => DurableObjectBridgeConstructor =
  makeDurableObjectBridge(NativeDurableObject, {
    entrypoint: fixtureEntrypoint,
    stack: { name: 'FoldkitDomainsCapacity', stage: 'test' },
  })

export class FixtureDomainSearchCoordinator extends bridge('DOMAIN_QUOTES') {}
export class FixtureRegistrarCoordinator extends bridge('REGISTRAR_BUDGET') {}
export class LowDomainSearchCoordinator extends bridge('LOW_QUOTES') {}
export class LowRegistrarCoordinator extends bridge('LOW_BUDGET') {}
export class PersistenceRegistrarCoordinator extends bridge(
  'PERSISTENCE_BUDGET',
) {}

const handlers = new WeakMap<
  FixtureEnvironment,
  {
    main: ReturnType<typeof makeCoordinatedDomainsRpc>
    low: ReturnType<typeof makeCoordinatedDomainsRpc>
  }
>()

export default {
  fetch(request: Request, environment: FixtureEnvironment) {
    if (request.url.includes('/persistence/')) {
      const [, , name, operation] = new URL(request.url).pathname.split('/')

      if (name === undefined || operation === undefined) {
        return new Response('Invalid persistence request', { status: 400 })
      }

      const response = environment.PERSISTENCE_BUDGET.getByName(name).fetch(
        new Request(`https://domains.internal/${operation}`, request),
      )

      if (operation === 'restart') {
        return response.catch(() => new Response(null, { status: 204 }))
      } else {
        return response
      }
    }

    const isLowBudget = request.url.includes('/low/')
    const namespace = isLowBudget
      ? environment.LOW_BUDGET
      : environment.REGISTRAR_BUDGET

    if (request.url.includes('/reopen/')) {
      const label = request.url.split('/reopen/').at(-1) ?? ''
      return environment.DOMAIN_QUOTES.getByName(label).fetch(
        new Request('https://domains.internal/reopen', request),
      )
    }

    if (request.url.includes('/expire/')) {
      const label = request.url.split('/expire/').at(-1) ?? ''
      return environment.DOMAIN_QUOTES.getByName(label).fetch(
        new Request('https://domains.internal/expire'),
      )
    }

    if (request.url.endsWith('/stats')) {
      return namespace
        .getByName('vercel')
        .fetch(new Request('https://domains.internal/stats'))
    }

    const existing = handlers.get(environment)
    const rpcHandlers = existing ?? {
      main: makeCoordinatedDomainsRpc(environment),
      low: makeCoordinatedDomainsRpc({
        ...environment,
        DOMAIN_QUOTES: environment.LOW_QUOTES,
      }),
    }
    handlers.set(environment, rpcHandlers)
    const rpc = isLowBudget ? rpcHandlers.low : rpcHandlers.main
    // NOTE: The local HTTP adapter does not forward disconnects; inject a native abort to test the Worker-to-Durable-Object boundary.
    const rpcRequest = new Request(
      request.url.replace('/low/rpc', '/rpc').replace('/abort/rpc', '/rpc'),
      {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: request.url.includes('/abort/rpc')
          ? AbortSignal.timeout(300)
          : request.signal,
      },
    )
    return rpc.handler(rpcRequest)
  },
}
