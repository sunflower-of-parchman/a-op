import { getHeader, readRawBody } from 'h3'
import { handleStripeEvent } from '../../utils/stripeEvents'
import { verifyStripeEvent } from '../../utils/stripe'
import { getAdminSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.stripeWebhookSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe webhooks are not configured.' })
  }
  const signature = getHeader(event, 'stripe-signature')
  const rawBody = await readRawBody(event, 'utf8')
  if (!signature || !rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'The Stripe signature is required.' })
  }

  let stripeEvent
  try {
    stripeEvent = verifyStripeEvent(rawBody, signature, config.stripeWebhookSecret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'The Stripe signature is invalid.' })
  }

  try {
    const result = await handleStripeEvent(event, stripeEvent)
    await getAdminSupabase(event).rpc('resolve_webhook_failure', {
      p_provider_event_id: stripeEvent.id,
    })
    return { received: true, eventId: stripeEvent.id, ...result }
  } catch {
    const object = stripeEvent.data.object as { id?: string }
    await getAdminSupabase(event).rpc('record_webhook_failure', {
      p_provider_event_id: stripeEvent.id,
      p_event_type: stripeEvent.type,
      p_object_id: object.id ?? stripeEvent.id,
      p_error_code: 'fulfillment_failed',
    })
    throw createError({ statusCode: 500, statusMessage: 'Verified Stripe fulfillment failed.' })
  }
})
