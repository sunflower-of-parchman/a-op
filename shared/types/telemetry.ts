import type { TelemetryEventInput, TelemetrySettingsInput } from '../schemas/telemetry'

export type TelemetryConsentPreference = 'unset' | 'granted' | 'denied'

export type TelemetryPolicyResponse = TelemetrySettingsInput & {
  privacySignal: boolean
  purposes: string[]
}

export type TelemetryCollectionResponse = {
  collected: boolean
}

export type TelemetryEventName = TelemetryEventInput['eventName']
export type TelemetryResourceType = NonNullable<TelemetryEventInput['resourceType']>

export type TelemetrySummary = {
  windowDays: number
  sessions: number
  events: number
  totals: Array<{ eventName: TelemetryEventName; count: number }>
  daily: Array<{ date: string; pageViews: number; meaningfulActions: number }>
  content: Array<{
    resourceType: TelemetryResourceType
    resourceKey: string
    eventName: TelemetryEventName
    count: number
  }>
}

export type TelemetryAdminResponse = {
  settings: TelemetrySettingsInput
  summary: TelemetrySummary
}

export type OperationalCheck = {
  id: string
  label: string
  status: 'pass' | 'action_required' | 'fail'
  summary: string
  action: string | null
  checkedAt: string
}

export type OperationalStatusResponse = {
  generatedAt: string
  overall: 'pass' | 'action_required' | 'fail'
  checks: OperationalCheck[]
}
