import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { processVerifiedCheckoutEvent } =
  await import("../db/commerce-fulfillment.ts");
const { RuntimeError } = await import("../lib/runtime/index.ts");

const PROCESSED_AT = "2026-07-19T06:30:00.000Z";
const RAW_BODY_DIGEST = "a".repeat(64);
const FACTS_FINGERPRINT = "b".repeat(64);

function seedCommerce(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('user_fulfillment_customer', 'fulfillment@example.invalid',
            'fulfillment@example.invalid', 'active');

    INSERT INTO access_plans
      (id, slug, name, description, state, revision)
    VALUES
      ('access_plan_track', 'track-access', 'Track access',
       'Frozen direct-access definition.', 'active', 1);

    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, remaining_uses, download_disposition)
    VALUES
      ('access_plan_item_track', 'access_plan_track', 1, 'track',
       'track_fulfillment', '["stream","download"]', NULL, 'attachment');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type,
       resource_id, access_plan_id, access_plan_revision, credit_kind,
       credit_quantity, state, revision)
    VALUES
      ('product_track', 'test-track', 'Test track',
       'A direct-access Test Mode product.', 'track', 'track',
       'track_fulfillment', 'access_plan_track', 1, NULL, NULL, 'active', 1),
      ('product_credits', 'test-download-credits', 'Two download credits',
       'A credit Test Mode product.', 'download-credits', NULL, NULL, NULL,
       NULL, 'download', 2, 'active', 1);

    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('price_track', 'product_track', 900, 'USD', 'one_time', 1,
       'price_TestFulfillmentTrack001', 1, 'test', 0),
      ('price_credits', 'product_credits', 500, 'USD', 'one_time', 1,
       'price_TestFulfillmentCredits01', 1, 'test', 0);
  `);
}

function seedOpenCheckout(
  database,
  {
    checkoutId = "checkout_fulfillment",
    checkoutSessionId = "cs_test_FulfillmentSession001",
    productId = "product_track",
    priceId = "price_track",
    amountMinor = 900,
  } = {},
) {
  database
    .prepare(
      `INSERT INTO checkout_sessions
        (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
         status, return_path, stripe_checkout_session_id, stripe_checkout_url,
         amount_minor, currency, stripe_environment, livemode,
         idempotency_key, request_fingerprint)
       VALUES (?1, 'user_fulfillment_customer', ?2, ?3, 'payment', 'open',
               '/account/orders/return', ?4,
               'https://checkout.stripe.com/c/pay/test-fulfillment', ?5,
               'USD', 'test', 0, ?6, ?7)`,
    )
    .run(
      checkoutId,
      productId,
      priceId,
      checkoutSessionId,
      amountMinor,
      `checkout-operation:${checkoutId}`,
      "c".repeat(64),
    );
}

function verifiedCheckoutInput({
  checkoutId = "checkout_fulfillment",
  checkoutSessionId = "cs_test_FulfillmentSession001",
  productId = "product_track",
  eventId = "evt_TestFulfillmentEvent001",
  eventType = "checkout.session.completed",
  status = "complete",
  paymentStatus = "paid",
  amountTotal = 900,
  currency = "usd",
  rawBodyDigest = RAW_BODY_DIGEST,
  factsFingerprint = FACTS_FINGERPRINT,
  requestId = "request_fulfillment_001",
} = {}) {
  return {
    event: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      stripeEventId: eventId,
      stripeEventType: eventType,
      createdAtUnix: 1_768_800_000,
      objectKind: "checkout-session",
      checkoutSession: {
        checkoutSessionId,
        mode: "payment",
        status,
        paymentStatus,
        stripeCustomerId: "cus_TestFulfillmentCustomer01",
        stripeSubscriptionId: null,
        amountTotal,
        currency,
        application: {
          checkoutId,
          productId,
          customerUserId: "user_fulfillment_customer",
        },
      },
    },
    rawBodyDigest,
    factsFingerprint,
    requestId,
    processedAt: PROCESSED_AT,
  };
}

function assertNoGrantedAccess(database) {
  for (const table of [
    "orders",
    "order_items",
    "fulfillment_events",
    "entitlements",
    "credit_accounts",
    "credit_grant_lots",
    "credit_ledger_entries",
    "memberships",
    "subscriptions",
    "issued_licenses",
  ]) {
    assert.equal(
      scalar(database, `SELECT COUNT(*) FROM ${table}`),
      0,
      `${table} must stay empty`,
    );
  }
}

test("a paid direct-access checkout fulfills once and exact replay returns its durable receipt", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    seedOpenCheckout(d1.database);
    const input = verifiedCheckoutInput();

    const first = await processVerifiedCheckoutEvent(d1.binding, input);
    assert.deepEqual(
      {
        status: first.status,
        resultType: first.resultType,
        replayed: first.replayed,
        stripeEnvironment: first.stripeEnvironment,
        livemode: first.livemode,
      },
      {
        status: "fulfilled",
        resultType: "direct-access",
        replayed: false,
        stripeEnvironment: "test",
        livemode: false,
      },
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM commerce_events"),
      1,
    );
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM orders"), 1);
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM order_items"), 1);
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM fulfillment_events"),
      1,
    );
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM entitlements"), 1);
    assert.deepEqual(
      {
        ...d1.database
          .prepare(
            `SELECT source_type, user_id, resource_type, resource_id,
                    actions_json, stripe_environment, livemode,
                    fulfillment_event_id
             FROM entitlements`,
          )
          .get(),
      },
      {
        source_type: "order",
        user_id: "user_fulfillment_customer",
        resource_type: "track",
        resource_id: "track_fulfillment",
        actions_json: '["stream","download"]',
        stripe_environment: "test",
        livemode: 0,
        fulfillment_event_id: first.fulfillmentEventId,
      },
    );
    assert.equal(
      scalar(
        d1.database,
        "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.webhook.fulfilled'",
      ),
      1,
    );

    const replay = await processVerifiedCheckoutEvent(d1.binding, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.orderId, first.orderId);
    assert.equal(replay.fulfillmentEventId, first.fulfillmentEventId);
    for (const [table, expected] of [
      ["commerce_events", 1],
      ["orders", 1],
      ["order_items", 1],
      ["fulfillment_events", 1],
      ["entitlements", 1],
      ["audit_events", 1],
    ]) {
      assert.equal(
        scalar(d1.database, `SELECT COUNT(*) FROM ${table}`),
        expected,
      );
    }

    await assert.rejects(
      processVerifiedCheckoutEvent(d1.binding, {
        ...input,
        factsFingerprint: "d".repeat(64),
      }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "STRIPE_EVENT_REPLAY_CONFLICT",
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM commerce_events"),
      1,
    );
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM orders"), 1);
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM entitlements"), 1);
  } finally {
    d1.close();
  }
});

test("a distinct second paid event is acknowledged without duplicating a fulfilled checkout", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    seedOpenCheckout(d1.database);
    const first = await processVerifiedCheckoutEvent(
      d1.binding,
      verifiedCheckoutInput(),
    );

    const second = await processVerifiedCheckoutEvent(
      d1.binding,
      verifiedCheckoutInput({
        eventId: "evt_TestFulfillmentEvent002",
        rawBodyDigest: "e".repeat(64),
        factsFingerprint: "f".repeat(64),
        requestId: "request_fulfillment_002",
      }),
    );

    assert.deepEqual(
      {
        status: second.status,
        resultType: second.resultType,
        orderId: second.orderId,
        fulfillmentEventId: second.fulfillmentEventId,
        replayed: second.replayed,
      },
      {
        status: "ignored",
        resultType: "already-fulfilled",
        orderId: first.orderId,
        fulfillmentEventId: null,
        replayed: false,
      },
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM commerce_events"),
      2,
    );
    assert.equal(
      scalar(
        d1.database,
        "SELECT COUNT(*) FROM commerce_events WHERE status = 'ignored'",
      ),
      1,
    );
    assert.equal(
      scalar(
        d1.database,
        "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.webhook.ignored'",
      ),
      1,
    );
    for (const table of [
      "orders",
      "order_items",
      "fulfillment_events",
      "entitlements",
    ]) {
      assert.equal(
        scalar(d1.database, `SELECT COUNT(*) FROM ${table}`),
        1,
        `${table} must not be duplicated`,
      );
    }
  } finally {
    d1.close();
  }
});

test("a paid credit checkout creates one reconciled test grant and replay creates no duplicate", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    seedOpenCheckout(d1.database, {
      checkoutId: "checkout_credits",
      checkoutSessionId: "cs_test_FulfillmentCredits001",
      productId: "product_credits",
      priceId: "price_credits",
      amountMinor: 500,
    });
    const input = verifiedCheckoutInput({
      checkoutId: "checkout_credits",
      checkoutSessionId: "cs_test_FulfillmentCredits001",
      productId: "product_credits",
      eventId: "evt_TestFulfillmentCredits001",
      amountTotal: 500,
      requestId: "request_fulfillment_credits_001",
    });

    const first = await processVerifiedCheckoutEvent(d1.binding, input);
    assert.equal(first.resultType, "credit-grant");
    assert.equal(first.status, "fulfilled");
    assert.deepEqual(
      {
        ...d1.database
          .prepare(
            `SELECT credit_kind, available_balance, reserved_balance,
                    consumed_balance, stripe_environment, livemode
             FROM credit_accounts`,
          )
          .get(),
      },
      {
        credit_kind: "download",
        available_balance: 2,
        reserved_balance: 0,
        consumed_balance: 0,
        stripe_environment: "test",
        livemode: 0,
      },
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM credit_grant_lots"),
      1,
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
      1,
    );
    assert.equal(
      scalar(
        d1.database,
        `SELECT quantity_granted FROM credit_grant_lots
         WHERE fulfillment_event_id IS NOT NULL`,
      ),
      2,
    );

    const replay = await processVerifiedCheckoutEvent(d1.binding, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.orderId, first.orderId);
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM orders"), 1);
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM credit_accounts"),
      1,
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM credit_grant_lots"),
      1,
    );
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
      1,
    );
  } finally {
    d1.close();
  }
});

for (const scenario of [
  {
    name: "expired",
    eventType: "checkout.session.expired",
    status: "expired",
    paymentStatus: "unpaid",
    resultType: "checkout-expired",
    checkoutStatus: "expired",
  },
  {
    name: "failed",
    eventType: "checkout.session.async_payment_failed",
    status: "complete",
    paymentStatus: "unpaid",
    resultType: "checkout-failed",
    checkoutStatus: "failed",
  },
  {
    name: "unpaid",
    eventType: "checkout.session.completed",
    status: "complete",
    paymentStatus: "unpaid",
    resultType: "payment-pending",
    checkoutStatus: "open",
  },
]) {
  test(`${scenario.name} Test Checkout records operational evidence without an order or access`, async () => {
    const d1 = await createInMemoryD1();
    try {
      seedCommerce(d1.database);
      seedOpenCheckout(d1.database);
      const receipt = await processVerifiedCheckoutEvent(
        d1.binding,
        verifiedCheckoutInput({
          eventId: `evt_TestFulfillment${scenario.name}001`,
          eventType: scenario.eventType,
          status: scenario.status,
          paymentStatus: scenario.paymentStatus,
          requestId: `request_fulfillment_${scenario.name}_001`,
        }),
      );

      assert.equal(receipt.status, "ignored");
      assert.equal(receipt.resultType, scenario.resultType);
      assert.equal(
        scalar(
          d1.database,
          "SELECT status FROM checkout_sessions WHERE id = 'checkout_fulfillment'",
        ),
        scenario.checkoutStatus,
      );
      assert.equal(
        scalar(d1.database, "SELECT COUNT(*) FROM commerce_events"),
        1,
      );
      assert.equal(
        scalar(
          d1.database,
          "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.webhook.ignored'",
        ),
        1,
      );
      assertNoGrantedAccess(d1.database);
    } finally {
      d1.close();
    }
  });
}

test("server-owned checkout mismatch rejects before any commerce write", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    seedOpenCheckout(d1.database);

    await assert.rejects(
      processVerifiedCheckoutEvent(
        d1.binding,
        verifiedCheckoutInput({ amountTotal: 901 }),
      ),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "STRIPE_CHECKOUT_MISMATCH",
    );

    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM commerce_events"),
      0,
    );
    assert.equal(scalar(d1.database, "SELECT COUNT(*) FROM audit_events"), 0);
    assert.equal(
      scalar(
        d1.database,
        "SELECT status FROM checkout_sessions WHERE id = 'checkout_fulfillment'",
      ),
      "open",
    );
    assertNoGrantedAccess(d1.database);
  } finally {
    d1.close();
  }
});
