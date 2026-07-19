import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeFiles = {
  overview: "../app/api/admin/access/route.ts",
  plans: "../app/api/admin/access/plans/route.ts",
  plan: "../app/api/admin/access/plans/[accessPlanId]/route.ts",
  grants: "../app/api/admin/access/grants/route.ts",
  revoke: "../app/api/admin/access/grants/[grantSetId]/revoke/route.ts",
  expire: "../app/api/admin/access/grants/[grantSetId]/expire/route.ts",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(routeFiles).map(async ([name, path]) => [
      name,
      await readFile(new URL(path, import.meta.url), "utf8"),
    ]),
  ),
);

function assertMutationBoundary(source) {
  assert.match(source, /await readJsonMutation\(request\)/);
  assert.match(source, /requireIdempotencyKey\(request\)/);
  assert.match(source, /requireMutationObject\(/);
  assert.match(source, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(source, /actorUserId: owner\.userId/);
  assert.match(source, /return runApiRoute\(/);
  assert.match(source, /return apiJson\(/);
  assert.doesNotMatch(source, /actorUserId:\s*(?:input|requestInput|body)/);
}

test("owner access APIs keep reads server-owned and mutations exact and idempotent", () => {
  assert.match(sources.overview, /export async function GET\(/);
  assert.match(
    sources.overview,
    /readAdminAccessOverview\(env\.DB, owner\.userId\)/,
  );
  assert.match(
    sources.overview,
    /requireApplicationAuthority\(env\.DB, \["owner"\]\)/,
  );

  for (const source of [
    sources.plans,
    sources.plan,
    sources.grants,
    sources.revoke,
    sources.expire,
  ]) {
    assertMutationBoundary(source);
  }
});

test("plan routes connect exact wrappers to create, update, and archive repositories", () => {
  assert.match(sources.plans, /export async function POST\(/);
  assert.match(
    sources.plans,
    /requireMutationObject\([\s\S]*?\["plan"\][\s\S]*?\)/,
  );
  assert.match(sources.plans, /createAccessPlan\(env\.DB, input\.plan/);
  assert.match(sources.plans, /result\.replayed \? 200 : 201/);

  assert.match(sources.plan, /export async function PUT\(/);
  assert.match(sources.plan, /export async function DELETE\(/);
  assert.match(sources.plan, /\["expectedRevision", "plan"\]/);
  assert.match(sources.plan, /\["expectedRevision"\]/);
  assert.match(sources.plan, /updateAccessPlan\(/);
  assert.match(sources.plan, /archiveAccessPlan\(/);
  assert.match(
    sources.plan,
    /requireExpectedVersion\(input\.expectedRevision, \{[\s\S]*?allowZero: false/,
  );
});

test("grant routes issue and terminate only by positive expected revision", () => {
  assert.match(sources.grants, /export async function POST\(/);
  assert.match(sources.grants, /\["expectedPlanRevision", "grant"\]/);
  assert.match(sources.grants, /issueAccessPlan\(/);
  assert.match(sources.grants, /result\.replayed \? 200 : 201/);

  assert.match(sources.revoke, /revokeAccessGrantSet\(/);
  assert.match(sources.expire, /expireAccessGrantSet\(/);
  for (const source of [sources.revoke, sources.expire]) {
    assert.match(source, /\["expectedRevision"\]/);
    assert.match(
      source,
      /requireExpectedVersion\(input\.expectedRevision, \{[\s\S]*?allowZero: false/,
    );
  }
});

test("access API surface contains no media bytes, card fields, or client principal overrides", () => {
  const combined = Object.values(sources).join("\n");
  assert.doesNotMatch(combined, /FormData|FileReader|R2Bucket|\.put\(/i);
  assert.doesNotMatch(
    combined,
    /cardNumber|card_number|cvc|cvv|expiryMonth|payment_method_data/i,
  );
  assert.doesNotMatch(combined, /input\.(?:actorUserId|ownerUserId)/);
});
