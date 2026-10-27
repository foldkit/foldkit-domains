import { env } from 'cloudflare:workers'

import { makeSharedDomainsRpc } from './rpc'

export const sharedDomainsRpc = makeSharedDomainsRpc(env)
