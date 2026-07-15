import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './helpers'

const accounts = {
  listener: { email: 'listener-one@daymark.local', password: 'Daymark-Listener-2026!' },
  owner: { email: 'owner@daymark.local', password: 'Daymark-Owner-2026!' },
}

test.describe.configure({ mode: 'serial' })

async function signIn(page: Page, account: (typeof accounts)['owner'], redirect: string) {
  await gotoHydrated(page, `/sign-in?redirect=${encodeURIComponent(redirect)}`)
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeEnabled()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await button.click()
  await expect(page).toHaveURL((url) => url.pathname === redirect)
}

test('collects consented product moments as owner-only aggregates and honors disablement', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The aggregate and settings mutation journey runs once against the shared local database.',
  )

  await gotoHydrated(page, '/')
  const consent = page.getByRole('complementary', { name: 'Optional artist-owned analytics' })
  await expect(consent).toBeVisible()
  await consent.getByRole('button', { name: 'Allow optional analytics' }).click()
  await expect(consent).toHaveCount(0)

  await gotoHydrated(page, '/music')
  await page.getByLabel("Search this artist's catalog").fill('turn')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText(/Search words stay in this browser/)).toBeVisible()

  await page.getByRole('link', { name: 'Lines We Carry', exact: true }).click()
  const meaningfulListen = page.waitForResponse((response) => {
    if (
      !response.url().endsWith('/api/telemetry/event') ||
      response.request().method() !== 'POST'
    ) {
      return false
    }
    return response.request().postDataJSON()?.eventName === 'meaningful_listen'
  })
  await page.getByRole('button', { name: 'Play public preview' }).click()
  await expect(page.getByText('Public preview playback verified.')).toBeVisible()
  expect((await meaningfulListen).ok()).toBe(true)

  await gotoHydrated(page, '/contact')
  await page.getByLabel('Name').fill('Telemetry Browser Proof')
  await page.getByLabel('Email').fill('telemetry-proof@example.test')
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('A fictional message proving a consented conversion event.')
  await page.getByLabel(/I understand/).check()
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Your message is stored for the artist.')).toBeVisible()

  await signIn(page, accounts.owner, '/admin/telemetry')
  await expect(
    page.getByRole('heading', { name: 'Useful counts with a deliberate boundary.' }),
  ).toBeVisible()
  await expect(page.getByText('page view', { exact: true })).toBeVisible()
  await expect(page.getByText('media start', { exact: true })).toBeVisible()
  await expect(page.getByText('meaningful listen', { exact: true })).toBeVisible()
  await expect(page.getByText('catalog search', { exact: true })).toBeVisible()
  await expect(page.getByText('contact conversion', { exact: true })).toBeVisible()
  const aggregate = await (await page.request.get('/api/admin/telemetry')).json()
  expect(aggregate.summary.sessions).toBeGreaterThanOrEqual(1)
  expect(aggregate.summary.events).toBeGreaterThanOrEqual(3)
  expect(JSON.stringify(aggregate)).not.toContain('telemetry-proof@example.test')

  const enabled = page.getByLabel('Enable optional first-party audience analytics')
  await enabled.uncheck()
  await page.getByRole('button', { name: 'Save privacy settings' }).click()
  await expect(page.getByText('Privacy settings saved.')).toBeVisible()
  const blocked = await page.request.post('/api/telemetry/event', {
    data: {
      id: crypto.randomUUID(),
      eventName: 'page_view',
      sessionId: crypto.randomUUID(),
      path: '/disabled-proof',
      resourceType: 'page',
      resourceKey: 'disabled-proof',
      value: null,
      consentState: 'granted',
    },
  })
  expect((await blocked.json()).collected).toBe(false)

  await enabled.check()
  await page.getByRole('button', { name: 'Save privacy settings' }).click()
  await expect(page.getByText('Privacy settings saved.')).toBeVisible()
})

test('respects Global Privacy Control and rejects fields outside the event contract', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'Sec-GPC': '1' })
  await gotoHydrated(page, '/')
  await expect(
    page.getByRole('complementary', { name: 'Optional artist-owned analytics' }),
  ).toHaveCount(0)
  await gotoHydrated(page, '/privacy')
  await expect(
    page.getByText(/Global Privacy Control or Do Not Track signal is active/),
  ).toBeVisible()

  const refused = await page.request.post('/api/telemetry/event', {
    headers: { 'Sec-GPC': '1' },
    data: {
      id: crypto.randomUUID(),
      eventName: 'page_view',
      sessionId: crypto.randomUUID(),
      path: '/privacy',
      resourceType: 'page',
      resourceKey: 'privacy',
      value: null,
      consentState: 'granted',
    },
  })
  expect((await refused.json()).collected).toBe(false)

  const arbitraryMetadata = await page.request.post('/api/telemetry/event', {
    headers: { 'Sec-GPC': '1' },
    data: {
      id: crypto.randomUUID(),
      eventName: 'page_view',
      sessionId: crypto.randomUUID(),
      path: '/privacy',
      resourceType: 'page',
      resourceKey: 'privacy',
      value: null,
      consentState: 'granted',
      email: 'must-not-be-accepted@example.test',
    },
  })
  expect(arbitraryMetadata.status()).toBe(400)
})

test('keeps redacted status owner-only and both privacy surfaces accessible', async ({ page }) => {
  await signIn(page, accounts.listener, '/account')
  expect((await page.request.get('/api/admin/system')).status()).toBe(403)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, accounts.owner, '/admin/system')

  for (const path of ['/privacy', '/admin/telemetry', '/admin/system']) {
    await gotoHydrated(page, path)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([])
  }

  await gotoHydrated(page, '/admin/system')
  await expect(page.getByRole('heading', { name: 'Installation checks' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Database migration' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Audio processing worker' })).toBeVisible()
  const status = await (await page.request.get('/api/admin/system')).json()
  const serialized = JSON.stringify(status)
  expect(serialized).not.toContain('owner@daymark.local')
  expect(serialized).not.toContain('127.0.0.1')
  expect(serialized).not.toContain('eyJ')
  expect(serialized).not.toContain('provider_event_id')
})
