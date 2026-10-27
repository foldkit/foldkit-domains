import { Effect, Option, pipe } from 'effect'
import { Url } from 'foldkit'
import { Server } from 'foldkit/experimental'

import { ApplicationBlock } from './block'
import { bootstrapSearchInput } from './bootstrap'
import { DOMAINS_RPC_PATH } from './domainsRpc'
import { ApplicationRoute, urlToApplicationRoute } from './route'
import { searchInputConfig } from './searchInput'
import { domainsRpc } from './server/rpc'

export { DomainSearchCoordinator } from './server/domainSearchCoordinator'
export { RegistrarCoordinator } from './server/registrarCoordinator'

export const prerenderPaths: ReadonlyArray<string> = ['/']

export const renderDocument: Server.DocumentRenderer = (
  application,
  assets,
) => {
  const documentAssets = import.meta.env.DEV
    ? Server.DocumentAssets.make({
        ...assets,
        stylesheets: [
          `${import.meta.env.BASE_URL}src/styles.css?direct`,
          ...assets.stylesheets,
        ],
      })
    : assets

  return Server.renderDocument(application, documentAssets, {
    head: '<meta name="color-scheme" content="dark">',
  }).replace(
    '<script type="module"',
    `<script>(${bootstrapSearchInput.toString()})(${JSON.stringify(searchInputConfig)});</script><script type="module"`,
  )
}

export const renderPage = (request: Request): Promise<Server.EntryResult> => {
  const isRpcRequest = Option.exists(
    Url.fromString(request.url),
    url =>
      url.pathname === DOMAINS_RPC_PATH ||
      url.pathname === `${DOMAINS_RPC_PATH}/`,
  )

  if (isRpcRequest) {
    return (
      import.meta.env.DEV
        ? domainsRpc.handler(request)
        : import('./server/cloudflareRpc').then(({ sharedDomainsRpc }) =>
            sharedDomainsRpc.handler(request),
          )
    ).then(Server.Responded)
  }

  const status = pipe(
    Url.fromString(request.url),
    Option.map(urlToApplicationRoute),
    Option.match({
      onNone: () => 404,
      onSome: ApplicationRoute.match({
        Search: () => 200,
        NotFound: () => 404,
      }),
    }),
  )

  return Effect.runPromise(
    Server.renderToString(
      ApplicationBlock,
      { routing: {} },
      { url: request.url },
    ).pipe(Effect.map(application => Server.Rendered(application, { status }))),
  )
}
