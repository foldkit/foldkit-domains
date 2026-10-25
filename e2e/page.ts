import { type Page, expect } from '@playwright/test'

export const assertLoadedCleanly = async (page: Page): Promise<void> => {
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('#root')).toHaveCount(0)
  expect(errors).toEqual([])
}
