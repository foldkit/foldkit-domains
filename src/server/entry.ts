import { Option } from 'effect'
import { Url } from 'foldkit'
import { Server } from 'foldkit/experimental'

import { renderPage as renderApplicationPage } from '../client/entry.server'
import { DOMAINS_RPC_PATH } from '../shared/domainsRpc'
import { domainsRpc } from './rpc'

export { prerenderPaths, renderDocument } from '../client/entry.server'
export { DomainSearchCoordinator } from './domainSearchCoordinator'
export { RegistrarCoordinator } from './registrarCoordinator'

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
        : import('./cloudflareRpc').then(({ coordinatedDomainsRpc }) =>
            coordinatedDomainsRpc.handler(request),
          )
    ).then(Server.Responded)
  } else {
    return renderApplicationPage(request)
  }
}
