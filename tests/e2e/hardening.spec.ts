import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

const accounts = {
  customer: { email: 'listener-one@daymark.local', password: 'Daymark-Listener-2026!' },
}

test('enforces production-shaped browser and request boundaries', async ({ page, request }) => {
  const home = await gotoHydrated(page, '/')
  expect(home?.headers()['content-security-policy']).toContain("default-src 'none'")
  expect(home?.headers()['content-security-policy']).toContain("script-src-attr 'none'")
  expect(home?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(home?.headers()['x-content-type-options']).toBe('nosniff')
  expect(home?.headers()['x-frame-options']).toBe('DENY')
  expect(home?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(home?.headers()['access-control-allow-origin']).toBeUndefined()

  const privateResponse = await request.get('/api/auth/session')
  expect(privateResponse.headers()['cache-control']).toContain('no-store')

  const deniedOrigin = await request.post('/api/contact', {
    headers: { origin: 'https://malicious.example' },
    data: {
      name: 'Boundary test',
      email: 'boundary@example.test',
      subject: 'Origin check',
      message: 'This request must be refused before the message is stored.',
      consent: true,
    },
  })
  expect(deniedOrigin.status()).toBe(403)

  const deniedFetchSite = await request.post('/api/auth/sign-out', {
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  expect(deniedFetchSite.status()).toBe(403)

  const oversized = await request.post('/api/telemetry/event', {
    data: { oversized: 'x'.repeat(2_100_000) },
  })
  expect(oversized.status()).toBe(413)
})

test('keeps redirects local and exposes keyboard, focus, motion, and offline states', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoHydrated(page, '/')

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  const duration = await page
    .locator('.hero__copy')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration))
  expect(duration).toBeLessThanOrEqual(0.001)

  await page.context().setOffline(true)
  await expect(page.getByText('You are offline.', { exact: false })).toBeVisible()
  await page.context().setOffline(false)

  await gotoHydrated(page, '/sign-in?redirect=//malicious.example')
  await page.getByLabel('Email').fill(accounts.customer.email)
  await page.getByLabel('Password').fill(accounts.customer.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  expect(new URL(page.url()).hostname).toBe('127.0.0.1')
})

test('keeps one main landmark, viewport containment, and serious axe results clean', async ({
  page,
}) => {
  for (const path of [
    '/',
    '/music',
    '/music/lines-we-carry',
    '/support',
    '/licensing',
    '/learn',
    '/video',
    '/journal',
    '/privacy',
    '/account',
  ]) {
    await gotoHydrated(page, path)
    await expect(page.locator('main')).toHaveCount(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([])
  }
})
