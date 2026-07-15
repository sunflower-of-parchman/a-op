import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './helpers'

const owner = { email: 'owner@daymark.local', password: 'Daymark-Owner-2026!' }

test.beforeEach(({ isMobile }) => {
  test.skip(Boolean(isMobile), 'Mutation journeys run once against the shared local database.')
})

async function signInAsOwner(page: Page, redirect: string) {
  await gotoHydrated(page, `/sign-in?redirect=${encodeURIComponent(redirect)}`)
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeEnabled()
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await button.click()
  await expect(page).toHaveURL(new RegExp(`${redirect.replaceAll('/', '\\/')}$`))
}

test('drafts, previews, and publishes database-authoritative artist configuration', async ({
  page,
}) => {
  await signInAsOwner(page, '/admin/identity')
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled()

  await page.getByLabel('Artist name').fill('Daymark Assembly Published')
  await page
    .getByLabel('Biography')
    .fill(
      'A browser-published biography proving that the database, rather than a source edit, controls the public artist identity.',
    )
  await page.getByLabel('Public email').fill('hello@daymark.example')
  await page.getByLabel('Display typeface').selectOption('Georgia, Times New Roman, serif')
  await page
    .locator('.color-fields label')
    .filter({ hasText: 'accent' })
    .locator('input')
    .fill('#0b6e4f')
  await page.locator('.navigation-editor li').last().getByLabel('Label').fill('Write to us')
  await page
    .getByLabel('Introduction')
    .fill(
      'A published browser journey now controls this invitation from a validated database version.',
    )
  await page.getByRole('button', { name: 'Add social link' }).click()
  const socialLink = page.locator('.link-groups > div').first().locator('.link-editor li').last()
  await socialLink.getByLabel('Label').fill('Artist archive')
  await socialLink.getByLabel('URL').fill('https://example.com/daymark')
  await page
    .getByLabel('Search description')
    .fill('A browser-published search description for the fictional artist demonstration.')
  await page
    .getByLabel('Footer statement')
    .fill('An artist-controlled footer, published from the database.')

  await expect(page.locator('.preview-artist-name')).toHaveText('Daymark Assembly Published')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved. The public site is unchanged.')).toBeVisible()

  const before = await page.request.get('/api/site-config?phase=before')
  expect((await before.json()).config.identity.name).not.toBe('Daymark Assembly Published')

  const publish = page.getByRole('button', { name: 'Publish site' })
  await expect(publish).toBeEnabled()
  await publish.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Daymark Assembly Published', { exact: true }).first()).toBeVisible()

  const after = await page.request.get('/api/site-config?phase=after')
  const published = (await after.json()).config
  expect(published.identity.name).toBe('Daymark Assembly Published')
  expect(published.identity.contact.publicEmail).toBe('hello@daymark.example')
  expect(published.identity.socialLinks).toContainEqual({
    label: 'Artist archive',
    url: 'https://example.com/daymark',
  })
  expect(published.design.colors.accent).toBe('#0b6e4f')
  expect(published.design.typography.displayFamily).toBe('Georgia, Times New Roman, serif')
  expect(published.footer.statement).toBe(
    'An artist-controlled footer, published from the database.',
  )
  expect(published.navigation).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: 'Write to us' })]),
  )
})

test('provides a dedicated editor for every structured section type', async ({ page }) => {
  await signInAsOwner(page, '/admin/pages/about')
  await expect(page.getByRole('button', { name: 'Save page draft' })).toBeEnabled()

  for (const name of [
    'Add image',
    'Add call to action',
    'Add credits',
    'Add links',
    'Add release',
    'Add learning',
    'Add video',
    'Add contact form',
  ]) {
    await page.getByRole('button', { name }).click()
  }

  await expect(page.getByLabel('Alternative text')).toBeVisible()
  await expect(page.getByLabel('Role')).toBeVisible()
  await expect(page.getByLabel('External URL')).toBeVisible()
  await expect(page.getByLabel('Release slug')).toBeVisible()
  await expect(page.getByLabel('Learning path slug')).toBeVisible()
  await expect(page.getByLabel('Approved video URL')).toBeVisible()
  await expect(page.getByLabel('Consent label')).toBeVisible()
})

test('drafts and publishes an ordered structured page', async ({ page }) => {
  await signInAsOwner(page, '/admin/pages/about')
  await expect(page.getByRole('button', { name: 'Save page draft' })).toBeEnabled()

  await page.getByLabel('Page title').fill('About the Published Practice')
  const firstSection = page.locator('.section-editor-list > li').first()
  await firstSection.getByLabel('Heading').fill('Work, held in its own context.')
  await firstSection
    .getByLabel('Body')
    .fill('This ordered prose section was validated, previewed, and published without raw HTML.')

  await page.getByRole('button', { name: 'Save page draft' }).click()
  await expect(page.getByText('Page draft saved. The published page is unchanged.')).toBeVisible()
  const before = await page.request.get('/api/pages/about?phase=before')
  expect((await before.json()).title).not.toBe('About the Published Practice')

  const publish = page.getByRole('button', { name: 'Publish page' })
  await expect(publish).toBeEnabled()
  await publish.click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { name: 'Work, held in its own context.' })).toBeVisible()

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/pages/about?phase=after-${Date.now()}`, {
        headers: { 'cache-control': 'no-cache' },
      })
      return (await response.json()).title
    })
    .toBe('About the Published Practice')
})

test('stores a validated contact message without sending external email', async ({ page }) => {
  await gotoHydrated(page, '/contact')
  const button = page.getByRole('button', { name: 'Send message' })
  await expect(button).toBeEnabled()
  await page.getByLabel('Name').fill('Browser Listener')
  await page.getByLabel('Email').fill('browser-listener@example.com')
  await page
    .getByLabel('Message', { exact: true })
    .fill('I am writing to verify the artist-owned contact surface and local message storage.')
  await page.getByLabel(/I understand this message/).check()
  await button.click()
  await expect(page.getByText('Your message is stored for the artist.')).toBeVisible()
  await expect(page.getByText('sends no external email')).toBeVisible()
})
