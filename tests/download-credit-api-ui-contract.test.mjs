import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  route: "../app/api/credits/downloads/[trackId]/redeem/route.ts",
  page: "../app/account/credits/page.tsx",
  customer: "../components/credits/CustomerCredits.tsx",
  action: "../components/credits/DownloadCreditRedemptionAction.tsx",
  coordinator: "../db/download-credit-redemption.ts",
  delivery: "../lib/catalog/delivery.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the customer API accepts only a route-selected track and server identity", async () => {
  const route = await source(files.route);

  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /await readJsonMutation\(request\)/);
  assert.match(
    route,
    /requireMutationObject\([\s\S]*?\[\],[\s\S]*?"Download-credit redemption"/,
  );
  assert.match(route, /requireIdempotencyKey\(request\)/);
  assert.match(route, /requireApplicationAuthority\(env\.DB, \["customer"\]\)/);
  assert.match(route, /requireActiveModule\(env\.DB, "downloads"\)/);
  assert.match(route, /\(await context\.params\)\.trackId/);
  assert.match(route, /redeemTrackDownloadWithCredit\(env\.DB, trackId/);
  assert.match(route, /actorUserId: customer\.userId/);
  assert.doesNotMatch(
    route,
    /(?:customerUserId|quantity|creditKind|purposeId|stripeEnvironment|livemode)\s*:/,
  );
  assert.doesNotMatch(
    route,
    /(?:cardNumber|card_number|paymentMethod|payment_method|billingAddress|billing_address|pk_live_|sk_live_)/i,
  );
});

test("the account surface shows action, durable evidence, Test Mode, and the protected download", async () => {
  const [page, customer, action] = await Promise.all([
    source(files.page),
    source(files.customer),
    source(files.action),
  ]);

  assert.match(
    page,
    /readCustomerDownloadCreditTargets\(env\.DB, identity\.userId\)/,
  );
  assert.match(page, /downloadTargets=\{downloadTargets\}/);
  assert.match(customer, /Use a download credit/);
  assert.match(customer, /published protected track/i);
  assert.match(customer, /creditReservationId/);
  assert.match(customer, /creditLedgerEntryId/);
  assert.match(customer, /DownloadCreditRedemptionAction/);
  assert.match(
    action,
    /fetch\([\s\S]*?\/api\/credits\/downloads\/\$\{encodeURIComponent\(target\.trackId\)\}\/redeem/,
  );
  assert.match(action, /"idempotency-key": operationKey\.current/);
  assert.match(action, /crypto\.randomUUID\(\)/);
  assert.match(action, /router\.refresh\(\)/);
  assert.match(action, /No real payment will be accepted\./);
  assert.match(action, /target\.downloadUrl/);
  assert.match(action, />\s*Download\s*</);
  assert.match(action, /aria-live="polite"/);
  assert.match(action, /type="button"/);
});

test("the coordinator keeps prepared access ineffective and activates through the central delivery contract", async () => {
  const [coordinator, delivery, action, customer] = await Promise.all([
    source(files.coordinator),
    source(files.delivery),
    source(files.action),
    source(files.customer),
  ]);
  const combined = [coordinator, action, customer].join("\n");

  assert.match(coordinator, /PENDING_ENTITLEMENT_STARTS_AT/);
  assert.match(coordinator, /preparePendingDownloadCreditEntitlement/);
  assert.match(coordinator, /requirePendingEntitlement/);
  assert.match(coordinator, /consumeCreditReservation/);
  assert.match(coordinator, /activateDownloadCreditEntitlement/);
  assert.match(coordinator, /source_type = 'credit'/);
  assert.match(coordinator, /stripe_environment = 'test'/);
  assert.match(coordinator, /livemode = 0/);
  assert.match(coordinator, /actions_json = '\["download"\]'/);
  assert.match(delivery, /readAccessFacts/);
  assert.match(delivery, /decideAccess/);
  assert.match(delivery, /recordSuccessfulDownload/);
  assert.doesNotMatch(combined, /<(?:img|audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /\bFormData\b|\bFileReader\b|\bR2Bucket\b/i);
  assert.doesNotMatch(
    combined,
    /(?:cardNumber|card_number|paymentMethod|payment_method|billingAddress|billing_address|pk_live_|sk_live_)/i,
  );
});
