import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const listeners = {
  one: { email: 'listener-one@daymark.local', password: 'Daymark-Listener-2026!' },
  two: { email: 'listener-two@daymark.local', password: 'Daymark-Listener-2026!' },
}

async function signIn(page: Page, account: (typeof listeners)['one'], redirect: string) {
  await page.goto(`/sign-in?redirect=${encodeURIComponent(redirect)}`)
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeEnabled()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await button.click()
  await expect(page).toHaveURL((url) => url.pathname === redirect)
}

test('keeps favorites, playlists, order, and history isolated to one listener', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The customer-library mutation journey runs once against the shared database.',
  )
  await signIn(page, listeners.one, '/music/tracks/first-light-repeated')

  const initialLibraryResponse = await page.request.get('/api/library')
  expect(initialLibraryResponse.ok()).toBe(true)
  const initialLibrary = await initialLibraryResponse.json()
  const existingFavorite = initialLibrary.favorites.find(
    ({ slug }: { slug: string }) => slug === 'first-light-repeated',
  )
  if (existingFavorite) {
    const favoriteReset = await page.request.post('/api/library/favorites', {
      data: { trackId: existingFavorite.id, favorite: false },
    })
    expect(favoriteReset.ok()).toBe(true)
  }
  for (const playlist of initialLibrary.playlists.filter(
    ({ title }: { title: string }) => title === 'Quiet Sequence',
  )) {
    await page.request.delete(`/api/library/playlists/${playlist.id}`)
  }
  await page.reload()

  await page.getByRole('button', { name: 'Save to favorites' }).click()
  await expect(page.getByText('Track saved to favorites.')).toBeVisible()
  await page.goto('/account')
  const favorites = page.getByRole('region', { name: 'Music you chose to keep close.' })
  await expect(favorites.getByRole('link', { name: 'First Light, Repeated' })).toBeVisible()

  const createPlaylist = page.getByRole('button', { name: 'Create playlist' })
  await expect(createPlaylist).toBeDisabled()
  await page.getByLabel('New playlist title').fill('Quiet Sequence')
  await expect(createPlaylist).toBeEnabled()
  await createPlaylist.click()
  await expect(page.getByText('Playlist created.')).toBeVisible()

  for (const slug of ['first-light-repeated', 'a-measure-of-distance']) {
    await page.goto(`/music/tracks/${slug}`)
    const playlistSelect = page.getByLabel('Playlist')
    await expect(playlistSelect).toBeEnabled()
    await playlistSelect.selectOption({ label: 'Quiet Sequence' })
    await expect(playlistSelect).not.toHaveValue('')
    const addToPlaylist = page.getByRole('button', { name: 'Add to playlist' })
    await expect(addToPlaylist).toBeEnabled()
    await addToPlaylist.click()
    await expect(page.getByText('Track added to Quiet Sequence.')).toBeVisible()
  }

  await page.goto('/music/tracks/first-light-repeated')
  await page.getByRole('button', { name: 'Play public preview' }).click()
  const playerPlay = page.getByRole('button', { name: 'Play current track' })
  await expect(playerPlay).toBeEnabled()
  await playerPlay.click()
  const pause = page.getByRole('button', { name: 'Pause current track' })
  await expect(pause).toBeVisible()
  await page.waitForTimeout(250)
  await pause.click()
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/library?history=${Date.now()}`)
      const library = await response.json()
      return library.authenticated ? library.history.length : 0
    })
    .toBeGreaterThan(0)

  await page.goto('/account')
  const playlist = page.locator('.playlist-library article').filter({ hasText: 'Quiet Sequence' })
  await expect(playlist.locator('li a')).toHaveText([
    'First Light, Repeated',
    'A Measure of Distance',
  ])
  await playlist.locator('li').first().getByRole('button', { name: 'Down' }).click()
  await expect(page.getByText('Playlist order updated.')).toBeVisible()
  await expect(playlist.locator('li a')).toHaveText([
    'A Measure of Distance',
    'First Light, Repeated',
  ])
  await expect(
    page.getByRole('region', { name: 'Recent points of return.' }).getByRole('link').first(),
  ).toHaveText('First Light, Repeated')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, listeners.two, '/account')
  await expect(
    page.getByText('Tracks saved from their catalog pages will gather here.'),
  ).toBeVisible()
  await expect(page.getByText('Quiet Sequence')).toHaveCount(0)
  await expect(
    page.getByText('Signed-in preview listening will appear here after a pause or completion.'),
  ).toBeVisible()
})

test('keeps the customer account surface accessible and within the viewport', async ({ page }) => {
  await page.goto('/account')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])
})
