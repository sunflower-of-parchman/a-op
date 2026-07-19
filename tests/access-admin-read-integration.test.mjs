import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readAdminAccessOverview } = await import("../db/access-admin-read.ts");

const OWNER_ID = "user_access_admin_owner";
const CUSTOMER_ID = "user_access_admin_customer";

function seedPrincipals(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'owner-access-admin@example.invalid',
       'owner-access-admin@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'customer-access-admin@example.invalid',
       'customer-access-admin@example.invalid', 'active'),
      ('user_access_admin_revoked', 'revoked-access-admin@example.invalid',
       'revoked-access-admin@example.invalid', 'active'),
      ('user_access_admin_disabled', 'disabled-access-admin@example.invalid',
       'disabled-access-admin@example.invalid', 'disabled'),
      ('user_access_admin_revoked_owner',
       'revoked-owner-access-admin@example.invalid',
       'revoked-owner-access-admin@example.invalid', 'active');

    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('${OWNER_ID}', 'Fictional access owner'),
      ('${CUSTOMER_ID}', 'Fictional access customer'),
      ('user_access_admin_revoked', 'Revoked fictional customer'),
      ('user_access_admin_disabled', 'Disabled fictional customer'),
      ('user_access_admin_revoked_owner', 'Revoked fictional owner');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_access_admin_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}', NULL),
      ('role_access_admin_customer', '${CUSTOMER_ID}', 'customer',
       '${OWNER_ID}', NULL),
      ('role_access_admin_revoked', 'user_access_admin_revoked', 'customer',
       '${OWNER_ID}', '2026-07-17T00:00:00.000Z'),
      ('role_access_admin_disabled', 'user_access_admin_disabled', 'customer',
       '${OWNER_ID}', NULL),
      ('role_access_admin_revoked_owner', 'user_access_admin_revoked_owner',
       'owner', '${OWNER_ID}', '2026-07-17T00:00:00.000Z');
  `);
}

function seedPublishedCatalog(database) {
  database.exec(`
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('track_access_admin', 'access-admin-track',
       'track_access_admin_revision_2', 'track_access_admin_revision_1',
       'published', '2026-07-01T00:00:00.000Z'),
      ('track_access_admin_unpublished', 'access-admin-unpublished',
       'track_access_admin_unpublished_revision_1', NULL, 'draft', NULL);

    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_access_admin_revision_1', 'track_access_admin', 1,
       'Published access track', 'protected', 'protected', 'protected'),
      ('track_access_admin_revision_2', 'track_access_admin', 2,
       'Private access track draft', 'protected', 'protected', 'protected'),
      ('track_access_admin_unpublished_revision_1',
       'track_access_admin_unpublished', 1, 'Unpublished access track',
       'protected', 'unavailable', 'unavailable');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('release_access_admin', 'access-admin-release',
       'release_access_admin_revision_1', 'release_access_admin_revision_1',
       'published', '2026-07-02T00:00:00.000Z');

    INSERT INTO release_revisions
      (id, release_id, revision, title, view_mode)
    VALUES
      ('release_access_admin_revision_1', 'release_access_admin', 1,
       'Published access release', 'protected');

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('collection_access_admin', 'access-admin-collection',
       'collection_access_admin_revision_1',
       'collection_access_admin_revision_1', 'published',
       '2026-07-03T00:00:00.000Z');

    INSERT INTO collection_revisions
      (id, collection_id, revision, title, view_mode)
    VALUES
      ('collection_access_admin_revision_1', 'collection_access_admin', 1,
       'Published access collection', 'protected');
  `);
}

function seedAccessState(database) {
  database.exec(`
    INSERT INTO access_plans
      (id, slug, name, description, state, revision, created_by_user_id,
       created_at, updated_at)
    VALUES
      ('plan_access_admin_locked', 'locked-plan', 'Fictional locked plan',
       'A plan with durable access history.', 'active', 1, '${OWNER_ID}',
       '2026-07-04T00:00:00.000Z', '2026-07-04T00:00:00.000Z'),
      ('plan_access_admin_open', 'open-plan', 'Fictional open plan',
       'A definition that can still change.', 'active', 2, '${OWNER_ID}',
       '2026-07-05T00:00:00.000Z', '2026-07-06T00:00:00.000Z'),
      ('plan_access_admin_archived', 'archived-plan',
       'Fictional archived plan', '', 'archived', 3, '${OWNER_ID}',
       '2026-07-01T00:00:00.000Z', '2026-07-07T00:00:00.000Z');

    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, remaining_uses, download_disposition, created_at)
    VALUES
      ('plan_item_access_admin_locked', 'plan_access_admin_locked', 1,
       'track', 'track_access_admin', '["download","view","stream"]',
       NULL, 'attachment', '2026-07-04T00:00:00.000Z'),
      ('plan_item_access_admin_open', 'plan_access_admin_open', 1,
       'release', 'release_access_admin', '["view"]', NULL, NULL,
       '2026-07-05T00:00:00.000Z'),
      ('plan_item_access_admin_archived', 'plan_access_admin_archived', 1,
       'track', 'track_access_admin_unpublished', '["view"]', NULL, NULL,
       '2026-07-01T00:00:00.000Z');

    INSERT INTO access_grant_sets
      (id, access_plan_id, access_plan_revision, grantee_user_id, state,
       starts_at, expires_at, reason, granted_by_user_id, activated_at,
       revision, created_at, updated_at)
    VALUES
      ('grant_set_access_admin', 'plan_access_admin_locked', 1,
       '${CUSTOMER_ID}', 'active', '2026-07-04T00:00:00.000Z',
       '2027-07-04T00:00:00.000Z', 'Fictional direct access.', '${OWNER_ID}',
       '2026-07-04T00:00:00.000Z', 1,
       '2026-07-04T00:00:00.000Z', '2026-07-04T00:00:00.000Z');

    INSERT INTO access_grants
      (id, grantee_user_id, grant_set_id, access_plan_id,
       access_plan_item_id, resource_type, resource_id, actions_json, state,
       starts_at, expires_at, remaining_uses, download_disposition, reason,
       granted_by_user_id, created_at, updated_at)
    VALUES
      ('grant_access_admin', '${CUSTOMER_ID}', 'grant_set_access_admin',
       'plan_access_admin_locked', 'plan_item_access_admin_locked', 'track',
       'track_access_admin', '["view","stream","download"]', 'active',
       '2026-07-04T00:00:00.000Z', '2027-07-04T00:00:00.000Z', NULL,
       'attachment', 'Fictional direct access.', '${OWNER_ID}',
       '2026-07-04T00:00:00.000Z', '2026-07-04T00:00:00.000Z');

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, grant_id, resource_type,
       resource_id, actions_json, state, starts_at, expires_at,
       remaining_uses, download_disposition, created_at, updated_at)
    VALUES
      ('entitlement_access_admin', '${CUSTOMER_ID}', 'grant',
       'grant_access_admin', 'grant_access_admin', 'track',
       'track_access_admin', '["view","stream","download"]', 'active',
       '2026-07-04T00:00:00.000Z', '2027-07-04T00:00:00.000Z', NULL,
       'attachment', '2026-07-04T00:00:00.000Z',
       '2026-07-04T00:00:00.000Z');

    INSERT INTO download_events
      (id, user_id, resource_type, resource_id, entitlement_id,
       access_source, byte_length, request_id, delivered_at, created_at)
    VALUES
      ('delivery_access_admin_customer', '${CUSTOMER_ID}', 'track',
       'track_access_admin', 'entitlement_access_admin', 'grant', 4096,
       'private_request_identifier_must_not_leave_server',
       '2026-07-18T18:00:00.000Z', '2026-07-18T18:00:00.000Z'),
      ('delivery_access_admin_public', NULL, 'release',
       'release_access_admin', NULL, 'public', 2048,
       'public_request_identifier_must_not_leave_server',
       '2026-07-18T17:00:00.000Z', '2026-07-18T17:00:00.000Z');
  `);
}

function seedCompleteState(database) {
  seedPrincipals(database);
  seedPublishedCatalog(database);
  seedAccessState(database);
}

test("owner access overview projects locked plans, current options, customers, grants, and redacted deliveries", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCompleteState(memory.database);

  const overview = await readAdminAccessOverview(memory.binding, OWNER_ID);

  assert.deepEqual(
    overview.resources.map(
      ({ resourceType, resourceId, title, href, allowedActions }) => ({
        resourceType,
        resourceId,
        title,
        href,
        allowedActions,
      }),
    ),
    [
      {
        resourceType: "collection",
        resourceId: "collection_access_admin",
        title: "Published access collection",
        href: "/admin/music/collections/access-admin-collection",
        allowedActions: ["view"],
      },
      {
        resourceType: "release",
        resourceId: "release_access_admin",
        title: "Published access release",
        href: "/admin/music/releases/access-admin-release",
        allowedActions: ["view"],
      },
      {
        resourceType: "track",
        resourceId: "track_access_admin",
        title: "Published access track",
        href: "/admin/music/tracks/access-admin-track",
        allowedActions: ["view", "stream", "download"],
      },
    ],
  );

  assert.equal(overview.plans.length, 3);
  const locked = overview.plans.find(
    ({ id }) => id === "plan_access_admin_locked",
  );
  assert.equal(locked?.definitionLocked, true);
  assert.equal(locked?.grantSetCount, 1);
  assert.deepEqual(locked?.items, [
    {
      id: "plan_item_access_admin_locked",
      position: 1,
      resourceType: "track",
      resourceId: "track_access_admin",
      actions: ["view", "stream", "download"],
      remainingUses: null,
      downloadDisposition: "attachment",
      title: "Published access track",
      href: "/admin/music/tracks/access-admin-track",
    },
  ]);
  assert.equal(
    overview.plans.find(({ id }) => id === "plan_access_admin_open")
      ?.definitionLocked,
    false,
  );
  const archived = overview.plans.find(
    ({ id }) => id === "plan_access_admin_archived",
  );
  assert.equal(archived?.definitionLocked, true);
  assert.equal(archived?.items[0]?.title, "Unavailable resource");
  assert.equal(archived?.items[0]?.href, null);

  assert.deepEqual(overview.customers, [
    {
      userId: CUSTOMER_ID,
      email: "customer-access-admin@example.invalid",
      displayName: "Fictional access customer",
      activeGrantSetCount: 1,
      totalGrantSetCount: 1,
    },
  ]);
  assert.deepEqual(overview.grantSets, [
    {
      id: "grant_set_access_admin",
      accessPlanId: "plan_access_admin_locked",
      accessPlanRevision: 1,
      accessPlanName: "Fictional locked plan",
      customerUserId: CUSTOMER_ID,
      customerDisplayName: "Fictional access customer",
      state: "active",
      startsAt: "2026-07-04T00:00:00.000Z",
      expiresAt: "2027-07-04T00:00:00.000Z",
      reason: "Fictional direct access.",
      activatedAt: "2026-07-04T00:00:00.000Z",
      revokedAt: null,
      expiredAt: null,
      revision: 1,
      entitlementCount: 1,
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(overview.recentDeliveries, [
    {
      id: "delivery_access_admin_customer",
      customerUserId: CUSTOMER_ID,
      customerDisplayName: "Fictional access customer",
      resourceType: "track",
      resourceId: "track_access_admin",
      resourceTitle: "Published access track",
      accessSource: "grant",
      byteLength: 4096,
      deliveredAt: "2026-07-18T18:00:00.000Z",
    },
    {
      id: "delivery_access_admin_public",
      customerUserId: null,
      customerDisplayName: null,
      resourceType: "release",
      resourceId: "release_access_admin",
      resourceTitle: "Published access release",
      accessSource: "public",
      byteLength: 2048,
      deliveredAt: "2026-07-18T17:00:00.000Z",
    },
  ]);

  const serialized = JSON.stringify(overview);
  assert.doesNotMatch(serialized, /request_identifier/);
  assert.doesNotMatch(serialized, /mediaDerivative|objectKey|requestId|audit/i);
});

test("owner access overview denies non-owner, revoked owner, and unsafe actor identities", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCompleteState(memory.database);

  for (const actorUserId of [CUSTOMER_ID, "user_access_admin_revoked_owner"]) {
    await assert.rejects(
      readAdminAccessOverview(memory.binding, actorUserId),
      (error) => {
        assert.equal(error?.name, "RuntimeError");
        assert.equal(error?.code, "ACCESS_OWNER_REQUIRED");
        assert.equal(error?.status, 403);
        return true;
      },
    );
  }
  await assert.rejects(
    readAdminAccessOverview(memory.binding, "unsafe/user"),
    TypeError,
  );
});

test("owner access overview fails closed on malformed stored access state", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCompleteState(memory.database);
  memory.database.exec("PRAGMA ignore_check_constraints = ON");
  memory.database
    .prepare(
      `UPDATE access_plan_items
       SET actions_json = 'not-json'
       WHERE id = 'plan_item_access_admin_open'`,
    )
    .run();

  await assert.rejects(
    readAdminAccessOverview(memory.binding, OWNER_ID),
    (error) => error?.name === "AccessAdminReadIntegrityError",
  );
});
