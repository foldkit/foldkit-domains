import { expect, test } from '@playwright/test'

import { mockDomainSearch } from './api'

test.beforeEach(async ({ page }) => {
  await mockDomainSearch(page)
})

test('serves unknown paths with HTTP 404 and recovers through the Worker', async ({
  page,
  request,
}) => {
  const head = await request.head('/')
  expect(head.status()).toBe(200)
  expect(await head.body()).toHaveLength(0)

  const response = await page.goto('/missing')
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: '404 — Page Not Found' }),
  ).toBeVisible()
  await page.getByRole('link', { name: '← Back to Domains' }).click()
  await expect(page).toHaveURL('/')

  const input = page.getByRole('searchbox', { name: 'Search domains' })
  await input.fill('worker-search')
  await expect(page).toHaveURL(/q=worker-search/)
  await expect(page.locator('.domain-card').first()).toContainText(
    'worker-search.com',
  )
})

test('serves the RPC endpoint and bounds request bodies', async ({
  request,
}) => {
  const response = await request.post('/rpc', {
    data: { padding: 'x'.repeat(2000) },
  })
  expect(response.status()).toBe(413)
  expect(response.headers()['cache-control']).toBe('no-store')
})
