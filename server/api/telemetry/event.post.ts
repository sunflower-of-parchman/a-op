import { telemetryEventInputSchema } from '#shared/schemas/telemetry'
import { getAdminSupabase } from '../../utils/supabase'
import { requestHasPrivacySignal } from '../../utils/telemetry'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => telemetryEventInputSchema.parse(body))
  if (requestHasPrivacySignal(event)) return { collected: false }

  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('record_analytics_event', {
    p_event_id: input.id,
    p_event_name: input.eventName,
    p_session_id: input.sessionId,
    p_path: input.path,
    p_resource_type: input.resourceType as string,
    p_resource_key: input.resourceKey as string,
    p_value: input.value as number,
    p_consent_state: input.consentState,
  })
  if (error) {
    throw createError({ statusCode: 400, statusMessage: 'The optional event was not accepted.' })
  }
  return { collected: data }
})
