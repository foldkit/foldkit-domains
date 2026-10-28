import * as Alchemy from 'alchemy'
import { Stage } from 'alchemy/Stage'
import { Config, Effect, Option } from 'effect'

import * as Cloudflare from '@alchemy.run/cloudflare'

export const Website = Cloudflare.Website.Foldkit(
  'Website',
  Effect.gen(function* () {
    const maybeAccessToken = yield* Config.Redacted('VERCEL_API_TOKEN').pipe(
      Config.option,
      Effect.orDie,
    )

    return {
      rootDir: '..',
      compatibility: {
        date: '2026-10-19',
        flags: [
          'nodejs_compat',
          'enable_request_signal',
          'request_signal_passthrough',
        ],
      },
      dev: { host: '127.0.0.1', port: 5195, strictPort: true },
      env: {
        COORDINATOR_STAGE: yield* Stage,
        DOMAIN_QUOTES: Cloudflare.DurableObject('DomainSearchCoordinator'),
        REGISTRAR_BUDGET: Cloudflare.DurableObject('RegistrarCoordinator'),
        REGISTRAR_REQUESTS_PER_SECOND: yield* Config.String(
          'REGISTRAR_REQUESTS_PER_SECOND',
        ).pipe(Config.withDefault('10'), Effect.orDie),
        REGISTRAR_REQUESTS_PER_MINUTE: yield* Config.String(
          'REGISTRAR_REQUESTS_PER_MINUTE',
        ).pipe(Config.withDefault('60'), Effect.orDie),
        REGISTRAR_MAX_CONCURRENT: yield* Config.String(
          'REGISTRAR_MAX_CONCURRENT',
        ).pipe(Config.withDefault('8'), Effect.orDie),
        ...Option.match(maybeAccessToken, {
          onNone: () => ({}),
          onSome: accessToken => ({ VERCEL_API_TOKEN: accessToken }),
        }),
      },
    }
  }),
)

export default Alchemy.Stack(
  'FoldkitDomains',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website

    return { url: website.url }
  }),
)
