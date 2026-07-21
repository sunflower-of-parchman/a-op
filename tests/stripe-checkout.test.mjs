import assert from "node:assert/strict";
import test from "node:test";

import {
  CommerceAdapterError,
  NO_REAL_PAYMENT_STATEMENT,
  STRIPE_CHECKOUT_SESSION_ENDPOINT,
  createStripeTestCheckoutSession,
} from "../lib/commerce/index.ts";

const SECRET_KEY = "sk_test_FictionalCheckoutSecret123456";
const INPUT = Object.freeze({
  secretKey: SECRET_KEY,
  idempotencyKey: "checkout.create:user_fictional_001:request_001",
  mode: "payment",
  priceId: "price_FictionalPrice001",
  checkoutId: "checkout_fictional_001",
  productId: "product_fictional_001",
  customerUserId: "user_fictional_001",
  stripeCustomerId: "cus_FictionalCustomer001",
  successUrl:
    "https://artist.example.test/account/orders/return?checkout=checkout_fictional_001",
  cancelUrl:
    "https://artist.example.test/music/fictional-track?checkout=cancelled",
});

function validStripeResponse(overrides = {}) {
  return {
    id: "cs_test_FictionalCheckoutSession001",
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    ui_mode: "hosted_page",
    url: "https://checkout.stripe.com/c/pay/cs_test_FictionalCheckoutSession001",
    client_secret: "cs_test_private_client_secret",
    customer_details: {
      email: "private-listener@example.test",
      address: { line1: "Private billing address" },
    },
    payment_method_types: ["card"],
    ...overrides,
  };
}

function recordingFetch(responseValue = validStripeResponse()) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json(responseValue);
    },
  };
}

async function assertSafeRejects(promise, code, privateValue) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof CommerceAdapterError);
    assert.equal(error.code, code);
    const diagnostic = `${error.message}\n${error.stack ?? ""}`;
    if (privateValue) assert.doesNotMatch(diagnostic, new RegExp(privateValue));
    return true;
  });
}

test("the client constructs one hosted, server-owned Test Checkout request", async () => {
  const transport = recordingFetch();
  const session = await createStripeTestCheckoutSession(INPUT, transport);

  assert.equal(transport.calls.length, 1);
  const [{ url, init }] = transport.calls;
  assert.equal(url, STRIPE_CHECKOUT_SESSION_ENDPOINT);
  assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.equal(
    init.headers["content-type"],
    "application/x-www-form-urlencoded",
  );
  assert.equal(init.headers["idempotency-key"], INPUT.idempotencyKey);
  assert.equal(
    globalThis.atob(init.headers.authorization.slice("Basic ".length)),
    `${SECRET_KEY}:`,
  );

  const body = new URLSearchParams(init.body);
  assert.equal(body.get("mode"), "payment");
  assert.equal(body.get("ui_mode"), "hosted_page");
  assert.equal(
    body.get("custom_text[submit][message]"),
    "No real payment will be accepted.",
  );
  assert.equal(
    body.get("custom_text[submit][message]"),
    NO_REAL_PAYMENT_STATEMENT,
  );
  assert.equal(body.get("client_reference_id"), INPUT.checkoutId);
  assert.equal(body.get("line_items[0][price]"), INPUT.priceId);
  assert.deepEqual(body.getAll("line_items[0][quantity]"), ["1"]);
  assert.equal(body.get("metadata[aop_checkout_id]"), INPUT.checkoutId);
  assert.equal(body.get("metadata[aop_product_id]"), INPUT.productId);
  assert.equal(body.get("metadata[aop_customer_id]"), INPUT.customerUserId);
  assert.equal(body.get("customer"), INPUT.stripeCustomerId);
  assert.equal(body.get("success_url"), INPUT.successUrl);
  assert.equal(body.get("cancel_url"), INPUT.cancelUrl);
  assert.equal(
    [...body.keys()].filter((key) => key.startsWith("line_items[")).length,
    2,
  );
  assert.doesNotMatch(
    [...body.keys()].join(" "),
    /card|payment_method|billing|customer_details|client_secret/i,
  );
  assert.doesNotMatch(body.toString(), /FictionalCheckoutSecret/);

  assert.deepEqual(session, {
    adapter: "stripe-test-simulation",
    stripeEnvironment: "test",
    livemode: false,
    mode: "payment",
    checkoutSessionId: "cs_test_FictionalCheckoutSession001",
    checkoutUrl:
      "https://checkout.stripe.com/c/pay/cs_test_FictionalCheckoutSession001",
  });
  assert.doesNotMatch(
    JSON.stringify(session),
    /FictionalCheckoutSecret|client_secret|customer_details|private-listener|Private billing|payment_method/i,
  );
});

test("subscription Checkout carries the same server metadata into subscription events", async () => {
  const transport = recordingFetch(
    validStripeResponse({ mode: "subscription" }),
  );
  await createStripeTestCheckoutSession(
    { ...INPUT, mode: "subscription" },
    transport,
  );

  const body = new URLSearchParams(transport.calls[0].init.body);
  assert.equal(body.get("mode"), "subscription");
  assert.equal(
    body.get("custom_text[submit][message]"),
    "No real payment will be accepted.",
  );
  assert.equal(
    body.get("subscription_data[metadata][aop_checkout_id]"),
    INPUT.checkoutId,
  );
  assert.equal(
    body.get("subscription_data[metadata][aop_product_id]"),
    INPUT.productId,
  );
  assert.equal(
    body.get("subscription_data[metadata][aop_customer_id]"),
    INPUT.customerUserId,
  );
});

test("every supported hosted Test Checkout mode carries the exact no-payment notice", async () => {
  for (const mode of ["payment", "subscription"]) {
    const transport = recordingFetch(validStripeResponse({ mode }));
    await createStripeTestCheckoutSession({ ...INPUT, mode }, transport);

    assert.equal(transport.calls.length, 1);
    const body = new URLSearchParams(transport.calls[0].init.body);
    assert.equal(body.get("ui_mode"), "hosted_page");
    assert.deepEqual(body.getAll("custom_text[submit][message]"), [
      NO_REAL_PAYMENT_STATEMENT,
    ]);
  }
});

test("local development can return from hosted Checkout over HTTP loopback only", async () => {
  const transport = recordingFetch();
  await createStripeTestCheckoutSession(
    {
      ...INPUT,
      successUrl: "http://localhost:3000/commerce/return?checkout=local",
      cancelUrl:
        "http://localhost:3000/commerce/return?checkout=local&canceled=1",
      allowHttpLoopback: true,
    },
    transport,
  );

  const body = new URLSearchParams(transport.calls[0].init.body);
  assert.equal(
    body.get("success_url"),
    "http://localhost:3000/commerce/return?checkout=local",
  );
  assert.equal(
    body.get("cancel_url"),
    "http://localhost:3000/commerce/return?checkout=local&canceled=1",
  );

  for (const successUrl of [
    "http://localhost:3000/commerce/return",
    "http://127.0.0.1:3000/commerce/return",
    "http://[::1]:3000/commerce/return",
  ]) {
    const rejected = recordingFetch();
    await assertSafeRejects(
      createStripeTestCheckoutSession({ ...INPUT, successUrl }, rejected),
      "STRIPE_CHECKOUT_INPUT_INVALID",
    );
    assert.equal(rejected.calls.length, 0);
  }
});

test("live and wrong API keys fail before fetch", async () => {
  const cases = [
    ["sk_live_ForbiddenCheckoutSecret123", "STRIPE_LIVE_CREDENTIAL_REJECTED"],
    [
      "rk_live_ForbiddenCheckoutRestricted123",
      "STRIPE_LIVE_CREDENTIAL_REJECTED",
    ],
    ["pk_test_NotASecretCheckoutKey123", "STRIPE_CONFIGURATION_INVALID"],
  ];

  for (const [secretKey, code] of cases) {
    const transport = recordingFetch();
    await assertSafeRejects(
      createStripeTestCheckoutSession({ ...INPUT, secretKey }, transport),
      code,
      secretKey,
    );
    assert.equal(transport.calls.length, 0);
  }
});

test("browser-like price, identity, idempotency, and redirect input fails before fetch", async () => {
  const cases = [
    { priceId: "prod_NotAPrice001" },
    { checkoutId: "checkout id with spaces" },
    { customerUserId: "user\ninjected" },
    { idempotencyKey: "short" },
    { stripeCustomerId: "customer_not_stripe" },
    { successUrl: "http://artist.example.test/account/orders/return" },
    { successUrl: "https://artist.example.test/#unsafe-fragment" },
    { cancelUrl: "https://different.example.test/music" },
    { mode: "setup" },
  ];

  for (const overrides of cases) {
    const transport = recordingFetch();
    await assertSafeRejects(
      createStripeTestCheckoutSession({ ...INPUT, ...overrides }, transport),
      "STRIPE_CHECKOUT_INPUT_INVALID",
    );
    assert.equal(transport.calls.length, 0);
  }
});

test("live-mode, live-ID, non-hosted, and unsafe Checkout responses fail closed", async () => {
  const responses = [
    validStripeResponse({ livemode: true }),
    validStripeResponse({ id: "cs_live_ForbiddenCheckoutSession001" }),
    validStripeResponse({ ui_mode: "embedded" }),
    validStripeResponse({ mode: "subscription" }),
    validStripeResponse({ url: "http://checkout.stripe.com/unsafe" }),
    validStripeResponse({ url: "https://checkout.stripe.example.test/unsafe" }),
  ];

  for (const response of responses) {
    const transport = recordingFetch(response);
    await assertSafeRejects(
      createStripeTestCheckoutSession(INPUT, transport),
      "STRIPE_CHECKOUT_RESPONSE_INVALID",
      "ForbiddenCheckoutSession001",
    );
    assert.equal(transport.calls.length, 1);
  }
});

test("provider failures and malformed provider bodies stay redacted", async () => {
  await assertSafeRejects(
    createStripeTestCheckoutSession(INPUT, {
      fetch: async () => {
        throw new Error(`transport leaked ${SECRET_KEY}`);
      },
    }),
    "STRIPE_CHECKOUT_REQUEST_FAILED",
    SECRET_KEY,
  );

  await assertSafeRejects(
    createStripeTestCheckoutSession(INPUT, {
      fetch: async () =>
        new Response(`provider leaked ${SECRET_KEY}`, { status: 401 }),
    }),
    "STRIPE_CHECKOUT_REQUEST_FAILED",
    SECRET_KEY,
  );

  await assertSafeRejects(
    createStripeTestCheckoutSession(INPUT, {
      fetch: async () => new Response("{not-json", { status: 200 }),
    }),
    "STRIPE_CHECKOUT_RESPONSE_INVALID",
  );
});
