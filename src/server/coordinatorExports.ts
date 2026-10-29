import { makeDurableObjectBridge } from '@alchemy.run/cloudflare/Workers/DurableObjectBridge'

import { coordinatorRuntime } from './coordinatorRuntime'

// NOTE: Node prerendering loads the server entry without Cloudflare; only workerd instantiates these exports.
const cloudflare = await import('cloudflare:workers').catch(() => undefined)

const makeNativeCoordinator = (name: string) =>
  cloudflare === undefined
    ? undefined
    : makeDurableObjectBridge(cloudflare.DurableObject, {
        entrypoint: coordinatorRuntime,
        stack: {
          name: 'FoldkitDomains',
          stage: cloudflare.env.COORDINATOR_STAGE ?? 'local',
        },
      })(name)

export const DomainSearchCoordinator = makeNativeCoordinator('DOMAIN_QUOTES')
export const RegistrarCoordinator = makeNativeCoordinator('REGISTRAR_BUDGET')
