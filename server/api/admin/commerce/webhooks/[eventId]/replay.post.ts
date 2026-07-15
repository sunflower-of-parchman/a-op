import { getRouterParam } from 'h3'
import { getAdminSupabase, requireAnyRole } from '../../../../../utils/supabase'
import { getStripeClient } from '../../../../../utils/stripe'
import { handleStripeEvent } from '../../../../../utils/stripeEvents'

export default defineEventHandler(async (event) => {
  const identity = await requireAnyRole(event, ['owner'])
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'A Stripe event is required.' })
  const admin = getAdminSupabase(event)
  const { data: failure, error: failureError } = await admin
    .from('webhook_failures')
    .select('provider_event_id')
    .eq('provider', 'stripe')
    .eq('provider_event_id', eventId)
    .eq('status', 'unresolved')
    .maybeSingle()
  if (failureError || !failure) {
    throw createError({ statusCode: 404, statusMessage: 'Unresolved webhook failure not found.' })
  }

  try {
    const stripeEvent = await getStripeClient(event).events.retrieve(eventId)
    const result = await handleStripeEvent(event, stripeEvent)
    await admin.rpc('resolve_webhook_failure', { p_provider_event_id: eventId })
    await admin.from('audit_records').insert({
      actor_id: identity.user.id,
      event_type: 'commerce.webhook_replayed',
      target_type: 'webhook_failure',
      detail: { providerEventId: eventId, handled: result.handled },
    })
    return { eventId, ...result }
  } catch {
    await admin.rpc('record_webhook_failure', {
      p_provider_event_id: eventId,
      p_event_type: 'stripe.replay',
      p_object_id: eventId,
      p_error_code: 'replay_failed',
    })
    throw createError({ statusCode: 502, statusMessage: 'Stripe event replay failed.' })
  }
})
