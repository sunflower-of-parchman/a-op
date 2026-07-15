export type BrowserDestinationPolicy =
  'same-origin' | 'https-or-local' | 'stripe-checkout' | 'stripe-portal'

export function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function parseUrl(value: string, base?: string) {
  try {
    const url = base ? new URL(value, base) : new URL(value)
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

export function resolvePublicSiteOrigin(value: string) {
  const url = parseUrl(value)
  if (!url) return null
  if (url.protocol === 'https:') return url.origin
  if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) return url.origin
  return null
}

export function resolveBrowserDestination(
  value: string,
  policy: BrowserDestinationPolicy,
  browserOrigin: string,
) {
  const base = parseUrl(browserOrigin)
  const destination = base ? parseUrl(value, base.origin) : null
  if (!base || !destination) return null

  if (policy === 'same-origin') {
    return destination.origin === base.origin ? destination.toString() : null
  }

  if (policy === 'stripe-checkout') {
    return destination.protocol === 'https:' && destination.hostname === 'checkout.stripe.com'
      ? destination.toString()
      : null
  }

  if (policy === 'stripe-portal') {
    return destination.protocol === 'https:' && destination.hostname === 'billing.stripe.com'
      ? destination.toString()
      : null
  }

  if (destination.protocol === 'https:') return destination.toString()
  if (destination.origin === base.origin && ['http:', 'https:'].includes(destination.protocol)) {
    return destination.toString()
  }
  if (destination.protocol === 'http:' && isLoopbackHostname(destination.hostname)) {
    return destination.toString()
  }
  return null
}
