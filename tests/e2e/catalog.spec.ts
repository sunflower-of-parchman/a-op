import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test('preserves authored catalog order and one player across routes', async ({ page }) => {
  await gotoHydrated(page, '/music')
  const trackTitles = page.locator('.music-track-row__title')
  await expect(trackTitles).toHaveText([
    'First Light, Repeated',
    'A Measure of Distance',
    'Turn Toward Home',
  ])

  await page.getByLabel('Meter').selectOption('3/4')
  await expect(trackTitles).toHaveText(['A Measure of Distance'])
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByLabel('Sort tracks').selectOption('tempo_desc')
  await expect(trackTitles).toHaveText([
    'Turn Toward Home',
    'First Light, Repeated',
    'A Measure of Distance',
  ])
  await page.getByLabel('Sort tracks').selectOption('authored')

  const musicViews = page.getByRole('navigation', { name: 'Music catalog views' })
  await musicViews.getByRole('button', { name: /Collections/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Collections' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Movement Studies' })).toBeVisible()
  await musicViews.getByRole('button', { name: /Playlists/ }).click()
  await expect(
    page.getByRole('heading', { level: 3, name: 'Sign in to reach your playlists.' }),
  ).toBeVisible()
  await musicViews.getByRole('button', { name: /Albums/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Albums' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  const catalogResults = await new AxeBuilder({ page }).analyze()
  expect(
    catalogResults.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])

  await page.locator('.music-album').filter({ hasText: 'Lines We Carry' }).click()
  await expect(page).toHaveURL(/\/music\/lines-we-carry$/)
  await expect(page.locator('audio')).toHaveCount(1)
  await page.getByRole('button', { name: 'Play public preview' }).click()
  await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.pause())
  await expect(page.getByText('Public preview playback verified.')).toBeVisible()
  const originalSource = await page.locator('audio').getAttribute('src')
  expect(originalSource).toContain('first-light-repeated-preview.wav')

  await expect(page.getByRole('button', { name: 'Play current track' })).toBeVisible()
  await page
    .getByRole('list', { name: 'Release track list' })
    .getByRole('link', { name: 'First Light, Repeated' })
    .click()
  await expect(page).toHaveURL(/\/music\/tracks\/first-light-repeated$/)
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(page.locator('audio')).toHaveAttribute('src', originalSource ?? '')

  await page.getByRole('button', { name: 'Next track' }).click()
  await expect(page.locator('.global-player__identity a')).toHaveText('A Measure of Distance')
  await expect(page.locator('.global-player__timeline input')).toBeVisible()

  await gotoHydrated(page, '/music/collections/movement-studies')
  await expect(page.locator('.tracklist__title')).toHaveText([
    'Turn Toward Home',
    'First Light, Repeated',
  ])
  await expect(page.locator('audio')).toHaveCount(1)

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])
})
