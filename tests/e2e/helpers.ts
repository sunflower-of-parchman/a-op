import { expect, type Page } from '@playwright/test'

export async function gotoHydrated(page: Page, url: string) {
  const response = await page.goto(url)
  await expect(page.locator('.site-shell')).toHaveAttribute('data-hydrated', 'true')
  return response
}

export async function reloadHydrated(page: Page) {
  const response = await page.reload()
  await expect(page.locator('.site-shell')).toHaveAttribute('data-hydrated', 'true')
  return response
}
