import {
  type Page as PlaywrightPage,
  devices,
  expect,
  test,
} from '@playwright/test'

import * as Page from './page'

const holdEarlyScript = async (page: PlaywrightPage) => {
  let earlyScript = ''
  let releaseScript = () => {}
  const scriptGate = new Promise<void>(resolve => {
    releaseScript = resolve
  })
  await page.route('**/?q=from-url', async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(
      /<script>([\s\S]*?)<\/script>/,
      (_script, source: string) => {
        earlyScript = source
        return '<script src="/early-search.js"></script>'
      },
    )
    expect(earlyScript).toContain('domains:ready')
    await route.fulfill({ response, body })
  })
  await page.route('**/early-search.js', async route => {
    await scriptGate
    await route.fulfill({ contentType: 'text/javascript', body: earlyScript })
  })

  return releaseScript
}

test('serves an editable search field in static HTML', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(
    page.getByRole('searchbox', { name: 'Search domains' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Find a domain foryour next big idea.',
  )
  await expect(page.locator('[data-foldkit-app]')).toHaveCount(1)
  await context.close()
})

test('preserves early typing, focus, selection, and the input node through hydration', async ({
  page,
}) => {
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))
  let releaseBundle = () => {}
  const bundleGate = new Promise<void>(resolve => {
    releaseBundle = resolve
  })
  await page.route('**/assets/*.js', async route => {
    await bundleGate
    await route.continue()
  })

  try {
    await page.goto('/?q=from-url', { waitUntil: 'commit' })
    const input = page.getByRole('searchbox', { name: 'Search domains' })
    await expect(input).toHaveValue('from-url')
    await expect(input).toBeFocused()
    await expect(
      page.getByRole('status', { name: 'Searching domains' }),
    ).toBeVisible()
    await expect(page.locator('[data-foldkit-app]')).toHaveCount(1)
    const originalInput = await input.elementHandle()
    expect(originalInput).not.toBeNull()

    await input.fill('typed-before-hydration')
    await input.evaluate(element => {
      if (element instanceof HTMLInputElement) {
        element.setSelectionRange(3, 8)
      }
    })
    await expect(page).toHaveURL(/q=typed-before-hydration/)
    await expect(page.locator('.domain-card').first()).toContainText(
      'typed-before-hydration.com',
    )
    await expect(
      page.locator('.results-preview .domain-row').last(),
    ).toContainText('typed-before-hydration.')
    await expect(page.locator('.results .price')).toHaveCount(0)
    releaseBundle()

    await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
    await expect(input).toHaveValue('typed-before-hydration')
    await expect(input).toBeFocused()
    expect(
      await originalInput?.evaluate(
        element => element === document.getElementById('domain-search'),
      ),
    ).toBe(true)
    expect(
      await input.evaluate(element =>
        element instanceof HTMLInputElement
          ? [element.selectionStart, element.selectionEnd]
          : [],
      ),
    ).toEqual([3, 8])
    await expect(page.locator('.domain-card').first()).toContainText(
      'typed-before-hydration.com',
    )
    expect(errors).toEqual([])
  } finally {
    releaseBundle()
  }
})

test('preserves input typed before the early script arrives', async ({
  page,
}) => {
  const releaseScript = await holdEarlyScript(page)

  try {
    await page.goto('/?q=from-url', { waitUntil: 'commit' })
    const input = page.getByRole('searchbox', { name: 'Search domains' })
    await input.fill('typed-during-stream')
    releaseScript()
    await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
    await expect(input).toHaveValue('typed-during-stream')
    await expect(input).toBeFocused()
    await expect(page).toHaveURL(/q=typed-during-stream/)
    await expect(page.locator('.domain-card').first()).toContainText(
      'typed-during-stream.com',
    )
  } finally {
    releaseScript()
  }
})

test('prefills the URL query after the field receives early focus', async ({
  page,
}) => {
  const releaseScript = await holdEarlyScript(page)

  try {
    await page.goto('/?q=from-url', { waitUntil: 'commit' })
    const input = page.getByRole('searchbox', { name: 'Search domains' })
    await input.click()
    await expect(input).toHaveValue('')
    releaseScript()
    await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
    await expect(input).toHaveValue('from-url')
    await expect(input).toBeFocused()
    await expect(page).toHaveURL(/q=from-url/)
    await expect(page.locator('.domain-card').first()).toContainText(
      'from-url.com',
    )
  } finally {
    releaseScript()
  }
})

test('first mobile tap moves the same input into the header before hydration', async ({
  browser,
  baseURL,
}, testInfo) => {
  if (baseURL === undefined) {
    throw new Error('The domain example requires a base URL')
  }

  const context = await browser.newContext({ ...devices['iPhone 13'], baseURL })
  const page = await context.newPage()
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
    await expect(input).not.toBeFocused()
    expect((await input.boundingBox())?.y).toBeGreaterThan(200)
    await input.tap()
    await expect(input).toBeFocused()
    await expect
      .poll(async () => (await input.boundingBox())?.y)
      .toBeLessThan(30)
    await input.fill('mobile-idea')
    releaseBundle()
    await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
    await expect(input).toHaveValue('mobile-idea')
    await expect(input).toBeFocused()
    expect(await originalInput?.evaluate(element => element.isConnected)).toBe(
      true,
    )
    await expect(page.locator('.domain-card').first()).toContainText(
      'mobile-idea.com',
    )
    await page.screenshot({ path: testInfo.outputPath('domains-mobile.png') })
  } finally {
    releaseBundle()
    await context.close()
  }
})

test('searches, filters, sorts, and manages the cart', async ({
  page,
}, testInfo) => {
  await Page.assertLoadedCleanly(page)
  const input = page.getByRole('searchbox', { name: 'Search domains' })
  await input.fill('foldkit')
  await expect(page.locator('.domain-card').first()).toContainText(
    'foldkit.com',
  )
  await expect(page.locator('.domain-card').first()).toContainText(
    'Unavailable',
  )
  await page.screenshot({ path: testInfo.outputPath('domains-desktop.png') })
  await page.getByLabel('Filter availability').selectOption('Available')
  await expect(page.locator('.result-count')).toHaveText(
    '554 domains · Prices per year in USD',
  )
  expect(
    await page.locator('#domain-results .domain-row').count(),
  ).toBeLessThan(60)
  await page.getByLabel('Sort results').selectOption('PriceAscending')
  await expect(
    page.locator('#domain-results .domain-row').first(),
  ).toContainText('$1.99')
  await page.getByLabel('Filter by TLD').selectOption('Com')
  await expect(page.getByRole('status')).toContainText([
    'No domains match',
    '0 domains',
  ])
  await page.getByLabel('Filter by TLD').selectOption('App')
  await page
    .locator('.all-results')
    .getByRole('button', { name: 'Add foldkit.app to cart' })
    .click()
  await page.getByRole('button', { name: 'Cart, 1 domains' }).click()
  await expect(page.getByRole('region', { name: 'Your cart' })).toContainText(
    'foldkit.app',
  )
  await page
    .getByRole('button', { name: 'Remove foldkit.app', exact: true })
    .click()
  await expect(page.getByRole('region', { name: 'Your cart' })).toContainText(
    'Your next idea starts with a name.',
  )
  await page.getByRole('button', { name: 'Close cart panel' }).click()
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await expect(page).toHaveURL('/')
})

test('updates domain names while prices and availability wait for the current lookup', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: '2030-01-01T08:00:00Z' })
  await Page.assertLoadedCleanly(page)
  await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
  await page.clock.pauseAt('2030-01-01T10:00:00Z')

  const input = page.getByRole('searchbox', { name: 'Search domains' })
  await input.fill('foldkit')
  await page.clock.runFor(1_000)
  await expect(page.locator('.domain-card').first()).toContainText(
    'Unavailable',
  )
  await expect(page.locator('.results .price').first()).toBeVisible()

  await input.fill('new-idea')
  await page.clock.runFor(50)
  await expect(page.locator('.domain-card h3')).toHaveText([
    'new-idea.com',
    'new-idea.dev',
    'new-idea.app',
    'new-idea.io',
  ])
  await expect(
    page.locator('#domain-results .domain-row').first(),
  ).toContainText('new-idea.com')
  await expect(
    page.locator('#domain-results .domain-row').last(),
  ).toContainText('new-idea.')
  await expect(page.locator('.results .price')).toHaveCount(0)
  await expect(page.locator('.results .unavailable')).toHaveCount(0)
  await expect(page.locator('.results button')).toHaveCount(0)
  await expect(
    page.getByRole('status', { name: 'Searching domains' }),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('domains-pending.png') })

  await input.pressSequentially('s')
  await page.clock.runFor(50)
  await expect(page.locator('.domain-card').first()).toContainText(
    'new-ideas.com',
  )
  await expect(page.locator('.results .price')).toHaveCount(0)
  await page.clock.runFor(1_000)
  await expect(page.locator('.domain-card').first()).toContainText('$12.00')
  await expect(
    page.locator('.domain-card').first().getByRole('button'),
  ).toHaveAccessibleName('Add new-ideas.com to cart')
})

test('restores queries on reload and browser navigation and ignores superseded searches', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'acme', exact: true }).click()
  const input = page.getByRole('searchbox', { name: 'Search domains' })
  await expect(input).toHaveValue('acme')
  await input.fill('first-query')
  await input.fill('latest-query')
  await expect(page.locator('.domain-card').first()).toContainText(
    'latest-query.com',
  )
  await page.reload()
  await expect(input).toHaveValue('latest-query')
  await expect(page.locator('.domain-card').first()).toContainText(
    'latest-query.com',
  )
  await page.goBack()
  await expect(input).toHaveValue('')
  await page.goForward()
  await expect(input).toHaveValue('latest-query')
  await input.fill('not a domain!')
  await expect(page.getByRole('alert')).toContainText('Enter a domain name')
  await input.fill('valid-domain')
  await expect(page.locator('.domain-card').first()).toContainText(
    'valid-domain.com',
  )
})

test('virtualizes the catalog and preserves scrolling and cart selections across query changes', async ({
  page,
}) => {
  await page.goto('/?q=acme')
  const viewport = page.locator('#domain-results')
  const rows = viewport.locator('.domain-row')
  await expect(page.locator('.result-count')).toHaveText(
    '556 domains · Prices per year in USD',
  )
  await expect(rows.first()).toContainText('acme.com')
  expect(await rows.count()).toBeLessThan(60)
  await expect(viewport.getByText('acme.zone', { exact: true })).toHaveCount(0)

  await expect
    .poll(async () => {
      await viewport.evaluate(element => {
        element.scrollTop = element.scrollHeight
      })
      return rows.last().textContent()
    })
    .toContain('acme.zone')
  await expect(viewport.getByText('acme.com', { exact: true })).toHaveCount(0)
  expect(await rows.count()).toBeLessThan(60)
  await viewport.getByRole('button', { name: 'Add acme.zone to cart' }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    viewport.getByRole('button', { name: 'Remove acme.zone from cart' }),
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)

  await page.getByRole('searchbox', { name: 'Search domains' }).fill('fresh')
  await expect
    .poll(() =>
      viewport
        .locator('[data-domain-label]')
        .evaluateAll(
          elements =>
            elements.length > 0 &&
            elements.every(element => element.textContent === 'fresh'),
        ),
    )
    .toBe(true)
  await expect
    .poll(() => viewport.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0)
  await expect(page.locator('.result-count')).toHaveText(
    '556 domains · Prices per year in USD',
  )
  await expect
    .poll(async () => {
      await viewport.evaluate(element => {
        element.scrollTop = element.scrollHeight
      })
      return rows.last().textContent()
    })
    .toContain('fresh.zone')
  await page.getByLabel('Sort results').selectOption('PriceAscending')
  await expect
    .poll(async () => {
      await viewport.evaluate(element => {
        element.scrollTop = 0
      })
      return rows.first().textContent()
    })
    .toContain('fresh.space')
  await page.getByLabel('Filter by TLD').selectOption('App')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('fresh.app')
  await expect
    .poll(() => viewport.evaluate(element => element.scrollTop))
    .toBe(0)

  await page.getByRole('button', { name: 'Cart, 1 domains' }).click()
  await expect(page.getByRole('region', { name: 'Your cart' })).toContainText(
    'acme.zone',
  )
})
