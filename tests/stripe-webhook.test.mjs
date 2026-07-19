import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  CommerceAdapterError,
  digestVerifiedStripeTestEvent,
  verifyAndParseStripeTestEvent,
  verifyStripeWebhookSignature,
} from "../lib/commerce/index.ts";

const WEBHOOK_SECRET = "whsec_FictionalWebhookSecret123456";
const NOW = 1_800_000_000;

function checkoutEvent(overrides = {}) {
  return {
    id: "evt_FictionalWebhook001",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    created: NOW,
    data: {
      object: {
        id: "cs_test_FictionalWebhookSession001",
        object: "checkout.session",
        livemode: false,
        client_reference_id: "checkout_fictional_001",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        customer: "cus_FictionalWebhookCustomer001",
        subscription: null,
        amount_total: 2_000,
        currency: "usd",
        metadata: {
          aop_checkout_id: "checkout_fictional_001",
          aop_product_id: "product_fictional_001",
          aop_customer_id: "user_fictional_001",
        },
      },
    },
    ...overrides,
  };
}

function bytes(value) {
  return new TextEncoder().encode(value);
}

function hmac(rawBody, timestamp, secret = WEBHOOK_SECRET) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(rawBody)
    .digest("hex");
}

function signatureHeader(rawBody, timestamp = NOW, secret = WEBHOOK_SECRET) {
  return `t=${timestamp},v1=${hmac(rawBody, timestamp, secret)}`;
}

function verificationInput(rawBody, signature = signatureHeader(rawBody)) {
  return {
    rawBody,
    signatureHeader: signature,
    webhookSecret: WEBHOOK_SECRET,
    nowUnix: () => NOW,
  };
}

async function assertCommerceRejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof CommerceAdapterError);
    assert.equal(error.code, code);
    assert.doesNotMatch(
      `${error.message}\n${error.stack ?? ""}`,
      /FictionalWebhookSecret123456/,
    );
    return true;
  });
}

test("a valid v1 signature verifies against the exact raw bytes", async () => {
  const rawBody = bytes(JSON.stringify(checkoutEvent()));
  const receipt = await verifyStripeWebhookSignature(
    verificationInput(rawBody),
  );

  assert.deepEqual(receipt, { verified: true, timestamp: NOW });
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /whsec_|v1=|checkout.session/);
});

test("verification precedes JSON parsing and projection", async () => {
  const invalidJson = bytes("{not-json");
  await assertCommerceRejects(
    verifyAndParseStripeTestEvent(
      verificationInput(invalidJson, `t=${NOW},v1=${"0".repeat(64)}`),
    ),
    "STRIPE_WEBHOOK_SIGNATURE_INVALID",
  );

  await assertCommerceRejects(
    verifyAndParseStripeTestEvent(verificationInput(invalidJson)),
    "STRIPE_WEBHOOK_PAYLOAD_INVALID",
  );
});

test("whitespace or encoding changes after signing invalidate the body", async () => {
  const compact = bytes(JSON.stringify(checkoutEvent()));
  const pretty = bytes(JSON.stringify(checkoutEvent(), null, 2));
  const compactSignature = signatureHeader(compact);

  await assertCommerceRejects(
    verifyStripeWebhookSignature(verificationInput(pretty, compactSignature)),
    "STRIPE_WEBHOOK_SIGNATURE_INVALID",
  );
});

test("multiple v1 signatures support endpoint-secret rotation without early acceptance", async () => {
  const rawBody = bytes(JSON.stringify(checkoutEvent()));
  const valid = hmac(rawBody, NOW);
  const header = `t=${NOW},v1=${"a".repeat(64)},v0=${"b".repeat(64)},v1=${valid}`;

  assert.deepEqual(
    await verifyStripeWebhookSignature(verificationInput(rawBody, header)),
    { verified: true, timestamp: NOW },
  );
});

test("stale and future timestamps outside the tolerance are rejected", async () => {
  const rawBody = bytes(JSON.stringify(checkoutEvent()));

  for (const timestamp of [NOW - 301, NOW + 301]) {
    await assertCommerceRejects(
      verifyStripeWebhookSignature(
        verificationInput(rawBody, signatureHeader(rawBody, timestamp)),
      ),
      "STRIPE_WEBHOOK_TIMESTAMP_INVALID",
    );
  }
});

test("malformed signature headers fail closed", async () => {
  const rawBody = bytes(JSON.stringify(checkoutEvent()));
  const cases = [
    null,
    "",
    `v1=${"0".repeat(64)}`,
    `t=${NOW}`,
    `t=${NOW},t=${NOW},v1=${"0".repeat(64)}`,
    `t=${NOW},v1=not-hex`,
    `t=${NOW}\r\nv1=${"0".repeat(64)}`,
  ];

  for (const signature of cases) {
    await assertCommerceRejects(
      verifyStripeWebhookSignature(verificationInput(rawBody, signature)),
      "STRIPE_WEBHOOK_SIGNATURE_INVALID",
    );
  }
});

test("a signed test event projects minimal checkout facts", async () => {
  const rawBody = bytes(JSON.stringify(checkoutEvent()));
  const event = await verifyAndParseStripeTestEvent(verificationInput(rawBody));

  assert.equal(event.objectKind, "checkout-session");
  assert.equal(event.stripeEventId, "evt_FictionalWebhook001");
  assert.equal(
    event.checkoutSession.checkoutSessionId,
    "cs_test_FictionalWebhookSession001",
  );
  assert.equal(event.stripeEnvironment, "test");
  assert.equal(event.livemode, false);
});

test("webhook replay digests retain no raw payload and distinguish bytes from projected facts", async () => {
  const compactBody = bytes(JSON.stringify(checkoutEvent()));
  const spacedBody = bytes(JSON.stringify(checkoutEvent(), null, 2));
  const compactEvent = await verifyAndParseStripeTestEvent(
    verificationInput(compactBody),
  );
  const spacedEvent = await verifyAndParseStripeTestEvent({
    ...verificationInput(spacedBody),
    signatureHeader: signatureHeader(spacedBody),
  });
  const compact = await digestVerifiedStripeTestEvent(
    compactBody,
    compactEvent,
  );
  const spaced = await digestVerifiedStripeTestEvent(spacedBody, spacedEvent);

  assert.match(compact.rawBodyDigest, /^[a-f0-9]{64}$/);
  assert.match(compact.factsFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(compact.rawBodyDigest, spaced.rawBodyDigest);
  assert.equal(compact.factsFingerprint, spaced.factsFingerprint);
  assert.doesNotMatch(JSON.stringify(compact), /checkout|customer|metadata/);
});

test("a correctly signed live-mode event is rejected after signature verification", async () => {
  const rawBody = bytes(
    JSON.stringify(
      checkoutEvent({ livemode: true, type: "unknown.live.event" }),
    ),
  );

  await assertCommerceRejects(
    verifyAndParseStripeTestEvent(verificationInput(rawBody)),
    "STRIPE_LIVE_EVENT_REJECTED",
  );
});

test("invalid webhook configuration is redacted and cannot be inferred from output", async () => {
  const rawBody = bytes(JSON.stringify(checkoutEvent()));
  const privateWrongSecret = "sk_live_ForbiddenCredential123456";

  await assert.rejects(
    verifyStripeWebhookSignature({
      ...verificationInput(rawBody),
      webhookSecret: privateWrongSecret,
    }),
    (error) => {
      assert.equal(error.code, "STRIPE_LIVE_CREDENTIAL_REJECTED");
      assert.doesNotMatch(
        `${error.message}\n${error.stack ?? ""}`,
        /ForbiddenCredential123456/,
      );
      return true;
    },
  );
});
