import { type Page, expect } from '@playwright/test'

export const assertLoadedCleanly = async (page: Page): Promise<void> => {
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('#root')).toHaveCount(0)
  expect(errors).toEqual([])
}

export const scrollResultsToOffset = async (
  page: Page,
  offset: number,
): Promise<void> => {
  await page.locator('#domain-results').evaluate((surface, offset) => {
    const headerHeight =
      document.querySelector('.header')?.getBoundingClientRect().height ?? 0
    window.scrollTo({
      top:
        window.scrollY +
        surface.getBoundingClientRect().top +
        offset -
        headerHeight,
      behavior: 'instant',
    })
  }, offset)
}

export const scrollResultsToEnd = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'instant',
    })
  })
}
