import { readValidatedBody } from 'h3'
import { createCheckoutSchema } from '#shared/schemas/commerce'
import { publicSiteOrigin, requirePublishedProduct } from '../../utils/commerce'
import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'
import { getStripeClient } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => createCheckoutSchema.parse(body))
  const product = await requirePublishedProduct(event, input.productId)

  if (product.purchaseMode === 'external') {
    return { provider: 'external' as const, url: product.externalUrl, status: 'external' as const }
  }
  if (!product.price) {
    throw createError({ statusCode: 409, statusMessage: 'This offering has no active price.' })
  }

  const config = useRuntimeConfig(event)
  const useSimulation =
    product.purchaseMode === 'free' ||
    (config.public.demoMode && (!config.stripeSecretKey || !product.price.mapped))
  if (!useSimulation && (!config.stripeSecretKey || !product.price.mapped)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe test mode and an approved price mapping are required.',
    })
  }

  const admin = getAdminSupabase(event)
  const provider = useSimulation ? 'simulation' : 'stripe'
  const { data: intent, error: intentError } = await admin
    .from('checkout_intents')
    .insert({
      subject_id: identity.user.id,
      product_id: product.id,
      price_id: product.price.id,
      provider,
      return_path: input.returnPath,
    })
    .select('id')
    .single()
  if (intentError || !intent) {
    throw createError({ statusCode: 503, statusMessage: 'Checkout could not be prepared.' })
  }

  if (useSimulation) {
    const { error } = await admin
      .from('checkout_intents')
      .update({ provider_session_id: `sim_${intent.id}`, updated_at: new Date().toISOString() })
      .eq('id', intent.id)
    if (error)
      throw createError({ statusCode: 503, statusMessage: 'Checkout could not be prepared.' })
    return {
      provider: 'simulation' as const,
      intentId: intent.id,
      url: `/checkout/simulated/${intent.id}`,
      status: 'open' as const,
    }
  }

  const stripe = getStripeClient(event)
  try {
    const { data: mappedPrice, error: mappedPriceError } = await admin
      .from('prices')
      .select('external_price_id')
      .eq('id', product.price.id)
      .single()
    if (mappedPriceError || !mappedPrice.external_price_id) {
      throw new Error('The Stripe price mapping is missing.')
    }
    const { data: existingCustomer } = await admin
      .from('payment_customers')
      .select('provider_customer_id')
      .eq('subject_id', identity.user.id)
      .eq('provider', 'stripe')
      .maybeSingle()
    let customerId = existingCustomer?.provider_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: identity.user.email, metadata: { platformUserId: identity.user.id } },
        { idempotencyKey: `artist-customer-${identity.user.id}` },
      )
      customerId = customer.id
      const { error } = await admin.from('payment_customers').upsert({
        subject_id: identity.user.id,
        provider: 'stripe',
        provider_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error('The Stripe customer mapping could not be stored.')
    }

    const origin = publicSiteOrigin(event)
    const metadata = {
      platformUserId: identity.user.id,
      productId: product.id,
      priceId: product.price.id,
      checkoutIntentId: intent.id,
    }
    const mode = product.productType === 'membership' ? 'subscription' : 'payment'
    const session = await stripe.checkout.sessions.create(
      {
        mode,
        customer: customerId,
        client_reference_id: identity.user.id,
        line_items: [{ price: mappedPrice.external_price_id, quantity: 1 }],
        success_url: `${origin}/checkout/return?intent=${intent.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout/return?intent=${intent.id}&canceled=1`,
        metadata,
        ...(mode === 'subscription' ? { subscription_data: { metadata } } : {}),
      },
      { idempotencyKey: `artist-checkout-${intent.id}` },
    )

    const { error } = await admin
      .from('checkout_intents')
      .update({ provider_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', intent.id)
    if (error || !session.url) throw new Error('The Checkout Session could not be stored.')
    return { provider: 'stripe' as const, intentId: intent.id, url: session.url, status: 'open' }
  } catch {
    await admin
      .from('checkout_intents')
      .update({
        status: 'failed',
        failure_code: 'provider_error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', intent.id)
    throw createError({ statusCode: 502, statusMessage: 'Stripe Checkout could not be created.' })
  }
})
