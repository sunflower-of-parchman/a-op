import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  activateStripeTestMembership,
  activateStripeTestSubscription,
  createMembershipPlan,
  createSubscriptionPlan,
  reconcileStripeTestSubscription,
  renewStripeTestSubscription,
} = await import("../db/membership-write.ts");

const FINGERPRINT = "a".repeat(64);

function context(actorUserId, idempotencyKey) {
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function seedFoundation(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('provider_owner', 'provider-owner@example.invalid',
       'provider-owner@example.invalid', 'active'),
      ('provider_customer_membership', 'provider-member@example.invalid',
       'provider-member@example.invalid', 'active'),
      ('provider_customer_subscription', 'provider-subscriber@example.invalid',
       'provider-subscriber@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('provider_role_owner', 'provider_owner', 'owner', 'provider_owner'),
      ('provider_role_membership_customer', 'provider_customer_membership',
       'customer', 'provider_owner'),
      ('provider_role_subscription_customer', 'provider_customer_subscription',
       'customer', 'provider_owner');
    INSERT INTO access_plans
      (id, slug, name, description, state, revision, created_by_user_id)
    VALUES
      ('provider_access_plan', 'provider-access', 'Provider access',
       'Fictional provider access.', 'active', 1, 'provider_owner');
    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, download_disposition)
    VALUES
      ('provider_access_track', 'provider_access_plan', 1, 'track',
       'provider_track', '["view","stream","download"]', 'attachment');
  `);
}

async function createProviderMembershipPlan(binding) {
  return createMembershipPlan(
    binding,
    {
      slug: "provider-membership",
      name: "Provider membership",
      description: "Fictional Stripe Test membership.",
      benefits: ["Protected track", "Benefits"],
      accessPlanId: "provider_access_plan",
      accessPlanRevision: 1,
      downloadCredits: 2,
      licenseCredits: 1,
      durationDays: 30,
      state: "active",
    },
    context("provider_owner", "provider-plan-create"),
  );
}

async function createProviderSubscriptionPlan(binding, membershipPlan) {
  return createSubscriptionPlan(
    binding,
    {
      slug: "provider-subscription",
      name: "Provider subscription",
      description: "Fictional Stripe Test subscription.",
      membershipPlanId: membershipPlan.value.membershipPlanId,
      membershipPlanRevision: membershipPlan.value.revision,
      billingInterval: "month",
      intervalCount: 1,
      state: "active",
    },
    context("provider_owner", "provider-subscription-plan-create"),
  );
}

function seedMembershipFulfillment(database, plan) {
  database
    .prepare(
      `INSERT INTO commerce_products
        (id, slug, name, description, product_type, membership_plan_id,
         membership_plan_revision_id, membership_plan_revision, state,
         revision)
       VALUES (?, 'provider-membership-product', 'Provider membership',
               'Fictional test product.', 'membership', ?, ?, 1, 'active', 1)`,
    )
    .run(
      "provider_product_membership",
      plan.value.membershipPlanId,
      plan.value.revisionId,
    );
  database.exec(`
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('provider_price_membership', 'provider_product_membership', 500, 'USD',
       'one_time', 1, 'price_ProviderMembership001', 1, 'test', 0);
    INSERT INTO checkout_sessions
      (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
       status, return_path, stripe_checkout_session_id, amount_minor,
       currency, stripe_environment, livemode, idempotency_key,
       request_fingerprint, completed_at)
    VALUES
      ('provider_checkout_membership', 'provider_customer_membership',
       'provider_product_membership', 'provider_price_membership', 'payment',
       'completed', '/account/orders', 'cs_test_ProviderMembership001', 500,
       'USD', 'test', 0, 'provider-checkout-membership', '${FINGERPRINT}',
       '2026-07-20T00:00:00.000Z');
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       checkout_session_id, event_created_at, raw_body_digest,
       facts_fingerprint, status, stripe_environment, livemode)
    VALUES
      ('provider_event_membership', 'evt_ProviderMembership001',
       'checkout.session.completed', 'cs_test_ProviderMembership001',
       'provider_checkout_membership', '2026-07-20T00:00:00.000Z',
       '${"b".repeat(64)}', '${FINGERPRINT}', 'processing', 'test', 0);
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id, status,
       total_minor, currency, stripe_environment, livemode)
    VALUES
      ('provider_order_membership', 'provider_customer_membership',
       'provider_checkout_membership', 'provider_event_membership', 'pending',
       500, 'USD', 'test', 0);
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode)
    VALUES
      ('provider_item_membership', 'provider_order_membership',
       'provider_product_membership', 1, 'provider_price_membership',
       'membership', 'Provider membership', '{}', 1, 500, 'USD', 'test', 0);
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id, customer_user_id,
       commerce_product_id, kind, provider_object_id, facts_fingerprint,
       status, result_json, stripe_environment, livemode)
    VALUES
      ('provider_fulfillment_membership', 'provider_event_membership',
       'provider_checkout_membership', 'provider_order_membership',
       'provider_customer_membership', 'provider_product_membership',
       'one_time', 'cs_test_ProviderMembership001', '${FINGERPRINT}',
       'processing', '{}', 'test', 0);
  `);
}

function membershipInput(overrides = {}) {
  return {
    customerUserId: "provider_customer_membership",
    commerceProductId: "provider_product_membership",
    commercePriceId: "provider_price_membership",
    commerceEventId: "provider_event_membership",
    orderId: "provider_order_membership",
    fulfillmentEventId: "provider_fulfillment_membership",
    factsFingerprint: FINGERPRINT,
    stripeEventId: "evt_ProviderMembership001",
    stripeObjectId: "cs_test_ProviderMembership001",
    fulfillmentProviderObjectId: "cs_test_ProviderMembership001",
    providerEventCreatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function seedSubscriptionFulfillment(database, subscriptionPlan) {
  database
    .prepare(
      `INSERT INTO commerce_products
        (id, slug, name, description, product_type, subscription_plan_id,
         state, revision)
       VALUES (?, 'provider-subscription-product', 'Provider subscription',
               'Fictional test subscription product.', 'subscription', ?,
               'active', 1)`,
    )
    .run(
      "provider_product_subscription",
      subscriptionPlan.value.subscriptionPlanId,
    );
  database.exec(`
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('provider_price_subscription', 'provider_product_subscription', 900,
       'USD', 'month', 1, 'price_ProviderSubscription001', 1, 'test', 0);
    INSERT INTO checkout_sessions
      (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
       status, return_path, stripe_checkout_session_id, stripe_customer_id,
       stripe_subscription_id, amount_minor, currency, stripe_environment,
       livemode, idempotency_key, request_fingerprint, completed_at)
    VALUES
      ('provider_checkout_subscription', 'provider_customer_subscription',
       'provider_product_subscription', 'provider_price_subscription',
       'subscription', 'completed', '/account/orders',
       'cs_test_ProviderSubscription001', 'cus_ProviderSubscription001',
       'sub_ProviderSubscription001', 900, 'USD', 'test', 0,
       'provider-checkout-subscription', '${FINGERPRINT}',
       '2026-07-20T00:00:00.000Z');
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       checkout_session_id, event_created_at, raw_body_digest,
       facts_fingerprint, status, stripe_environment, livemode)
    VALUES
      ('provider_event_subscription', 'evt_ProviderSubscription001',
       'invoice.paid', 'in_ProviderSubscriptionInitial001',
       'provider_checkout_subscription', '2026-07-20T00:05:00.000Z',
       '${"c".repeat(64)}', '${FINGERPRINT}', 'processing', 'test', 0);
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id, status,
       total_minor, currency, stripe_subscription_id, stripe_environment,
       livemode)
    VALUES
      ('provider_order_subscription', 'provider_customer_subscription',
       'provider_checkout_subscription', 'provider_event_subscription',
       'pending', 900, 'USD', 'sub_ProviderSubscription001', 'test', 0);
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode)
    VALUES
      ('provider_item_subscription', 'provider_order_subscription',
       'provider_product_subscription', 1, 'provider_price_subscription',
       'subscription', 'Provider subscription', '{}', 1, 900, 'USD',
       'test', 0);
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id, customer_user_id,
       commerce_product_id, kind, provider_object_id, facts_fingerprint,
       status, result_json, stripe_environment, livemode)
    VALUES
      ('provider_fulfillment_subscription', 'provider_event_subscription',
       'provider_checkout_subscription', 'provider_order_subscription',
       'provider_customer_subscription', 'provider_product_subscription',
       'initial_subscription', 'in_ProviderSubscriptionInitial001',
       '${FINGERPRINT}', 'processing', '{}', 'test', 0);
  `);
}

function subscriptionInput(overrides = {}) {
  return {
    customerUserId: "provider_customer_subscription",
    commerceProductId: "provider_product_subscription",
    commercePriceId: "provider_price_subscription",
    commerceEventId: "provider_event_subscription",
    orderId: "provider_order_subscription",
    fulfillmentEventId: "provider_fulfillment_subscription",
    factsFingerprint: FINGERPRINT,
    stripeEventId: "evt_ProviderSubscription001",
    stripeObjectId: "in_ProviderSubscriptionInitial001",
    fulfillmentProviderObjectId: "in_ProviderSubscriptionInitial001",
    providerEventCreatedAt: "2026-07-20T00:05:00.000Z",
    billingReason: "subscription_create",
    stripeCustomerId: "cus_ProviderSubscription001",
    stripeSubscriptionId: "sub_ProviderSubscription001",
    periodStart: "2026-07-20T00:00:00.000Z",
    periodEnd: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function seedSubscriptionRenewalFulfillment(database) {
  const renewalFingerprint = "d".repeat(64);
  database.exec(`
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       event_created_at, raw_body_digest, facts_fingerprint, status,
       stripe_environment, livemode)
    VALUES
      ('provider_event_subscription_renewal',
       'evt_ProviderSubscriptionRenewal001', 'invoice.paid',
       'in_ProviderSubscriptionRenewal001', '2026-08-20T00:05:00.000Z',
       '${"e".repeat(64)}', '${renewalFingerprint}', 'processing', 'test', 0);
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id, status,
       total_minor, currency, stripe_subscription_id, stripe_environment,
       livemode)
    VALUES
      ('provider_order_subscription_renewal',
       'provider_customer_subscription', NULL,
       'provider_event_subscription_renewal', 'pending', 900, 'USD',
       'sub_ProviderSubscription001', 'test', 0);
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode)
    VALUES
      ('provider_item_subscription_renewal',
       'provider_order_subscription_renewal',
       'provider_product_subscription', 1, 'provider_price_subscription',
       'subscription', 'Provider subscription', '{}', 1, 900, 'USD',
       'test', 0);
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id, customer_user_id,
       commerce_product_id, kind, provider_object_id, facts_fingerprint,
       status, result_json, stripe_environment, livemode)
    VALUES
      ('provider_fulfillment_subscription_renewal',
       'provider_event_subscription_renewal', NULL,
       'provider_order_subscription_renewal',
       'provider_customer_subscription', 'provider_product_subscription',
       'renewal', 'in_ProviderSubscriptionRenewal001',
       '${renewalFingerprint}', 'processing', '{}', 'test', 0);
  `);
  return renewalFingerprint;
}

function renewalInput(subscriptionId, factsFingerprint, overrides = {}) {
  return {
    customerUserId: "provider_customer_subscription",
    commerceProductId: "provider_product_subscription",
    commercePriceId: "provider_price_subscription",
    commerceEventId: "provider_event_subscription_renewal",
    orderId: "provider_order_subscription_renewal",
    fulfillmentEventId: "provider_fulfillment_subscription_renewal",
    factsFingerprint,
    stripeEventId: "evt_ProviderSubscriptionRenewal001",
    stripeObjectId: "in_ProviderSubscriptionRenewal001",
    fulfillmentProviderObjectId: "in_ProviderSubscriptionRenewal001",
    providerEventCreatedAt: "2026-08-20T00:05:00.000Z",
    billingReason: "subscription_cycle",
    subscriptionId,
    stripeCustomerId: "cus_ProviderSubscription001",
    stripeSubscriptionId: "sub_ProviderSubscription001",
    expectedRevision: 1,
    periodStart: "2026-08-20T00:00:00.000Z",
    periodEnd: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function seedSubscriptionStateFulfillment(
  database,
  {
    key,
    eventType,
    eventCreatedAt,
    fingerprintCharacter,
    eventStatus = "processing",
    fulfillmentStatus = "processing",
  },
) {
  const commerceEventId = `provider_event_subscription_state_${key}`;
  const fulfillmentEventId = `provider_fulfillment_subscription_state_${key}`;
  const stripeEventId = `evt_ProviderSubscriptionState${key}`;
  const factsFingerprint = fingerprintCharacter.repeat(64);
  database
    .prepare(
      `INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id,
         event_created_at, raw_body_digest, facts_fingerprint, status,
         stripe_environment, livemode)
       VALUES (?, ?, ?, 'sub_ProviderSubscription001', ?, ?, ?, ?,
               'test', 0)`,
    )
    .run(
      commerceEventId,
      stripeEventId,
      eventType,
      eventCreatedAt,
      fingerprintCharacter.repeat(64),
      factsFingerprint,
      eventStatus,
    );
  database
    .prepare(
      `INSERT INTO fulfillment_events
        (id, commerce_event_id, checkout_session_id, order_id,
         customer_user_id, commerce_product_id, kind, provider_object_id,
         facts_fingerprint, status, result_json, stripe_environment, livemode)
       VALUES (?, ?, NULL, NULL, 'provider_customer_subscription',
               'provider_product_subscription', 'subscription_state',
               'sub_ProviderSubscription001', ?, ?, '{}', 'test', 0)`,
    )
    .run(
      fulfillmentEventId,
      commerceEventId,
      factsFingerprint,
      fulfillmentStatus,
    );
  return {
    commerceEventId,
    fulfillmentEventId,
    stripeEventId,
    factsFingerprint,
    providerEventCreatedAt: eventCreatedAt,
  };
}

function reconciliationInput(
  subscriptionId,
  expectedRevision,
  targetState,
  providerEvent,
  overrides = {},
) {
  return {
    customerUserId: "provider_customer_subscription",
    commerceProductId: "provider_product_subscription",
    commercePriceId: "provider_price_subscription",
    commerceEventId: providerEvent.commerceEventId,
    orderId: null,
    fulfillmentEventId: providerEvent.fulfillmentEventId,
    factsFingerprint: providerEvent.factsFingerprint,
    stripeEventId: providerEvent.stripeEventId,
    stripeObjectId: "sub_ProviderSubscription001",
    fulfillmentProviderObjectId: "sub_ProviderSubscription001",
    providerEventCreatedAt: providerEvent.providerEventCreatedAt,
    subscriptionId,
    stripeCustomerId: "cus_ProviderSubscription001",
    stripeSubscriptionId: "sub_ProviderSubscription001",
    expectedRevision,
    targetState,
    ...overrides,
  };
}

test("verified processing fulfillment activates one Stripe Test membership and benefits", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedFoundation(memory.database);
  const plan = await createProviderMembershipPlan(memory.binding);
  seedMembershipFulfillment(memory.database, plan);

  const mutationContext = context(
    "provider_customer_membership",
    "provider-membership-activation",
  );
  const activated = await activateStripeTestMembership(
    memory.binding,
    membershipInput(),
    mutationContext,
  );
  assert.equal(activated.replayed, false);
  assert.equal(activated.value.state, "active");
  assert.equal(activated.value.entitlementCount, 1);
  assert.equal(activated.value.downloadCreditsGranted, 2);
  assert.equal(activated.value.licenseCreditsGranted, 1);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT source, source_order_id, source_fulfillment_event_id,
                  stripe_environment, livemode
           FROM memberships WHERE id = ?1`,
        )
        .get(activated.value.membershipId),
    },
    {
      source: "stripe_test",
      source_order_id: "provider_order_membership",
      source_fulfillment_event_id: "provider_fulfillment_membership",
      stripe_environment: "test",
      livemode: 0,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'membership'
         AND fulfillment_event_id = 'provider_fulfillment_membership'`,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_grant_lots
       WHERE fulfillment_event_id = 'provider_fulfillment_membership'`,
    ),
    2,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE fulfillment_event_id = 'provider_fulfillment_membership'`,
    ),
    2,
  );

  const replay = await activateStripeTestMembership(
    memory.binding,
    membershipInput(),
    mutationContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, activated.value);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM memberships"), 1);
});

test("verified processing fulfillment activates one Stripe Test subscription and frozen benefits", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedFoundation(memory.database);
  const membershipPlan = await createProviderMembershipPlan(memory.binding);
  const subscriptionPlan = await createProviderSubscriptionPlan(
    memory.binding,
    membershipPlan,
  );
  seedSubscriptionFulfillment(memory.database, subscriptionPlan);

  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    0,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 0);
  memory.database.exec(
    `UPDATE commerce_events
     SET status = 'failed', failure_category = 'invoice_payment_failed'
     WHERE id = 'provider_event_subscription'`,
  );
  await assertRuntimeCode(
    activateStripeTestSubscription(
      memory.binding,
      subscriptionInput(),
      context(
        "provider_customer_subscription",
        "provider-subscription-failed-invoice",
      ),
    ),
    "MEMBERSHIP_PROVIDER_FULFILLMENT_REQUIRED",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM memberships"), 0);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    0,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 0);
  memory.database.exec(
    `UPDATE commerce_events
     SET status = 'processing', failure_category = NULL
     WHERE id = 'provider_event_subscription'`,
  );

  const mutationContext = context(
    "provider_customer_subscription",
    "provider-subscription-activation",
  );
  const activated = await activateStripeTestSubscription(
    memory.binding,
    subscriptionInput(),
    mutationContext,
  );
  assert.equal(activated.replayed, false);
  assert.equal(activated.value.state, "active");
  assert.equal(activated.value.eventType, "activated");
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT source, commerce_product_id, commerce_price_id,
                  stripe_subscription_id, stripe_customer_id,
                  last_provider_event_created_at, stripe_environment, livemode
           FROM subscriptions WHERE id = ?1`,
        )
        .get(activated.value.subscriptionId),
    },
    {
      source: "stripe_test",
      commerce_product_id: "provider_product_subscription",
      commerce_price_id: "provider_price_subscription",
      stripe_subscription_id: "sub_ProviderSubscription001",
      stripe_customer_id: "cus_ProviderSubscription001",
      last_provider_event_created_at: "2026-07-20T00:05:00.000Z",
      stripe_environment: "test",
      livemode: 0,
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT source, stripe_event_id, provider_object_id,
                  fulfillment_event_id, order_id
           FROM subscription_events WHERE subscription_id = ?1`,
        )
        .get(activated.value.subscriptionId),
    },
    {
      source: "stripe_test",
      stripe_event_id: "evt_ProviderSubscription001",
      provider_object_id: "sub_ProviderSubscription001",
      fulfillment_event_id: "provider_fulfillment_subscription",
      order_id: "provider_order_subscription",
    },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'subscription'
         AND fulfillment_event_id = 'provider_fulfillment_subscription'`,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_type = 'subscription'
         AND fulfillment_event_id = 'provider_fulfillment_subscription'`,
    ),
    2,
  );

  const replay = await activateStripeTestSubscription(
    memory.binding,
    subscriptionInput(),
    mutationContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, activated.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscription_events"),
    1,
  );

  memory.database.exec(`
    UPDATE commerce_products SET state = 'archived'
    WHERE id = 'provider_product_subscription';
    UPDATE commerce_prices SET active = 0
    WHERE id = 'provider_price_subscription';
  `);

  const renewalFingerprint = seedSubscriptionRenewalFulfillment(
    memory.database,
  );
  const renewalFacts = renewalInput(
    activated.value.subscriptionId,
    renewalFingerprint,
  );
  memory.database.exec(
    `UPDATE commerce_events SET status = 'completed'
     WHERE id = 'provider_event_subscription_renewal'`,
  );
  await assertRuntimeCode(
    renewStripeTestSubscription(
      memory.binding,
      renewalFacts,
      context(
        "provider_customer_subscription",
        "provider-subscription-renewal-mixed",
      ),
    ),
    "MEMBERSHIP_PROVIDER_FULFILLMENT_REQUIRED",
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT revision FROM subscriptions
       WHERE id = '${activated.value.subscriptionId}'`,
    ),
    1,
  );
  memory.database.exec(
    `UPDATE commerce_events SET status = 'processing'
     WHERE id = 'provider_event_subscription_renewal'`,
  );
  await assertRuntimeCode(
    renewStripeTestSubscription(
      memory.binding,
      renewalFacts,
      context("provider_owner", "provider-subscription-renewal-owner"),
    ),
    "MEMBERSHIP_PROVIDER_CUSTOMER_MISMATCH",
  );

  const renewalContext = context(
    "provider_customer_subscription",
    "provider-subscription-renewal",
  );
  const renewed = await renewStripeTestSubscription(
    memory.binding,
    renewalFacts,
    renewalContext,
  );
  assert.equal(renewed.replayed, false);
  assert.equal(renewed.value.eventType, "renewed");
  assert.equal(renewed.value.revision, 2);
  assert.equal(renewed.value.membershipRevision, 2);
  assert.equal(renewed.value.currentPeriodEnd, "2026-09-20T00:00:00.000Z");
  assert.equal(
    scalar(
      memory.database,
      `SELECT SUM(available_balance) FROM credit_accounts
       WHERE customer_user_id = 'provider_customer_subscription'`,
    ),
    6,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE fulfillment_event_id =
         'provider_fulfillment_subscription_renewal'`,
    ),
    2,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT stripe_event_id, provider_object_id,
                  fulfillment_event_id, order_id
           FROM subscription_events
           WHERE subscription_id = ?1 AND event_type = 'renewed'`,
        )
        .get(activated.value.subscriptionId),
    },
    {
      stripe_event_id: "evt_ProviderSubscriptionRenewal001",
      provider_object_id: "in_ProviderSubscriptionRenewal001",
      fulfillment_event_id: "provider_fulfillment_subscription_renewal",
      order_id: "provider_order_subscription_renewal",
    },
  );
  const renewalReplay = await renewStripeTestSubscription(
    memory.binding,
    renewalFacts,
    renewalContext,
  );
  assert.equal(renewalReplay.replayed, true);
  assert.deepEqual(renewalReplay.value, renewed.value);
  await assertRuntimeCode(
    renewStripeTestSubscription(
      memory.binding,
      renewalInput(activated.value.subscriptionId, renewalFingerprint, {
        periodEnd: "2026-10-20T00:00:00.000Z",
      }),
      renewalContext,
    ),
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscription_events"),
    2,
  );
});

test("verified no-order Stripe Test events reconcile subscription access through its cancellation boundary", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedFoundation(memory.database);
  const membershipPlan = await createProviderMembershipPlan(memory.binding);
  const subscriptionPlan = await createProviderSubscriptionPlan(
    memory.binding,
    membershipPlan,
  );
  seedSubscriptionFulfillment(memory.database, subscriptionPlan);
  const activated = await activateStripeTestSubscription(
    memory.binding,
    subscriptionInput(),
    context(
      "provider_customer_subscription",
      "provider-reconcile-subscription-activation",
    ),
  );
  const subscriptionId = activated.value.subscriptionId;

  const staleEvent = seedSubscriptionStateFulfillment(memory.database, {
    key: "Stale001",
    eventType: "customer.subscription.paused",
    eventCreatedAt: "2026-07-20T00:04:00.000Z",
    fingerprintCharacter: "1",
  });
  await assertRuntimeCode(
    reconcileStripeTestSubscription(
      memory.binding,
      reconciliationInput(subscriptionId, 1, "paused", staleEvent),
      context("provider_customer_subscription", "provider-reconcile-stale"),
    ),
    "MEMBERSHIP_PROVIDER_EVENT_STALE",
  );

  const pauseEvent = seedSubscriptionStateFulfillment(memory.database, {
    key: "Pause001",
    eventType: "customer.subscription.paused",
    eventCreatedAt: "2026-07-21T00:00:00.000Z",
    fingerprintCharacter: "2",
    eventStatus: "completed",
  });
  const pauseInput = reconciliationInput(
    subscriptionId,
    1,
    "paused",
    pauseEvent,
  );
  await assertRuntimeCode(
    reconcileStripeTestSubscription(
      memory.binding,
      pauseInput,
      context(
        "provider_customer_subscription",
        "provider-reconcile-pause-mixed",
      ),
    ),
    "MEMBERSHIP_PROVIDER_FULFILLMENT_REQUIRED",
  );
  memory.database.exec(
    `UPDATE commerce_events SET status = 'processing'
     WHERE id = 'provider_event_subscription_state_Pause001'`,
  );
  const pauseContext = context(
    "provider_customer_subscription",
    "provider-reconcile-pause",
  );
  const paused = await reconcileStripeTestSubscription(
    memory.binding,
    pauseInput,
    pauseContext,
  );
  assert.equal(paused.replayed, false);
  assert.equal(paused.value.state, "paused");
  assert.equal(paused.value.eventType, "paused");
  assert.equal(paused.value.revision, 2);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'subscription' AND source_id = '${subscriptionId}'
         AND state = 'revoked'`,
    ),
    1,
  );
  const pauseReplay = await reconcileStripeTestSubscription(
    memory.binding,
    pauseInput,
    pauseContext,
  );
  assert.equal(pauseReplay.replayed, true);
  assert.deepEqual(pauseReplay.value, paused.value);
  await assertRuntimeCode(
    reconcileStripeTestSubscription(
      memory.binding,
      { ...pauseInput, targetState: "active" },
      pauseContext,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  const resumeEvent = seedSubscriptionStateFulfillment(memory.database, {
    key: "Resume001",
    eventType: "customer.subscription.resumed",
    eventCreatedAt: "2026-07-22T00:00:00.000Z",
    fingerprintCharacter: "3",
    eventStatus: "completed",
    fulfillmentStatus: "fulfilled",
  });
  const resumed = await reconcileStripeTestSubscription(
    memory.binding,
    reconciliationInput(subscriptionId, 2, "active", resumeEvent),
    context("provider_customer_subscription", "provider-reconcile-resume"),
  );
  assert.equal(resumed.value.eventType, "resumed");
  assert.equal(resumed.value.revision, 3);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'subscription' AND source_id = '${subscriptionId}'
         AND state = 'active'`,
    ),
    1,
  );

  const firstScheduleEvent = seedSubscriptionStateFulfillment(memory.database, {
    key: "Schedule001",
    eventType: "customer.subscription.updated",
    eventCreatedAt: "2026-08-01T00:00:00.000Z",
    fingerprintCharacter: "4",
  });
  const scheduled = await reconcileStripeTestSubscription(
    memory.binding,
    reconciliationInput(
      subscriptionId,
      3,
      "cancellation_scheduled",
      firstScheduleEvent,
    ),
    context("provider_customer_subscription", "provider-reconcile-schedule"),
  );
  assert.equal(scheduled.value.eventType, "cancellation_scheduled");
  assert.equal(scheduled.value.cancelAt, "2026-08-20T00:00:00.000Z");
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'subscription' AND source_id = '${subscriptionId}'
         AND state = 'active'`,
    ),
    1,
  );

  const clearEvent = seedSubscriptionStateFulfillment(memory.database, {
    key: "Clear001",
    eventType: "customer.subscription.updated",
    eventCreatedAt: "2026-08-02T00:00:00.000Z",
    fingerprintCharacter: "5",
  });
  const cleared = await reconcileStripeTestSubscription(
    memory.binding,
    reconciliationInput(subscriptionId, 4, "active", clearEvent),
    context("provider_customer_subscription", "provider-reconcile-clear"),
  );
  assert.equal(cleared.value.eventType, "cancellation_cleared");
  assert.equal(cleared.value.cancelAt, null);

  const secondScheduleEvent = seedSubscriptionStateFulfillment(
    memory.database,
    {
      key: "Schedule002",
      eventType: "customer.subscription.updated",
      eventCreatedAt: "2026-08-03T00:00:00.000Z",
      fingerprintCharacter: "6",
    },
  );
  const scheduledAgain = await reconcileStripeTestSubscription(
    memory.binding,
    reconciliationInput(
      subscriptionId,
      5,
      "cancellation_scheduled",
      secondScheduleEvent,
    ),
    context(
      "provider_customer_subscription",
      "provider-reconcile-schedule-again",
    ),
  );
  assert.equal(scheduledAgain.value.revision, 6);

  const earlyCancellationEvent = seedSubscriptionStateFulfillment(
    memory.database,
    {
      key: "CancelEarly001",
      eventType: "customer.subscription.deleted",
      eventCreatedAt: "2026-08-19T23:59:59.000Z",
      fingerprintCharacter: "7",
    },
  );
  await assertRuntimeCode(
    reconcileStripeTestSubscription(
      memory.binding,
      reconciliationInput(
        subscriptionId,
        6,
        "canceled",
        earlyCancellationEvent,
      ),
      context(
        "provider_customer_subscription",
        "provider-reconcile-cancel-early",
      ),
    ),
    "CANCELLATION_BOUNDARY_NOT_REACHED",
  );
  assert.equal(
    memory.database
      .prepare("SELECT state FROM subscriptions WHERE id = ?1")
      .get(subscriptionId).state,
    "cancellation_scheduled",
  );

  const cancellationEvent = seedSubscriptionStateFulfillment(memory.database, {
    key: "Cancel001",
    eventType: "customer.subscription.deleted",
    eventCreatedAt: "2026-08-20T00:00:01.000Z",
    fingerprintCharacter: "8",
  });
  const cancellationInput = reconciliationInput(
    subscriptionId,
    6,
    "canceled",
    cancellationEvent,
  );
  const cancellationContext = context(
    "provider_customer_subscription",
    "provider-reconcile-cancel",
  );
  const canceled = await reconcileStripeTestSubscription(
    memory.binding,
    cancellationInput,
    cancellationContext,
  );
  assert.equal(canceled.value.state, "canceled");
  assert.equal(canceled.value.eventType, "canceled");
  assert.equal(canceled.value.revision, 7);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT state, cancel_at, canceled_at, current_period_end,
                  last_provider_event_created_at
           FROM subscriptions WHERE id = ?1`,
        )
        .get(subscriptionId),
    },
    {
      state: "canceled",
      cancel_at: "2026-08-20T00:00:00.000Z",
      canceled_at: "2026-08-20T00:00:01.000Z",
      current_period_end: "2026-08-20T00:00:00.000Z",
      last_provider_event_created_at: "2026-08-20T00:00:01.000Z",
    },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'subscription' AND source_id = '${subscriptionId}'
         AND state = 'expired'
         AND expires_at = '2026-08-20T00:00:01.000Z'`,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM subscription_events
       WHERE subscription_id = '${subscriptionId}' AND source = 'stripe_test'
         AND event_type <> 'activated' AND order_id IS NULL`,
    ),
    6,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(DISTINCT provider_object_id) FROM subscription_events
       WHERE subscription_id = '${subscriptionId}' AND source = 'stripe_test'`,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(DISTINCT stripe_event_id) FROM subscription_events
       WHERE subscription_id = '${subscriptionId}' AND source = 'stripe_test'`,
    ),
    7,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
  const cancellationReplay = await reconcileStripeTestSubscription(
    memory.binding,
    cancellationInput,
    cancellationContext,
  );
  assert.equal(cancellationReplay.replayed, true);
  assert.deepEqual(cancellationReplay.value, canceled.value);
});
