import { Effect, Result, Schema } from 'effect'

import { expect, test } from '@playwright/test'

import { DomainsClient, makeDomainsClientLayer } from '../src/client/rpc'
import { DOMAINS_RPC_PATH, SearchError } from '../src/shared/domainsRpc'

const searchDomains = (baseURL: string | undefined, label: string) => {
  if (baseURL === undefined) {
    throw new Error('The live search check requires a base URL')
  }

  return Effect.scoped(
    Effect.gen(function* () {
      const client = yield* DomainsClient
      return yield* client.SearchDomains({
        mode: 'Live',
        label,
        offset: 0,
        limit: 60,
      })
    }),
  ).pipe(
    Effect.provide(makeDomainsClientLayer(`${baseURL}${DOMAINS_RPC_PATH}`)),
    Effect.timeout('20 seconds'),
  )
}

test('loads live registrar quotes and keeps a registered name out of the demo cart', async ({
  page,
}, testInfo) => {
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('radio', { name: 'Live', exact: true }).click()
  const input = page.getByRole('searchbox', { name: 'Search domains' })
  await expect(input).toBeEditable()
  await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)

  const responsePromise = page.waitForResponse(
    response =>
      response.url().endsWith(DOMAINS_RPC_PATH) ||
      response.url().endsWith(`${DOMAINS_RPC_PATH}/`),
  )
  await input.pressSequentially('foldkitcafeshowcase', { delay: 60 })
  await expect(page.locator('.domain-card').first()).toContainText(
    'foldkitcafeshowcase.com',
  )
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const quotedCard = page
    .locator('.domain-card')
    .filter({ has: page.getByRole('button', { name: /^Add / }) })
    .first()
  await expect(quotedCard.locator('.price')).toBeVisible()
  const quotedName = await quotedCard.getByRole('heading').innerText()
  const quotedPrice = await quotedCard.locator('.price').innerText()
  const addToCart = quotedCard.getByRole('button', {
    name: `Add ${quotedName} to cart`,
  })
  await expect(addToCart).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('live-results.png'),
    fullPage: true,
  })
  await addToCart.click()
  await page.getByRole('button', { name: 'Cart, 1 domains' }).click()
  const cart = page.getByRole('region', { name: 'Your cart' })
  await expect(cart).toContainText(quotedName)
  await expect(cart).toContainText(quotedPrice)
  await expect(cart).toContainText('No purchases are made.')
  await page.screenshot({ path: testInfo.outputPath('live-cart.png') })
  await page.getByRole('button', { name: 'Close cart panel' }).click()
  await expect(page.getByRole('region', { name: 'Your cart' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Cart,/ })).toBeFocused()

  await input.fill('vercel')
  const registered = page.locator('.domain-card').first()
  await expect(registered).toContainText('vercel.com')
  await expect(registered).toContainText('Not available')
  await expect(registered.getByRole('button')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Cart, 1 domains' }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('live-registered.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('handles overlapping live HTTP requests without transport failures', async ({
  baseURL,
}, testInfo) => {
  const results = await Effect.runPromise(
    Effect.all(
      [
        searchDomains(baseURL, 'foldkitcafeconcurrency').pipe(Effect.result),
        searchDomains(baseURL, 'foldkitcafeconcurrency').pipe(Effect.result),
      ],
      { concurrency: 'unbounded' },
    ),
  )

  for (const result of results) {
    if (Result.isSuccess(result)) {
      expect(result.success).toHaveLength(60)
    } else {
      expect(Schema.is(SearchError)(result.failure)).toBe(true)
      testInfo.annotations.push({
        type: 'registrar',
        description: JSON.stringify(result.failure),
      })
    }
  }
})

test.describe('live mobile scrolling', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })

  test('loads quotes throughout the catalog as a mobile visitor scrolls', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    await page.goto('/')
    await page.getByRole('radio', { name: 'Live', exact: true }).click()
    await page
      .getByRole('searchbox', { name: 'Search domains' })
      .fill('devinjameson.com')
    await expect(page.locator('.result-count')).toContainText('60 of 556', {
      timeout: 25_000,
    })
    const viewport = page.locator('#domain-results')
    await viewport.scrollIntoViewIfNeeded()

    for (let swipe = 0; swipe < 100; swipe += 1) {
      await page.evaluate(() => {
        window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'instant' })
        return new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      })
      await expect
        .poll(
          async () => {
            const alert = page.getByRole('alert')

            if (await alert.count()) {
              throw new Error(await alert.innerText())
            }

            return viewport.evaluate(element => {
              const headerBottom =
                document.querySelector('.header')?.getBoundingClientRect()
                  .bottom ?? 0
              const visibleRows = Array.from(
                element.querySelectorAll('.domain-row'),
              ).filter(row => {
                const bounds = row.getBoundingClientRect()
                return (
                  bounds.bottom > headerBottom &&
                  bounds.top < window.innerHeight
                )
              })
              return (
                visibleRows.length > 0 &&
                visibleRows.every(
                  row => row.querySelector('.skeleton-price') === null,
                )
              )
            })
          },
          { timeout: 25_000 },
        )
        .toBe(true)
      const isAtBottom = await page.evaluate(
        () =>
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 1,
      )

      if (isAtBottom) {
        break
      }
    }

    await expect(page.locator('.result-count')).toHaveText(
      '556 domains · Registration prices in USD',
    )
    await expect(viewport).toContainText('devinjameson.zone')
    await page.screenshot({
      path: testInfo.outputPath('live-mobile-scroll.png'),
      fullPage: true,
    })
  })
})
