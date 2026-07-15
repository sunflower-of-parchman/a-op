import type {
  TelemetryCollectionResponse,
  TelemetryConsentPreference,
  TelemetryEventName,
  TelemetryPolicyResponse,
  TelemetryResourceType,
} from '#shared/types/telemetry'

const preferenceKey = 'artist-telemetry-consent'
const sessionKey = 'artist-telemetry-session'

type TrackOptions = {
  resourceType?: TelemetryResourceType
  resourceKey?: string
  value?: number
  path?: string
}

function browserPrivacySignal() {
  if (!import.meta.client) return false
  const navigatorWithGpc = navigator as Navigator & { globalPrivacyControl?: boolean }
  return navigatorWithGpc.globalPrivacyControl === true || navigator.doNotTrack === '1'
}

function pageKey(path: string) {
  const normalized = path
    .split('?')[0]
    ?.replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return normalized || 'home'
}

function safeInternalPath(path: string) {
  const withoutQuery = path.split('?')[0] || '/'
  return withoutQuery.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    'identifier',
  )
}

export function useTelemetry() {
  const policy = useState<TelemetryPolicyResponse | null>('telemetry-policy', () => null)
  const preference = useState<TelemetryConsentPreference>('telemetry-preference', () => 'unset')
  const sessionId = useState<string>('telemetry-session', () => '')
  const initialized = useState<boolean>('telemetry-initialized', () => false)
  const trackedPages = useState<string[]>('telemetry-tracked-pages', () => [])
  const localPrivacySignal = useState<boolean>('telemetry-local-privacy-signal', () => false)

  const privacySignal = computed(
    () => Boolean(policy.value?.privacySignal) || localPrivacySignal.value,
  )
  const canCollect = computed(() => {
    if (!policy.value?.optionalEnabled || privacySignal.value || preference.value === 'denied') {
      return false
    }
    return policy.value.consentMode === 'implied' || preference.value === 'granted'
  })

  async function loadPolicy() {
    if (!import.meta.client) return
    localPrivacySignal.value = browserPrivacySignal()
    const stored = localStorage.getItem(preferenceKey)
    preference.value = stored === 'granted' || stored === 'denied' ? stored : 'unset'
    sessionId.value = sessionStorage.getItem(sessionKey) ?? crypto.randomUUID()
    sessionStorage.setItem(sessionKey, sessionId.value)
    try {
      policy.value = await $fetch<TelemetryPolicyResponse>('/api/telemetry/policy')
    } catch {
      policy.value = {
        optionalEnabled: false,
        consentMode: 'opt_in',
        retentionDays: 90,
        meaningfulListenSeconds: 10,
        privacySignal: localPrivacySignal.value,
        purposes: [],
      }
    } finally {
      initialized.value = true
    }
  }

  function setConsent(value: Exclude<TelemetryConsentPreference, 'unset'>) {
    if (!import.meta.client) return
    preference.value = value
    localStorage.setItem(preferenceKey, value)
  }

  async function track(eventName: TelemetryEventName, options: TrackOptions = {}) {
    if (!import.meta.client || !canCollect.value || !sessionId.value) return false
    const route = useRoute()
    const path = safeInternalPath(options.path ?? route.path)
    try {
      const response = await $fetch<TelemetryCollectionResponse>('/api/telemetry/event', {
        method: 'POST',
        body: {
          id: crypto.randomUUID(),
          eventName,
          sessionId: sessionId.value,
          path,
          resourceType: options.resourceType ?? null,
          resourceKey: options.resourceKey ?? null,
          value: options.value ?? null,
          consentState: preference.value === 'granted' ? 'granted' : 'implied',
        },
      })
      return response.collected
    } catch {
      return false
    }
  }

  async function trackPage(path: string) {
    const safePath = safeInternalPath(path)
    if (trackedPages.value.includes(safePath)) return false
    const collected = await track('page_view', {
      path: safePath,
      resourceType: 'page',
      resourceKey: pageKey(safePath),
    })
    if (collected) trackedPages.value = [...trackedPages.value, safePath]
    return collected
  }

  return {
    policy: readonly(policy),
    preference: readonly(preference),
    initialized: readonly(initialized),
    privacySignal,
    canCollect,
    loadPolicy,
    setConsent,
    track,
    trackPage,
  }
}
