import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const accounts = {
  listenerOne: { email: 'listener-one@daymark.local', password: 'Daymark-Listener-2026!' },
  listenerTwo: { email: 'listener-two@daymark.local', password: 'Daymark-Listener-2026!' },
  owner: { email: 'owner@daymark.local', password: 'Daymark-Owner-2026!' },
}

test.describe.configure({ mode: 'serial' })

async function signIn(page: Page, account: (typeof accounts)['listenerOne'], redirect: string) {
  await page.goto(`/sign-in?redirect=${encodeURIComponent(redirect)}`)
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeEnabled()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await button.click()
  await expect(page).toHaveURL((url) => url.pathname === redirect)
}

async function completeSimulation(page: Page, offeringName: string, actionName: string) {
  await page.goto('/support')
  const offering = page.locator('.offering-list article').filter({ hasText: offeringName })
  await offering.getByRole('button', { name: actionName }).click()
  await expect(page).toHaveURL(/\/checkout\/simulated\/[0-9a-f-]+$/)
  await expect(page.getByText('This screen never charges a card.')).toBeVisible()
  const intentId = page.url().split('/').at(-1)!

  await page.goto(`/checkout/return?intent=${intentId}`)
  await expect(
    page.getByRole('heading', { name: 'Waiting for verified payment confirmation.' }),
  ).toBeVisible()
  const openIntent = await page.request.get(`/api/commerce/checkout/${intentId}`)
  expect((await openIntent.json()).intent.status).toBe('open')

  await page.goto(`/checkout/simulated/${intentId}`)
  await page.getByRole('button', { name: 'Complete simulated payment' }).click()
  await expect(page.getByText('Simulation complete. Your account access is ready.')).toBeVisible()
  await expect(page.getByText('complete', { exact: true })).toBeVisible()
  return intentId
}

test('fulfills purchases, memberships, and free access only from durable events', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The commerce mutation journey runs once against the shared local database.',
  )
  await signIn(page, accounts.listenerOne, '/support')

  await completeSimulation(page, 'Lines We Carry download', 'Purchase securely')
  await page.getByRole('link', { name: 'Continue to your account' }).click()
  const purchases = page.getByRole('region', { name: 'Orders and protected delivery.' })
  await expect(
    purchases.getByRole('heading', { name: 'Lines We Carry download' }).first(),
  ).toBeVisible()
  await expect(
    purchases.getByRole('button', { name: 'Request protected download' }).first(),
  ).toBeVisible()

  await completeSimulation(page, 'Daymark Circle membership', 'Join the membership')
  await page.getByRole('link', { name: 'Continue to your account' }).click()
  const membership = page.getByRole('region', { name: 'Time-bound access with a visible state.' })
  await expect(membership.getByText('Daymark Circle membership').first()).toBeVisible()
  await expect(membership.getByText(/active · through/).first()).toBeVisible()

  await completeSimulation(page, 'Turn Toward Home listening notes', 'Claim free access')
  await page.getByRole('link', { name: 'Continue to your account' }).click()
  const ledger = page.getByRole('region', { name: 'Why this account can enter.' })
  await expect(ledger.getByText('track', { exact: true }).first()).toBeVisible()

  const commerceResponse = await page.request.get('/api/commerce/account')
  const commerce = await commerceResponse.json()
  const downloadMediaId = commerce.orders
    .flatMap(
      (order: { items: Array<{ name: string; downloadMediaId: string | null }> }) => order.items,
    )
    .find(({ name }: { name: string }) => name === 'Lines We Carry download')?.downloadMediaId
  expect(downloadMediaId).toBeTruthy()
  const allowedDownload = await page.request.get(`/api/downloads/${downloadMediaId}`)
  expect(allowedDownload.status()).toBe(200)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, accounts.listenerTwo, '/account')
  await expect(
    page.getByText('Completed purchases will appear here after a verified event.'),
  ).toBeVisible()
  await expect(page.getByText('No membership is attached to this account.')).toBeVisible()
  const deniedDownload = await page.request.get(`/api/downloads/${downloadMediaId}`)
  expect(deniedDownload.status()).toBe(403)
})

test('lets only the owner inspect and save provider mappings', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The owner commerce mutation journey runs once against the shared local database.',
  )
  await signIn(page, accounts.owner, '/admin/commerce')
  await expect(
    page.getByRole('heading', { name: 'The artist defines the offer. Providers move the money.' }),
  ).toBeVisible()
  const download = page
    .locator('.commerce-editor-list form')
    .filter({ hasText: 'Lines We Carry download' })
  await expect(download.getByText('No Stripe price mapping')).toBeVisible()
  await download.getByRole('button', { name: 'Save offering' }).click()
  await expect(page.getByText('Lines We Carry download saved.')).toBeVisible()
  await expect(page.getByText(/simulation · complete/).first()).toBeVisible()
})

test('keeps the offerings and account surfaces accessible and within the viewport', async ({
  page,
}) => {
  for (const path of ['/support', '/account']) {
    await page.goto(path)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([])
  }
})
