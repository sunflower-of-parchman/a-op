import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  page: "../app/admin/commerce/page.tsx",
  workspace: "../components/commerce/AdminCommerceProductWorkspace.tsx",
  styles: "../components/commerce/AdminCommerceProductWorkspace.module.css",
  mutation: "../components/commerce/useCommerceProductMutation.ts",
  read: "../db/commerce-admin-read.ts",
  notice: "../components/commerce/CommerceTestModeNotice.tsx",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("owner commerce page combines product setup with existing operational evidence", async () => {
  const [page, workspace, read] = await Promise.all([
    source(files.page),
    source(files.workspace),
    source(files.read),
  ]);
  assert.match(page, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(page, /readAdminCommerceProducts\(env\.DB, identity\.userId\)/);
  assert.match(page, /<AdminCommerceProductWorkspace products=\{products\}/);
  assert.match(page, /<AdminCommerce[\s\S]*?evidence=\{evidence\}/);
  assert.match(read, /activeOwnerCondition\(ownerUserId\)/);
  assert.match(read, /commerce_prices\.revision = 1/);
  assert.match(read, /commerce_prices\.stripe_environment = 'test'/);
  assert.match(read, /commerce_prices\.livemode = 0/);
  assert.match(workspace, /Existing test order history remains intact/);
});

test("product setup submits exact server-compatible create and state operations", async () => {
  const [workspace, mutation] = await Promise.all([
    source(files.workspace),
    source(files.mutation),
  ]);
  for (const productType of [
    "track",
    "release",
    "collection",
    "membership",
    "subscription",
    "license",
    "download-credits",
    "license-credits",
  ]) {
    assert.match(workspace, new RegExp(`value: "${productType}"`));
  }
  for (const field of [
    "resourceId",
    "resourceRevisionId",
    "resourceVersion",
    "accessPlanId",
    "accessPlanRevision",
    "membershipPlanId",
    "membershipPlanRevision",
    "subscriptionPlanId",
    "subscriptionPlanRevision",
    "trackId",
    "trackRevisionId",
    "trackVersion",
    "quantity",
    "stripePriceId",
    "amountMinor",
    "currency",
    "billingInterval",
    "intervalCount",
  ]) {
    assert.match(workspace, new RegExp(`\\b${field}\\b`));
  }
  assert.match(workspace, /mutate\("\/api\/admin\/commerce\/products"/);
  assert.match(
    workspace,
    /`\/api\/admin\/commerce\/products\/\$\{encodeURIComponent\(product\.id\)\}\/\$\{transition\}`/,
  );
  assert.match(workspace, /expectedRevision: product\.revision/);
  assert.match(workspace, /licenseOfferId: offer\.id/);
  assert.match(workspace, /licenseOfferRevision: offer\.revision/);
  assert.match(workspace, /licenseOffer:[\s\S]*?: null/);
  assert.match(workspace, /router\.refresh\(\)/);

  assert.match(mutation, /fingerprint = `POST:\$\{url\}:\$\{serializedBody\}`/);
  assert.match(mutation, /pending\?\.fingerprint === fingerprint/);
  assert.match(mutation, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(mutation, /"idempotency-key": operation\.idempotencyKey/);
  assert.match(
    mutation,
    /if \(response\.status < 500\) pendingOperation\.current = null/,
  );
});

test("product administration stays visibly test-only, cardless, responsive, and asset-free", async () => {
  const [workspace, styles, mutation, notice] = await Promise.all([
    source(files.workspace),
    source(files.styles),
    source(files.mutation),
    source(files.notice),
  ]);
  const combined = `${workspace}\n${mutation}\n${notice}`;
  assert.match(workspace, /<CommerceTestModeNotice/);
  assert.match(workspace, /no live commerce control/i);
  assert.match(workspace, /No API key or payment detail belongs in/);
  assert.match(notice, /NO_REAL_PAYMENT_STATEMENT/);
  assert.match(notice, /STRIPE_TEST_MODE_LABEL/);
  assert.doesNotMatch(combined, /pk_(?:test|live)_|sk_(?:test|live)_/);
  assert.doesNotMatch(
    combined,
    /card(?:Number|Cvc|Expiry)|paymentMethod|customerUserId|accessGrantId|entitlementId/i,
  );
  assert.doesNotMatch(combined, /type=["'](?:password|file)["']/i);
  assert.doesNotMatch(combined, /<(?:img|audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /FormData|FileReader|R2Bucket/i);
  assert.match(combined, /type="submit"/);
  assert.match(combined, /type="button"/);
  assert.match(combined, /aria-live="polite"/);
  assert.match(styles, /border-top: 1px solid var\(--slate\)/);
  assert.match(styles, /border-bottom: 1px solid var\(--slate\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /\.(?:card|panel|surface)\b/i);
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(|gradient\(/i);
});

test("the interface explains its exact-ID and revision workflow", async () => {
  const workspace = await source(files.workspace);
  assert.match(
    workspace,
    /stable application IDs and exact current\s+revisions/,
  );
  assert.match(
    workspace,
    /Copy them from Music, Access, Memberships, or Licensing/,
  );
  assert.match(workspace, /Published resource revision ID/);
  assert.match(workspace, /Access plan revision/);
  assert.match(workspace, /Subscription plan revision/);
  assert.match(workspace, /License offer revision/);
});
