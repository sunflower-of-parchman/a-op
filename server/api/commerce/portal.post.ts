import { getAdminSupabase, requireAuthIdentity } from '../../utils/supabase'
import { publicSiteOrigin } from '../../utils/commerce'
import { getStripeClient } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const identity = await requireAuthIdentity(event)
  const admin = getAdminSupabase(event)
  const { data: mapping, error } = await admin
    .from('payment_customers')
    .select('provider_customer_id')
    .eq('subject_id', identity.user.id)
    .eq('provider', 'stripe')
    .maybeSingle()
  if (error || !mapping) {
    throw createError({ statusCode: 409, statusMessage: 'No Stripe customer portal is available.' })
  }
  const stripe = getStripeClient(event)
  const session = await stripe.billingPortal.sessions.create({
    customer: mapping.provider_customer_id,
    return_url: `${publicSiteOrigin(event)}/account`,
  })
  return { url: session.url }
})
