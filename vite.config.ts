import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({
      ssr: {
        serverEntry: '/src/server/entry.ts',
        clientEntry: '/src/client/entry.ts',
        build: { prerender: true },
      },
    }),
  ],
  optimizeDeps: { entries: ['src/client/entry.ts'] },
})
