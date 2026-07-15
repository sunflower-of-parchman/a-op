import { createError, readValidatedBody } from 'h3'
import { simulatedFulfillmentSchema } from '#shared/schemas/fulfillment'
import { getAdminSupabase, requireAnyRole } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.public.demoMode) {
    throw createError({ statusCode: 404, statusMessage: 'The simulation route is disabled.' })
  }

  await requireAnyRole(event, ['owner'])
  const input = await readValidatedBody(event, (body) => simulatedFulfillmentSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('process_simulated_payment_event', {
    p_provider_event_id: input.eventId,
    p_target_customer_id: input.customerId,
    p_target_product_id: input.productId,
    p_paid_amount_minor: input.amountMinor,
    p_paid_currency: input.currency,
    p_event_payload: { source: 'local-gate-a' },
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: 'The simulated payment was rejected.' })
  }

  return { fulfillment: data[0] }
})
