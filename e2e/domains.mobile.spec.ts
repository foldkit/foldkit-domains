import { Effect } from 'effect'

import { devices, expect, test } from '@playwright/test'

import { makeDomainFixtures } from '../src/shared/domain.fixture'
import { mockDomainSearch } from './api'

test.beforeEach(async ({ page }) => {
  await mockDomainSearch(page)
})

const MIN_TOUCH_TARGET_SIZE_PX = 44
const PHONE_VIEWPORTS = [
  { name: 'narrow portrait', width: 320, height: 568 },
  { name: 'portrait', width: 390, height: 664 },
  { name: 'landscape', width: 844, height: 390 },
]

for (const { name, width, height } of PHONE_VIEWPORTS) {
  test(`mobile search supports focus, viewport changes, filters, and clearing in ${name}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('The domain example requires a base URL')
    }

    const context = await browser.newContext({
      ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 5'],
      viewport: { width, height },
      baseURL,
    })
    const page = await context.newPage()
    await mockDomainSearch(page)
    const errors: Array<string> = []
    page.on('pageerror', error => errors.push(error.message))

    try {
      await page.goto('/')
      const input = page.getByRole('searchbox', { name: 'Search domains' })
      await expect(input).not.toBeFocused()
      await expect(input).toHaveCSS('font-size', '16px')
      await expect(input).toHaveAttribute('enterkeyhint', 'search')
      const originalInput = await input.elementHandle()
      await input.tap()
      await expect(input).toBeFocused()
      await input.fill('mobile-idea')
      await expect(page.locator('.results .price').first()).toBeVisible()

      const filtersAndSort = page.getByRole('button', {
        name: 'Filters and sort',
      })

      for (const control of [
        page.getByRole('button', { name: 'Clear search' }),
        page.getByRole('button', { name: /^Cart,/ }),
        page.getByRole('combobox', { name: 'Filter by TLD' }),
        filtersAndSort,
      ]) {
        const bounds = await control.boundingBox()
        expect(bounds?.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_SIZE_PX)
        expect(bounds?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_SIZE_PX)
      }

      await input.press('Enter')
      await expect(input).not.toBeFocused()
      await expect(input).toHaveValue('mobile-idea')
      await input.tap()
      await page.setViewportSize({ width, height: 320 })
      await expect(input).toBeFocused()
      await expect(input).toBeInViewport()
      await expect(input).toHaveValue('mobile-idea')
      await page.setViewportSize({ width, height })
      await filtersAndSort.tap()
      const filtersDialog = page.getByRole('dialog', {
        name: 'Filters and sort',
      })
      const availability = filtersDialog.getByRole('combobox', {
        name: 'Filter availability',
      })
      const sort = filtersDialog.getByRole('combobox', {
        name: 'Sort results',
      })
      const closeFilters = filtersDialog.getByRole('button', { name: 'Done' })
      await expect(filtersDialog).toBeVisible()
      for (const control of [availability, sort, closeFilters]) {
        const bounds = await control.boundingBox()
        expect(bounds?.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_SIZE_PX)
        expect(bounds?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_SIZE_PX)
      }
      await sort.selectOption('PriceDescending')
      await availability.selectOption('Available')
      const sortTextFits = await sort.evaluate(element => {
        if (!(element instanceof HTMLSelectElement)) {
          return false
        }

        const style = getComputedStyle(element)
        const canvas = document.createElement('canvas')
        const drawing = canvas.getContext('2d')
        if (drawing === null) {
          return false
        }

        drawing.font = style.font
        const selected = element.selectedOptions.item(0)
        const textWidth = drawing.measureText(selected?.textContent ?? '').width
        return (
          textWidth <=
          element.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight)
        )
      })
      expect(sortTextFits).toBe(true)
      await closeFilters.tap()
      await expect(filtersDialog).toBeHidden()
      await expect(page.locator('.domain-row').first()).toContainText('$80.00')
      await page
        .getByRole('combobox', { name: 'Filter by TLD' })
        .selectOption('App')
      await expect(page.locator('.result-count')).toHaveText(
        '1 domains · Registration prices in USD',
      )
      await expect(page.locator('#domain-results .domain-row')).toHaveCount(1)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)

      await page.getByRole('button', { name: 'Clear search' }).tap()
      await expect(input).toHaveValue('')
      await expect(input).toBeFocused()
      await expect(input).toBeInViewport()
      await expect(page).toHaveURL('/')
      await page.getByText('A Foldkit example', { exact: true }).tap()
      await expect(input).not.toBeFocused()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(
        await originalInput?.evaluate(
          element => element === document.getElementById('domain-search'),
        ),
      ).toBe(true)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}

for (const phase of ['before hydration', 'after hydration']) {
  test(`tapping Domains focuses search during the mobile gesture ${phase}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('The domain example requires a base URL')
    }

    const context = await browser.newContext({
      ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 5'],
      baseURL,
    })
    const page = await context.newPage()
    await mockDomainSearch(page)
    let releaseBundle = () => {}
    const bundleGate = new Promise<void>(resolve => {
      releaseBundle = resolve
    })
    await page.route('**/assets/*.js', async route => {
      await bundleGate
      await route.continue()
    })

    try {
      await page.goto('/?q=acme', { waitUntil: 'commit' })
      const input = page.getByRole('searchbox', { name: 'Search domains' })
      await expect(input).toHaveValue('acme')
      await expect(input).not.toBeFocused()
      const originalInput = await input.elementHandle()

      if (phase === 'after hydration') {
        releaseBundle()
        await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
      }

      await page.evaluate(() => {
        document.addEventListener('click', event => {
          if (
            event.target instanceof Element &&
            event.target.closest('a.brand') !== null
          ) {
            document.documentElement.setAttribute(
              'data-focus-on-domains-click',
              document.activeElement?.id ?? '',
            )
          }
        })
      })
      await page.getByRole('link', { name: 'Domains home' }).tap()
      await expect(page.locator('html')).toHaveAttribute(
        'data-focus-on-domains-click',
        'domain-search',
      )
      await expect(input).toBeFocused()
      await expect(input).toBeInViewport()
      await expect(input).toHaveValue('')
      await expect(page).toHaveURL('/')
      await input.fill('ready-to-type')
      releaseBundle()
      await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('ready-to-type')
      await expect(page).toHaveURL(/q=ready-to-type/)
      await expect(page.locator('.domain-card').first()).toContainText(
        'ready-to-type.com',
      )
      expect(
        await originalInput?.evaluate(
          element => element === document.getElementById('domain-search'),
        ),
      ).toBe(true)
    } finally {
      releaseBundle()
      await context.close()
    }
  })
}

test('mobile submission dismisses focus before hydration and preserves the query at handoff', async ({
  browser,
  browserName,
  baseURL,
}) => {
  if (baseURL === undefined) {
    throw new Error('The domain example requires a base URL')
  }

  const context = await browser.newContext({
    ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 5'],
    baseURL,
  })
  const page = await context.newPage()
  await mockDomainSearch(page)
  let releaseBundle = () => {}
  const bundleGate = new Promise<void>(resolve => {
    releaseBundle = resolve
  })
  await page.route('**/assets/*.js', async route => {
    await bundleGate
    await route.continue()
  })

  try {
    await page.goto('/', { waitUntil: 'commit' })
    const input = page.getByRole('searchbox', { name: 'Search domains' })
    await expect(input).toBeVisible()
    const originalInput = await input.elementHandle()
    await input.tap()
    await input.fill('early-mobile')
    await input.press('Enter')
    await expect(input).not.toBeFocused()
    await expect(input).toHaveValue('early-mobile')
    await expect(page).toHaveURL(/q=early-mobile/)
    releaseBundle()
    await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
    await expect(input).not.toBeFocused()
    await expect(input).toHaveValue('early-mobile')
    await expect(page.locator('.domain-card').first()).toContainText(
      'early-mobile.com',
    )
    expect(
      await originalInput?.evaluate(
        element => element === document.getElementById('domain-search'),
      ),
    ).toBe(true)
  } finally {
    releaseBundle()
    await context.close()
  }
})

for (const { name, width, height } of PHONE_VIEWPORTS.filter(
  viewport => viewport.width >= 390,
)) {
  test(`mobile cart traps focus, locks page scrolling, and restores focus in ${name}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('The domain example requires a base URL')
    }

    const context = await browser.newContext({
      ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 5'],
      viewport: { width, height },
      baseURL,
    })
    const page = await context.newPage()
    await mockDomainSearch(page)

    try {
      await page.goto('/?q=acme')
      await page
        .locator('.domain-card')
        .getByRole('button', { name: 'Add acme.com to cart', exact: true })
        .tap()
      const input = page.getByRole('searchbox', { name: 'Search domains' })
      const trigger = page.getByRole('button', { name: 'Cart, 1 domains' })
      await page.evaluate(() => window.scrollTo(0, 100))
      await trigger.tap()
      const dialog = page.getByRole('dialog', { name: 'Your cart' })
      const close = page.getByRole('button', { name: 'Close cart panel' })
      await expect(dialog).toBeVisible()
      await expect(close).toBeFocused()
      await expect(page.locator('html')).toHaveCSS('overflow', 'hidden')
      await page.keyboard.press('Shift+Tab')
      expect(
        await dialog.evaluate(element =>
          element.contains(document.activeElement),
        ),
      ).toBe(true)
      const scrollOffset = await page.evaluate(() => scrollY)
      if (browserName === 'webkit') {
        await page.keyboard.press('PageDown')
      } else {
        await page.mouse.move(width / 2, height / 2)
        await page.mouse.wheel(0, 200)
      }
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollOffset)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await expect(input).toHaveValue('acme')
      await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollOffset)

      await trigger.tap()
      await expect(close).toBeFocused()
      await close.tap()
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await trigger.tap()
      await page.setViewportSize({ width: 844, height: 320 })
      await page
        .locator('.dialog-backdrop')
        .click({ position: { x: 20, y: 100 } })
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
    } finally {
      await context.close()
    }
  })
}

test('mobile results use page scrolling beneath the pinned navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?q=acme')
  await expect(page.locator('.domain-card .price').first()).toBeVisible()
  const results = page.getByRole('list', { name: 'All domain results' })
  await expect(results).toHaveCSS('overflow-y', 'visible')
  await expect
    .poll(() => results.evaluate(element => element.clientHeight))
    .toBeGreaterThan(844)
  await page.mouse.move(195, 500)
  await page.mouse.wheel(0, 500)
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
  const firstScroll = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 400)
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(firstScroll)
  await expect
    .poll(() => results.evaluate(element => element.scrollTop))
    .toBe(0)
  await expect
    .poll(() =>
      page
        .locator('.header')
        .evaluate(element => element.getBoundingClientRect().top),
    )
    .toBe(0)
  await expect(
    page.getByRole('searchbox', { name: 'Search domains' }),
  ).toBeInViewport()
})

test('mobile results use a dark two-row header and single-column layout', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?q=foldkit')
  await expect(page.locator('.domain-card').first()).toContainText(
    'Not available',
  )
  await expect(page.locator('.domain-card .price').first()).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')

  const geometry = await page.evaluate(() => {
    const bounds = (element: Element | null) => {
      if (element === null) {
        throw new Error('Expected responsive layout element')
      }

      const rect = element.getBoundingClientRect()
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      }
    }
    const itemBounds = (selector: string) =>
      [...document.querySelectorAll(selector)]
        .slice(0, 4)
        .map(element => bounds(element))

    return {
      viewportWidth: innerWidth,
      header: bounds(document.querySelector('.header')),
      brand: bounds(document.querySelector('.brand')),
      search: bounds(document.querySelector('form.search')),
      topResults: bounds(document.querySelector('.top-results')),
      cards: itemBounds('.top-results .domain-card'),
      rowGroup: bounds(document.querySelector('.domain-row-group')),
      rows: itemBounds('.domain-row-group .domain-row'),
      scrollWidth: document.documentElement.scrollWidth,
    }
  })

  expect(geometry.header.y).toBe(0)
  expect(geometry.header.height).toBeCloseTo(129, 0)
  expect(geometry.search.x).toBeCloseTo(16, 0)
  expect(geometry.search.y).toBeCloseTo(75, 0)
  expect(geometry.search.width).toBeCloseTo(geometry.viewportWidth - 32, 0)
  expect(geometry.search.height).toBeCloseTo(44, 0)
  expect(geometry.search.y).toBeGreaterThan(geometry.brand.bottom)
  expect(geometry.search.bottom).toBeLessThanOrEqual(geometry.header.bottom)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)

  const expectSingleColumn = (
    items: ReadonlyArray<{
      x: number
      y: number
      width: number
      bottom: number
    }>,
    container: { x: number; width: number },
  ) => {
    expect(items).toHaveLength(4)

    items.reduce<number | undefined>((previousBottom, item) => {
      expect(item.x).toBeCloseTo(container.x, 0)
      expect(item.width).toBeCloseTo(container.width, 0)

      if (previousBottom !== undefined) {
        expect(item.y).toBeGreaterThanOrEqual(previousBottom)
      }

      return item.bottom
    }, undefined)
  }

  expectSingleColumn(geometry.cards, geometry.topResults)
  expectSingleColumn(geometry.rows, geometry.rowGroup)
  const [unavailableCard, , availableCard] = geometry.cards
  const [unavailableRow, , availableRow] = geometry.rows

  if (
    unavailableCard === undefined ||
    availableCard === undefined ||
    unavailableRow === undefined ||
    availableRow === undefined
  ) {
    throw new Error('Expected available and unavailable mobile results')
  }

  expect(unavailableCard.height).toBeCloseTo(availableCard.height, 0)
  expect(unavailableRow.height).toBeCloseTo(availableRow.height, 0)
  await page.screenshot({ path: testInfo.outputPath('mobile-results.png') })
  await page
    .getByRole('button', { name: 'Filters and sort', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Filters and sort' }),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-filters.png') })
})

for (const phase of ['before hydration', 'after hydration']) {
  test(`first mobile typing keeps Top Results in view ${phase}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('The domain example requires a base URL')
    }

    const context = await browser.newContext({
      ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 5'],
      viewport: { width: 390, height: 664 },
      baseURL,
    })
    const page = await context.newPage()
    let releaseBundle = () => {}
    const bundleGate = new Promise<void>(resolve => {
      releaseBundle = resolve
    })
    let releaseQuotes = () => {}
    const quoteGate = new Promise<void>(resolve => {
      releaseQuotes = resolve
    })
    await mockDomainSearch(page, label =>
      Effect.promise(() => quoteGate).pipe(
        Effect.as(makeDomainFixtures(label)),
      ),
    )
    await page.addInitScript(() => {
      window.addEventListener('scroll', () => {
        const maximum = Math.max(
          Number(document.documentElement.getAttribute('data-max-page-scroll')),
          window.scrollY,
        )
        document.documentElement.setAttribute(
          'data-max-page-scroll',
          String(maximum),
        )
      })
    })
    if (phase === 'before hydration') {
      await page.route('**/assets/*.js', async route => {
        await bundleGate
        await route.continue()
      })
    }

    try {
      await page.goto('/', { waitUntil: 'commit' })
      const input = page.getByRole('searchbox', { name: 'Search domains' })
      const heading = page.getByRole('heading', {
        name: 'Top Results',
        exact: true,
      })
      if (phase === 'after hydration') {
        await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
      }
      await input.tap()
      for (const query of ['d', 'de']) {
        await input.fill(query)
        await expect(page.locator('.domain-card').first()).toContainText(
          `${query}.com`,
        )
        await expect(heading).toBeInViewport()
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      }
      await expect(page.locator('.results .price')).toHaveCount(0)
      releaseBundle()
      await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
      await expect(
        page.locator('#domain-results [data-virtual-list-item-index]').first(),
      ).toBeAttached()
      await expect(heading).toBeInViewport()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      releaseQuotes()
      await expect(page.locator('.domain-card .price').first()).toBeVisible()
      await expect(heading).toBeInViewport()
      await input.pressSequentially('v')
      await expect(page.locator('.domain-card').first()).toContainText(
        'dev.com',
      )
      await expect(page.locator('.domain-card .price').first()).toBeVisible()
      await expect(heading).toBeInViewport()

      await page.getByRole('button', { name: 'Clear search, Esc' }).tap()
      await expect(input).toHaveValue('')
      await expect(page.locator('#domain-results')).toHaveCount(0)
      await input.fill('fresh')
      await expect(page.locator('.domain-card .price').first()).toBeVisible()
      await expect(heading).toBeInViewport()
      await expect(input).toBeFocused()
      expect(
        await page.evaluate(() =>
          Number(document.documentElement.getAttribute('data-max-page-scroll')),
        ),
      ).toBe(0)
    } finally {
      releaseBundle()
      releaseQuotes()
      await context.close()
    }
  })
}
