import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  archiveAccessPlan,
  createAccessPlan,
  expireAccessGrantSet,
  issueAccessPlan,
  revokeAccessGrantSet,
  updateAccessPlan,
} = await import("../db/access-admin-write.ts");

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_access_admin_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function seedPrincipalsAndCatalog(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_access_owner', 'owner@example.invalid',
       'owner@example.invalid', 'active'),
      ('user_access_owner_disabled', 'disabled-owner@example.invalid',
       'disabled-owner@example.invalid', 'disabled'),
      ('user_access_owner_revoked', 'revoked-owner@example.invalid',
       'revoked-owner@example.invalid', 'active'),
      ('user_access_customer', 'customer@example.invalid',
       'customer@example.invalid', 'active'),
      ('user_access_customer_other', 'other@example.invalid',
       'other@example.invalid', 'active'),
      ('user_access_customer_disabled', 'disabled@example.invalid',
       'disabled@example.invalid', 'disabled'),
      ('user_access_customer_revoked', 'revoked@example.invalid',
       'revoked@example.invalid', 'active');

    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('user_access_owner', 'Fictional owner'),
      ('user_access_customer', 'Fictional customer'),
      ('user_access_customer_other', 'Other fictional customer'),
      ('user_access_customer_disabled', 'Disabled fictional customer'),
      ('user_access_customer_revoked', 'Revoked fictional customer');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_access_owner', 'user_access_owner', 'owner',
       'user_access_owner', NULL),
      ('role_access_owner_disabled', 'user_access_owner_disabled', 'owner',
       'user_access_owner', NULL),
      ('role_access_owner_revoked', 'user_access_owner_revoked', 'owner',
       'user_access_owner', '2026-07-18T00:00:00.000Z'),
      ('role_access_customer', 'user_access_customer', 'customer',
       'user_access_owner', NULL),
      ('role_access_customer_other', 'user_access_customer_other', 'customer',
       'user_access_owner', NULL),
      ('role_access_customer_disabled', 'user_access_customer_disabled',
       'customer', 'user_access_owner', NULL),
      ('role_access_customer_revoked', 'user_access_customer_revoked',
       'customer', 'user_access_owner', '2026-07-18T00:00:00.000Z');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('track_access_all', 'track-access-all', 'track_access_all_r1',
       'track_access_all_r1', 'published', 1),
      ('track_access_no_download', 'track-access-no-download',
       'track_access_no_download_r1', 'track_access_no_download_r1',
       'published', 1),
      ('track_access_draft', 'track-access-draft', 'track_access_draft_r1',
       NULL, 'draft', 1);
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_access_all_r1', 'track_access_all', 1,
       'Fictional protected track', 'protected', 'protected', 'protected'),
      ('track_access_no_download_r1', 'track_access_no_download', 1,
       'Fictional stream-only track', 'protected', 'protected', 'unavailable'),
      ('track_access_draft_r1', 'track_access_draft', 1,
       'Fictional draft track', 'protected', 'protected', 'protected');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('release_access', 'release-access', 'release_access_r1',
       'release_access_r1', 'published', 1);
    INSERT INTO release_revisions
      (id, release_id, revision, title, view_mode)
    VALUES
      ('release_access_r1', 'release_access', 1,
       'Fictional protected release', 'protected');

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('collection_access', 'collection-access', 'collection_access_r1',
       'collection_access_r1', 'published', 1);
    INSERT INTO collection_revisions
      (id, collection_id, revision, title, view_mode)
    VALUES
      ('collection_access_r1', 'collection_access', 1,
       'Fictional protected collection', 'protected');
  `);
}

function planInput(slug = "supporter-access") {
  return {
    slug,
    name: "Supporter access",
    description: "A fictional access definition.",
    items: [
      {
        resourceType: "track",
        resourceId: "track_access_all",
        actions: ["view", "stream", "download"],
        remainingUses: null,
        downloadDisposition: "attachment",
      },
      {
        resourceType: "release",
        resourceId: "release_access",
        actions: ["view"],
        remainingUses: null,
        downloadDisposition: null,
      },
      {
        resourceType: "collection",
        resourceId: "collection_access",
        actions: ["view"],
        remainingUses: null,
        downloadDisposition: null,
      },
    ],
  };
}

function grantInput(accessPlanId, customerUserId = "user_access_customer") {
  return {
    accessPlanId,
    customerUserId,
    startsAt: "2026-07-18T12:00:00.000Z",
    expiresAt: "2027-07-18T12:00:00.000Z",
    reason: "Fictional supporter access.",
  };
}

test("owner access plans issue one frozen grant and entitlement per item, replay once, and cascade terminal state", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipalsAndCatalog(memory.database);

  const createContext = context("user_access_owner", "plan-create");
  const created = await createAccessPlan(
    memory.binding,
    planInput(),
    createContext,
  );
  assert.equal(created.replayed, false);
  assert.deepEqual(
    {
      state: created.value.state,
      revision: created.value.revision,
      itemCount: created.value.itemCount,
      created: created.value.created,
    },
    { state: "active", revision: 1, itemCount: 3, created: true },
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_plan_items WHERE access_plan_id = ?",
      created.value.accessPlanId,
    ),
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = 'access.plan.create:user_access_owner:plan-create'",
    ),
    1,
  );

  const replayedCreate = await createAccessPlan(
    memory.binding,
    planInput(),
    createContext,
  );
  assert.equal(replayedCreate.replayed, true);
  assert.deepEqual(replayedCreate.value, created.value);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM access_plans"), 1);
  await assertRuntimeCode(
    createAccessPlan(
      memory.binding,
      { ...planInput(), name: "Different fingerprint" },
      createContext,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  await assertRuntimeCode(
    updateAccessPlan(
      memory.binding,
      created.value.accessPlanId,
      {
        name: "Stale update",
        description: "",
        items: planInput().items,
      },
      2,
      context("user_access_owner", "plan-update-stale"),
    ),
    "STALE_STATE",
  );
  const updateContext = context("user_access_owner", "plan-update");
  const updated = await updateAccessPlan(
    memory.binding,
    created.value.accessPlanId,
    {
      name: "Supporter access, current",
      description: "The complete fictional access definition.",
      items: planInput().items,
    },
    1,
    updateContext,
  );
  assert.equal(updated.value.revision, 2);
  assert.equal(updated.value.slug, "supporter-access");
  assert.equal(updated.value.created, false);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_plan_items WHERE access_plan_id = ?",
      created.value.accessPlanId,
    ),
    3,
  );
  assert.equal(
    (
      await updateAccessPlan(
        memory.binding,
        created.value.accessPlanId,
        {
          name: "Supporter access, current",
          description: "The complete fictional access definition.",
          items: planInput().items,
        },
        1,
        updateContext,
      )
    ).replayed,
    true,
  );

  await assertRuntimeCode(
    issueAccessPlan(
      memory.binding,
      grantInput(created.value.accessPlanId),
      1,
      context("user_access_owner", "grant-stale-plan"),
    ),
    "STALE_STATE",
  );
  const issueContext = context("user_access_owner", "grant-issue");
  const issued = await issueAccessPlan(
    memory.binding,
    grantInput(created.value.accessPlanId),
    2,
    issueContext,
  );
  assert.deepEqual(
    {
      state: issued.value.state,
      revision: issued.value.revision,
      accessPlanRevision: issued.value.accessPlanRevision,
      grantCount: issued.value.grantCount,
      entitlementCount: issued.value.entitlementCount,
    },
    {
      state: "active",
      revision: 1,
      accessPlanRevision: 2,
      grantCount: 3,
      entitlementCount: 3,
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT state, revision, access_plan_revision,
                  grantee_user_id, activated_at IS NOT NULL AS activated
           FROM access_grant_sets WHERE id = ?`,
        )
        .get(issued.value.grantSetId),
    },
    {
      state: "active",
      revision: 1,
      access_plan_revision: 2,
      grantee_user_id: "user_access_customer",
      activated: 1,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*)
       FROM access_grants
       JOIN access_plan_items
         ON access_plan_items.id = access_grants.access_plan_item_id
        AND access_plan_items.access_plan_id = access_grants.access_plan_id
        AND access_plan_items.resource_type = access_grants.resource_type
        AND access_plan_items.resource_id = access_grants.resource_id
       WHERE access_grants.grant_set_id = ?
         AND access_grants.state = 'active'
         AND access_grants.remaining_uses IS NULL`,
      issued.value.grantSetId,
    ),
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*)
       FROM entitlements
       JOIN access_grants
         ON access_grants.id = entitlements.grant_id
        AND entitlements.source_type = 'grant'
        AND entitlements.source_id = access_grants.id
       WHERE access_grants.grant_set_id = ?
         AND entitlements.state = 'active'
         AND entitlements.remaining_uses IS NULL`,
      issued.value.grantSetId,
    ),
    3,
  );
  const replayedIssue = await issueAccessPlan(
    memory.binding,
    grantInput(created.value.accessPlanId),
    2,
    issueContext,
  );
  assert.equal(replayedIssue.replayed, true);
  assert.deepEqual(replayedIssue.value, issued.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM access_grant_sets"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM access_grants"),
    3,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 3);

  await assertRuntimeCode(
    updateAccessPlan(
      memory.binding,
      created.value.accessPlanId,
      {
        name: "Locked definition",
        description: "",
        items: planInput().items,
      },
      2,
      context("user_access_owner", "plan-update-locked"),
    ),
    "ACCESS_PLAN_LOCKED",
  );
  const archived = await archiveAccessPlan(
    memory.binding,
    created.value.accessPlanId,
    2,
    context("user_access_owner", "plan-archive"),
  );
  assert.equal(archived.value.state, "archived");
  assert.equal(archived.value.revision, 3);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_plan_items WHERE access_plan_id = ?",
      created.value.accessPlanId,
    ),
    3,
  );
  await assertRuntimeCode(
    issueAccessPlan(
      memory.binding,
      grantInput(created.value.accessPlanId, "user_access_customer_other"),
      3,
      context("user_access_owner", "archived-plan-issue"),
    ),
    "ACCESS_PLAN_ARCHIVED",
  );

  await assertRuntimeCode(
    revokeAccessGrantSet(
      memory.binding,
      issued.value.grantSetId,
      2,
      context("user_access_owner", "grant-revoke-stale"),
    ),
    "STALE_STATE",
  );
  const revokeContext = context("user_access_owner", "grant-revoke");
  const revoked = await revokeAccessGrantSet(
    memory.binding,
    issued.value.grantSetId,
    1,
    revokeContext,
  );
  assert.equal(revoked.value.state, "revoked");
  assert.equal(revoked.value.revision, 2);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM access_grants
       WHERE grant_set_id = ? AND state = 'revoked'
         AND revoked_at IS NOT NULL
         AND last_operation_key = 'access.grant-set.revoke:user_access_owner:grant-revoke'`,
      issued.value.grantSetId,
    ),
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       JOIN access_grants ON access_grants.id = entitlements.grant_id
       WHERE access_grants.grant_set_id = ?
         AND entitlements.state = 'revoked'
         AND entitlements.last_operation_key = 'access.grant-set.revoke:user_access_owner:grant-revoke'`,
      issued.value.grantSetId,
    ),
    3,
  );
  assert.equal(
    (
      await revokeAccessGrantSet(
        memory.binding,
        issued.value.grantSetId,
        1,
        revokeContext,
      )
    ).replayed,
    true,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT revision FROM access_grant_sets WHERE id = ?",
      issued.value.grantSetId,
    ),
    2,
  );
});

test("issuance rejects invented access, inactive principals, stale state, and leaves no pending or partial access", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipalsAndCatalog(memory.database);

  for (const actorUserId of [
    "user_access_customer",
    "user_access_owner_disabled",
    "user_access_owner_revoked",
  ]) {
    await assertRuntimeCode(
      createAccessPlan(
        memory.binding,
        planInput(`forbidden-${actorUserId.replaceAll("_", "-")}`),
        context(actorUserId, `forbidden-${actorUserId}`),
      ),
      "ACCESS_OWNER_REQUIRED",
    );
  }
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM access_plans"), 0);

  await assertRuntimeCode(
    createAccessPlan(
      memory.binding,
      {
        ...planInput("finite-use"),
        items: [
          {
            ...planInput().items[0],
            remainingUses: 1,
          },
        ],
      },
      context("user_access_owner", "finite-use"),
    ),
    "ACCESS_PLAN_INPUT_INVALID",
  );
  await assertRuntimeCode(
    createAccessPlan(
      memory.binding,
      {
        ...planInput("invented-action"),
        items: [
          {
            resourceType: "release",
            resourceId: "release_access",
            actions: ["stream"],
            remainingUses: null,
            downloadDisposition: null,
          },
        ],
      },
      context("user_access_owner", "invented-action"),
    ),
    "ACCESS_PLAN_INPUT_INVALID",
  );
  await assertRuntimeCode(
    createAccessPlan(
      memory.binding,
      {
        ...planInput("unavailable-action"),
        items: [
          {
            resourceType: "track",
            resourceId: "track_access_no_download",
            actions: ["download"],
            remainingUses: null,
            downloadDisposition: "attachment",
          },
        ],
      },
      context("user_access_owner", "unavailable-action"),
    ),
    "ACCESS_RESOURCE_UNAVAILABLE",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM access_plans"), 0);

  const created = await createAccessPlan(
    memory.binding,
    planInput("adversarial-access"),
    context("user_access_owner", "adversarial-plan"),
  );
  for (const customerUserId of [
    "user_access_customer_disabled",
    "user_access_customer_revoked",
  ]) {
    await assertRuntimeCode(
      issueAccessPlan(
        memory.binding,
        grantInput(created.value.accessPlanId, customerUserId),
        1,
        context("user_access_owner", `inactive-${customerUserId}`),
      ),
      "ACCESS_CUSTOMER_UNAVAILABLE",
    );
  }
  await assertRuntimeCode(
    issueAccessPlan(
      memory.binding,
      grantInput(created.value.accessPlanId, "user_access_customer_other"),
      1,
      context("user_access_customer", "cross-customer-issue"),
    ),
    "ACCESS_OWNER_REQUIRED",
  );

  let revokedAtBatchBoundary = false;
  const revokingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      if (!revokedAtBatchBoundary) {
        revokedAtBatchBoundary = true;
        memory.database.exec(`
          UPDATE role_assignments
          SET revoked_at = '2026-07-18T18:00:00.000Z',
              revoked_by_user_id = 'user_access_owner'
          WHERE id = 'role_access_customer_other';
        `);
      }
      return memory.binding.batch(statements);
    },
  };
  await assertRuntimeCode(
    issueAccessPlan(
      revokingBinding,
      grantInput(created.value.accessPlanId, "user_access_customer_other"),
      1,
      context("user_access_owner", "customer-revoked-at-batch"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM access_grant_sets"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM access_grants"),
    0,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM entitlements"), 0);

  memory.database.exec(`
    UPDATE tracks
    SET publication_state = 'draft', published_revision_id = NULL
    WHERE id = 'track_access_all';
  `);
  await assertRuntimeCode(
    issueAccessPlan(
      memory.binding,
      grantInput(created.value.accessPlanId),
      1,
      context("user_access_owner", "unpublished-issue"),
    ),
    "ACCESS_RESOURCE_UNAVAILABLE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_grant_sets WHERE state = 'pending'",
    ),
    0,
  );
  memory.database.exec(`
    UPDATE tracks
    SET publication_state = 'published',
        published_revision_id = 'track_access_all_r1'
    WHERE id = 'track_access_all';
  `);

  const issued = await issueAccessPlan(
    memory.binding,
    grantInput(created.value.accessPlanId),
    1,
    context("user_access_owner", "adversarial-issue"),
  );
  await assertRuntimeCode(
    expireAccessGrantSet(
      memory.binding,
      issued.value.grantSetId,
      2,
      context("user_access_owner", "stale-expire"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_grants WHERE grant_set_id = ? AND state = 'active'",
      issued.value.grantSetId,
    ),
    3,
  );
  await assertRuntimeCode(
    expireAccessGrantSet(
      memory.binding,
      issued.value.grantSetId,
      1,
      context("user_access_customer_other", "cross-customer-expire"),
    ),
    "ACCESS_OWNER_REQUIRED",
  );

  memory.database.exec(`
    UPDATE users SET status = 'disabled'
    WHERE id = 'user_access_customer';
  `);
  const expired = await expireAccessGrantSet(
    memory.binding,
    issued.value.grantSetId,
    1,
    context("user_access_owner", "grant-expire"),
  );
  assert.equal(expired.value.state, "expired");
  assert.equal(expired.value.revision, 2);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM access_grants
       WHERE grant_set_id = ? AND state = 'expired'
         AND expired_at IS NOT NULL AND expired_by_user_id = 'user_access_owner'
         AND revision = 2`,
      issued.value.grantSetId,
    ),
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       JOIN access_grants ON access_grants.id = entitlements.grant_id
       WHERE access_grants.grant_set_id = ?
         AND entitlements.state = 'expired' AND entitlements.revision = 2`,
      issued.value.grantSetId,
    ),
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_grant_sets WHERE state = 'pending'",
    ),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key LIKE 'access.%'",
    ),
    3,
  );
});
