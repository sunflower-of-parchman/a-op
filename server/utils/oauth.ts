import { createError, getRequestURL, type H3Event } from 'h3'
import { resolveBrowserDestination, resolvePublicSiteOrigin } from '#shared/utils/urlSafety'

export function oauthSiteOrigin(event: H3Event) {
  const configured = useRuntimeConfig(event).public.siteUrl
  const origin = resolvePublicSiteOrigin(configured || getRequestURL(event).origin)
  if (!origin) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The public site origin must use HTTPS or a local loopback address.',
    })
  }
  return origin
}

export function oauthReturnPath(event: H3Event, value?: string) {
  const origin = oauthSiteOrigin(event)
  const destination = resolveBrowserDestination(value || '/account', 'same-origin', origin)
  if (!destination) return '/account'
  const url = new URL(destination)
  return `${url.pathname}${url.search}${url.hash}`
}

export function assertOAuthAuthorizationUrl(event: H3Event, value: string) {
  const supabaseOrigin = resolvePublicSiteOrigin(useRuntimeConfig(event).public.supabaseUrl)
  const destination = supabaseOrigin
    ? resolveBrowserDestination(value, 'https-or-local', supabaseOrigin)
    : null
  const url = destination ? new URL(destination) : null

  if (!url || url.origin !== supabaseOrigin || !url.pathname.endsWith('/auth/v1/authorize')) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The authentication provider destination was refused.',
    })
  }
  return url.toString()
}
