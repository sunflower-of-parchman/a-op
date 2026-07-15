import { telemetrySettingsInputSchema } from '#shared/schemas/telemetry'
import { getAdminSupabase, requireAnyRole } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const input = await readValidatedBody(event, (body) => telemetrySettingsInputSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { error } = await admin.rpc('save_telemetry_settings', {
    p_actor_id: identity.user.id,
    p_optional_enabled: input.optionalEnabled,
    p_consent_mode: input.consentMode,
    p_retention_days: input.retentionDays,
    p_meaningful_listen_seconds: input.meaningfulListenSeconds,
  })
  if (error) {
    throw createError({ statusCode: 400, statusMessage: 'Privacy settings could not be saved.' })
  }
  return { saved: true }
})
