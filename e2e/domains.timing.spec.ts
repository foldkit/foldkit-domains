import { Array, Clock, Effect, Option, Schema } from 'effect'

import { expect, test } from '@playwright/test'

import { parseSearchTimings } from '../src/server/searchTiming'
import { observeSearchPresentationTiming } from './fixtures/searchPresentationTiming'

const RpcPayload = Schema.Struct({
  payload: Schema.Struct({ offset: Schema.Number, limit: Schema.Number }),
})

const candidateRange = (body: unknown) =>
  Option.match(Schema.decodeUnknownOption(RpcPayload)(body), {
    onSome: ({ payload }) => payload,
    onNone: () =>
      Option.getOrThrow(
        Array.head(Schema.decodeUnknownSync(Schema.Array(RpcPayload))(body)),
      ).payload,
  })

test('reports cold, frontend-cache, and backend-cache search latency', async ({
  page,
  context,
}, testInfo) => {
  const runId = await Effect.runPromise(Clock.currentTimeMillis)
  const firstLabel = `foldkittiming${runId}a`
  const secondLabel = `foldkittiming${runId}b`
  let sample = 'cold-a'
  const pendingResponses: Array<Promise<unknown>> = []

  const recordResponses = (target: typeof page) =>
    target.on('response', response => {
      if (!/\/rpc\/?$/.test(response.url())) {
        return
      }

      const sampleName = sample
      pendingResponses.push(
        (async () => {
          await response.finished()
          const timing = response.request().timing()
          const phases = parseSearchTimings(
            (await response.headerValue('server-timing')) ?? '',
          )
          expect(
            phases.some(({ name }) => name === 'rpc'),
            'The target server must support x-domains-timing: 1 and return Server-Timing headers',
          ).toBe(true)
          return {
            sample: sampleName,
            ...candidateRange(response.request().postDataJSON()),
            httpMillis: timing.responseEnd - timing.requestStart,
            phases,
          }
        })(),
      )
    })

  await page.addInitScript(observeSearchPresentationTiming)
  recordResponses(page)
  await page.goto('/')
  await page.getByRole('radio', { name: 'Live', exact: true }).click()
  await expect(page.locator('[data-foldkit-app]')).toHaveCount(0)
  const input = page.getByRole('searchbox', { name: 'Search domains' })
  const samples: Array<unknown> = []

  for (const next of [
    { name: 'cold-a', label: firstLabel },
    { name: 'cold-b', label: secondLabel },
    { name: 'frontend-cache-hit', label: firstLabel },
  ]) {
    sample = next.name
    const previousCount = await page.evaluate(
      () => performance.getEntriesByName('domains-input-to-frame').length,
    )
    const previousRequests = pendingResponses.length
    await input.fill(next.label)
    await expect
      .poll(() =>
        page.evaluate(
          () => performance.getEntriesByName('domains-input-to-frame').length,
        ),
      )
      .toBe(previousCount + 1)
    await expect(page.locator('.result-count')).toContainText('60 of 556')
    const measurements = await page.evaluate(() => {
      const results = performance
        .getEntriesByName('domains-input-to-results')
        .at(-1)
      const frame = performance
        .getEntriesByName('domains-input-to-frame')
        .at(-1)
      if (results === undefined || frame === undefined) {
        throw new Error('The search presentation measurement is missing')
      }
      const request = performance
        .getEntriesByType('resource')
        .find(
          entry =>
            /\/rpc\/?$/.test(entry.name) &&
            entry.startTime >= results.startTime,
        )
      return {
        inputToResultsMillis: results.duration,
        inputToFrameMillis: frame.duration,
        ...(request === undefined
          ? {}
          : {
              rpcStartAfterInputMillis: request.startTime - results.startTime,
            }),
      }
    })
    const rpcCount = pendingResponses.length - previousRequests
    if (next.name === 'frontend-cache-hit') {
      expect(rpcCount).toBe(0)
    }
    samples.push({ sample: next.name, ...measurements, rpcCount })
  }

  sample = 'backend-cache-hit'
  const cachePage = await context.newPage()
  recordResponses(cachePage)
  try {
    await cachePage.goto('/')
    await cachePage.getByRole('radio', { name: 'Live', exact: true }).click()
    await cachePage
      .getByRole('searchbox', { name: 'Search domains' })
      .fill(firstLabel)
    await expect(cachePage.locator('.result-count')).toContainText('60 of 556')
    const responses = await Promise.all(pendingResponses)
    const report = { samples, responses }
    console.log(JSON.stringify(report, null, 2))
    await testInfo.attach('search-latency', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    })
  } finally {
    await cachePage.close()
  }
})
