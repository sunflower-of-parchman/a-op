import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../app/api/commerce/webhooks/stripe/route.ts",
  import.meta.url,
);

test("the Stripe route verifies bounded raw bytes before any D1 handler runs", async () => {
  const source = await readFile(routeUrl, "utf8");
  const bodyIndex = source.indexOf("readBoundedBody(request)");
  const verifyIndex = source.indexOf("verifyAndParseStripeTestEvent({");
  const digestIndex = source.indexOf("digestVerifiedStripeTestEvent(");
  const d1Index = source.indexOf("processVerifiedCheckoutEvent(env.DB");

  assert.match(source, /const MAX_WEBHOOK_BYTES = 262_144/);
  assert.match(source, /mediaType !== "application\/json"/);
  assert.match(source, /STRIPE_WEBHOOK_CONTENT_TYPE_REQUIRED/);
  assert.match(source, /request\.body\.getReader\(\)/);
  assert.match(source, /stripe-signature/);
  assert.ok(bodyIndex >= 0);
  assert.ok(verifyIndex > bodyIndex);
  assert.ok(digestIndex > verifyIndex);
  assert.ok(d1Index > digestIndex);
  assert.doesNotMatch(source, /request\.json\(\)|request\.text\(\)/);
  assert.doesNotMatch(source, /rawBody\s*[:,]\s*(?:JSON|stringify)|console\./);
});

test("the verified route dispatches checkout, invoice, and subscription facts", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /event\.objectKind === "checkout-session"/);
  assert.match(source, /processVerifiedCheckoutEvent\(env\.DB/);
  assert.match(source, /event\.objectKind === "invoice"/);
  assert.match(source, /processVerifiedInvoiceEvent\(env\.DB/);
  assert.match(source, /processVerifiedSubscriptionEvent\(env\.DB/);
  assert.match(source, /validateStripeTestEnvironment\(\{/);
  assert.match(source, /env\.STRIPE_PUBLISHABLE_KEY/);
  assert.match(source, /env\.STRIPE_SECRET_KEY/);
  assert.match(source, /env\.STRIPE_WEBHOOK_SECRET/);
});
