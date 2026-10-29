import { type Locator, type Page, expect } from '@playwright/test'

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

export const chooseFilterOption = async (
  scope: Page | Locator,
  name: string,
  option: string,
): Promise<void> => {
  const trigger = scope.getByRole('button', { name, exact: false })
  const popupRole = await trigger.getAttribute('aria-haspopup')
  await trigger.click()

  if (popupRole === 'dialog') {
    const dialog = scope.getByRole('dialog', { name, exact: true })
    await dialog.getByRole('button', { name: option, exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    return
  }

  const listbox = scope.getByRole('listbox', { name, exact: false })
  await listbox.getByRole('option', { name: option, exact: true }).click()
  await expect(listbox).toBeHidden()
  await expect(trigger).toBeFocused()
}

export const acknowledgeLiveWarning = async (page: Page): Promise<void> => {
  const warning = page.getByRole('dialog', { name: 'Before you go Live' })
  const checkbox = warning.getByRole('checkbox', {
    name: 'I promise',
  })
  const continueButton = warning.getByRole('button', {
    name: 'Continue to Live',
  })
  await expect(warning).toBeVisible()
  await expect(checkbox).toBeFocused()
  await expect(checkbox).not.toBeChecked()
  await expect(continueButton).toBeDisabled()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await continueButton.click()
  await expect(warning).toBeHidden()
}

export const chooseDataSource = async (
  page: Page,
  dataSource: 'Demo' | 'Live',
): Promise<void> => {
  const trigger = page.getByRole('button', { name: /^Data source:/ })
  await trigger.click()
  await page.getByRole('option', { name: new RegExp(`^${dataSource}`) }).click()
  await expect(
    page.getByRole('listbox', { name: /^Data source:/ }),
  ).toBeHidden()
  if (dataSource === 'Live') {
    await acknowledgeLiveWarning(page)
  }
  await expect(trigger).toBeFocused()
}
