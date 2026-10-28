import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/domains.timing.spec.ts',
  outputDir: 'test-results/timing',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 25_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['DOMAINS_BASE_URL'] ?? 'http://127.0.0.1:5196',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'x-domains-timing': '1' },
    trace: 'off',
  },
})
