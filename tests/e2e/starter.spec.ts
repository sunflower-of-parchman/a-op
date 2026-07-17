import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { gotoHydrated, reloadHydrated } from './helpers'

test('labels the artist-editable elements in the first-clone layout', async ({ page }) => {
  await gotoHydrated(page, '/')

  await expect(page.locator('.site-shell')).toHaveAttribute('data-starter-layout', 'true')
  await expect(page.locator('.demo-notice')).toHaveCount(0)
  await expect(page.locator('p.eyebrow')).toHaveCount(0)
  await expect(page.getByText('Artist Name / Logo', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primary Homepage Headline')
  await expect(page.getByText('Introductory Text', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Primary Action', exact: true })).toBeVisible()
  await expect(page.getByText('Featured Release / Artwork', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
    'Supporting Section Headline',
  )
  await expect(page.getByText('Music made for attentive rooms', { exact: false })).toHaveCount(0)
})

test('keeps the labeled layout accessible on desktop and mobile', async ({ page }) => {
  await gotoHydrated(page, '/')
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  )

  expect(serious).toEqual([])
})

test('labels track-detail content instead of presenting the fictional demo as artist copy', async ({
  page,
}) => {
  await gotoHydrated(page, '/music/tracks/a-measure-of-distance')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Track Title')
  await expect(page.getByText('Track Description', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Track Metadata')
  await expect(page.getByRole('heading', { level: 2 }).last()).toHaveText('Favorites and Playlists')
  await expect(page.getByRole('link', { name: 'Return to Album', exact: true })).toBeVisible()
  await expect(page.getByText('A Measure of Distance', { exact: true })).toHaveCount(0)
  await expect(page.getByText('A fictional study in spacing', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Music, with its context intact.', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText('Keep a personal path through the catalog.', { exact: true }),
  ).toHaveCount(0)
})

test('labels every public content archetype without leaking demonstration copy', async ({
  page,
}) => {
  const routes = [
    ['/about', 'Artist Name'],
    ['/contact', 'Contact Page Heading'],
    ['/support', 'Support Page Heading'],
    ['/licensing', 'Licensing Page Heading'],
    ['/privacy', 'Privacy Page Heading'],
    ['/music', 'Music'],
    ['/music/lines-we-carry', 'Album Title'],
    ['/music/collections/movement-studies', 'Collection Title'],
    ['/learn', 'Learning Page Heading'],
    ['/learn/listening-with-the-whole-phrase', 'Learning Path Title'],
    ['/learn/listening-with-the-whole-phrase/hear-the-first-arc', 'Lesson Title'],
    ['/video', 'Video Page Heading'],
    ['/video/external-video-with-context', 'Video Title'],
    ['/journal', 'Journal Page Heading'],
    ['/journal/what-a-phrase-carries', 'Journal Entry Title'],
    ['/account', 'Account Page Heading'],
    ['/sign-in', 'Sign-In Page Heading'],
    ['/sign-up', 'Sign-Up Page Heading'],
  ] as const

  const demonstrationCopy =
    /Daymark|fictional|attentive rooms|suspended arrival|whole phrase|phrase carries|context still attached|relationship makes possible|small signals, held/i

  for (const [route, heading] of routes) {
    await gotoHydrated(page, route)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(page.locator('.demo-notice')).toHaveCount(0)
    await expect(page.locator('p.eyebrow')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(demonstrationCopy)
  }
})

test('starts in Lato and preserves the artist-selected color mode', async ({ page }) => {
  await gotoHydrated(page, '/music')

  const shell = page.locator('.site-shell')
  await expect(page.locator('.demo-notice')).toHaveCount(0)
  await expect(page.locator('p.eyebrow')).toHaveCount(0)
  await expect(page.locator('.music-sidebar-heading').filter({ hasText: /^Library$/ })).toHaveCount(
    0,
  )
  await expect(shell).toHaveAttribute('data-color-mode', 'light')
  expect(await shell.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Lato')
  expect(await page.evaluate(() => document.fonts.check('16px Lato'))).toBe(true)

  const declineAnalytics = page.getByRole('button', { name: 'No thanks' })
  if (await declineAnalytics.isVisible()) await declineAnalytics.click()

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark')
  await expect(shell).toHaveAttribute('data-color-mode', 'dark')

  await reloadHydrated(page)
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])
})
