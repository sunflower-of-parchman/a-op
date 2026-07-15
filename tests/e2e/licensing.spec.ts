import { execFileSync } from 'node:child_process'
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
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === redirect)
}

test('freezes visible terms, issues one license, and protects its document', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The licensing mutation journey runs once against the shared local database.',
  )
  await signIn(page, accounts.listenerOne, '/licensing?track=turn-toward-home')
  const option = page.locator('.license-option').filter({ hasText: 'Dance film study' })
  await expect(option.getByText('$75.00', { exact: true })).toBeVisible()
  await expect(option.getByText('Up to 10,000 total viewers')).toBeVisible()
  await expect(option.getByText('Non-exclusive')).toBeVisible()
  await option.getByLabel('Licensee or organization name').fill('Browser Dance Collective')
  await option.getByLabel('Project title').fill('Browser licensing study')
  await option
    .getByLabel('Describe this exact project')
    .fill('A fictional dance film used only for the protected browser licensing journey.')
  await option.getByRole('button', { name: /License for/ }).click()
  await expect(page).toHaveURL(/\/checkout\/simulated\/[0-9a-f-]+$/)
  await expect(page.getByText('This screen never charges a card.')).toBeVisible()
  await page.getByRole('button', { name: 'Complete simulated payment' }).click()
  await expect(page.getByText('Simulation complete. Your account access is ready.')).toBeVisible()

  execFileSync(process.execPath, ['--experimental-strip-types', 'workers/documents/index.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  })

  await page.getByRole('link', { name: 'Continue to your account' }).click()
  const licenses = page.getByRole('region', { name: 'The exact terms issued for your project.' })
  await expect(licenses.getByText(/Turn Toward Home · Dance film study/).first()).toBeVisible()
  await expect(
    licenses.getByText(/Browser Dance Collective · Browser licensing study/).first(),
  ).toBeVisible()
  await expect(
    licenses.getByRole('button', { name: 'Download protected license' }).first(),
  ).toBeVisible()

  const accountResponse = await page.request.get('/api/commerce/account')
  const account = await accountResponse.json()
  const issued = account.licenses.find(
    ({ projectTitle }: { projectTitle: string }) => projectTitle === 'Browser licensing study',
  )
  expect(issued.documentStatus).toBe('ready')
  const allowed = await page.request.get(`/api/licenses/${issued.id}/document`)
  expect(allowed.status()).toBe(200)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, accounts.listenerTwo, '/account')
  await expect(page.getByText('Issued music licenses will appear here.')).toBeVisible()
  const denied = await page.request.get(`/api/licenses/${issued.id}/document`)
  expect(denied.status()).toBe(403)
})

test('shows unsupported uses as inquiry and exposes owner versioning controls', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The owner licensing journey runs once against the shared local database.',
  )
  await page.goto('/licensing')
  await expect(
    page.getByRole('heading', {
      name: 'Unusual, broadcast, commercial, or exclusive uses begin with an inquiry.',
    }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Describe the project' })).toHaveAttribute(
    'href',
    '/contact',
  )

  await signIn(page, accounts.owner, '/admin/licensing')
  await expect(
    page.getByRole('heading', {
      name: 'The artist publishes the supported use before a buyer can choose it.',
    }),
  ).toBeVisible()
  await expect(page.getByText('Turn Toward Home supported uses')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create revised version' })).toBeVisible()
  await expect(page.getByText('Exclusivity: non-exclusive.')).toBeVisible()
})

test('keeps public and owner licensing surfaces accessible and within the viewport', async ({
  page,
}) => {
  for (const path of ['/licensing', '/music/tracks/turn-toward-home']) {
    await page.goto(path)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([])
  }

  await page.goto('/support')
  await expect(page.getByText(/Turn Toward Home supported uses/)).toHaveCount(0)
})
