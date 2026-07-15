import { describe, expect, it } from 'vitest'
import { resolveBrowserDestination, resolvePublicSiteOrigin } from '../../shared/utils/urlSafety'

describe('URL trust boundaries', () => {
  const origin = 'http://127.0.0.1:3000'

  it('accepts HTTPS and loopback public origins without paths or credentials', () => {
    expect(resolvePublicSiteOrigin('https://artist.example/path')).toBe('https://artist.example')
    expect(resolvePublicSiteOrigin('http://127.0.0.1:3000')).toBe(origin)
    expect(resolvePublicSiteOrigin('http://artist.example')).toBeNull()
    expect(resolvePublicSiteOrigin('https://user:secret@artist.example')).toBeNull()
  })

  it('keeps same-origin navigation on the current site', () => {
    expect(resolveBrowserDestination('/account', 'same-origin', origin)).toBe(
      'http://127.0.0.1:3000/account',
    )
    expect(resolveBrowserDestination('//malicious.example', 'same-origin', origin)).toBeNull()
    expect(resolveBrowserDestination('javascript:alert(1)', 'same-origin', origin)).toBeNull()
  })

  it('allows HTTPS delivery and local development while denying insecure remote URLs', () => {
    expect(
      resolveBrowserDestination('https://storage.example/file', 'https-or-local', origin),
    ).toBe('https://storage.example/file')
    expect(
      resolveBrowserDestination('http://127.0.0.1:54321/storage/file', 'https-or-local', origin),
    ).toBe('http://127.0.0.1:54321/storage/file')
    expect(
      resolveBrowserDestination('http://storage.example/file', 'https-or-local', origin),
    ).toBeNull()
  })

  it('pins provider redirects to the expected Stripe hosts', () => {
    expect(
      resolveBrowserDestination(
        'https://checkout.stripe.com/c/pay/test',
        'stripe-checkout',
        origin,
      ),
    ).toBe('https://checkout.stripe.com/c/pay/test')
    expect(
      resolveBrowserDestination(
        'https://billing.stripe.com/p/session/test',
        'stripe-portal',
        origin,
      ),
    ).toBe('https://billing.stripe.com/p/session/test')
    expect(
      resolveBrowserDestination('https://stripe.example/checkout', 'stripe-checkout', origin),
    ).toBeNull()
  })
})
