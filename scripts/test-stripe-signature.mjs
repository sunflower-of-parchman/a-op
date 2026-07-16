import assert from 'node:assert/strict'
import {
  createStripeClient,
  stripeApiVersion,
  subscriptionCancellationScheduled,
  verifyStripeEvent,
} from '../server/utils/stripe.ts'
import { requiredStripeEventTypes } from '../shared/stripeEvents.ts'

const secret = 'whsec_local_signature_test_only'
const payload = JSON.stringify({
  id: 'evt_signature_test',
  object: 'event',
  api_version: stripeApiVersion,
  created: 1_789_000_000,
  data: { object: { id: 'cs_signature_test', object: 'checkout.session' } },
  livemode: false,
  pending_webhooks: 1,
  request: { id: 'req_signature_test', idempotency_key: null },
  type: 'checkout.session.completed',
})

try {
  const stripe = createStripeClient('sk_test_signature_generation_only')
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret })
  const event = verifyStripeEvent(payload, signature, secret)
  assert.equal(event.id, 'evt_signature_test')
  assert.throws(() => verifyStripeEvent(`${payload} `, signature, secret))
  assert.throws(() => verifyStripeEvent(payload, signature, `${secret}-wrong`))
  assert.equal(
    subscriptionCancellationScheduled({ cancel_at: null, cancel_at_period_end: false }),
    false,
  )
  assert.equal(
    subscriptionCancellationScheduled({ cancel_at: null, cancel_at_period_end: true }),
    true,
  )
  assert.equal(
    subscriptionCancellationScheduled({ cancel_at: 1_789_000_000, cancel_at_period_end: false }),
    true,
  )
  assert.deepEqual(requiredStripeEventTypes, [
    'checkout.session.completed',
    'checkout.session.expired',
    'invoice.paid',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'refund.created',
    'refund.updated',
  ])
  console.log(
    'Stripe signature boundary: PASS (raw body, required events, tampering and wrong secret)',
  )
} catch (error) {
  console.error(
    `Stripe signature boundary: FAIL\n${error instanceof Error ? error.message : error}`,
  )
  process.exit(1)
}
