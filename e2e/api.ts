import { Array, Effect, Layer, Option } from 'effect'
import { HttpRouter } from 'effect/http'

import type { Page } from '@playwright/test'

import { Domain, QueryWindow, domainNames, domainTlds } from '../src/domain'
import { makeDomainFixtures } from '../src/domain.fixture'
import { DOMAINS_RPC_PATH, DomainsRpcs, SearchError } from '../src/domainsRpc'
import { DomainsRpcRoutes } from '../src/server/rpc'

export const mockDomainSearch = async (
  page: Page,
  search: (
    label: string,
    window: typeof QueryWindow.Type,
  ) => Effect.Effect<
    ReadonlyArray<typeof Domain.Type>,
    typeof SearchError.Type
  > = label => Effect.succeed(makeDomainFixtures(label)),
): Promise<void> => {
  const rpc = HttpRouter.toWebHandler(
    DomainsRpcRoutes.pipe(
      HttpRouter.provideRequest(
        DomainsRpcs.toLayer({
          SearchDomains: ({ label, offset = 0, limit = domainTlds.length }) =>
            search(label, { offset, limit }).pipe(
              Effect.map(quotes =>
                Array.map(
                  Array.take(Array.drop(domainNames(label), offset), limit),
                  name =>
                    Array.findFirst(
                      quotes,
                      quote => quote.name === name.name,
                    ).pipe(Option.getOrElse(() => Domain.Unconfirmed(name))),
                ),
              ),
            ),
        }),
      ),
    ),
    { disableLogger: true },
  )
  page.once('close', () => {
    void rpc.dispose()
  })

  await page.route(`**${DOMAINS_RPC_PATH}{,/}`, async route => {
    const request = route.request()
    const response = await rpc.handler(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: request.postData(),
      }),
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    })
  })
}
