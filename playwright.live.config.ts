import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/domains.live.spec.ts',
  outputDir: 'test-results/live',
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['DOMAINS_BASE_URL'] ?? 'http://127.0.0.1:5194',
    viewport: { width: 1280, height: 900 },
    video: 'on',
    trace: 'retain-on-failure',
  },
})
