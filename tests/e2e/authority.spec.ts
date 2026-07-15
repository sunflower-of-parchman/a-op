import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const fixtures = {
  owner: { email: 'owner@daymark.local', password: 'Daymark-Owner-2026!' },
  customerOne: { email: 'listener-one@daymark.local', password: 'Daymark-Listener-2026!' },
  customerTwo: { email: 'listener-two@daymark.local', password: 'Daymark-Listener-2026!' },
  privateMediaId: '10000000-0000-4000-8000-000000000003',
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
}

test('plays the RLS-published preview and creates a customer account', async ({
  page,
}, testInfo) => {
  await page.goto('/music/lines-we-carry')
  const player = page.locator('audio')
  await expect(player).toHaveCount(1)
  await expect.poll(() => player.evaluate((audio) => audio.duration)).toBeGreaterThan(0.9)
  await page.getByRole('button', { name: 'Play public preview' }).click()
  await expect(page.getByText('Public preview playback verified.')).toBeVisible()

  const uniqueEmail = `build-week-${testInfo.project.name}-${Date.now()}@daymark.test`
  await page.goto('/sign-up')
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled()
  await page.getByLabel('Name').fill('Build Week Listener')
  await page.getByLabel('Email').fill(uniqueEmail)
  await page.getByLabel('Password').fill('Daymark-New-2026!')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)

  const session = await page.request.get('/api/auth/session')
  expect(session.ok()).toBe(true)
  expect(await session.json()).toMatchObject({ authenticated: true, roles: ['customer'] })
})

test('protects administration behind the explicit owner role', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/sign-in\?redirect=\/admin$/)

  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  await page.getByLabel('Email').fill(fixtures.owner.email)
  await page.getByLabel('Password').fill(fixtures.owner.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The working side of your site.')
  await expect(page.getByText('owner@daymark.local')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])
})

test('delivers one protected download and denies the second customer', async ({ page }) => {
  await signIn(page, fixtures.customerOne)
  const allowed = await page.request.get(`/api/downloads/${fixtures.privateMediaId}`)
  expect(allowed.status()).toBe(200)
  const delivery = await allowed.json()
  expect(delivery).toMatchObject({ expiresIn: 60, reason: 'order' })

  const protectedFile = await page.request.get(delivery.url)
  expect(protectedFile.status()).toBe(200)
  expect(await protectedFile.text()).toContain('local demonstration download')

  await page.request.post('/api/auth/sign-out')
  await signIn(page, fixtures.customerTwo)
  const denied = await page.request.get(`/api/downloads/${fixtures.privateMediaId}`)
  expect(denied.status()).toBe(403)
})
