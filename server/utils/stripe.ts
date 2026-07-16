import Stripe from 'stripe'
import type { H3Event } from 'h3'

export const stripeApiVersion = '2026-06-24.dahlia' as const

export function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: stripeApiVersion, typescript: true })
}

export function getStripeClient(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secretKey = config.stripeSecretKey
  if (!secretKey) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe test mode is not configured.' })
  }
  if (config.public.demoMode && !secretKey.startsWith('sk_test_')) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The demonstration accepts Stripe test mode only.',
    })
  }
  return createStripeClient(secretKey)
}

export function verifyStripeEvent(rawBody: string, signature: string, webhookSecret: string) {
  const verifier = createStripeClient('sk_test_signature_verification_only')
  return verifier.webhooks.constructEvent(rawBody, signature, webhookSecret)
}

export function stripeObjectId(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

export function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  if (!item) throw new Error('The Stripe subscription has no billable item.')
  return {
    startsAt: new Date(item.current_period_start * 1000).toISOString(),
    endsAt: new Date(item.current_period_end * 1000).toISOString(),
  }
}

export function subscriptionCancellationScheduled(
  subscription: Pick<Stripe.Subscription, 'cancel_at' | 'cancel_at_period_end'>,
) {
  return subscription.cancel_at_period_end || subscription.cancel_at !== null
}

export function safeStripeEventPayload(event: Stripe.Event, objectId: string) {
  return { eventType: event.type, objectId, livemode: event.livemode }
}
