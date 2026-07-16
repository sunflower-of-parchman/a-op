import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

test('labels the artist-editable elements in the first-clone layout', async ({ page }) => {
  await gotoHydrated(page, '/')

  await expect(page.locator('.site-shell')).toHaveAttribute('data-starter-layout', 'true')
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
