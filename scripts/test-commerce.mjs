import assert from 'node:assert/strict'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { demoFixtureIds, safeSupabaseError } from './lib/local-supabase.mjs'

const ids = {
  purchaseIntent: '60000000-0000-4000-8000-000000000001',
  membershipIntent: '60000000-0000-4000-8000-000000000002',
  purchaseProduct: '60000000-0000-4000-8000-000000000003',
  purchasePrice: '60000000-0000-4000-8000-000000000004',
  membershipTier: '60000000-0000-4000-8000-000000000005',
  membershipProduct: '60000000-0000-4000-8000-000000000006',
  membershipPrice: '60000000-0000-4000-8000-000000000007',
}

const events = {
  purchase: 'commerce-purchase-v1',
  membership: 'commerce-membership-v1',
  cancellation: 'commerce-membership-cancel-v1',
  partialRefund: 'commerce-refund-partial-v1',
  fullRefund: 'commerce-refund-full-v1',
}

async function cleanup(admin) {
  const { data: paymentEvents } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider', 'simulation')
    .in('provider_event_id', Object.values(events))
  const eventIds = paymentEvents?.map(({ id }) => id) ?? []
  const { data: orders } = eventIds.length
    ? await admin.from('orders').select('id').in('payment_event_id', eventIds)
    : { data: [] }
  const orderIds = orders?.map(({ id }) => id) ?? []
  const { data: subscriptions } = await admin
    .from('subscriptions')
    .select('id')
    .eq('provider', 'simulation')
    .eq('provider_subscription_id', 'sim-subscription-commerce-v1')
  const subscriptionIds = subscriptions?.map(({ id }) => id) ?? []

  if (orderIds.length) {
    await admin.from('refunds').delete().in('order_id', orderIds)
    await admin
      .from('entitlement_grants')
      .delete()
      .eq('source_type', 'order')
      .in('source_id', orderIds)
    await admin.from('order_items').delete().in('order_id', orderIds)
    await admin.from('orders').delete().in('id', orderIds)
  }
  if (subscriptionIds.length) {
    await admin
      .from('entitlement_grants')
      .delete()
      .eq('source_type', 'membership')
      .in('source_id', subscriptionIds)
    await admin.from('subscriptions').delete().in('id', subscriptionIds)
  }
  if (eventIds.length) await admin.from('payment_events').delete().in('id', eventIds)
  await admin.from('checkout_intents').delete().in('id', [ids.purchaseIntent, ids.membershipIntent])
  await admin.from('prices').delete().in('id', [ids.purchasePrice, ids.membershipPrice])
  await admin.from('products').delete().in('id', [ids.purchaseProduct, ids.membershipProduct])
  await admin.from('membership_tiers').delete().eq('id', ids.membershipTier)
  await admin.from('webhook_failures').delete().eq('provider_event_id', 'evt-commerce-failure-v1')
}

try {
  const { admin, authenticated } = await getAuthorityTestContext()
  const customerOne = authenticated.customerOne
  const customerTwo = authenticated.customerTwo
  await cleanup(admin)

  const { error: testProductError } = await admin.from('products').insert({
    id: ids.purchaseProduct,
    slug: 'commerce-authority-track-download',
    product_type: 'track_download',
    name: 'Commerce authority track download',
    resource_type: 'track',
    resource_id: demoFixtureIds.trackTwo,
    purchase_mode: 'stripe',
    state: 'published',
  })
  requireNoError(testProductError, 'Purchase test product creation failed')
  const { error: testPriceError } = await admin.from('prices').insert({
    id: ids.purchasePrice,
    product_id: ids.purchaseProduct,
    currency: 'USD',
    amount_minor: 1200,
    billing_interval: 'one_time',
  })
  requireNoError(testPriceError, 'Purchase test price creation failed')

  const { error: membershipTierError } = await admin.from('membership_tiers').insert({
    id: ids.membershipTier,
    slug: 'commerce-authority-membership',
    name: 'Commerce authority membership',
    description: 'Isolated recurring-access fixture.',
    state: 'published',
  })
  requireNoError(membershipTierError, 'Membership test tier creation failed')
  const { error: membershipProductError } = await admin.from('products').insert({
    id: ids.membershipProduct,
    slug: 'commerce-authority-membership-product',
    product_type: 'membership',
    name: 'Commerce authority membership product',
    resource_type: 'membership',
    resource_id: ids.membershipTier,
    purchase_mode: 'stripe',
    state: 'published',
  })
  requireNoError(membershipProductError, 'Membership test product creation failed')
  const { error: membershipPriceError } = await admin.from('prices').insert({
    id: ids.membershipPrice,
    product_id: ids.membershipProduct,
    currency: 'USD',
    amount_minor: 800,
    billing_interval: 'month',
  })
  requireNoError(membershipPriceError, 'Membership test price creation failed')

  const { error: purchaseIntentError } = await admin.from('checkout_intents').insert({
    id: ids.purchaseIntent,
    subject_id: customerOne.user.id,
    product_id: ids.purchaseProduct,
    price_id: ids.purchasePrice,
    provider: 'simulation',
    provider_session_id: 'sim-commerce-purchase-v1',
  })
  requireNoError(purchaseIntentError, 'Purchase checkout intent creation failed')

  let purchaseOrderId
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin.rpc('process_commerce_payment_event', {
      p_provider: 'simulation',
      p_provider_event_id: events.purchase,
      p_target_customer_id: customerOne.user.id,
      p_target_product_id: ids.purchaseProduct,
      p_target_price_id: ids.purchasePrice,
      p_paid_amount_minor: 1200,
      p_paid_currency: 'USD',
      p_checkout_intent_id: ids.purchaseIntent,
      p_provider_payment_id: 'sim-payment-commerce-v1',
      p_provider_customer_id: `sim-customer:${customerOne.user.id}`,
      p_event_payload: { eventType: 'simulation.checkout.completed', objectId: ids.purchaseIntent },
    })
    requireNoError(error, `Purchase fulfillment attempt ${attempt + 1} failed`)
    purchaseOrderId = data[0].order_id
    assert.equal(data[0].replayed, attempt > 0)
  }

  const { data: purchaseEvents } = await admin
    .from('payment_events')
    .select('id')
    .eq('provider', 'simulation')
    .eq('provider_event_id', events.purchase)
  const { data: purchaseOrders } = await admin
    .from('orders')
    .select('id')
    .eq('payment_event_id', purchaseEvents[0].id)
  const { data: purchaseEntitlements } = await admin
    .from('entitlement_grants')
    .select('id')
    .eq('source_type', 'order')
    .eq('source_id', purchaseOrderId)
  assert.equal(purchaseEvents.length, 1)
  assert.equal(purchaseOrders.length, 1)
  assert.equal(purchaseEntitlements.length, 1)

  const mismatch = await admin.rpc('process_commerce_payment_event', {
    p_provider: 'simulation',
    p_provider_event_id: events.purchase,
    p_target_customer_id: customerOne.user.id,
    p_target_product_id: ids.purchaseProduct,
    p_target_price_id: ids.purchasePrice,
    p_paid_amount_minor: 999,
    p_paid_currency: 'USD',
  })
  assert.ok(mismatch.error, 'A payment replay with changed facts was accepted')

  const { error: membershipIntentError } = await admin.from('checkout_intents').insert({
    id: ids.membershipIntent,
    subject_id: customerOne.user.id,
    product_id: ids.membershipProduct,
    price_id: ids.membershipPrice,
    provider: 'simulation',
    provider_session_id: 'sim-commerce-membership-v1',
  })
  requireNoError(membershipIntentError, 'Membership checkout intent creation failed')
  const periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('process_commerce_payment_event', {
      p_provider: 'simulation',
      p_provider_event_id: events.membership,
      p_target_customer_id: customerOne.user.id,
      p_target_product_id: ids.membershipProduct,
      p_target_price_id: ids.membershipPrice,
      p_paid_amount_minor: 800,
      p_paid_currency: 'USD',
      p_checkout_intent_id: ids.membershipIntent,
      p_provider_payment_id: 'sim-invoice-commerce-v1',
      p_provider_customer_id: `sim-customer:${customerOne.user.id}`,
      p_provider_subscription_id: 'sim-subscription-commerce-v1',
      p_period_end: periodEnd,
      p_event_payload: { eventType: 'simulation.invoice.paid', objectId: ids.membershipIntent },
    })
    requireNoError(error, `Membership fulfillment attempt ${attempt + 1} failed`)
    assert.equal(data[0].replayed, attempt > 0)
  }

  const { data: activeMembership, error: activeMembershipError } = await admin.rpc(
    'decide_access',
    {
      target_subject_id: customerOne.user.id,
      target_resource_type: 'membership',
      target_resource_id: ids.membershipTier,
    },
  )
  requireNoError(activeMembershipError, 'Membership access decision failed')
  assert.equal(activeMembership.allowed, true)

  const { data: otherMembership, error: otherMembershipError } = await admin.rpc('decide_access', {
    target_subject_id: customerTwo.user.id,
    target_resource_type: 'membership',
    target_resource_id: ids.membershipTier,
  })
  requireNoError(otherMembershipError, 'Cross-account membership decision failed')
  assert.equal(otherMembership.allowed, false)

  const { data: subscriptionState, error: subscriptionStateError } = await admin.rpc(
    'process_subscription_state_event',
    {
      p_provider: 'simulation',
      p_provider_event_id: events.cancellation,
      p_target_customer_id: customerOne.user.id,
      p_target_product_id: ids.membershipProduct,
      p_provider_subscription_id: 'sim-subscription-commerce-v1',
      p_status: 'canceled',
      p_period_end: new Date().toISOString(),
      p_cancel_at_period_end: false,
      p_canceled_at: new Date().toISOString(),
      p_ended_at: new Date().toISOString(),
      p_event_payload: {
        eventType: 'simulation.customer.subscription.deleted',
        objectId: 'sim-subscription-commerce-v1',
      },
    },
  )
  requireNoError(subscriptionStateError, 'Subscription cancellation failed')
  assert.equal(subscriptionState[0].replayed, false)

  const { data: expiredMembership } = await admin.rpc('decide_access', {
    target_subject_id: customerOne.user.id,
    target_resource_type: 'membership',
    target_resource_id: ids.membershipTier,
  })
  assert.equal(expiredMembership.allowed, false)
  assert.equal(expiredMembership.reason, 'expired')
  const { data: permanentPurchase } = await admin.rpc('decide_access', {
    target_subject_id: customerOne.user.id,
    target_resource_type: 'track',
    target_resource_id: demoFixtureIds.trackTwo,
  })
  assert.equal(
    permanentPurchase.allowed,
    true,
    'Membership cancellation removed a permanent purchase',
  )

  const { data: partialRefund, error: partialRefundError } = await admin.rpc(
    'process_refund_event',
    {
      p_provider: 'simulation',
      p_provider_event_id: events.partialRefund,
      p_provider_refund_id: 'sim-refund-partial-v1',
      p_provider_payment_id: 'sim-payment-commerce-v1',
      p_refund_amount_minor: 500,
      p_refund_status: 'succeeded',
      p_refund_reason: 'requested_by_customer',
      p_event_payload: {
        eventType: 'simulation.refund.updated',
        objectId: 'sim-refund-partial-v1',
      },
    },
  )
  requireNoError(partialRefundError, 'Partial refund failed')
  assert.equal(partialRefund[0].entitlement_revoked, false)
  const { data: afterPartialRefund } = await admin.rpc('decide_access', {
    target_subject_id: customerOne.user.id,
    target_resource_type: 'track',
    target_resource_id: demoFixtureIds.trackTwo,
  })
  assert.equal(afterPartialRefund.allowed, true)

  const { data: fullRefund, error: fullRefundError } = await admin.rpc('process_refund_event', {
    p_provider: 'simulation',
    p_provider_event_id: events.fullRefund,
    p_provider_refund_id: 'sim-refund-full-v1',
    p_provider_payment_id: 'sim-payment-commerce-v1',
    p_refund_amount_minor: 700,
    p_refund_status: 'succeeded',
    p_refund_reason: 'requested_by_customer',
    p_event_payload: { eventType: 'simulation.refund.updated', objectId: 'sim-refund-full-v1' },
  })
  requireNoError(fullRefundError, 'Full refund failed')
  assert.equal(fullRefund[0].entitlement_revoked, true)
  const { data: afterFullRefund } = await admin.rpc('decide_access', {
    target_subject_id: customerOne.user.id,
    target_resource_type: 'track',
    target_resource_id: demoFixtureIds.trackTwo,
  })
  assert.equal(afterFullRefund.allowed, false)
  assert.equal(afterFullRefund.reason, 'revoked')

  const { data: otherOrders, error: otherOrdersError } = await customerTwo.client
    .from('orders')
    .select('id')
    .eq('id', purchaseOrderId)
  requireNoError(otherOrdersError, 'Cross-account order read failed')
  assert.equal(otherOrders.length, 0)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await admin.rpc('record_webhook_failure', {
      p_provider_event_id: 'evt-commerce-failure-v1',
      p_event_type: 'checkout.session.completed',
      p_object_id: 'cs-commerce-failure-v1',
      p_error_code: 'fulfillment_failed',
    })
    requireNoError(error, 'Webhook failure recording failed')
  }
  const { data: failure } = await admin
    .from('webhook_failures')
    .select('attempts, status')
    .eq('provider_event_id', 'evt-commerce-failure-v1')
    .single()
  assert.equal(failure.attempts, 2)
  assert.equal(failure.status, 'unresolved')
  const privateFailureRead = await customerOne.client.from('webhook_failures').select('id')
  assert.ok(privateFailureRead.error, 'A customer read operational webhook failure records')
  const { error: resolveFailureError } = await admin.rpc('resolve_webhook_failure', {
    p_provider_event_id: 'evt-commerce-failure-v1',
  })
  requireNoError(resolveFailureError, 'Webhook failure resolution failed')
  const { data: resolvedFailure } = await admin
    .from('webhook_failures')
    .select('status, resolved_at')
    .eq('provider_event_id', 'evt-commerce-failure-v1')
    .single()
  assert.equal(resolvedFailure.status, 'resolved')
  assert.ok(resolvedFailure.resolved_at)

  await cleanup(admin)

  console.log(
    'Commerce authority: PASS (payment replay, mismatch denial, membership expiry, refund state, customer isolation)',
  )
} catch (error) {
  console.error(
    `Commerce authority: FAIL\n${error instanceof Error && error.stack ? error.stack : safeSupabaseError(error)}`,
  )
  process.exit(1)
}
