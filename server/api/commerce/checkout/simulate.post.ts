import { readValidatedBody } from 'h3'
import { confirmSimulationSchema } from '#shared/schemas/commerce'
import { getAdminSupabase, requireAuthIdentity } from '../../../utils/supabase'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.public.demoMode) {
    throw createError({ statusCode: 404, statusMessage: 'Local payment simulation is disabled.' })
  }
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => confirmSimulationSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: intent, error: intentError } = await admin
    .from('checkout_intents')
    .select('id, product_id, price_id, provider, status, return_path')
    .eq('id', input.intentId)
    .eq('subject_id', identity.user.id)
    .eq('provider', 'simulation')
    .maybeSingle()
  if (intentError || !intent?.price_id) {
    throw createError({ statusCode: 404, statusMessage: 'Simulated checkout not found.' })
  }
  const [{ data: product }, { data: price }] = await Promise.all([
    admin.from('products').select('product_type').eq('id', intent.product_id).single(),
    admin
      .from('prices')
      .select('amount_minor, currency, billing_interval')
      .eq('id', intent.price_id)
      .single(),
  ])
  if (!product || !price) {
    throw createError({ statusCode: 409, statusMessage: 'The offering changed before checkout.' })
  }

  const periodEnd = new Date()
  if (price.billing_interval === 'month') periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)
  if (price.billing_interval === 'year') periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1)
  const membership = product.product_type === 'membership'
  const { data, error } = await admin.rpc('process_commerce_payment_event', {
    p_provider: 'simulation',
    p_provider_event_id: `sim-checkout:${intent.id}`,
    p_target_customer_id: identity.user.id,
    p_target_product_id: intent.product_id,
    p_target_price_id: intent.price_id,
    p_paid_amount_minor: price.amount_minor,
    p_paid_currency: price.currency,
    p_checkout_intent_id: intent.id,
    p_provider_payment_id: `sim-payment:${intent.id}`,
    p_provider_customer_id: `sim-customer:${identity.user.id}`,
    p_provider_subscription_id: membership ? `sim-subscription:${intent.id}` : undefined,
    p_period_end: membership ? periodEnd.toISOString() : undefined,
    p_event_payload: { eventType: 'simulation.checkout.completed', objectId: intent.id },
  })
  if (error || !data?.[0]) {
    throw createError({ statusCode: 400, statusMessage: 'The simulated payment was rejected.' })
  }
  return { fulfillment: data[0], returnPath: intent.return_path }
})
