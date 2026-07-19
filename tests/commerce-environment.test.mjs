import assert from "node:assert/strict";
import test from "node:test";

import {
  CommerceAdapterError,
  SITES_COMMERCE_ADAPTER,
  validateStripeTestEnvironment,
} from "../lib/commerce/index.ts";

const VALID = Object.freeze({
  publishableKey: "pk_test_FictionalPublishable123",
  secretKey: "sk_test_FictionalSecret123456",
  webhookSecret: "whsec_FictionalWebhook123456",
});

function assertSafeFailure(run, code, privateValue) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof CommerceAdapterError);
    assert.equal(error.code, code);
    const diagnostic = `${error.name}\n${error.message}\n${error.stack ?? ""}`;
    if (privateValue) assert.doesNotMatch(diagnostic, new RegExp(privateValue));
    return true;
  });
}

test("the Sites adapter is permanently the Stripe test simulation", () => {
  assert.equal(SITES_COMMERCE_ADAPTER, "stripe-test-simulation");

  const status = validateStripeTestEnvironment(VALID);
  assert.deepEqual(status, {
    adapter: "stripe-test-simulation",
    stripeEnvironment: "test",
    livemode: false,
    ready: true,
  });

  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /pk_test_|sk_test_|whsec_|Fictional/);
  assert.deepEqual(Object.keys(status).sort(), [
    "adapter",
    "livemode",
    "ready",
    "stripeEnvironment",
  ]);
});

test("missing test credentials fail setup with a clear redacted error", () => {
  for (const [field, value] of [
    ["publishableKey", undefined],
    ["secretKey", null],
    ["webhookSecret", ""],
  ]) {
    assertSafeFailure(
      () => validateStripeTestEnvironment({ ...VALID, [field]: value }),
      "STRIPE_CONFIGURATION_MISSING",
    );
  }
});

test("recognized live credentials produce a hard failure in every slot", () => {
  const cases = [
    ["publishableKey", "pk_live_ForbiddenPublishable123"],
    ["secretKey", "sk_live_ForbiddenSecret123456"],
    ["secretKey", "rk_live_ForbiddenRestricted123"],
    ["webhookSecret", "ak_live_ForbiddenFutureKey123"],
    ["publishableKey", "  pk_live_ForbiddenPaddedKey123"],
  ];

  for (const [field, value] of cases) {
    assertSafeFailure(
      () => validateStripeTestEnvironment({ ...VALID, [field]: value }),
      "STRIPE_LIVE_CREDENTIAL_REJECTED",
      value,
    );
  }
});

test("wrong prefixes, whitespace, controls, and truncated values are rejected", () => {
  const cases = [
    ["publishableKey", "rk_test_RestrictedNotPublishable123"],
    ["publishableKey", "pk_test_short"],
    ["secretKey", "pk_test_NotASecret123456"],
    ["secretKey", "sk_test_Contains Space123"],
    ["webhookSecret", "whsec_short"],
    ["webhookSecret", "whsec_Fictional\nInjected"],
  ];

  for (const [field, value] of cases) {
    assertSafeFailure(
      () => validateStripeTestEnvironment({ ...VALID, [field]: value }),
      "STRIPE_CONFIGURATION_INVALID",
      value,
    );
  }
});

test("a webhook prefix never changes the environment established by test API keys", () => {
  const first = validateStripeTestEnvironment(VALID);
  const second = validateStripeTestEnvironment({
    ...VALID,
    webhookSecret: "whsec_AnotherFictionalEndpoint987654",
  });

  assert.deepEqual(first, second);
  assert.equal(second.stripeEnvironment, "test");
  assert.equal(second.livemode, false);
});
