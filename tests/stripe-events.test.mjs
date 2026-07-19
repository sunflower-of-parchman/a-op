import assert from "node:assert/strict";
import test from "node:test";

import {
  CommerceAdapterError,
  STRIPE_TEST_EVENT_TYPES,
  parseVerifiedStripeTestEvent,
} from "../lib/commerce/index.ts";

const APPLICATION_METADATA = Object.freeze({
  aop_checkout_id: "checkout_fictional_001",
  aop_product_id: "product_fictional_001",
  aop_customer_id: "user_fictional_001",
});

function checkoutObject(overrides = {}) {
  return {
    id: "cs_test_FictionalSession001",
    object: "checkout.session",
    livemode: false,
    client_reference_id: APPLICATION_METADATA.aop_checkout_id,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    customer: "cus_FictionalCustomer001",
    subscription: null,
    amount_total: 1_500,
    currency: "usd",
    metadata: { ...APPLICATION_METADATA },
    customer_details: {
      email: "private-listener@example.test",
      address: { line1: "Private billing address" },
    },
    payment_method_types: ["card"],
    payment_intent: "pi_PrivatePaymentMethodLink",
    client_secret: "cs_private_secret_value",
    ...overrides,
  };
}

function subscriptionObject(overrides = {}) {
  return {
    id: "sub_FictionalSubscription001",
    object: "subscription",
    livemode: false,
    customer: "cus_FictionalCustomer001",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    metadata: { ...APPLICATION_METADATA },
    default_payment_method: "pm_PrivatePaymentMethod",
    ...overrides,
  };
}

function invoiceObject(overrides = {}) {
  return {
    id: "in_FictionalInvoice001",
    object: "invoice",
    livemode: false,
    customer: "cus_FictionalCustomer001",
    status: "paid",
    paid: true,
    amount_paid: 1_500,
    amount_due: 1_500,
    currency: "usd",
    billing_reason: "subscription_cycle",
    period_start: 1_800_000_000,
    period_end: 1_802_592_000,
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: "sub_FictionalSubscription001",
        metadata: { ...APPLICATION_METADATA },
      },
    },
    confirmation_secret: { client_secret: "pi_private_secret_value" },
    customer_address: { line1: "Private billing address" },
    default_payment_method: "pm_PrivatePaymentMethod",
    ...overrides,
  };
}

function stripeEvent(type, object, overrides = {}) {
  return {
    id: "evt_FictionalEvent001",
    object: "event",
    type,
    livemode: false,
    created: 1_800_000_100,
    data: { object },
    ...overrides,
  };
}

function assertCommerceError(run, code) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof CommerceAdapterError);
    assert.equal(error.code, code);
    return true;
  });
}

test("the event allowlist contains only checkout, subscription, and invoice lifecycle facts", () => {
  assert.deepEqual(STRIPE_TEST_EVENT_TYPES, [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "invoice.paid",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "invoice.voided",
  ]);
});

test("all allowlisted checkout events project the same minimal reconciliation facts", () => {
  const types = STRIPE_TEST_EVENT_TYPES.filter((type) =>
    type.startsWith("checkout.session."),
  );

  for (const type of types) {
    const projected = parseVerifiedStripeTestEvent(
      stripeEvent(type, checkoutObject()),
    );

    assert.equal(projected.objectKind, "checkout-session");
    assert.equal(projected.stripeEnvironment, "test");
    assert.equal(projected.livemode, false);
    assert.deepEqual(projected.checkoutSession.application, {
      checkoutId: "checkout_fictional_001",
      productId: "product_fictional_001",
      customerUserId: "user_fictional_001",
    });
    assert.equal(
      projected.checkoutSession.checkoutSessionId,
      "cs_test_FictionalSession001",
    );
  }
});

test("subscription lifecycle events retain state and application identity without payment details", () => {
  const types = STRIPE_TEST_EVENT_TYPES.filter((type) =>
    type.startsWith("customer.subscription."),
  );

  for (const type of types) {
    const projected = parseVerifiedStripeTestEvent(
      stripeEvent(type, subscriptionObject()),
    );
    assert.equal(projected.objectKind, "subscription");
    assert.equal(projected.subscription.status, "active");
    assert.equal(
      projected.subscription.stripeSubscriptionId,
      "sub_FictionalSubscription001",
    );
  }
});

test("invoice lifecycle events use current subscription parent metadata", () => {
  const types = STRIPE_TEST_EVENT_TYPES.filter((type) =>
    type.startsWith("invoice."),
  );

  for (const type of types) {
    const projected = parseVerifiedStripeTestEvent(
      stripeEvent(type, invoiceObject()),
    );
    assert.equal(projected.objectKind, "invoice");
    assert.equal(projected.invoice.stripeInvoiceId, "in_FictionalInvoice001");
    assert.equal(
      projected.invoice.stripeSubscriptionId,
      "sub_FictionalSubscription001",
    );
    assert.equal(projected.invoice.billingReason, "subscription_cycle");
  }
});

test("legacy invoice subscription fields project through the same safe DTO", () => {
  const current = invoiceObject();
  const legacy = {
    ...current,
    parent: undefined,
    subscription: "sub_FictionalSubscription001",
    subscription_details: { metadata: { ...APPLICATION_METADATA } },
  };
  const projected = parseVerifiedStripeTestEvent(
    stripeEvent("invoice.paid", legacy),
  );

  assert.equal(projected.objectKind, "invoice");
  assert.equal(
    projected.invoice.stripeSubscriptionId,
    "sub_FictionalSubscription001",
  );
  assert.deepEqual(projected.invoice.application, {
    checkoutId: "checkout_fictional_001",
    productId: "product_fictional_001",
    customerUserId: "user_fictional_001",
  });
});

test("projection drops customer details, card data, client secrets, and unrestricted provider objects", () => {
  const projections = [
    parseVerifiedStripeTestEvent(
      stripeEvent("checkout.session.completed", checkoutObject()),
    ),
    parseVerifiedStripeTestEvent(
      stripeEvent("customer.subscription.updated", subscriptionObject()),
    ),
    parseVerifiedStripeTestEvent(
      stripeEvent("invoice.payment_succeeded", invoiceObject()),
    ),
  ];

  const serialized = JSON.stringify(projections);
  assert.doesNotMatch(
    serialized,
    /customer_details|billing.address|payment_method|client_secret|private-listener|Private billing|pi_Private|pm_Private/i,
  );
  assert.match(serialized, /stripeEnvironment/);
  assert.match(serialized, /"livemode":false/);
});

test("live mode is rejected before event-type or object projection", () => {
  assertCommerceError(
    () =>
      parseVerifiedStripeTestEvent({
        type: "unknown.live.event",
        livemode: true,
      }),
    "STRIPE_LIVE_EVENT_REJECTED",
  );

  assertCommerceError(
    () =>
      parseVerifiedStripeTestEvent(
        stripeEvent(
          "checkout.session.completed",
          checkoutObject({ livemode: true }),
        ),
      ),
    "STRIPE_LIVE_EVENT_REJECTED",
  );
});

test("unknown event types and missing explicit test mode fail closed", () => {
  assertCommerceError(
    () =>
      parseVerifiedStripeTestEvent(
        stripeEvent("payment_intent.succeeded", checkoutObject()),
      ),
    "STRIPE_EVENT_UNSUPPORTED",
  );
  assertCommerceError(
    () =>
      parseVerifiedStripeTestEvent({
        ...stripeEvent("checkout.session.completed", checkoutObject()),
        livemode: undefined,
      }),
    "STRIPE_WEBHOOK_PAYLOAD_INVALID",
  );
});

test("application metadata is exact and cannot carry provider or customer payload fields", () => {
  assertCommerceError(
    () =>
      parseVerifiedStripeTestEvent(
        stripeEvent(
          "checkout.session.completed",
          checkoutObject({
            metadata: {
              ...APPLICATION_METADATA,
              payment_method: "pm_forbidden",
            },
          }),
        ),
      ),
    "STRIPE_WEBHOOK_PAYLOAD_INVALID",
  );

  assertCommerceError(
    () =>
      parseVerifiedStripeTestEvent(
        stripeEvent(
          "checkout.session.completed",
          checkoutObject({ customer: { id: "cus_ExpandedCustomer001" } }),
        ),
      ),
    "STRIPE_WEBHOOK_PAYLOAD_INVALID",
  );
});

test("test object identifiers, states, currency, and periods are validated", () => {
  const invalidObjects = [
    checkoutObject({ id: "cs_live_ForbiddenSession001" }),
    checkoutObject({ payment_status: "refunded" }),
    subscriptionObject({ status: "future_status" }),
    invoiceObject({ currency: "USD" }),
    invoiceObject({ period_end: 1_700_000_000 }),
    invoiceObject({
      period_start: 1_800_000_000,
      period_end: 1_800_000_000,
    }),
  ];
  const types = [
    "checkout.session.completed",
    "checkout.session.completed",
    "customer.subscription.updated",
    "invoice.paid",
    "invoice.paid",
    "invoice.paid",
  ];

  invalidObjects.forEach((object, index) => {
    assertCommerceError(
      () => parseVerifiedStripeTestEvent(stripeEvent(types[index], object)),
      "STRIPE_WEBHOOK_PAYLOAD_INVALID",
    );
  });
});
