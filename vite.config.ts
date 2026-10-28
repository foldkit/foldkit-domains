import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    tailwindcss(),
    {
      name: 'domains:refresh-ssr-definitions',
      apply: 'serve',
      handleHotUpdate({ server }) {
        server.environments.ssr?.moduleGraph.invalidateAll()
      },
    },
    foldkit({
      // NOTE: This preview assigns separate dev identities to client and SSR environments; use one shared development identity.
      ...(command === 'serve' && !isPreview ? { buildId: 'development' } : {}),
      ssr: {
        serverEntry: '/src/server/entry.ts',
        clientEntry: '/src/client/entry.ts',
        build: { prerender: true },
      },
    }),
  ],
  ssr: { external: ['cloudflare:workers'] },
  environments: {
    ssr: { build: { rolldownOptions: { external: ['cloudflare:workers'] } } },
  },
  optimizeDeps: { entries: ['src/client/entry.ts'] },
}))
