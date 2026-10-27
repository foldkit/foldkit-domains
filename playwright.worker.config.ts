import { defineConfig } from '@playwright/test'

import productionConfig from './playwright.config'

const PORT = 5182
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  ...productionConfig,
  testMatch: ['**/domains.spec.ts', '**/domains.worker.spec.ts'],
  use: { ...productionConfig.use, baseURL: BASE_URL },
  webServer: {
    command: `pnpm build && pnpm exec wrangler dev --local --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
