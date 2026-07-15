import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('preserves authored catalog order and one player across routes', async ({ page }) => {
  await page.goto('/music')
  const releaseTracks = page.locator('.compact-tracklist li')
  await expect(releaseTracks).toHaveText([
    '01First Light, Repeated',
    '02A Measure of Distance',
    '03Turn Toward Home',
  ])

  await page.getByRole('link', { name: 'Lines We Carry', exact: true }).click()
  await expect(page).toHaveURL(/\/music\/lines-we-carry$/)
  await expect(page.locator('audio')).toHaveCount(1)
  await page.getByRole('button', { name: 'Play public preview' }).click()
  await expect(page.getByText('Public preview playback verified.')).toBeVisible()
  const originalSource = await page.locator('audio').getAttribute('src')
  expect(originalSource).toContain('first-light-repeated-preview.wav')

  await page.getByRole('button', { name: 'Pause current track' }).click()
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

  await page.goto('/music/collections/movement-studies')
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
