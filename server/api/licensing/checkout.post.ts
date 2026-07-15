import { readValidatedBody } from 'h3'
import { licenseCheckoutSchema } from '#shared/schemas/licensing'
import { publicSiteOrigin } from '../../utils/commerce'
import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'
import { getStripeClient } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const input = await readValidatedBody(event, (body) => licenseCheckoutSchema.parse(body))
  const admin = getAdminSupabase(event)
  const { data: selectionRows, error: selectionError } = await admin.rpc(
    'create_license_selection',
    {
      p_subject_id: identity.user.id,
      p_offer_id: input.offerId,
      p_licensee_name: input.licenseeName,
      p_project_title: input.projectTitle,
      p_project_description: input.projectDescription,
    },
  )
  const selection = selectionRows?.[0]
  if (selectionError || !selection) {
    throw createError({ statusCode: 409, statusMessage: 'The license could not be prepared.' })
  }

  const { data: price, error: priceError } = await admin
    .from('prices')
    .select('external_price_id')
    .eq('id', selection.price_id)
    .single()
  if (priceError) {
    throw createError({ statusCode: 503, statusMessage: 'The license price could not be read.' })
  }

  const config = useRuntimeConfig(event)
  const useSimulation =
    config.public.demoMode && (!config.stripeSecretKey || !price.external_price_id)
  if (!useSimulation && (!config.stripeSecretKey || !price.external_price_id)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe test mode and an approved license price mapping are required.',
    })
  }

  const provider = useSimulation ? 'simulation' : 'stripe'
  const { data: intent, error: intentError } = await admin
    .from('checkout_intents')
    .insert({
      subject_id: identity.user.id,
      product_id: selection.product_id,
      price_id: selection.price_id,
      license_selection_id: selection.selection_id,
      provider,
      return_path: input.returnPath,
    })
    .select('id')
    .single()
  if (intentError || !intent) {
    throw createError({ statusCode: 503, statusMessage: 'License checkout could not be created.' })
  }

  if (useSimulation) {
    const { error } = await admin
      .from('checkout_intents')
      .update({ provider_session_id: `sim_${intent.id}`, updated_at: new Date().toISOString() })
      .eq('id', intent.id)
    if (error) {
      throw createError({
        statusCode: 503,
        statusMessage: 'License checkout could not be created.',
      })
    }
    return {
      provider: 'simulation' as const,
      intentId: intent.id,
      url: `/checkout/simulated/${intent.id}`,
      status: 'open' as const,
    }
  }

  const stripe = getStripeClient(event)
  try {
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

    const metadata = {
      platformUserId: identity.user.id,
      productId: selection.product_id,
      priceId: selection.price_id,
      checkoutIntentId: intent.id,
      licenseSelectionId: selection.selection_id,
    }
    const origin = publicSiteOrigin(event)
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer: customerId,
        client_reference_id: identity.user.id,
        line_items: [{ price: price.external_price_id!, quantity: 1 }],
        success_url: `${origin}/checkout/return?intent=${intent.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout/return?intent=${intent.id}&canceled=1`,
        metadata,
      },
      { idempotencyKey: `artist-license-checkout-${intent.id}` },
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
    throw createError({ statusCode: 502, statusMessage: 'Stripe license checkout failed.' })
  }
})
