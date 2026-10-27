import { Array, Layer, Schema } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'

import { DomainsRpcLayer } from '../../src/server/rpc'

const RegistrarRequest = Schema.Struct({ domains: Schema.Array(Schema.String) })
const PROVIDER_DELAY_MILLISECONDS = 500
const CANCELLED_SEARCH_DELAY_MILLISECONDS = 6000
let calls = 0
let inFlight = 0
let maximumInFlight = 0

const registrarFetch: typeof globalThis.fetch = async (input, init) => {
  const request = new Request(input, init)
  const { domains } = Schema.decodeUnknownSync(RegistrarRequest)(
    await request.json(),
  )
  calls += 1
  inFlight += 1
  maximumInFlight = Math.max(maximumInFlight, inFlight)

  try {
    const delay = Array.some(domains, domain => domain.startsWith('cancelled-'))
      ? CANCELLED_SEARCH_DELAY_MILLISECONDS
      : PROVIDER_DELAY_MILLISECONDS
    await new Promise<void>(resolve => setTimeout(resolve, delay))
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
    inFlight -= 1
  }
}

const rpc = HttpRouter.toWebHandler(
  DomainsRpcLayer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, registrarFetch)),
  ),
  { disableLogger: true },
)

export default {
  fetch(request: Request) {
    if (request.url.endsWith('/stats')) {
      return Response.json({ calls, inFlight, maximumInFlight })
    } else {
      return rpc.handler(request)
    }
  },
}
