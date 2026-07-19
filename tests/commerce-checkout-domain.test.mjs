import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_REAL_PAYMENT_STATEMENT,
  STRIPE_TEST_MODE_LABEL,
  commerceTestStatus,
  parseCommerceCheckoutSelection,
} from "../lib/commerce/domain.ts";

test("the public commerce contract is permanently and visibly Test Mode", () => {
  assert.deepEqual(commerceTestStatus(), {
    adapter: "stripe-test-simulation",
    stripeEnvironment: "test",
    livemode: false,
    label: STRIPE_TEST_MODE_LABEL,
    statement: NO_REAL_PAYMENT_STATEMENT,
  });
  assert.equal(STRIPE_TEST_MODE_LABEL, "Stripe Test Mode");
  assert.equal(NO_REAL_PAYMENT_STATEMENT, "No real payment will be accepted.");
});

test("checkout selection accepts only an opaque server product and optional license request", () => {
  assert.deepEqual(
    parseCommerceCheckoutSelection({ productId: "product_test_001" }),
    { productId: "product_test_001", licenseRequestId: null },
  );
  assert.deepEqual(
    parseCommerceCheckoutSelection({
      licenseRequestId: "license_request_test_001",
      productId: "product_test_001",
    }),
    {
      productId: "product_test_001",
      licenseRequestId: "license_request_test_001",
    },
  );

  for (const input of [
    null,
    {},
    { productId: "unsafe product" },
    { productId: "product_test_001", amountMinor: 1 },
    { productId: "product_test_001", customerUserId: "user_other" },
    { productId: "product_test_001", priceId: "price_browser" },
    { productId: "product_test_001", payment: {} },
  ]) {
    assert.throws(
      () => parseCommerceCheckoutSelection(input),
      /checkout selection/i,
    );
  }
});
