import type { BrowserDestinationPolicy } from '#shared/utils/urlSafety'
import { resolveBrowserDestination } from '#shared/utils/urlSafety'

export function assignSafeDestination(value: string, policy: BrowserDestinationPolicy) {
  const destination = resolveBrowserDestination(value, policy, window.location.origin)
  if (!destination) throw new Error('The destination did not pass the navigation policy.')
  window.location.assign(destination)
}

export function resolveSafeInternalPath(value: string, fallback = '/') {
  const destination = resolveBrowserDestination(value, 'same-origin', window.location.origin)
  if (!destination) return fallback
  const url = new URL(destination)
  return `${url.pathname}${url.search}${url.hash}`
}
