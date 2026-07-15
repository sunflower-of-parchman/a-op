import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { gotoHydrated } from './helpers'

const enabled = process.env.TEST_OAUTH_ENABLED === '1'

test('keeps optional provider sign-in closed until an artist configures it', async ({
  page,
  request,
}) => {
  test.skip(enabled, 'The enabled-provider contract runs in the dedicated OAuth gate.')

  const options = await request.get('/api/auth/options')
  expect(await options.json()).toEqual({ email: true, oauthProviders: [] })

  await gotoHydrated(page, '/sign-in')
  await expect(page.getByText('Or continue with')).toHaveCount(0)

  const refused = await request.post('/api/auth/oauth', {
    data: { provider: 'google', redirect: '/account' },
  })
  expect(refused.status()).toBe(404)
})

test('offers only configured providers and starts a return-bound PKCE flow', async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(!enabled, 'Provider configuration is exercised in the dedicated OAuth gate.')

  await gotoHydrated(page, '/sign-in?redirect=/learn')
  await expect(page.getByRole('button', { name: 'Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'GitHub' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apple' })).toHaveCount(0)

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([])

  const started = await request.post('/api/auth/oauth', {
    data: { provider: 'google', redirect: '/learn' },
  })
  expect(started.ok()).toBe(true)
  const body = await started.json()
  const authorization = new URL(body.url)
  expect(authorization.origin).toBe('http://127.0.0.1:54321')
  expect(authorization.pathname).toBe('/auth/v1/authorize')
  expect(authorization.searchParams.get('provider')).toBe('google')
  expect(authorization.searchParams.get('redirect_to')).toBe(`${baseURL}/api/auth/oauth/callback`)
  expect(authorization.searchParams.get('code_challenge')).toBeTruthy()
  expect(authorization.searchParams.get('code_challenge_method')).toBe('s256')
  expect(started.headers()['set-cookie']).toContain('artist-oauth-code-verifier=')
  expect(started.headers()['set-cookie']).toContain('artist-oauth-return=%2Flearn')
  expect(started.headers()['set-cookie']).toContain('HttpOnly')
  expect(started.headers()['set-cookie']).toContain('SameSite=Lax')

  const cancelled = await request.get('/api/auth/oauth/callback', { maxRedirects: 0 })
  expect(cancelled.status()).toBe(303)
  expect(cancelled.headers().location).toBe(`${baseURL}/sign-in?oauth=failed`)
  expect(cancelled.headers()['set-cookie']).toContain('artist-oauth-code-verifier=;')
  expect(cancelled.headers()['set-cookie']).toContain('artist-oauth-return=;')

  const disabled = await request.post('/api/auth/oauth', {
    data: { provider: 'apple', redirect: '/account' },
  })
  expect(disabled.status()).toBe(404)

  const unsafeReturn = await request.post('/api/auth/oauth', {
    data: { provider: 'github', redirect: '//malicious.example' },
  })
  expect(unsafeReturn.ok()).toBe(true)
  expect(unsafeReturn.headers()['set-cookie']).toContain('artist-oauth-return=%2Faccount')
})
