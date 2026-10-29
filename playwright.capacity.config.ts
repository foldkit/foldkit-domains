import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

const stateDirectory = mkdtempSync(join(tmpdir(), 'foldkit-domains-capacity-'))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/domains.capacity.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/capacity.json' }]],
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5184' },
  webServer: {
    command: `pnpm exec wrangler dev --local --config e2e/fixtures/coordinated.wrangler.jsonc --ip 127.0.0.1 --port 5184 --persist-to ${stateDirectory}`,
    url: 'http://127.0.0.1:5184/stats',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
