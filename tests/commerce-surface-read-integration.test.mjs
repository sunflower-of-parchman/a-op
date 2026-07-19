import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  readAdminCommerceEvidence,
  readCustomerCommerceOrders,
  readCustomerCommerceReturn,
} = await import("../db/commerce-surface-read.ts");

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

function seedCompletedTestOrder(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_surface_customer', 'surface@example.invalid',
       'surface@example.invalid', 'active'),
      ('user_surface_other', 'other@example.invalid',
       'other@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('user_surface_customer', 'Surface Customer'),
      ('user_surface_other', 'Other Customer');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_surface_customer', 'user_surface_customer', 'customer', NULL),
      ('role_surface_other', 'user_surface_other', 'customer', NULL);

    UPDATE artist_modules SET active = 1 WHERE module_key = 'downloads';
    INSERT INTO commerce_products
      (id, slug, name, description, product_type, credit_kind,
       credit_quantity, state, revision)
    VALUES
      ('product_surface_download', 'surface-download-credit',
       'One download credit', 'One simulated delivery credit.',
       'download-credits', 'download', 1, 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('price_surface_download', 'product_surface_download', 500, 'USD',
       'one_time', 1, 'price_TestSurfaceDownload001', 1, 'test', 0);
    INSERT INTO checkout_sessions
      (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
       status, return_path, stripe_checkout_session_id, stripe_checkout_url,
       amount_minor, currency, stripe_environment, livemode, idempotency_key,
       request_fingerprint, completed_at, created_at, updated_at)
    VALUES
      ('checkout_surface_completed', 'user_surface_customer',
       'product_surface_download', 'price_surface_download', 'payment',
       'completed', '/commerce/return', 'cs_test_SurfaceCheckout001',
       'https://checkout.stripe.com/c/pay/cs_test_SurfaceCheckout001',
       500, 'USD', 'test', 0, 'surface-checkout-operation-001',
       '${DIGEST_A}', '2026-07-19T06:03:00.000Z',
       '2026-07-19T06:00:00.000Z', '2026-07-19T06:03:00.000Z'),
      ('checkout_surface_other', 'user_surface_other',
       'product_surface_download', 'price_surface_download', 'payment',
       'open', '/commerce/return', 'cs_test_SurfaceCheckout002',
       'https://checkout.stripe.com/c/pay/cs_test_SurfaceCheckout002',
       500, 'USD', 'test', 0, 'surface-checkout-operation-002',
       '${DIGEST_B}', NULL, '2026-07-19T06:04:00.000Z',
       '2026-07-19T06:04:00.000Z');
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       checkout_session_id, event_created_at, raw_body_digest,
       facts_fingerprint, status, stripe_environment, livemode,
       created_at, processed_at)
    VALUES
      ('event_surface_completed', 'evt_TestSurfaceCompleted001',
       'checkout.session.completed', 'cs_test_SurfaceCheckout001',
       'checkout_surface_completed', '2026-07-19T06:02:00.000Z',
       '${DIGEST_B}', '${DIGEST_C}', 'completed', 'test', 0,
       '2026-07-19T06:02:30.000Z', '2026-07-19T06:03:00.000Z');
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id, status,
       total_minor, currency, stripe_environment, livemode, completed_at,
       created_at, updated_at)
    VALUES
      ('order_surface_completed', 'user_surface_customer',
       'checkout_surface_completed', 'event_surface_completed', 'fulfilled',
       500, 'USD', 'test', 0, '2026-07-19T06:03:00.000Z',
       '2026-07-19T06:03:00.000Z', '2026-07-19T06:03:00.000Z');
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode, created_at)
    VALUES
      ('item_surface_completed', 'order_surface_completed',
       'product_surface_download', 1, 'price_surface_download',
       'download-credits', 'One download credit', '{"creditQuantity":1}',
       1, 500, 'USD', 'test', 0, '2026-07-19T06:03:00.000Z');
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id, customer_user_id,
       commerce_product_id, kind, provider_object_id, facts_fingerprint,
       status, result_json, stripe_environment, livemode, created_at,
       completed_at)
    VALUES
      ('fulfillment_surface_completed', 'event_surface_completed',
       'checkout_surface_completed', 'order_surface_completed',
       'user_surface_customer', 'product_surface_download', 'one_time',
       'cs_test_SurfaceCheckout001', '${DIGEST_C}', 'fulfilled',
       '{"orderId":"order_surface_completed"}', 'test', 0,
       '2026-07-19T06:03:00.000Z', '2026-07-19T06:03:00.000Z');
  `);
}

function seedRenewalTestOrder(database) {
  database.exec(`
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       checkout_session_id, event_created_at, raw_body_digest,
       facts_fingerprint, status, stripe_environment, livemode,
       created_at, processed_at)
    VALUES
      ('event_surface_renewal', 'evt_TestSurfaceRenewal001',
       'invoice.paid', 'in_TestSurfaceRenewal001', NULL,
       '2026-08-19T06:02:00.000Z', '${DIGEST_A}', '${DIGEST_B}',
       'completed', 'test', 0, '2026-08-19T06:02:30.000Z',
       '2026-08-19T06:03:00.000Z');
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id, status,
       total_minor, currency, stripe_subscription_id, stripe_environment,
       livemode, completed_at, created_at, updated_at)
    VALUES
      ('order_surface_renewal', 'user_surface_customer', NULL,
       'event_surface_renewal', 'fulfilled', 500, 'USD',
       'sub_TestSurfaceSubscription001', 'test', 0,
       '2026-08-19T06:03:00.000Z', '2026-08-19T06:03:00.000Z',
       '2026-08-19T06:03:00.000Z');
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode, created_at)
    VALUES
      ('item_surface_renewal', 'order_surface_renewal',
       'product_surface_download', 1, 'price_surface_download',
       'download-credits', 'Monthly credit renewal',
       '{"creditQuantity":1}', 1, 500, 'USD', 'test', 0,
       '2026-08-19T06:03:00.000Z');
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id, customer_user_id,
       commerce_product_id, kind, provider_object_id, facts_fingerprint,
       status, result_json, stripe_environment, livemode, created_at,
       completed_at)
    VALUES
      ('fulfillment_surface_renewal', 'event_surface_renewal', NULL,
       'order_surface_renewal', 'user_surface_customer',
       'product_surface_download', 'renewal', 'in_TestSurfaceRenewal001',
       '${DIGEST_C}', 'fulfilled', '{"orderId":"order_surface_renewal"}',
       'test', 0, '2026-08-19T06:03:00.000Z',
       '2026-08-19T06:03:00.000Z');
  `);
}

test("customer commerce history is test-only, customer-scoped, and durable", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCompletedTestOrder(d1.database);

    const orders = await readCustomerCommerceOrders(
      d1.binding,
      "user_surface_customer",
    );
    assert.equal(orders.length, 1);
    assert.deepEqual(
      {
        id: orders[0].id,
        checkoutId: orders[0].checkoutId,
        productName: orders[0].productName,
        status: orders[0].status,
        fulfillmentStatus: orders[0].fulfillmentStatus,
        totalMinor: orders[0].totalMinor,
        stripeEnvironment: orders[0].stripeEnvironment,
        livemode: orders[0].livemode,
      },
      {
        id: "order_surface_completed",
        checkoutId: "checkout_surface_completed",
        productName: "One download credit",
        status: "fulfilled",
        fulfillmentStatus: "fulfilled",
        totalMinor: 500,
        stripeEnvironment: "test",
        livemode: false,
      },
    );
    assert.deepEqual(
      await readCustomerCommerceOrders(d1.binding, "user_surface_other"),
      [],
    );

    d1.database.exec(
      "UPDATE artist_modules SET active = 0 WHERE module_key = 'downloads'",
    );
    assert.equal(
      (await readCustomerCommerceOrders(d1.binding, "user_surface_customer"))
        .length,
      1,
      "module deactivation preserves customer order history",
    );
  } finally {
    d1.close();
  }
});

test("return state comes from the matching application customer and order", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCompletedTestOrder(d1.database);
    const result = await readCustomerCommerceReturn(
      d1.binding,
      "user_surface_customer",
      "checkout_surface_completed",
    );
    assert.deepEqual(
      {
        checkoutStatus: result?.checkoutStatus,
        orderId: result?.orderId,
        orderStatus: result?.orderStatus,
        fulfillmentStatus: result?.fulfillmentStatus,
        environment: result?.stripeEnvironment,
        livemode: result?.livemode,
      },
      {
        checkoutStatus: "completed",
        orderId: "order_surface_completed",
        orderStatus: "fulfilled",
        fulfillmentStatus: "fulfilled",
        environment: "test",
        livemode: false,
      },
    );
    assert.equal(
      await readCustomerCommerceReturn(
        d1.binding,
        "user_surface_other",
        "checkout_surface_completed",
      ),
      null,
    );
    assert.equal(
      await readCustomerCommerceReturn(
        d1.binding,
        "user_surface_customer",
        "unsafe checkout id",
      ),
      null,
    );
  } finally {
    d1.close();
  }
});

test("renewal orders and invoice events remain visible without a checkout session", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCompletedTestOrder(d1.database);
    seedRenewalTestOrder(d1.database);

    const orders = await readCustomerCommerceOrders(
      d1.binding,
      "user_surface_customer",
    );
    assert.equal(orders.length, 2);
    assert.deepEqual(
      {
        id: orders[0].id,
        checkoutId: orders[0].checkoutId,
        fulfillmentKind: orders[0].fulfillmentKind,
        environment: orders[0].stripeEnvironment,
        livemode: orders[0].livemode,
      },
      {
        id: "order_surface_renewal",
        checkoutId: null,
        fulfillmentKind: "renewal",
        environment: "test",
        livemode: false,
      },
    );

    const evidence = await readAdminCommerceEvidence(d1.binding);
    const renewalEvent = evidence.events.find(
      (event) => event.id === "event_surface_renewal",
    );
    assert.equal(renewalEvent?.checkoutId, null);
    assert.equal(renewalEvent?.customerUserId, "user_surface_customer");
    assert.equal(renewalEvent?.customerName, "Surface Customer");
  } finally {
    d1.close();
  }
});

test("operator evidence exposes allowlisted test facts without raw provider bodies", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCompletedTestOrder(d1.database);
    const evidence = await readAdminCommerceEvidence(d1.binding);
    assert.equal(evidence.orders.length, 1);
    assert.equal(evidence.events.length, 1);
    assert.equal(evidence.fulfillments.length, 1);
    assert.equal(evidence.orders[0].customerName, "Surface Customer");
    assert.equal(
      evidence.events[0].stripeEventId,
      "evt_TestSurfaceCompleted001",
    );
    assert.equal(evidence.fulfillments[0].status, "fulfilled");

    const serialized = JSON.stringify(evidence);
    assert.doesNotMatch(
      serialized,
      /rawBody|raw_body|resultJson|result_json|paymentMethod|card|secret/i,
    );
    assert.match(serialized, /"stripeEnvironment":"test"/);
    assert.match(serialized, /"livemode":false/);
  } finally {
    d1.close();
  }
});
