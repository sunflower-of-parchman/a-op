import { execFileSync } from 'node:child_process'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const owner = { email: 'owner@daymark.local', password: 'Daymark-Owner-2026!' }

function waveFile() {
  const sampleRate = 8_000
  const samples = sampleRate
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * 2 * Math.PI * 330) * 10_000)
    buffer.writeInt16LE(sample, 44 + index * 2)
  }
  return buffer
}

async function signInAsOwner(page: Page, redirect: string) {
  await page.goto(`/sign-in?redirect=${encodeURIComponent(redirect)}`)
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeEnabled()
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Password').fill(owner.password)
  await button.click()
  await expect(page).toHaveURL((url) => url.pathname === redirect)
}

test('authors, uploads, processes, and explicitly publishes a release', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The catalog mutation journey runs once against the shared database.',
  )
  await signInAsOwner(page, '/admin/music')
  await expect(
    page.getByRole('heading', { name: 'Shape the catalog, then publish it.' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'New release' }).click()
  await expect(page.getByText('Unsaved private changes.')).toBeVisible()
  const form = page.locator('.catalog-edit-form')
  const releaseFields = form.locator('section').first()
  await releaseFields.getByLabel('Title', { exact: true }).fill('Browser Session')
  await releaseFields.getByLabel('Slug', { exact: true }).fill('browser-session')
  await releaseFields
    .getByLabel('Description', { exact: true })
    .fill('A release authored through the artist-owned catalog workspace.')
  await page
    .getByLabel(/Bulk entry/)
    .fill('Opening Tone | opening-tone\nSecond Motion | second-motion')
  await page.getByRole('button', { name: 'Apply bulk list' }).click()
  await expect(page.getByText('2 proposed tracks applied to the draft.')).toBeVisible()

  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Release draft saved privately.')).toBeVisible()
  await expect(page.locator('input[accept^="audio/"]')).toHaveCount(2)

  const publicBefore = await page.request.get('/api/catalog?draft=browser-session-before')
  const beforeCatalog = await publicBefore.json()
  expect(beforeCatalog.releases).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: 'browser-session' })]),
  )

  await page.locator('input[accept^="audio/"]').first().setInputFiles({
    name: 'opening-tone.wav',
    mimeType: 'audio/wav',
    buffer: waveFile(),
  })
  await expect(page.getByText('Source uploaded directly and queued for processing.')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/Source pending · job pending/)).toBeVisible()

  await page.getByLabel('Release artwork').evaluate(async (input: HTMLInputElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 800
    const context = canvas.getContext('2d')!
    context.fillStyle = '#d9ff43'
    context.fillRect(0, 0, 800, 800)
    context.fillStyle = '#10110d'
    context.fillRect(96, 96, 608, 608)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG fixture failed.'))),
        'image/png',
      ),
    )
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'browser-session.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(
    page.getByText('Artwork validated, optimized to WebP, and attached to the private draft.'),
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Artwork attached/)).toBeVisible()

  const workerOutput = execFileSync(
    process.execPath,
    ['--experimental-strip-types', 'workers/media/index.ts', '--once'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, MEDIA_WORKER_ID: 'browser-catalog-test', MEDIA_PREVIEW_SECONDS: '1' },
    },
  )
  expect(workerOutput).toContain('"event":"media-job-ready"')

  await page.reload()
  await expect(page.getByText(/Source ready · job ready/).first()).toBeVisible()
  await expect(page.getByText('Public preview ready.').first()).toBeVisible()

  await page.getByRole('button', { name: 'Add credit' }).click()
  const credit = page.locator('.credit-editor li').last()
  await credit.getByLabel('Role').fill('Composer')
  await credit.getByLabel('Name').fill('Browser Artist')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Publish release' }).click()
  await expect(page.getByText('Release published from the approved draft.')).toBeVisible()

  await page.goto('/music/browser-session')
  await expect(page.getByRole('heading', { name: 'Browser Session' })).toBeVisible()
  await expect(page.getByText('Opening Tone', { exact: true })).toBeVisible()
  await expect(page.getByText('Second Motion', { exact: true })).toBeVisible()
  await expect(page.getByText('Browser Artist', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play public preview' })).toBeVisible()
})

test('drafts, orders, and explicitly publishes a collection', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The collection mutation journey runs once against the shared database.',
  )
  await signInAsOwner(page, '/admin/collections')
  await expect(
    page.getByRole('heading', { name: 'Make another authored way through the music.' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'New collection' }).click()
  await expect(page.getByText('Unsaved private changes.')).toBeVisible()
  const identity = page.locator('.catalog-edit-form section').first()
  await identity.getByLabel('Title', { exact: true }).fill('Browser Path')
  await identity.getByLabel('Slug', { exact: true }).fill('browser-path')
  await identity
    .getByLabel('Description', { exact: true })
    .fill('A separately authored route through already-published music.')

  for (const title of ['First Light, Repeated', 'Turn Toward Home']) {
    await page
      .locator('.collection-track-pool li')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Add' })
      .click()
  }
  const collectionOrder = page.locator('.collection-order > li')
  await expect(collectionOrder).toHaveCount(2)
  await collectionOrder.first().getByRole('button', { name: 'Down' }).click()
  await collectionOrder.first().getByLabel('Optional collection note').fill('Begin with return.')

  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Collection draft saved privately.')).toBeVisible()
  const publicBefore = await page.request.get('/api/catalog?draft=browser-path-before')
  const beforeCatalog = await publicBefore.json()
  expect(beforeCatalog.collections).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: 'browser-path' })]),
  )

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Publish collection' }).click()
  await expect(page.getByText('Collection published from the approved draft.')).toBeVisible()

  await page.goto('/music/collections/browser-path')
  await expect(page.getByRole('heading', { name: 'Browser Path' })).toBeVisible()
  await expect(page.locator('.tracklist__title')).toHaveText([
    'Turn Toward Home',
    'First Light, Repeated',
  ])
  await expect(page.getByRole('button', { name: 'Play Turn Toward Home' })).toBeVisible()
})

test('keeps music administration accessible within desktop and mobile viewports', async ({
  page,
}) => {
  await signInAsOwner(page, '/admin/music')
  await expect(
    page.getByRole('heading', { name: 'Shape the catalog, then publish it.' }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])

  await page.goto('/admin/collections')
  await expect(
    page.getByRole('heading', { name: 'Make another authored way through the music.' }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const collectionResults = await new AxeBuilder({ page }).analyze()
  expect(
    collectionResults.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
})
