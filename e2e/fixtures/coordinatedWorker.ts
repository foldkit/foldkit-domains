import { Array, Clock, Effect, Schema } from 'effect'

import type { DurableObjectState } from '@cloudflare/workers-types'

import type { SearchEnvironment } from '../../src/server/coordination'
import { DomainSearchCoordinator } from '../../src/server/domainSearchCoordinator'
import { RegistrarCoordinator } from '../../src/server/registrarCoordinator'
import { makeCoordinatedDomainsRpc } from '../../src/server/rpc'

const RegistrarRequest = Schema.Struct({ domains: Schema.Array(Schema.String) })

export class FixtureDomainSearchCoordinator extends DomainSearchCoordinator {
  private readonly fixtureState: DurableObjectState
  private readonly fixtureEnvironment: SearchEnvironment

  constructor(state: DurableObjectState, environment: SearchEnvironment) {
    super(state, environment)
    this.fixtureState = state
    this.fixtureEnvironment = environment
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.url.endsWith('/expire')) {
      const entries = await this.fixtureState.storage.list<{
        expiresAt: number
      }>()
      const nowMillis = Effect.runSync(Clock.currentTimeMillis)

      for (const [key, entry] of entries) {
        await this.fixtureState.storage.put(key, {
          ...entry,
          expiresAt: nowMillis - 1,
        })
      }

      await this.alarm()
      return new Response(null, { status: 204 })
    } else if (request.url.endsWith('/reopen')) {
      const coordinator = new DomainSearchCoordinator(
        this.fixtureState,
        this.fixtureEnvironment,
      )
      return coordinator.fetch(
        new Request('https://domains.internal/search', request),
      )
    } else {
      return super.fetch(request)
    }
  }
}

export class FixtureRegistrarCoordinator extends RegistrarCoordinator {
  private readonly fixtureState: DurableObjectState
  private readonly instanceId = crypto.randomUUID()

  constructor(state: DurableObjectState, environment: SearchEnvironment) {
    super(state, environment)
    this.fixtureState = state
  }

  private calls = 0
  private inFlight = 0
  private maximumInFlight = 0
  private aborted = 0
  private readonly starts: Array<number> = []
  private readonly failed = new Set<string>()
  private readonly throttled = new Set<string>()

  protected override readonly fetchRegistrar: typeof globalThis.fetch = async (
    input,
    init,
  ) => {
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
    this.calls += 1
    this.inFlight += 1
    this.maximumInFlight = Math.max(this.maximumInFlight, this.inFlight)
    this.starts.push(Effect.runSync(Clock.currentTimeMillis))

    try {
      if (
        Array.some(domains, domain => domain.startsWith('failure-once-')) &&
        !this.failed.has(firstName)
      ) {
        this.failed.add(firstName)
        return new Response(null, { status: 503 })
      }

      if (isThrottled && !this.throttled.has(firstName)) {
        this.throttled.add(firstName)
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
          this.aborted += 1
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
      this.inFlight -= 1
    }
  }

  override fetch(request: Request): Promise<Response> {
    if (request.url.endsWith('/restart')) {
      this.fixtureState.abort('Restarting registrar test instance')
      return Promise.resolve(new Response(null, { status: 204 }))
    }

    if (request.url.endsWith('/stats')) {
      return Promise.resolve(
        Response.json({
          instanceId: this.instanceId,
          calls: this.calls,
          inFlight: this.inFlight,
          maximumInFlight: this.maximumInFlight,
          aborted: this.aborted,
          starts: this.starts,
        }),
      )
    } else {
      return super.fetch(request)
    }
  }
}

interface FixtureEnvironment extends SearchEnvironment {
  readonly LOW_QUOTES: SearchEnvironment['DOMAIN_QUOTES']
  readonly LOW_BUDGET: SearchEnvironment['REGISTRAR_BUDGET']
  readonly PERSISTENCE_BUDGET: SearchEnvironment['REGISTRAR_BUDGET']
}

export class LowDomainSearchCoordinator extends DomainSearchCoordinator {
  constructor(state: DurableObjectState, environment: FixtureEnvironment) {
    super(state, { ...environment, REGISTRAR_BUDGET: environment.LOW_BUDGET })
  }
}

export class LowRegistrarCoordinator extends FixtureRegistrarCoordinator {
  constructor(state: DurableObjectState, environment: FixtureEnvironment) {
    super(state, {
      ...environment,
      REGISTRAR_REQUESTS_PER_SECOND: '2',
      REGISTRAR_REQUESTS_PER_MINUTE: '100',
      REGISTRAR_MAX_CONCURRENT: '2',
    })
  }
}

export class PersistenceRegistrarCoordinator extends FixtureRegistrarCoordinator {
  constructor(state: DurableObjectState, environment: FixtureEnvironment) {
    super(state, {
      ...environment,
      REGISTRAR_REQUESTS_PER_SECOND: '1000',
      REGISTRAR_REQUESTS_PER_MINUTE: '1',
    })
  }
}

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
