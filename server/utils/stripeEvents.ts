import type Stripe from 'stripe'
import type { H3Event } from 'h3'
import { getAdminSupabase } from './supabase'
import {
  getStripeClient,
  safeStripeEventPayload,
  stripeObjectId,
  subscriptionPeriod,
} from './stripe'
import { requestDocumentWorkerForOrder } from './workerServices'

type EventMetadata = {
  platformUserId: string
  productId: string
  priceId: string
  checkoutIntentId?: string
}

function requireMetadata(metadata: Stripe.Metadata | null | undefined): EventMetadata {
  const platformUserId = metadata?.platformUserId
  const productId = metadata?.productId
  const priceId = metadata?.priceId
  if (!platformUserId || !productId || !priceId) {
    throw new Error('The verified Stripe event lacks platform reconciliation metadata.')
  }
  return { platformUserId, productId, priceId, checkoutIntentId: metadata?.checkoutIntentId }
}

async function availableCheckoutIntent(event: H3Event, intentId: string | undefined) {
  if (!intentId) return undefined
  const { data } = await getAdminSupabase(event)
    .from('checkout_intents')
    .select('id')
    .eq('id', intentId)
    .eq('status', 'open')
    .maybeSingle()
  return data?.id
}

async function fulfillCheckoutPayment(
  event: H3Event,
  stripeEvent: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  const metadata = requireMetadata(session.metadata)
  if (session.mode === 'subscription') return { handled: false, reason: 'invoice-authoritative' }
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { handled: false, reason: 'checkout-not-paid' }
  }
  if (session.amount_total === null || !session.currency) {
    throw new Error('The completed Checkout Session lacks payment totals.')
  }
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('process_commerce_payment_event', {
    p_provider: 'stripe',
    p_provider_event_id: stripeEvent.id,
    p_target_customer_id: metadata.platformUserId,
    p_target_product_id: metadata.productId,
    p_target_price_id: metadata.priceId,
    p_paid_amount_minor: session.amount_total,
    p_paid_currency: session.currency,
    p_checkout_intent_id: await availableCheckoutIntent(event, metadata.checkoutIntentId),
    p_provider_payment_id: stripeObjectId(session.payment_intent) ?? undefined,
    p_provider_customer_id: stripeObjectId(session.customer) ?? undefined,
    p_event_payload: safeStripeEventPayload(stripeEvent, session.id),
  })
  if (error || !data?.[0]) throw new Error('Stripe Checkout fulfillment failed.')
  await requestDocumentWorkerForOrder(event, data[0].order_id)
  return { handled: true, kind: 'payment', fulfillment: data[0] }
}

async function fulfillPaidInvoice(
  event: H3Event,
  stripeEvent: Stripe.Event,
  invoice: Stripe.Invoice,
) {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription
  const subscriptionId = stripeObjectId(subscriptionRef)
  if (!subscriptionId) return { handled: false, reason: 'not-a-subscription-invoice' }
  const stripe = getStripeClient(event)
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const metadata = requireMetadata(
    invoice.parent?.subscription_details?.metadata ?? subscription.metadata,
  )
  const period = subscriptionPeriod(subscription)
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('process_commerce_payment_event', {
    p_provider: 'stripe',
    p_provider_event_id: stripeEvent.id,
    p_target_customer_id: metadata.platformUserId,
    p_target_product_id: metadata.productId,
    p_target_price_id: metadata.priceId,
    p_paid_amount_minor: invoice.amount_paid,
    p_paid_currency: invoice.currency,
    p_checkout_intent_id: await availableCheckoutIntent(event, metadata.checkoutIntentId),
    p_provider_payment_id: invoice.id,
    p_provider_customer_id: stripeObjectId(invoice.customer) ?? undefined,
    p_provider_subscription_id: subscription.id,
    p_period_end: period.endsAt,
    p_event_payload: safeStripeEventPayload(stripeEvent, invoice.id),
  })
  if (error || !data?.[0]) throw new Error('Stripe subscription invoice fulfillment failed.')
  await requestDocumentWorkerForOrder(event, data[0].order_id)
  return { handled: true, kind: 'subscription-payment', fulfillment: data[0] }
}

async function reconcileSubscription(
  event: H3Event,
  stripeEvent: Stripe.Event,
  subscription: Stripe.Subscription,
) {
  const metadata = requireMetadata(subscription.metadata)
  const admin = getAdminSupabase(event)
  const { data: existing, error: existingError } = await admin
    .from('subscriptions')
    .select('id')
    .eq('provider', 'stripe')
    .eq('provider_subscription_id', subscription.id)
    .maybeSingle()
  if (existingError) throw new Error('The subscription state could not be read.')
  if (!existing) return { handled: false, reason: 'subscription-not-yet-fulfilled' }

  const period = subscriptionPeriod(subscription)
  const { data, error } = await admin.rpc('process_subscription_state_event', {
    p_provider: 'stripe',
    p_provider_event_id: stripeEvent.id,
    p_target_customer_id: metadata.platformUserId,
    p_target_product_id: metadata.productId,
    p_provider_subscription_id: subscription.id,
    p_status: subscription.status,
    p_period_end: period.endsAt,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : undefined,
    p_ended_at: subscription.ended_at
      ? new Date(subscription.ended_at * 1000).toISOString()
      : undefined,
    p_event_payload: safeStripeEventPayload(stripeEvent, subscription.id),
  })
  if (error || !data?.[0]) throw new Error('Stripe subscription state reconciliation failed.')
  return { handled: true, kind: 'subscription-state', reconciliation: data[0] }
}

async function reconcileRefund(event: H3Event, stripeEvent: Stripe.Event, refund: Stripe.Refund) {
  const paymentIntentId = stripeObjectId(refund.payment_intent)
  if (!paymentIntentId) return { handled: false, reason: 'refund-without-payment-intent' }
  const admin = getAdminSupabase(event)
  const { data, error } = await admin.rpc('process_refund_event', {
    p_provider: 'stripe',
    p_provider_event_id: stripeEvent.id,
    p_provider_refund_id: refund.id,
    p_provider_payment_id: paymentIntentId,
    p_refund_amount_minor: refund.amount,
    p_refund_status: refund.status ?? 'pending',
    p_refund_reason: refund.reason ?? undefined,
    p_event_payload: safeStripeEventPayload(stripeEvent, refund.id),
  })
  if (error || !data?.[0]) throw new Error('Stripe refund reconciliation failed.')
  return { handled: true, kind: 'refund', reconciliation: data[0] }
}

export async function handleStripeEvent(event: H3Event, stripeEvent: Stripe.Event) {
  switch (stripeEvent.type) {
    case 'checkout.session.completed':
      return fulfillCheckoutPayment(event, stripeEvent, stripeEvent.data.object)
    case 'invoice.paid':
      return fulfillPaidInvoice(event, stripeEvent, stripeEvent.data.object)
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return reconcileSubscription(event, stripeEvent, stripeEvent.data.object)
    case 'refund.created':
    case 'refund.updated':
      return reconcileRefund(event, stripeEvent, stripeEvent.data.object)
    case 'checkout.session.expired': {
      const intentId = stripeEvent.data.object.metadata?.checkoutIntentId
      if (!intentId) return { handled: false, reason: 'checkout-without-intent' }
      const { error } = await getAdminSupabase(event)
        .from('checkout_intents')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', intentId)
        .eq('status', 'open')
      if (error) throw new Error('Expired Checkout state could not be stored.')
      return { handled: true, kind: 'checkout-expired' }
    }
    default:
      return { handled: false, reason: 'event-not-required' }
  }
}
