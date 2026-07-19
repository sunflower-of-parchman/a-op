import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  checkoutProviderIdempotencyKey,
  checkoutReceipt,
  createCheckoutIntent,
  markCheckoutFailed,
  markCheckoutOpen,
} = await import("../db/commerce-checkout-write.ts");
const {
  listActiveCommerceProducts,
  readActiveCommerceProduct,
  readCheckoutSession,
} = await import("../db/commerce-read.ts");
const { RuntimeError } = await import("../lib/runtime/index.ts");

function seedCommerce(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_checkout_customer', 'checkout@example.invalid',
       'checkout@example.invalid', 'active'),
      ('user_checkout_without_role', 'without-role@example.invalid',
       'without-role@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_checkout_customer', 'user_checkout_customer', 'customer', NULL);
    UPDATE artist_modules SET active = 1 WHERE module_key = 'downloads';
    INSERT INTO commerce_products
      (id, slug, name, description, product_type, credit_kind,
       credit_quantity, state, revision)
    VALUES
      ('product_download_credits', 'download-credits', 'Two download credits',
       'Two simulated delivery credits.', 'download-credits', 'download', 2,
       'active', 1),
      ('product_download_credits_second', 'download-credits-second',
       'One download credit', 'One simulated delivery credit.',
       'download-credits', 'download', 1, 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('commerce_price_download', 'product_download_credits', 500, 'USD',
       'one_time', 1, 'price_TestDownloadCredits001', 1, 'test', 0),
      ('commerce_price_download_second', 'product_download_credits_second',
       300, 'USD', 'one_time', 1, 'price_TestDownloadCredits002', 1,
       'test', 0);
  `);
}

function context(overrides = {}) {
  return {
    actorUserId: "user_checkout_customer",
    idempotencyKey: "checkout-operation-001",
    requestId: "request_checkout_001",
    ...overrides,
  };
}

test("active products expose server pricing and persistent Test Mode state", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    const product = await readActiveCommerceProduct(
      d1.binding,
      "product_download_credits",
    );
    assert.equal(product.stripePriceId, "price_TestDownloadCredits001");
    assert.equal(product.amountMinor, 500);
    assert.equal(product.mode, "payment");
    assert.equal(product.livemode, false);
    assert.equal(product.statement, "No real payment will be accepted.");

    const visible = await listActiveCommerceProducts(d1.binding);
    assert.equal(visible.length, 2);
    assert.equal(Object.hasOwn(visible[0], "stripePriceId"), false);

    d1.database.exec(
      "UPDATE artist_modules SET active = 0 WHERE module_key = 'downloads'",
    );
    assert.deepEqual(await listActiveCommerceProducts(d1.binding), []);
    await assert.rejects(
      readActiveCommerceProduct(d1.binding, "product_download_credits"),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "COMMERCE_PRODUCT_UNAVAILABLE",
    );
  } finally {
    d1.close();
  }
});

test("one customer operation creates and replays one server-owned checkout intent", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    const selection = {
      productId: "product_download_credits",
      licenseRequestId: null,
    };
    const first = await createCheckoutIntent(d1.binding, selection, context());
    assert.equal(first.replayed, false);
    assert.equal(first.checkout.status, "creating");
    assert.equal(first.checkout.amountMinor, 500);
    assert.equal(first.checkout.currency, "USD");
    assert.equal(first.checkout.customerUserId, "user_checkout_customer");
    assert.equal(first.checkout.stripeCheckoutSessionId, null);

    const replay = await createCheckoutIntent(d1.binding, selection, context());
    assert.equal(replay.replayed, true);
    assert.equal(replay.checkout.id, first.checkout.id);
    assert.equal(
      scalar(d1.database, "SELECT COUNT(*) FROM checkout_sessions"),
      1,
    );
    assert.equal(
      scalar(
        d1.database,
        "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.checkout.create'",
      ),
      1,
    );
    assert.deepEqual(
      {
        ...d1.database
          .prepare(
            `SELECT stripe_environment, livemode, amount_minor, currency
             FROM checkout_sessions WHERE id = ?1`,
          )
          .get(first.checkout.id),
      },
      {
        stripe_environment: "test",
        livemode: 0,
        amount_minor: 500,
        currency: "USD",
      },
    );

    await assert.rejects(
      createCheckoutIntent(
        d1.binding,
        {
          productId: "product_download_credits_second",
          licenseRequestId: null,
        },
        context(),
      ),
      (error) =>
        error instanceof RuntimeError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  } finally {
    d1.close();
  }
});

test("Stripe Test Checkout facts advance the exact intent without browser authority", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    const intent = await createCheckoutIntent(
      d1.binding,
      { productId: "product_download_credits", licenseRequestId: null },
      context(),
    );
    const opened = await markCheckoutOpen(d1.binding, intent.checkout, {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      mode: "payment",
      checkoutSessionId: "cs_test_CheckoutIntegration001",
      checkoutUrl:
        "https://checkout.stripe.com/c/pay/cs_test_CheckoutIntegration001",
    });
    assert.equal(opened.status, "open");
    assert.equal(
      checkoutProviderIdempotencyKey(opened.id),
      `aop_checkout_${opened.id}`,
    );
    assert.equal(
      checkoutReceipt(opened, intent.product.name, false).statement,
      "No real payment will be accepted.",
    );

    const exactReplay = await markCheckoutOpen(d1.binding, intent.checkout, {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      mode: "payment",
      checkoutSessionId: "cs_test_CheckoutIntegration001",
      checkoutUrl:
        "https://checkout.stripe.com/c/pay/cs_test_CheckoutIntegration001",
    });
    assert.equal(exactReplay.id, opened.id);

    const stored = await readCheckoutSession(d1.binding, opened.id);
    assert.equal(
      stored?.stripeCheckoutSessionId,
      opened.stripeCheckoutSessionId,
    );
    assert.equal(
      JSON.stringify(stored).includes("price_TestDownloadCredits001"),
      false,
    );
  } finally {
    d1.close();
  }
});

test("failed provider creation grants no state and inactive customers cannot create intents", async () => {
  const d1 = await createInMemoryD1();
  try {
    seedCommerce(d1.database);
    const intent = await createCheckoutIntent(
      d1.binding,
      { productId: "product_download_credits", licenseRequestId: null },
      context(),
    );
    await markCheckoutFailed(
      d1.binding,
      intent.checkout.id,
      "provider_unavailable",
    );
    const failed = await readCheckoutSession(d1.binding, intent.checkout.id);
    assert.equal(failed?.status, "failed");
    for (const table of [
      "orders",
      "fulfillment_events",
      "entitlements",
      "credit_ledger_entries",
      "memberships",
      "subscriptions",
      "issued_licenses",
    ]) {
      assert.equal(scalar(d1.database, `SELECT COUNT(*) FROM ${table}`), 0);
    }

    await assert.rejects(
      createCheckoutIntent(
        d1.binding,
        {
          productId: "product_download_credits_second",
          licenseRequestId: null,
        },
        context({
          actorUserId: "user_checkout_without_role",
          idempotencyKey: "checkout-operation-unauthorized",
        }),
      ),
      (error) => error instanceof RuntimeError && error.code === "STALE_STATE",
    );
  } finally {
    d1.close();
  }
});
