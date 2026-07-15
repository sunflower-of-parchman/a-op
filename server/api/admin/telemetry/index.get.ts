import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'
import { summarizeTelemetry } from '../../../utils/telemetry'

export default defineEventHandler(async (event) => {
  await requireAnyRole(event, ['owner'])
  const admin = getAdminSupabase(event)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: settings, error: settingsError }, { data: events, error: eventsError }] =
    await Promise.all([
      admin.from('telemetry_settings').select('*').eq('id', 'primary').single(),
      admin
        .from('analytics_events')
        .select('event_name, session_id, resource_type, resource_key, occurred_at')
        .gte('occurred_at', since)
        .order('occurred_at')
        .limit(20_000),
    ])
  if (settingsError || eventsError || !settings) {
    throw createError({ statusCode: 503, statusMessage: 'Audience analytics could not be loaded.' })
  }

  return {
    settings: {
      optionalEnabled: settings.optional_enabled,
      consentMode: settings.consent_mode,
      retentionDays: settings.retention_days,
      meaningfulListenSeconds: settings.meaningful_listen_seconds,
    },
    summary: summarizeTelemetry(events),
  }
})
