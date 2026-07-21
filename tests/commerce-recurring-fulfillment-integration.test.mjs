import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { processVerifiedInvoiceEvent, processVerifiedSubscriptionEvent } =
  await import("../db/commerce-recurring-fulfillment.ts");
const { processVerifiedCheckoutEvent } =
  await import("../db/commerce-fulfillment.ts");
const { createMembershipPlan, createSubscriptionPlan } =
  await import("../db/membership-write.ts");
const { digestVerifiedStripeTestEvent, verifyAndParseStripeTestEvent } =
  await import("../lib/commerce/index.ts");

const CUSTOMER_ID = "recurring_customer";
const OWNER_ID = "recurring_owner";
const PRODUCT_ID = "recurring_product";
const PRICE_ID = "recurring_price";
const CHECKOUT_ID = "recurring_checkout";
const CHECKOUT_SESSION_ID = "cs_test_RecurringCheckout001";
const STRIPE_CUSTOMER_ID = "cus_RecurringCustomer001";
const STRIPE_SUBSCRIPTION_ID = "sub_RecurringSubscription001";
const INITIAL_INVOICE_ID = "in_RecurringInitial001";
const RAW_DIGEST = "a".repeat(64);
const FACTS_DIGEST = "b".repeat(64);
const WEBHOOK_SECRET = "whsec_RecurringFictionalSecret123456";

function mutationContext(actorUserId, key) {
  return {
    actorUserId,
    idempotencyKey: key,
    requestId: `request_${key}`,
  };
}

function unix(value) {
  return Math.floor(Date.parse(value) / 1_000);
}

async function seedRecurringFoundation(memory) {
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'recurring-owner@example.invalid',
       'recurring-owner@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'recurring-customer@example.invalid',
       'recurring-customer@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('recurring_owner_role', '${OWNER_ID}', 'owner', '${OWNER_ID}'),
      ('recurring_customer_role', '${CUSTOMER_ID}', 'customer', '${OWNER_ID}');
    UPDATE artist_modules SET active = 1
      WHERE module_key IN ('memberships', 'subscriptions');
    INSERT INTO access_plans
      (id, slug, name, description, state, revision, created_by_user_id)
    VALUES
      ('recurring_access', 'recurring-access', 'Recurring access',
       'Fictional recurring access.', 'active', 1, '${OWNER_ID}');
    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, download_disposition)
    VALUES
      ('recurring_access_track', 'recurring_access', 1, 'track',
       'recurring_track', '["view","stream","download"]', 'attachment');
  `);
  const membershipPlan = await createMembershipPlan(
    memory.binding,
    {
      slug: "recurring-membership",
      name: "Recurring membership",
      description: "Fictional recurring benefits.",
      benefits: ["Protected track", "Monthly credits"],
      accessPlanId: "recurring_access",
      accessPlanRevision: 1,
      downloadCredits: 2,
      licenseCredits: 1,
      durationDays: 31,
      state: "active",
    },
    mutationContext(OWNER_ID, "recurring-membership-plan"),
  );
  const subscriptionPlan = await createSubscriptionPlan(
    memory.binding,
    {
      slug: "recurring-subscription",
      name: "Recurring subscription",
      description: "Fictional monthly Test Mode subscription.",
      membershipPlanId: membershipPlan.value.membershipPlanId,
      membershipPlanRevision: membershipPlan.value.revision,
      billingInterval: "month",
      intervalCount: 1,
      state: "active",
    },
    mutationContext(OWNER_ID, "recurring-subscription-plan"),
  );
  memory.database
    .prepare(
      `INSERT INTO commerce_products
        (id, slug, name, description, product_type, subscription_plan_id,
         state, revision)
       VALUES (?, 'recurring-test-product', 'Recurring test membership',
               'Fictional monthly Stripe Test product.', 'subscription', ?,
               'active', 1)`,
    )
    .run(PRODUCT_ID, subscriptionPlan.value.subscriptionPlanId);
  memory.database.exec(`
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('${PRICE_ID}', '${PRODUCT_ID}', 900, 'USD', 'month', 1,
       'price_RecurringSubscription001', 1, 'test', 0);
    INSERT INTO checkout_sessions
      (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
       status, return_path, stripe_checkout_session_id, stripe_checkout_url,
       amount_minor, currency, stripe_environment, livemode,
       idempotency_key, request_fingerprint)
    VALUES
      ('${CHECKOUT_ID}', '${CUSTOMER_ID}', '${PRODUCT_ID}', '${PRICE_ID}',
       'subscription', 'open', '/commerce/return', '${CHECKOUT_SESSION_ID}',
       'https://checkout.stripe.com/c/pay/recurring-test', 900, 'USD',
       'test', 0, 'recurring-checkout-operation', '${"c".repeat(64)}');
  `);
}

function invoiceInput({
  eventId = "evt_RecurringInitial001",
  eventType = "invoice.paid",
  invoiceId = INITIAL_INVOICE_ID,
  billingReason = "subscription_create",
  status = "paid",
  paid = true,
  amountPaid = 900,
  amountDue = 900,
  periodStart = "2026-07-20T00:00:00.000Z",
  periodEnd = "2026-08-20T00:00:00.000Z",
  eventCreatedAt = "2026-07-20T00:05:00.000Z",
  rawBodyDigest = RAW_DIGEST,
  factsFingerprint = FACTS_DIGEST,
  requestId = "request_recurring_initial_001",
} = {}) {
  return {
    event: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      stripeEventId: eventId,
      stripeEventType: eventType,
      createdAtUnix: unix(eventCreatedAt),
      objectKind: "invoice",
      invoice: {
        stripeInvoiceId: invoiceId,
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
        status,
        paid,
        amountPaid,
        amountDue,
        currency: "usd",
        billingReason,
        periodStartUnix: unix(periodStart),
        periodEndUnix: unix(periodEnd),
        application: {
          checkoutId: CHECKOUT_ID,
          productId: PRODUCT_ID,
          customerUserId: CUSTOMER_ID,
        },
      },
    },
    rawBodyDigest,
    factsFingerprint,
    requestId,
    processedAt: eventCreatedAt,
  };
}

function subscriptionInput({
  eventId,
  eventType,
  eventCreatedAt,
  status,
  cancelAtPeriodEnd = false,
  cancelAtUnix = null,
  factsCharacter,
  requestId,
} = {}) {
  return {
    event: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      stripeEventId: eventId,
      stripeEventType: eventType,
      createdAtUnix: unix(eventCreatedAt),
      objectKind: "subscription",
      subscription: {
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        status,
        cancelAtPeriodEnd,
        cancelAtUnix,
        canceledAtUnix: null,
        endedAtUnix: null,
        application: {
          checkoutId: CHECKOUT_ID,
          productId: PRODUCT_ID,
          customerUserId: CUSTOMER_ID,
        },
      },
    },
    rawBodyDigest: factsCharacter.repeat(64),
    factsFingerprint: factsCharacter.repeat(64),
    requestId,
    processedAt: eventCreatedAt,
  };
}

async function activateInitial(memory) {
  return processVerifiedInvoiceEvent(memory.binding, invoiceInput());
}

function completedSubscriptionCheckoutInput() {
  return {
    event: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      stripeEventId: "evt_RecurringCheckoutCompleted001",
      stripeEventType: "checkout.session.completed",
      createdAtUnix: unix("2026-07-20T00:01:00.000Z"),
      objectKind: "checkout-session",
      checkoutSession: {
        checkoutSessionId: CHECKOUT_SESSION_ID,
        mode: "subscription",
        status: "complete",
        paymentStatus: "paid",
        stripeCustomerId: STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
        amountTotal: 900,
        currency: "usd",
        application: {
          checkoutId: CHECKOUT_ID,
          productId: PRODUCT_ID,
          customerUserId: CUSTOMER_ID,
        },
      },
    },
    rawBodyDigest: "7".repeat(64),
    factsFingerprint: "8".repeat(64),
    requestId: "request_recurring_checkout_completed_001",
    processedAt: "2026-07-20T00:01:00.000Z",
  };
}

function signedInitialInvoice() {
  const timestamp = unix("2026-07-20T00:05:00.000Z");
  const rawBody = new TextEncoder().encode(
    JSON.stringify({
      id: "evt_RecurringSignedInitial001",
      object: "event",
      type: "invoice.paid",
      livemode: false,
      created: timestamp,
      data: {
        object: {
          id: "in_RecurringSignedInitial001",
          object: "invoice",
          livemode: false,
          customer: STRIPE_CUSTOMER_ID,
          status: "paid",
          paid: true,
          amount_paid: 900,
          amount_due: 900,
          currency: "usd",
          billing_reason: "subscription_create",
          period_start: unix("2026-07-20T00:00:00.000Z"),
          period_end: unix("2026-08-20T00:00:00.000Z"),
          parent: {
            type: "subscription_details",
            subscription_details: {
              subscription: STRIPE_SUBSCRIPTION_ID,
              metadata: {
                aop_checkout_id: CHECKOUT_ID,
                aop_product_id: PRODUCT_ID,
                aop_customer_id: CUSTOMER_ID,
              },
            },
          },
        },
      },
    }),
  );
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.`, "utf8")
    .update(rawBody)
    .digest("hex");
  return {
    rawBody,
    timestamp,
    signatureHeader: `t=${timestamp},v1=${signature}`,
  };
}

test("a signed test invoice completes the application-owned subscription journey", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  const checkoutResult = await processVerifiedCheckoutEvent(
    memory.binding,
    completedSubscriptionCheckoutInput(),
  );
  assert.equal(checkoutResult.status, "ignored");
  assert.equal(checkoutResult.resultType, "awaiting-subscription-invoice");
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 0);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 0);

  const signed = signedInitialInvoice();
  const event = await verifyAndParseStripeTestEvent({
    rawBody: signed.rawBody,
    signatureHeader: signed.signatureHeader,
    webhookSecret: WEBHOOK_SECRET,
    nowUnix: () => signed.timestamp,
  });
  assert.equal(event.objectKind, "invoice");
  const digests = await digestVerifiedStripeTestEvent(signed.rawBody, event);
  const result = await processVerifiedInvoiceEvent(memory.binding, {
    event,
    ...digests,
    requestId: "request_recurring_signed_initial_001",
    processedAt: "2026-07-20T00:05:00.000Z",
  });

  assert.equal(result.status, "fulfilled");
  assert.equal(result.resultType, "initial-subscription");
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    1,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 1);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM commerce_events
       WHERE stripe_event_id = 'evt_RecurringSignedInitial001'
         AND status = 'completed' AND stripe_environment = 'test'
         AND livemode = 0`,
    ),
    1,
  );
});

test("a correctly signed live invoice is rejected before D1 can change", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  const signed = signedInitialInvoice();
  const payload = JSON.parse(new TextDecoder().decode(signed.rawBody));
  payload.livemode = true;
  payload.data.object.livemode = true;
  const rawBody = new TextEncoder().encode(JSON.stringify(payload));
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${signed.timestamp}.`, "utf8")
    .update(rawBody)
    .digest("hex");

  await assert.rejects(
    verifyAndParseStripeTestEvent({
      rawBody,
      signatureHeader: `t=${signed.timestamp},v1=${signature}`,
      webhookSecret: WEBHOOK_SECRET,
      nowUnix: () => signed.timestamp,
    }),
    (error) => error?.code === "STRIPE_LIVE_EVENT_REJECTED",
  );
  for (const table of [
    "commerce_events",
    "orders",
    "fulfillment_events",
    "memberships",
    "subscriptions",
    "entitlements",
  ]) {
    assert.equal(
      scalar(memory.database, `SELECT COUNT(*) FROM ${table}`),
      0,
      `${table} must stay unchanged`,
    );
  }
});

test("a paid initial invoice activates one subscription and exact replay is idempotent", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);

  const first = await activateInitial(memory);
  assert.deepEqual(
    {
      status: first.status,
      resultType: first.resultType,
      checkoutId: first.checkoutId,
      replayed: first.replayed,
      environment: first.stripeEnvironment,
      livemode: first.livemode,
    },
    {
      status: "fulfilled",
      resultType: "initial-subscription",
      checkoutId: CHECKOUT_ID,
      replayed: false,
      environment: "test",
      livemode: false,
    },
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    1,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM memberships"), 1);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 1);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    2,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT status, stripe_customer_id, stripe_subscription_id,
                  stripe_environment, livemode
           FROM checkout_sessions WHERE id = ?1`,
        )
        .get(CHECKOUT_ID),
    },
    {
      status: "completed",
      stripe_customer_id: STRIPE_CUSTOMER_ID,
      stripe_subscription_id: STRIPE_SUBSCRIPTION_ID,
      stripe_environment: "test",
      livemode: 0,
    },
  );

  const delayedCheckout = await processVerifiedCheckoutEvent(
    memory.binding,
    completedSubscriptionCheckoutInput(),
  );
  assert.equal(delayedCheckout.status, "ignored");
  assert.equal(delayedCheckout.resultType, "already-fulfilled");
  assert.equal(delayedCheckout.orderId, first.orderId);

  const replay = await activateInitial(memory);
  assert.equal(replay.replayed, true);
  assert.equal(replay.orderId, first.orderId);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    1,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);

  await assert.rejects(
    processVerifiedInvoiceEvent(
      memory.binding,
      invoiceInput({ factsFingerprint: "f".repeat(64) }),
    ),
    (error) => error?.code === "STRIPE_EVENT_REPLAY_CONFLICT",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
});

test("failed initial invoice records evidence and grants no access", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);

  const result = await processVerifiedInvoiceEvent(
    memory.binding,
    invoiceInput({
      eventId: "evt_RecurringFailed001",
      eventType: "invoice.payment_failed",
      invoiceId: "in_RecurringFailed001",
      status: "open",
      paid: false,
      amountPaid: 0,
      requestId: "request_recurring_failed_001",
      factsFingerprint: "d".repeat(64),
      rawBodyDigest: "e".repeat(64),
    }),
  );
  assert.equal(result.status, "ignored");
  assert.equal(result.resultType, "invoice-not-paid");
  for (const table of [
    "orders",
    "order_items",
    "fulfillment_events",
    "memberships",
    "subscriptions",
    "entitlements",
    "credit_grant_lots",
  ]) {
    assert.equal(
      scalar(memory.database, `SELECT COUNT(*) FROM ${table}`),
      0,
      `${table} must stay empty`,
    );
  }
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM commerce_events WHERE status = 'ignored'",
    ),
    1,
  );
});

test("a renewal creates one null-checkout order and a second event for the same invoice is ignored", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  await activateInitial(memory);

  const renewal = await processVerifiedInvoiceEvent(
    memory.binding,
    invoiceInput({
      eventId: "evt_RecurringRenewal001",
      invoiceId: "in_RecurringRenewal001",
      billingReason: "subscription_cycle",
      periodStart: "2026-08-20T00:00:00.000Z",
      periodEnd: "2026-09-20T00:00:00.000Z",
      eventCreatedAt: "2026-08-20T00:05:00.000Z",
      requestId: "request_recurring_renewal_001",
      rawBodyDigest: "d".repeat(64),
      factsFingerprint: "e".repeat(64),
    }),
  );
  assert.equal(renewal.status, "fulfilled");
  assert.equal(renewal.resultType, "renewal");
  assert.equal(renewal.checkoutId, null);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT checkout_session_id, status, stripe_subscription_id,
                  stripe_environment, livemode
           FROM orders WHERE id = ?1`,
        )
        .get(renewal.orderId),
    },
    {
      checkout_session_id: null,
      status: "fulfilled",
      stripe_subscription_id: STRIPE_SUBSCRIPTION_ID,
      stripe_environment: "test",
      livemode: 0,
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT revision, current_period_start, current_period_end
           FROM subscriptions`,
        )
        .get(),
    },
    {
      revision: 2,
      current_period_start: "2026-08-20T00:00:00.000Z",
      current_period_end: "2026-09-20T00:00:00.000Z",
    },
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 2);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    4,
  );

  const duplicate = await processVerifiedInvoiceEvent(
    memory.binding,
    invoiceInput({
      eventId: "evt_RecurringRenewalDuplicate001",
      eventType: "invoice.payment_succeeded",
      invoiceId: "in_RecurringRenewal001",
      billingReason: "subscription_cycle",
      periodStart: "2026-08-20T00:00:00.000Z",
      periodEnd: "2026-09-20T00:00:00.000Z",
      eventCreatedAt: "2026-08-20T00:06:00.000Z",
      requestId: "request_recurring_renewal_duplicate_001",
      rawBodyDigest: "f".repeat(64),
      factsFingerprint: "0".repeat(64),
    }),
  );
  assert.equal(duplicate.status, "ignored");
  assert.equal(duplicate.resultType, "already-fulfilled");
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 2);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    4,
  );
});

test("ordered subscription events pause and resume access without creating orders", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  await activateInitial(memory);

  const pausedInput = subscriptionInput({
    eventId: "evt_RecurringPaused001",
    eventType: "customer.subscription.paused",
    eventCreatedAt: "2026-07-21T00:00:00.000Z",
    status: "paused",
    factsCharacter: "3",
    requestId: "request_recurring_paused_001",
  });
  const paused = await processVerifiedSubscriptionEvent(
    memory.binding,
    pausedInput,
  );
  assert.equal(paused.status, "fulfilled");
  assert.equal(paused.resultType, "subscription-state");
  assert.equal(paused.orderId, null);
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "paused",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM entitlements").get().state,
    "revoked",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);

  const pauseReplay = await processVerifiedSubscriptionEvent(
    memory.binding,
    pausedInput,
  );
  assert.equal(pauseReplay.replayed, true);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);

  const resumed = await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringResumed001",
      eventType: "customer.subscription.resumed",
      eventCreatedAt: "2026-07-22T00:00:00.000Z",
      status: "active",
      factsCharacter: "4",
      requestId: "request_recurring_resumed_001",
    }),
  );
  assert.equal(resumed.status, "fulfilled");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "active",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM entitlements").get().state,
    "active",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM fulfillment_events WHERE kind = 'subscription_state'",
    ),
    2,
  );
});

test("a terminal subscription event before the initial invoice is durable and preempts all access and credits", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);

  const deletedInput = subscriptionInput({
    eventId: "evt_RecurringDeletedBeforeInvoice001",
    eventType: "customer.subscription.deleted",
    eventCreatedAt: "2026-07-20T00:05:00.000Z",
    status: "canceled",
    factsCharacter: "5",
    requestId: "request_recurring_deleted_before_invoice_001",
  });
  const deferred = await processVerifiedSubscriptionEvent(
    memory.binding,
    deletedInput,
  );
  assert.deepEqual(
    {
      status: deferred.status,
      resultType: deferred.resultType,
      replayed: deferred.replayed,
    },
    {
      status: "pending",
      resultType: "subscription-state-deferred",
      replayed: false,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM commerce_events WHERE status = 'processing'",
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM fulfillment_events
       WHERE kind = 'subscription_state' AND status = 'processing'`,
    ),
    1,
  );

  const pendingReplay = await processVerifiedSubscriptionEvent(
    memory.binding,
    deletedInput,
  );
  assert.equal(pendingReplay.status, "pending");
  assert.equal(pendingReplay.replayed, true);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM commerce_events"),
    1,
  );

  const invoice = await activateInitial(memory);
  assert.equal(invoice.status, "ignored");
  assert.equal(invoice.resultType, "invoice-not-fulfillable");
  for (const table of [
    "orders",
    "order_items",
    "memberships",
    "subscriptions",
    "entitlements",
    "credit_accounts",
    "credit_grant_lots",
    "credit_ledger_entries",
  ]) {
    assert.equal(
      scalar(memory.database, `SELECT COUNT(*) FROM ${table}`),
      0,
      `${table} must stay empty`,
    );
  }
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM commerce_events WHERE status = 'ignored'",
    ),
    2,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM fulfillment_events
       WHERE kind = 'subscription_state' AND status = 'ignored'`,
    ),
    1,
  );
  assert.equal(
    memory.database
      .prepare("SELECT status FROM checkout_sessions WHERE id = ?1")
      .get(CHECKOUT_ID).status,
    "canceled",
  );

  const invoiceReplay = await activateInitial(memory);
  const deletionReplay = await processVerifiedSubscriptionEvent(
    memory.binding,
    deletedInput,
  );
  assert.equal(invoiceReplay.replayed, true);
  assert.equal(deletionReplay.replayed, true);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 0);

  const distinctInvoice = await processVerifiedInvoiceEvent(
    memory.binding,
    invoiceInput({
      eventId: "evt_RecurringInitialAfterDelete001",
      eventType: "invoice.payment_succeeded",
      invoiceId: "in_RecurringInitialAfterDelete001",
      eventCreatedAt: "2026-07-20T00:06:00.000Z",
      rawBodyDigest: "c".repeat(64),
      factsFingerprint: "d".repeat(64),
      requestId: "request_recurring_initial_after_delete_001",
    }),
  );
  assert.equal(distinctInvoice.status, "ignored");
  assert.equal(distinctInvoice.resultType, "invoice-not-fulfillable");
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 0);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 0);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    0,
  );
});

test("a nonterminal pre-invoice event reconciles after activation", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);

  const pausedInput = subscriptionInput({
    eventId: "evt_RecurringPausedBeforeInvoice001",
    eventType: "customer.subscription.paused",
    eventCreatedAt: "2026-07-20T00:05:00.000Z",
    status: "paused",
    factsCharacter: "6",
    requestId: "request_recurring_paused_before_invoice_001",
  });
  const deferred = await processVerifiedSubscriptionEvent(
    memory.binding,
    pausedInput,
  );
  assert.equal(deferred.status, "pending");

  const invoice = await activateInitial(memory);
  assert.equal(invoice.status, "fulfilled");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "paused",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM memberships").get().state,
    "paused",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM entitlements").get().state,
    "revoked",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);

  const replay = await processVerifiedSubscriptionEvent(
    memory.binding,
    pausedInput,
  );
  assert.equal(replay.status, "fulfilled");
  assert.equal(replay.replayed, true);
});

test("same-second deletion outranks activation and a later resume cannot restore access", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  await activateInitial(memory);

  const deleted = await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringImmediateDeleted001",
      eventType: "customer.subscription.deleted",
      eventCreatedAt: "2026-07-20T00:05:00.000Z",
      status: "canceled",
      factsCharacter: "8",
      requestId: "request_recurring_immediate_deleted_001",
    }),
  );
  assert.equal(deleted.status, "fulfilled");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "canceled",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM memberships").get().state,
    "canceled",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM entitlements").get().state,
    "expired",
  );
  assert.equal(
    memory.database
      .prepare(
        `SELECT last_provider_event_created_at
         FROM subscriptions`,
      )
      .get().last_provider_event_created_at,
    "2026-07-20T00:05:00.900Z",
  );

  const resumed = await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringResumeAfterDeleted001",
      eventType: "customer.subscription.resumed",
      eventCreatedAt: "2026-07-20T00:05:00.000Z",
      status: "active",
      factsCharacter: "9",
      requestId: "request_recurring_resume_after_deleted_001",
    }),
  );
  assert.equal(resumed.status, "ignored");
  assert.equal(resumed.resultType, "subscription-state-stale");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "canceled",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM entitlements").get().state,
    "expired",
  );
});

test("a verified deletion terminates a paused subscription directly", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  await activateInitial(memory);
  await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringPauseBeforeDelete001",
      eventType: "customer.subscription.paused",
      eventCreatedAt: "2026-07-21T00:00:00.000Z",
      status: "paused",
      factsCharacter: "1",
      requestId: "request_recurring_pause_before_delete_001",
    }),
  );

  const deleted = await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringDeletePaused001",
      eventType: "customer.subscription.deleted",
      eventCreatedAt: "2026-07-21T00:00:00.000Z",
      status: "canceled",
      factsCharacter: "2",
      requestId: "request_recurring_delete_paused_001",
    }),
  );
  assert.equal(deleted.status, "fulfilled");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "canceled",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM memberships").get().state,
    "canceled",
  );
  assert.equal(
    memory.database.prepare("SELECT state FROM entitlements").get().state,
    "expired",
  );
});

test("same-second scheduled cancellation outranks an access-restoring event", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  await seedRecurringFoundation(memory);
  await activateInitial(memory);

  const scheduled = await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringScheduleSameSecond001",
      eventType: "customer.subscription.updated",
      eventCreatedAt: "2026-07-22T00:00:00.000Z",
      status: "active",
      cancelAtPeriodEnd: true,
      cancelAtUnix: unix("2026-08-20T00:00:00.000Z"),
      factsCharacter: "a",
      requestId: "request_recurring_schedule_same_second_001",
    }),
  );
  assert.equal(scheduled.status, "fulfilled");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "cancellation_scheduled",
  );

  const resumed = await processVerifiedSubscriptionEvent(
    memory.binding,
    subscriptionInput({
      eventId: "evt_RecurringClearSameSecond001",
      eventType: "customer.subscription.resumed",
      eventCreatedAt: "2026-07-22T00:00:00.000Z",
      status: "active",
      factsCharacter: "b",
      requestId: "request_recurring_clear_same_second_001",
    }),
  );
  assert.equal(resumed.status, "ignored");
  assert.equal(resumed.resultType, "subscription-state-stale");
  assert.equal(
    memory.database.prepare("SELECT state FROM subscriptions").get().state,
    "cancellation_scheduled",
  );
});
