import { createError, getHeader, getMethod, getRequestPath, getRequestURL, type H3Event } from 'h3'
import { resolvePublicSiteOrigin } from '#shared/utils/urlSafety'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const originExemptPaths = new Set(['/api/webhooks/stripe'])

function allowedOrigins(event: H3Event) {
  const requestOrigin = resolvePublicSiteOrigin(getRequestURL(event).origin)
  const configuredOrigin = resolvePublicSiteOrigin(useRuntimeConfig(event).public.siteUrl)
  return new Set(
    [requestOrigin, configuredOrigin].filter((value): value is string => Boolean(value)),
  )
}

export default defineEventHandler((event) => {
  const method = getMethod(event).toUpperCase()
  const path = getRequestPath(event)
  if (safeMethods.has(method) || originExemptPaths.has(path)) return

  if (getHeader(event, 'sec-fetch-site') === 'cross-site') {
    throw createError({ statusCode: 403, statusMessage: 'Cross-site state changes are refused.' })
  }

  const origin = getHeader(event, 'origin')
  if (origin && !allowedOrigins(event).has(origin)) {
    throw createError({ statusCode: 403, statusMessage: 'The request origin is not allowed.' })
  }
})
