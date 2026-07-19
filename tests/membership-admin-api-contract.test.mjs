import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const routeFiles = {
  createPlan: "../app/api/admin/memberships/plans/[kind]/route.ts",
  revisePlan: "../app/api/admin/memberships/plans/[kind]/[planId]/route.ts",
  activate: "../app/api/admin/memberships/relationships/[kind]/route.ts",
  transition:
    "../app/api/admin/memberships/relationships/[kind]/[relationshipId]/[action]/route.ts",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(routeFiles).map(async ([name, path]) => [
      name,
      await readFile(new URL(path, import.meta.url), "utf8"),
    ]),
  ),
);
const inputSource = await readFile(
  new URL("../app/api/admin/memberships/membership-input.ts", import.meta.url),
  "utf8",
);
const {
  requireMembershipEffectiveAt,
  requireMembershipRelationshipAction,
  requireMembershipRouteId,
  requireMembershipRouteKind,
} = await import("../app/api/admin/memberships/membership-input.ts");

function assertMutationBoundary(source) {
  assert.match(source, /return runApiRoute\(/);
  assert.match(source, /await readJsonMutation\(request\)/);
  assert.match(source, /requireMutationObject\(/);
  assert.match(source, /requireIdempotencyKey\(request\)/);
  assert.match(source, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(source, /requireMembershipRouteModules\(env\.DB, kind\)/);
  assert.match(source, /actorUserId: owner\.userId/);
  assert.match(source, /requestId,/);
  assert.match(source, /return apiJson\(/);
  assert.doesNotMatch(source, /actorUserId:\s*(?:input|body|requestInput)/);
}

test("membership owner mutations require identity, modules, idempotency, request IDs, and exact JSON objects", () => {
  for (const source of Object.values(sources)) assertMutationBoundary(source);

  assert.match(sources.createPlan, /\["plan"\]/);
  assert.match(sources.revisePlan, /\["expectedRevision", "plan"\]/);
  assert.match(sources.activate, /\["activation"\]/);
  assert.match(sources.transition, /\["effectiveAt", "expectedRevision"\]/);
  assert.match(sources.transition, /\["expectedRevision"\]/);
  assert.match(
    sources.revisePlan,
    /requireExpectedVersion\(input\.expectedRevision, \{[\s\S]*?allowZero: false/,
  );
  assert.match(
    sources.transition,
    /requireExpectedVersion\(input\.expectedRevision, \{[\s\S]*?allowZero: false/,
  );
});

test("membership routes expose only manual owner repositories and retain provider-event authority", () => {
  assert.match(sources.createPlan, /createMembershipPlan/);
  assert.match(sources.createPlan, /createSubscriptionPlan/);
  assert.match(sources.revisePlan, /reviseMembershipPlan/);
  assert.match(sources.revisePlan, /reviseSubscriptionPlan/);
  assert.match(sources.activate, /activateMembership/);
  assert.match(sources.activate, /activateSubscription/);
  assert.match(sources.transition, /pauseMembership/);
  assert.match(sources.transition, /renewSubscription/);
  assert.match(sources.transition, /applySubscriptionCancellation/);

  const combined = Object.values(sources).join("\n");
  assert.doesNotMatch(
    combined,
    /activateStripeTest|renewStripeTest|reconcileStripeTest/,
  );
  assert.doesNotMatch(combined, /FormData|FileReader|R2Bucket|\.put\(/i);
  assert.doesNotMatch(
    combined,
    /cardNumber|card_number|cvc|cvv|expiryMonth|payment_method_data/i,
  );
});

test("membership route input rejects unsafe kinds, IDs, actions, direct renewal, and timestamps", () => {
  assert.equal(requireMembershipRouteKind("membership"), "membership");
  assert.equal(requireMembershipRouteKind("subscription"), "subscription");
  assert.equal(
    requireMembershipRouteId("membership_safe:123", "Relationship ID"),
    "membership_safe:123",
  );
  assert.equal(
    requireMembershipRelationshipAction("renew", "subscription"),
    "renew",
  );
  assert.equal(
    requireMembershipEffectiveAt("2026-07-19T12:00:00Z"),
    "2026-07-19T12:00:00.000Z",
  );

  for (const invoke of [
    () => requireMembershipRouteKind("billing"),
    () => requireMembershipRouteId("../unsafe", "Relationship ID"),
    () => requireMembershipRelationshipAction("delete", "membership"),
    () => requireMembershipRelationshipAction("renew", "membership"),
    () => requireMembershipEffectiveAt("tomorrow"),
  ]) {
    assert.throws(invoke, (error) => {
      assert.equal(error?.name, "RuntimeError");
      assert.equal(error?.code, "INVALID_INPUT");
      return true;
    });
  }
});

test("membership and subscription module gates are explicit in the route helper", () => {
  assert.match(inputSource, /requireActiveModule\(binding, "memberships"\)/);
  assert.match(inputSource, /kind === "subscription"/);
  assert.match(inputSource, /requireActiveModule\(binding, "subscriptions"\)/);
});
