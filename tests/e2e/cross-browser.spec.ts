import { expect, test } from '@playwright/test'

const routes = [
  ['/', /Music made for attentive rooms/],
  ['/music', /Music in authored order/],
  ['/support', /Choose what the relationship makes possible/],
  ['/licensing', /Choose a use whose boundaries are already clear/],
  ['/learn', /Teaching that stays close to the music/],
  ['/video', /Watch with the context still attached/],
  ['/journal', /Notes that remain part of the work/],
  ['/about', /Daymark Assembly/],
] as const

test('keeps the public judge journey coherent across browser engines', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  for (const [route, heading] of routes) {
    const response = await page.goto(route, { waitUntil: 'load' })
    expect(response?.ok(), `${route} should return a successful document`).toBe(true)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1)
  }

  expect(consoleErrors).toEqual([])
})
