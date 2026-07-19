import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeFiles = {
  submit: "../app/api/licensing/requests/route.ts",
  redeem:
    "../app/api/licensing/requests/[licenseRequestId]/redeem-credit/route.ts",
  approve:
    "../app/api/admin/licensing/requests/[licenseRequestId]/approve/route.ts",
  reject:
    "../app/api/admin/licensing/requests/[licenseRequestId]/reject/route.ts",
  issue:
    "../app/api/admin/licensing/requests/[licenseRequestId]/issue/route.ts",
  revoke:
    "../app/api/admin/licensing/licenses/[issuedLicenseId]/revoke/route.ts",
  expire:
    "../app/api/admin/licensing/licenses/[issuedLicenseId]/expire/route.ts",
  generate:
    "../app/api/admin/licensing/documents/[licenseDocumentId]/generate/route.ts",
  download:
    "../app/api/licensing/documents/[licenseDocumentId]/download/route.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("customer request submission uses exact validated input, customer authority, module state, and idempotency", async () => {
  const submit = await source(routeFiles.submit);

  assert.match(submit, /export const dynamic = "force-dynamic"/);
  assert.match(submit, /await readJsonMutation\(request\)/);
  assert.match(submit, /validateLicenseRequestSubmitInput/);
  assert.match(submit, /requireIdempotencyKey\(request\)/);
  assert.match(
    submit,
    /requireApplicationAuthority\(env\.DB, \["customer"\]\)/,
  );
  assert.match(submit, /requireActiveModule\(env\.DB, "licensing"\)/);
  assert.match(submit, /submitLicenseRequest\(env\.DB, requestInput/);
  assert.match(submit, /actorUserId: customer\.userId/);
  assert.match(submit, /idempotencyKey,/);
  assert.match(submit, /requestId,/);
  assert.doesNotMatch(
    submit,
    /(?:cardNumber|paymentMethod|billingAddress|livemode|stripeKey)/i,
  );
});

test("owner decision, issuance, and terminal routes derive authority and time on the server", async () => {
  const entries = await Promise.all(
    Object.entries(routeFiles)
      .filter(
        ([name]) =>
          name !== "submit" && name !== "redeem" && name !== "download",
      )
      .map(async ([name, path]) => [name, await source(path)]),
  );

  for (const [name, route] of entries) {
    assert.match(route, /export const dynamic = "force-dynamic"/, name);
    assert.match(route, /await readJsonMutation\(request\)/, name);
    assert.match(route, /requireIdempotencyKey\(request\)/, name);
    assert.match(
      route,
      /requireApplicationAuthority\(env\.DB, \["owner"\]\)/,
      name,
    );
    assert.match(route, /requireActiveModule\(env\.DB, "licensing"\)/, name);
    assert.match(route, /actorUserId: owner\.userId/, name);
    assert.match(route, /idempotencyKey/, name);
    assert.match(route, /requestId/, name);
    assert.doesNotMatch(route, /customerUserId|creditLedgerEntryId/, name);
  }

  const approve = Object.fromEntries(entries).approve;
  const reject = Object.fromEntries(entries).reject;
  const issue = Object.fromEntries(entries).issue;
  const revoke = Object.fromEntries(entries).revoke;
  const expire = Object.fromEntries(entries).expire;
  for (const decision of [approve, reject]) {
    assert.match(decision, /\["expectedRevision", "reason"\]/);
    assert.match(decision, /decidedAt: new Date\(\)\.toISOString\(\)/);
  }
  assert.match(issue, /\["expectedRevision"\]/);
  assert.match(issue, /source: "owner_approval"/);
  assert.match(issue, /issuedAt: new Date\(\)\.toISOString\(\)/);
  const generate = Object.fromEntries(entries).generate;
  assert.match(generate, /generateLicenseDocument\(/);
  assert.match(generate, /env\.MEDIA/);
  assert.match(generate, /\["expectedRevision"\]/);
  for (const terminal of [revoke, expire]) {
    assert.match(terminal, /\["expectedRevision", "reason"\]/);
    assert.match(terminal, /effectiveAt: new Date\(\)\.toISOString\(\)/);
  }
});

test("customer document delivery resolves identity and delegates to protected same-origin delivery", async () => {
  const [route, delivery] = await Promise.all([
    source(routeFiles.download),
    source("../lib/licensing/document-delivery.ts"),
  ]);

  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /requireActiveModule\(env\.DB, "licensing"\)/);
  assert.match(route, /resolveApplicationIdentity\(/);
  assert.match(route, /deliverLicenseDocument\(/);
  assert.match(route, /bucket: env\.MEDIA/);
  assert.doesNotMatch(route, /readJsonMutation|requireIdempotencyKey/);

  const decisionIndex = delivery.indexOf("await decideAccess");
  const headIndex = delivery.indexOf("await store.head");
  const getIndex = delivery.indexOf("await store.get");
  assert.ok(decisionIndex >= 0 && decisionIndex < headIndex);
  assert.ok(headIndex < getIndex);
  assert.match(delivery, /recordLicenseDocumentDelivery\(/);
  assert.match(delivery, /"cache-control": "no-store"/);
  assert.match(delivery, /"x-aop-commerce-environment": "test"/);
  assert.doesNotMatch(delivery, /cardNumber|paymentMethod|billingAddress/i);
});

test("customer credit redemption exposes only the recoverable server coordinator", async () => {
  const redeem = await source(routeFiles.redeem);

  assert.match(redeem, /export const dynamic = "force-dynamic"/);
  assert.match(redeem, /await readJsonMutation\(request\)/);
  assert.match(
    redeem,
    /requireMutationObject\([\s\S]*?\[\],[\s\S]*?"License-credit redemption"/,
  );
  assert.match(redeem, /requireIdempotencyKey\(request\)/);
  assert.match(
    redeem,
    /requireApplicationAuthority\(env\.DB, \["customer"\]\)/,
  );
  assert.match(redeem, /requireActiveModule\(env\.DB, "licensing"\)/);
  assert.match(redeem, /redeemLicenseRequestWithCredits\(/);
  assert.match(redeem, /actorUserId: customer\.userId/);
  assert.doesNotMatch(
    redeem,
    /(?:customerUserId|creditLedgerEntryId|quantity|livemode)\s*:/,
  );

  const coordinator = await source("../db/license-credit-redemption.ts");
  assert.match(coordinator, /reserveCustomerCredits\(/);
  assert.match(coordinator, /consumeCreditReservation\(/);
  assert.match(coordinator, /issueLicense\(/);
  assert.match(coordinator, /source: "credit_redemption"/);
  assert.match(coordinator, /stripeEnvironment: "test"/);
  assert.match(coordinator, /livemode: false/);
  assert.doesNotMatch(
    `${redeem}\n${coordinator}`,
    /(?:cardNumber|paymentMethod|billingAddress|stripeCustomerId|stripePaymentIntent)/i,
  );
});
