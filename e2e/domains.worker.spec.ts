import { expect, test } from '@playwright/test'

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
