import { env } from 'cloudflare:workers'

import { makeCoordinatedDomainsRpc } from './rpc'

export const coordinatedDomainsRpc = makeCoordinatedDomainsRpc(env)
