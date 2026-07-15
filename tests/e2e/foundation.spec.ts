import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('presents the fictional artist and working navigation', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Music made for attentive rooms',
  )
  await expect(page.getByText('fictional artist', { exact: false }).first()).toBeVisible()

  await page.getByRole('link', { name: 'Music', exact: true }).click()
  await expect(page).toHaveURL(/\/music$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Music in authored order.')
})

test('has no automatically detectable serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  )

  expect(serious).toEqual([])
})
