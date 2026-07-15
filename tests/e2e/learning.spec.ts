import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './helpers'

const accounts = {
  listenerOne: { email: 'listener-one@daymark.local', password: 'Daymark-Listener-2026!' },
  listenerTwo: { email: 'listener-two@daymark.local', password: 'Daymark-Listener-2026!' },
  owner: { email: 'owner@daymark.local', password: 'Daymark-Owner-2026!' },
}
const pathSlug = 'listening-with-the-whole-phrase'
const publicLesson = 'hear-the-first-arc'
const memberLesson = 'hold-the-suspended-moment'
const accountLesson = 'return-with-context'
const memberDownloadSection = '10000000-0000-4000-8000-000000000025'

test.describe.configure({ mode: 'serial' })

async function waitForHydration(page: Page) {
  await expect(page.locator('.site-shell')).toHaveAttribute('data-hydrated', 'true')
}

async function signIn(page: Page, account: (typeof accounts)['listenerOne'], redirect: string) {
  await gotoHydrated(page, `/sign-in?redirect=${encodeURIComponent(redirect)}`)
  await waitForHydration(page)
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeEnabled()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await button.click()
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === redirect)
}

test('preserves public order, mixed media, access explanations, and private embeds', async ({
  page,
}) => {
  await gotoHydrated(page, '/learn')
  await expect(
    page.getByRole('heading', { name: 'Teaching that stays close to the music.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Listening with the whole phrase' })).toBeVisible()
  await waitForHydration(page)
  const pathLink = page.getByRole('link', { name: 'Open the path' })
  await expect(pathLink).toHaveAttribute('href', `/learn/${pathSlug}`)
  await pathLink.click()
  await expect(page).toHaveURL(`/learn/${pathSlug}`)
  const lessons = page.locator('.lesson-order > li')
  await expect(lessons).toHaveCount(3)
  await expect(lessons.nth(0)).toContainText('Hear the first arc')
  await expect(lessons.nth(1)).toContainText('Hold the suspended moment')
  await expect(lessons.nth(2)).toContainText('Return with context')

  await gotoHydrated(page, `/learn/${pathSlug}/${publicLesson}`)
  await expect(page.getByRole('heading', { name: 'Hear the first arc' })).toBeVisible()
  await expect(page.locator('.safe-rich-text strong')).toContainText('counting')
  await expect(page.locator('.safe-rich-text ul > li')).toHaveCount(3)
  await expect(page.locator('.lesson-section--image img')).toHaveAttribute(
    'alt',
    'Three warm arcs rise, suspend, and return across a dark field.',
  )
  await expect(page.locator('.lesson-section--audio audio')).toHaveCount(1)

  await gotoHydrated(page, `/learn/${pathSlug}/${memberLesson}`)
  await expect(page.getByText('Daymark Circle members can open this studio lesson.')).toBeVisible()
  await expect(page.getByText('Suspension still has direction.')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Sign in to continue' })).toBeVisible()

  await gotoHydrated(page, `/learn/${pathSlug}/${accountLesson}`)
  await expect(page.getByRole('link', { name: 'Sign in to continue' })).toBeVisible()

  await gotoHydrated(page, '/video/external-video-with-context')
  await expect(page.getByRole('button', { name: 'Load external video' })).toBeVisible()
  await expect(page.locator('.external-video-poster')).toHaveAttribute(
    'src',
    '/demo/video-poster.svg',
  )
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByText('Read transcript').click()
  await expect(page.getByText(/official YouTube IFrame API sample video/)).toBeVisible()
  await page.getByRole('button', { name: 'Load external video' }).click()
  await expect(page.locator('iframe[title="External video, presented with context"]')).toBeVisible()

  await gotoHydrated(page, '/journal/what-a-phrase-carries')
  await expect(page.getByRole('heading', { name: 'What a phrase carries' })).toBeVisible()
  await expect(page.getByText(/An arrival belongs to the path/)).toBeVisible()
})

test('lets a verified member complete protected learning and isolates progress and media', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The membership and progress journey runs once against the shared local database.',
  )
  await signIn(page, accounts.listenerOne, '/support')
  const membership = page
    .locator('.offering-list article')
    .filter({ hasText: 'Daymark Circle membership' })
  await membership.getByRole('button', { name: 'Join the membership' }).click()
  await expect(page).toHaveURL(/\/checkout\/simulated\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: 'Complete simulated payment' }).click()
  await expect(page.getByText('Simulation complete. Your account access is ready.')).toBeVisible()

  await gotoHydrated(page, `/learn/${pathSlug}/${publicLesson}`)
  await page.getByRole('button', { name: 'Mark lesson complete' }).click()
  await expect(page.getByText('Lesson completed. Your next lesson is ready.')).toBeVisible()

  await gotoHydrated(page, `/learn/${pathSlug}/${memberLesson}`)
  await expect(page.getByText('Suspension still has direction.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load external video' })).toBeVisible()
  const allowed = await page.request.get(`/api/learning/media/${memberDownloadSection}`, {
    maxRedirects: 0,
  })
  expect(allowed.status()).toBe(302)
  await page.getByRole('button', { name: 'Mark lesson complete' }).click()
  await expect(page.getByText('Lesson completed. Your next lesson is ready.')).toBeVisible()

  await gotoHydrated(page, '/account')
  const learning = page.getByRole('region', { name: 'Resume the next meaningful lesson.' })
  await expect(learning.getByRole('link', { name: /Continue Return with context/ })).toBeVisible()
  const accountResponse = await page.request.get('/api/learning/account')
  const account = await accountResponse.json()
  expect(account.paths[0].completedLessons).toBe(2)
  expect(account.paths[0].nextLesson.slug).toBe(accountLesson)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, accounts.listenerTwo, '/account')
  const denied = await page.request.get(`/api/learning/media/${memberDownloadSection}`, {
    maxRedirects: 0,
  })
  expect(denied.status()).toBe(403)
  const otherAccount = await (await page.request.get('/api/learning/account')).json()
  expect(otherAccount.paths[0].completedLessons).toBe(0)
})

test('keeps artist drafts private until explicit editorial publication', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000)
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'The publication mutation journey runs once against the shared local database.',
  )
  await signIn(page, accounts.owner, '/admin/learning')
  await expect(
    page.getByRole('heading', { name: 'Author the sequence, access, and return.' }),
  ).toBeVisible()
  await expect(page.getByText('Lesson 2 · Hold the suspended moment')).toBeVisible()
  await expect(page.getByText(/Hold the suspended moment · membership · 4 sections/)).toBeVisible()
  await page.locator('.learning-preview-courses summary').first().click()
  await expect(page.locator('.learning-preview-sections .safe-rich-text strong')).toContainText(
    'counting',
  )
  await expect(page.locator('.learning-preview-sections img')).toBeVisible()
  await expect(page.locator('.learning-preview-sections audio')).toHaveCount(2)
  await gotoHydrated(page, '/admin/videos')
  await waitForHydration(page)
  await expect(page.getByRole('textbox', { name: 'Complete transcript', exact: true })).toHaveValue(
    /official YouTube IFrame API sample/,
  )

  const unsafeEditorial = await page.request.put('/api/admin/editorial', {
    data: {
      id: '80000000-0000-4000-8000-000000000010',
      kind: 'essay',
      slug: 'unsafe-editorial',
      title: 'Unsafe editorial',
      summary: 'Validation fixture.',
      publishedOn: '2026-07-15',
      sections: [
        {
          id: '80000000-0000-4000-8000-000000000011',
          type: 'prose',
          heading: 'Unsafe',
          body: '<script>alert(1)</script>',
        },
      ],
    },
  })
  expect(unsafeEditorial.status()).toBe(400)
  const learningDrafts = await (await page.request.get('/api/admin/learning')).json()
  const unsafeLearning = structuredClone(learningDrafts.drafts[0])
  unsafeLearning.courses[0].lessons[0].sections[0].body =
    '[Unsafe external link](http://example.com)'
  const unsafeLearningResponse = await page.request.put('/api/admin/learning', {
    data: unsafeLearning,
  })
  expect(unsafeLearningResponse.status()).toBe(400)

  await gotoHydrated(page, '/admin/editorial')
  await waitForHydration(page)
  const title = page.getByLabel('Title')
  const originalTitle = await title.inputValue()
  const draftTitle = `${originalTitle} browser draft`
  await title.fill(draftTitle)
  await page.getByRole('button', { name: 'Save private draft' }).click()
  await expect(
    page.getByText('Editorial draft saved. Raw HTML and scripts are excluded.'),
  ).toBeVisible()
  const savedDrafts = await (await page.request.get('/api/admin/editorial')).json()
  expect(
    savedDrafts.drafts.find(({ slug }: { slug: string }) => slug === 'what-a-phrase-carries').title,
  ).toBe(draftTitle)
  await gotoHydrated(page, '/journal')
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible()
  await expect(page.getByRole('heading', { name: draftTitle })).toHaveCount(0)

  await gotoHydrated(page, '/admin/editorial')
  await waitForHydration(page)
  await expect(page.getByLabel('Title')).toHaveValue(draftTitle)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Publish approved work' }).click()
  await expect(page.getByText('Editorial work published from the approved draft.')).toBeVisible()
  await gotoHydrated(page, '/journal')
  await expect(page.getByRole('heading', { name: draftTitle })).toBeVisible()

  await gotoHydrated(page, '/admin/editorial')
  await waitForHydration(page)
  await page.getByLabel('Title').fill(originalTitle)
  await page.getByRole('button', { name: 'Save private draft' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Publish approved work' }).click()
  await expect(page.getByText('Editorial work published from the approved draft.')).toBeVisible()
})

test('keeps learning, video, editorial, and owner surfaces accessible and within the viewport', async ({
  page,
}) => {
  test.setTimeout(60_000)
  for (const path of [
    '/learn',
    `/learn/${pathSlug}`,
    `/learn/${pathSlug}/${publicLesson}`,
    '/video',
    '/video/external-video-with-context',
    '/journal',
    '/journal/what-a-phrase-carries',
  ]) {
    await gotoHydrated(page, path)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([])
  }

  await signIn(page, accounts.owner, '/admin/learning')
  for (const path of ['/admin/learning', '/admin/videos', '/admin/editorial']) {
    await gotoHydrated(page, path)
    await waitForHydration(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
    ).toEqual([])
  }
})
