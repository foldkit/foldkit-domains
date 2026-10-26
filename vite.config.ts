import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
      ssr: {
        serverEntry: '/src/entry.server.ts',
        clientEntry: '/src/entry.ts',
        build: { prerender: true },
      },
    }),
  ],
  optimizeDeps: { entries: ['src/entry.ts'] },
})
