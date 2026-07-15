import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const baseUrl = process.env.BASE_URL
if (!baseUrl) throw new Error('BASE_URL is required for production performance verification.')

const budgets = {
  domContentLoadedMs: 3_000,
  loadMs: 5_000,
  requests: 45,
  transferBytes: 1_500_000,
  scriptTransferBytes: 700_000,
  mediaTransferBytes: 600_000,
}

const routes = ['/', '/music', '/music/lines-we-carry', '/learn']
const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const consoleErrors = []
    const failedRequests = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })

    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' })
    assert.equal(response?.status(), 200, `${route} did not return 200`)
    await page.locator('.site-shell[data-hydrated="true"]').waitFor()

    const measurement = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0]
      if (!(navigation instanceof PerformanceNavigationTiming)) {
        throw new Error('Navigation timing was not available.')
      }
      const resources = performance.getEntriesByType('resource')
      const total = (predicate) =>
        resources.filter(predicate).reduce((sum, resource) => sum + resource.transferSize, 0)
      return {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadMs: Math.round(navigation.loadEventEnd),
        requests: resources.length + 1,
        transferBytes: Math.round(
          navigation.transferSize +
            resources.reduce((sum, resource) => sum + resource.transferSize, 0),
        ),
        scriptTransferBytes: Math.round(
          total(
            (resource) =>
              resource.initiatorType === 'script' ||
              new URL(resource.name).pathname.endsWith('.js'),
          ),
        ),
        mediaTransferBytes: Math.round(
          total((resource) =>
            /\.(?:aac|flac|m4a|mp3|mp4|ogg|wav|webm)(?:$|\?)/i.test(
              new URL(resource.name).pathname,
            ),
          ),
        ),
        audioPreload: Array.from(document.querySelectorAll('audio')).map((audio) => ({
          preload: audio.preload,
          autoplay: audio.autoplay,
        })),
        videoPreload: Array.from(document.querySelectorAll('video')).map((video) => ({
          preload: video.preload,
          autoplay: video.autoplay,
        })),
      }
    })

    assert.ok(
      measurement.domContentLoadedMs <= budgets.domContentLoadedMs,
      `${route} DOMContentLoaded exceeded ${budgets.domContentLoadedMs}ms`,
    )
    assert.ok(measurement.loadMs <= budgets.loadMs, `${route} load exceeded ${budgets.loadMs}ms`)
    assert.ok(measurement.requests <= budgets.requests, `${route} exceeded the request budget`)
    assert.ok(
      measurement.transferBytes <= budgets.transferBytes,
      `${route} exceeded the transfer budget`,
    )
    assert.ok(
      measurement.scriptTransferBytes <= budgets.scriptTransferBytes,
      `${route} exceeded the script budget`,
    )
    assert.ok(
      measurement.mediaTransferBytes <= budgets.mediaTransferBytes,
      `${route} exceeded the initial media budget`,
    )
    assert.ok(
      [...measurement.audioPreload, ...measurement.videoPreload].every(
        ({ preload, autoplay }) => preload !== 'auto' && !autoplay,
      ),
      `${route} eagerly preloaded or autoplayed media`,
    )
    assert.deepEqual(failedRequests, [], `${route} had failed requests`)
    assert.deepEqual(consoleErrors, [], `${route} emitted browser console errors`)

    results.push({ route, ...measurement })
    await context.close()
  }

  console.log(JSON.stringify({ runtime: 'production', budgets, results }, null, 2))
  console.log('Production performance: PASS (four critical routes within explicit budgets)')
} finally {
  await browser.close()
}
