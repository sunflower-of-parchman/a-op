import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [{ readAccessFacts }, { decideAccess }] = await Promise.all([
  import("../db/access-read.ts"),
  import("../lib/access/decide-access.ts"),
]);

const CUSTOMER_ID = "user_plan_read_customer";
const TRACK_ID = "track_plan_read";
const REQUEST_TIME = "2026-07-18T18:00:00.000Z";

function request(action = "download") {
  return {
    identity: { userId: CUSTOMER_ID, roles: ["customer"] },
    resourceType: "track",
    resourceId: TRACK_ID,
    action,
    now: REQUEST_TIME,
  };
}

function seedPlanLinkedGrant(database, { entitlement = true } = {}) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email)
    VALUES
      ('user_plan_read_owner', 'plan-owner@example.invalid',
       'plan-owner@example.invalid'),
      ('${CUSTOMER_ID}', 'plan-customer@example.invalid',
       'plan-customer@example.invalid');

    INSERT INTO access_plans
      (id, slug, name, revision, created_by_user_id)
    VALUES
      ('plan_read', 'plan-read', 'Plan read', 2, 'user_plan_read_owner');

    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, remaining_uses, download_disposition)
    VALUES
      ('plan_item_read', 'plan_read', 1, 'track', '${TRACK_ID}',
       '["stream","download"]', 5, 'attachment');

    INSERT INTO access_grant_sets
      (id, access_plan_id, access_plan_revision, grantee_user_id, state,
       starts_at, expires_at, reason, granted_by_user_id, activated_at)
    VALUES
      ('grant_set_read', 'plan_read', 1, '${CUSTOMER_ID}', 'active',
       '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z',
       'Fictional plan access.', 'user_plan_read_owner',
       '2026-01-01T00:00:00.000Z');

    INSERT INTO access_grants
      (id, grantee_user_id, grant_set_id, access_plan_id, access_plan_item_id,
       resource_type, resource_id, actions_json, state, starts_at, expires_at,
       remaining_uses, download_disposition, reason, granted_by_user_id)
    VALUES
      ('grant_plan_read', '${CUSTOMER_ID}', 'grant_set_read', 'plan_read',
       'plan_item_read', 'track', '${TRACK_ID}',
       '["view","stream","download"]', 'active',
       '2026-02-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z', 3,
       'attachment', 'Fictional item access.', 'user_plan_read_owner');
  `);

  if (entitlement) {
    database.exec(`
      INSERT INTO entitlements
        (id, user_id, source_type, source_id, grant_id, resource_type,
         resource_id, actions_json, state, starts_at, expires_at,
         remaining_uses, download_disposition)
      VALUES
        ('entitlement_plan_read', '${CUSTOMER_ID}', 'grant',
         'grant_plan_read', 'grant_plan_read', 'track', '${TRACK_ID}',
         '["stream","download"]', 'active',
         '2026-03-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z', 2,
         'attachment');
    `);
  }
}

test("plan-linked access uses the narrowest exact set, item, grant, and entitlement authority", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPlanLinkedGrant(memory.database);

  const projection = await readAccessFacts(memory.binding, request());
  assert.deepEqual(projection.sources, [
    {
      sourceType: "grant",
      explanation: "Artist access grant",
      state: "active",
      entitlementId: "entitlement_plan_read",
      startsAt: "2026-03-01T00:00:00.000Z",
      expiresAt: "2026-10-31T00:00:00.000Z",
      remainingUses: 2,
    },
  ]);
  assert.deepEqual(
    await decideAccess({ ...request(), facts: projection.facts }),
    {
      allowed: true,
      reason: "explicit-grant",
      source: "grant",
      entitlementId: "entitlement_plan_read",
      expiresAt: "2026-10-31T00:00:00.000Z",
      remainingUses: 2,
      downloadDisposition: "attachment",
      sourceExplanation: "Artist access grant",
    },
  );

  memory.database
    .prepare(
      `UPDATE access_plan_items
       SET actions_json = '["stream"]'
       WHERE id = 'plan_item_read'`,
    )
    .run();
  assert.deepEqual(await readAccessFacts(memory.binding, request()), {
    facts: { grants: [] },
    sources: [],
  });
});

test("pending plan grant sets and missing grant entitlements fail closed", async (t) => {
  const pending = await createInMemoryD1();
  t.after(() => pending.close());
  seedPlanLinkedGrant(pending.database);
  pending.database
    .prepare(
      `UPDATE access_grant_sets
       SET state = 'pending', activated_at = NULL
       WHERE id = 'grant_set_read'`,
    )
    .run();
  assert.deepEqual(await readAccessFacts(pending.binding, request()), {
    facts: { grants: [] },
    sources: [],
  });

  const missingEntitlement = await createInMemoryD1();
  t.after(() => missingEntitlement.close());
  seedPlanLinkedGrant(missingEntitlement.database, { entitlement: false });
  assert.deepEqual(
    await readAccessFacts(missingEntitlement.binding, request()),
    { facts: { grants: [] }, sources: [] },
  );
});

test("plan grant set terminal state overrides active child records", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPlanLinkedGrant(memory.database);

  memory.database
    .prepare(
      `UPDATE access_grant_sets
       SET state = 'revoked', revoked_at = '2026-07-18T17:00:00.000Z'
       WHERE id = 'grant_set_read'`,
    )
    .run();
  let projection = await readAccessFacts(memory.binding, request());
  assert.equal(projection.sources[0].state, "revoked");
  assert.deepEqual(
    await decideAccess({ ...request(), facts: projection.facts }),
    { allowed: false, reason: "grant-revoked", source: "none" },
  );

  memory.database
    .prepare(
      `UPDATE access_grant_sets
       SET state = 'expired', revoked_at = NULL,
           expired_at = '2026-07-18T17:00:00.000Z'
       WHERE id = 'grant_set_read'`,
    )
    .run();
  projection = await readAccessFacts(memory.binding, request());
  assert.equal(projection.sources[0].state, "expired");
  assert.deepEqual(
    await decideAccess({ ...request(), facts: projection.facts }),
    { allowed: false, reason: "grant-expired", source: "none" },
  );
});

test("plan-linked grants require their exact set and plan-item joins", async (t) => {
  const missingItem = await createInMemoryD1();
  t.after(() => missingItem.close());
  seedPlanLinkedGrant(missingItem.database);

  missingItem.database.exec("PRAGMA foreign_keys = OFF");
  missingItem.database
    .prepare("DELETE FROM access_plan_items WHERE id = 'plan_item_read'")
    .run();
  assert.deepEqual(await readAccessFacts(missingItem.binding, request()), {
    facts: { grants: [] },
    sources: [],
  });

  const missingSet = await createInMemoryD1();
  t.after(() => missingSet.close());
  seedPlanLinkedGrant(missingSet.database);
  missingSet.database.exec("PRAGMA foreign_keys = OFF");
  missingSet.database
    .prepare("DELETE FROM access_grant_sets WHERE id = 'grant_set_read'")
    .run();
  assert.deepEqual(await readAccessFacts(missingSet.binding, request()), {
    facts: { grants: [] },
    sources: [],
  });
});

test("bare pre-plan grants remain valid without an entitlement", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email)
    VALUES
      ('user_legacy_owner', 'legacy-owner@example.invalid',
       'legacy-owner@example.invalid'),
      ('${CUSTOMER_ID}', 'legacy-customer@example.invalid',
       'legacy-customer@example.invalid');
    INSERT INTO access_grants
      (id, grantee_user_id, resource_type, resource_id, actions_json,
       state, remaining_uses, download_disposition, reason,
       granted_by_user_id)
    VALUES
      ('grant_legacy_read', '${CUSTOMER_ID}', 'track', '${TRACK_ID}',
       '["download"]', 'active', 1, 'attachment',
       'Fictional legacy access.', 'user_legacy_owner');
  `);

  const projection = await readAccessFacts(memory.binding, request());
  assert.equal(projection.facts.grants.length, 1);
  assert.equal(projection.facts.grants[0].entitlementId, undefined);
  assert.equal(projection.sources[0].entitlementId, null);
});
