import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const routes = {
  grant: "../app/api/admin/credits/grants/route.ts",
  expireReservation:
    "../app/api/admin/credits/reservations/[reservationId]/expire/route.ts",
  reverseReservation:
    "../app/api/admin/credits/reservations/[reservationId]/reverse/route.ts",
  expireLot: "../app/api/admin/credits/lots/[lotId]/expire/route.ts",
  reverseLot: "../app/api/admin/credits/lots/[lotId]/reverse/route.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("manual grants accept only owner-selected facts and set authority fields on the server", async () => {
  const grant = await source(routes.grant);

  assert.match(grant, /export const dynamic = "force-dynamic"/);
  assert.match(grant, /await readJsonMutation\(request\)/);
  assert.match(grant, /requireIdempotencyKey\(request\)/);
  assert.match(grant, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(
    grant,
    /\[\s*"customerUserId",\s*"creditKind",\s*"quantity",\s*"expiresAt",\s*"expectedAccountRevision",?\s*\]/,
  );
  assert.match(grant, /originType: "owner"/);
  assert.match(grant, /originId: `owner:\$\{idempotencyKey\}`/);
  assert.match(grant, /fulfillmentEventId: null/);
  assert.match(grant, /grantCustomerCredits\(/);
  assert.match(grant, /allowZero: true/);
  assert.doesNotMatch(grant, /stripeEnvironment|livemode|secret|publishable/i);
});

test("owner terminal routes preserve exact reservation, lot, and account revisions", async () => {
  const entries = await Promise.all(
    Object.entries(routes)
      .filter(([name]) => name !== "grant")
      .map(async ([name, path]) => [name, await source(path)]),
  );
  const sources = Object.fromEntries(entries);

  for (const [name, route] of entries) {
    assert.match(route, /export const dynamic = "force-dynamic"/, name);
    assert.match(route, /await readJsonMutation\(request\)/, name);
    assert.match(route, /requireIdempotencyKey\(request\)/, name);
    assert.match(
      route,
      /requireApplicationAuthority\(env\.DB, \["owner"\]\)/,
      name,
    );
    assert.match(route, /actorUserId: owner\.userId/, name);
    assert.match(route, /idempotencyKey/, name);
    assert.match(route, /requestId/, name);
    assert.doesNotMatch(
      route,
      /customerUserId|creditKind|quantity|originType|livemode/,
      name,
    );
  }

  for (const route of [sources.expireReservation, sources.reverseReservation]) {
    assert.match(
      route,
      /\["expectedReservationRevision", "expectedAccountRevision"\]/,
    );
  }
  for (const route of [sources.expireLot, sources.reverseLot]) {
    assert.match(route, /\["expectedLotRevision", "expectedAccountRevision"\]/);
  }
  assert.match(sources.expireReservation, /expireCreditReservation\(/);
  assert.match(
    sources.reverseReservation,
    /reverseConsumedCreditReservation\(/,
  );
  assert.match(sources.expireLot, /expireCreditGrantLot\(/);
  assert.match(sources.reverseLot, /reverseCreditGrantLot\(/);
});

test("owner HTTP routes omit customer release, reserve, consume, and license-credit redemption", async () => {
  const omitted = [
    "../app/api/admin/credits/reservations/[reservationId]/release/route.ts",
    "../app/api/admin/credits/reservations/[reservationId]/consume/route.ts",
    "../app/api/admin/credits/reservations/route.ts",
    "../app/api/admin/credits/license-redemption/route.ts",
  ];
  for (const path of omitted) {
    await assert.rejects(access(new URL(path, import.meta.url)));
  }

  const combined = (await Promise.all(Object.values(routes).map(source))).join(
    "\n",
  );
  assert.doesNotMatch(
    combined,
    /releaseCreditReservation|reserveCustomerCredits|consumeCreditReservation|credit_redemption/,
  );
  assert.doesNotMatch(
    combined,
    /(?:cardNumber|paymentMethod|billingAddress|pk_live_|sk_live_)/i,
  );
});
