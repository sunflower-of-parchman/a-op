import assert from 'node:assert/strict'
import { createStripeClient, stripeApiVersion, verifyStripeEvent } from '../server/utils/stripe.ts'

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
  console.log(
    'Stripe signature boundary: PASS (raw body accepted, tampering and wrong secret denied)',
  )
} catch (error) {
  console.error(
    `Stripe signature boundary: FAIL\n${error instanceof Error ? error.message : error}`,
  )
  process.exit(1)
}
