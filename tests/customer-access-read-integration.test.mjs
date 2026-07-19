import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readCustomerAccessLibrary } =
  await import("../db/customer-access-read.ts");

const DECISION_TIME = "2026-07-18T18:00:00.000Z";

function identity(userId, roles = ["customer"]) {
  return {
    userId,
    email: `${userId}@example.invalid`,
    displayName: userId,
    roles,
  };
}

async function assertRuntimeError(promise, expectedCode, expectedStatus) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    if (expectedCode !== null) assert.equal(error?.code, expectedCode);
    if (expectedStatus !== null) assert.equal(error?.status, expectedStatus);
    return true;
  });
}

function activateCustomerLibrary(database) {
  database.exec(`
    UPDATE artist_modules
    SET active = 1,
        revision = revision + 1,
        activated_at = '2026-07-18T12:00:00.000Z',
        deactivated_at = NULL,
        updated_at = '2026-07-18T12:00:00.000Z'
    WHERE module_key = 'customer-library';
  `);
}

function setDownloadsActive(database, active) {
  database
    .prepare(
      `UPDATE artist_modules
       SET active = ?,
           revision = revision + 1,
           activated_at = CASE WHEN ? = 1
             THEN '2026-07-18T12:00:00.000Z' ELSE activated_at END,
           deactivated_at = CASE WHEN ? = 0
             THEN '2026-07-18T12:00:00.000Z' ELSE NULL END,
           updated_at = '2026-07-18T12:00:00.000Z'
       WHERE module_key = 'downloads'`,
    )
    .run(active ? 1 : 0, active ? 1 : 0, active ? 1 : 0);
}

function seedCustomerPrincipals(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_access_owner', 'owner@example.invalid',
       'owner@example.invalid', 'active'),
      ('user_access_customer', 'customer@example.invalid',
       'customer@example.invalid', 'active'),
      ('user_access_other', 'other@example.invalid',
       'other@example.invalid', 'active'),
      ('user_access_revoked', 'revoked@example.invalid',
       'revoked@example.invalid', 'active'),
      ('user_access_disabled', 'disabled@example.invalid',
       'disabled@example.invalid', 'disabled');

    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('user_access_owner', 'Fictional owner'),
      ('user_access_customer', 'Fictional customer'),
      ('user_access_other', 'Other fictional customer'),
      ('user_access_revoked', 'Revoked fictional customer'),
      ('user_access_disabled', 'Disabled fictional customer');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_access_owner', 'user_access_owner', 'owner',
       'user_access_owner', NULL),
      ('role_access_customer', 'user_access_customer', 'customer',
       'user_access_owner', NULL),
      ('role_access_other', 'user_access_other', 'customer',
       'user_access_owner', NULL),
      ('role_access_revoked', 'user_access_revoked', 'customer',
       'user_access_owner', '2026-07-17T00:00:00.000Z'),
      ('role_access_disabled', 'user_access_disabled', 'customer',
       'user_access_owner', NULL);
  `);
}

function seedPublishedCatalog(database) {
  database.exec(`
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('track_access_grant', 'grant-track', 'track_access_grant_revision_2',
       'track_access_grant_revision_1', 'published',
       '2026-07-01T00:00:00.000Z'),
      ('track_access_credit', 'credit-track', 'track_access_credit_revision_1',
       'track_access_credit_revision_1', 'published',
       '2026-07-02T00:00:00.000Z'),
      ('track_access_revoked', 'revoked-track',
       'track_access_revoked_revision_1',
       'track_access_revoked_revision_1', 'published',
       '2026-07-03T00:00:00.000Z'),
      ('track_access_other', 'other-track', 'track_access_other_revision_1',
       'track_access_other_revision_1', 'published',
       '2026-07-04T00:00:00.000Z');

    INSERT INTO track_revisions
      (id, track_id, revision, title, stream_mode, download_mode)
    VALUES
      ('track_access_grant_revision_1', 'track_access_grant', 1,
       'Published grant track', 'protected', 'protected'),
      ('track_access_grant_revision_2', 'track_access_grant', 2,
       'Private draft grant track', 'protected', 'protected'),
      ('track_access_credit_revision_1', 'track_access_credit', 1,
       'Published credit track', 'protected', 'protected'),
      ('track_access_revoked_revision_1', 'track_access_revoked', 1,
       'Published revoked track', 'protected', 'protected'),
      ('track_access_other_revision_1', 'track_access_other', 1,
       'Other customer track', 'protected', 'protected');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('release_access_membership', 'membership-release',
       'release_access_membership_revision_2',
       'release_access_membership_revision_1', 'published',
       '2026-07-05T00:00:00.000Z'),
      ('release_access_expired', 'expired-release',
       'release_access_expired_revision_1',
       'release_access_expired_revision_1', 'published',
       '2026-07-06T00:00:00.000Z');

    INSERT INTO release_revisions
      (id, release_id, revision, title, view_mode)
    VALUES
      ('release_access_membership_revision_1',
       'release_access_membership', 1, 'Published membership release',
       'protected'),
      ('release_access_membership_revision_2',
       'release_access_membership', 2, 'Private draft membership release',
       'protected'),
      ('release_access_expired_revision_1', 'release_access_expired', 1,
       'Published expired release', 'protected');

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('collection_access_subscription', 'subscription-collection',
       'collection_access_subscription_revision_2',
       'collection_access_subscription_revision_1', 'published',
       '2026-07-07T00:00:00.000Z');

    INSERT INTO collection_revisions
      (id, collection_id, revision, title, view_mode)
    VALUES
      ('collection_access_subscription_revision_1',
       'collection_access_subscription', 1,
       'Published subscription collection', 'protected'),
      ('collection_access_subscription_revision_2',
       'collection_access_subscription', 2,
       'Private draft subscription collection', 'protected');
  `);
}

function seedAccessAndHistory(database) {
  database.exec(`
    INSERT INTO access_grants
      (id, grantee_user_id, resource_type, resource_id, actions_json, state,
       starts_at, expires_at, remaining_uses, reason, granted_by_user_id,
       revoked_at, revoked_by_user_id, expired_at, expired_by_user_id,
       created_at, updated_at)
    VALUES
      ('grant_access_track', 'user_access_customer', 'track',
       'track_access_grant', '["stream"]', 'active',
       '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL,
       'Fictional direct access.', 'user_access_owner', NULL, NULL, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
      ('grant_access_revoked', 'user_access_customer', 'track',
       'track_access_revoked', '["stream"]', 'revoked',
       '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL,
       'Fictional revoked access.', 'user_access_owner',
       '2026-07-17T00:00:00.000Z', 'user_access_owner', NULL, NULL,
       '2026-07-02T00:00:00.000Z', '2026-07-17T00:00:00.000Z'),
      ('grant_access_expired', 'user_access_customer', 'release',
       'release_access_expired', '["view"]', 'expired',
       '2026-06-01T00:00:00.000Z', '2026-07-18T17:59:59.000Z', NULL,
       'Fictional expired access.', 'user_access_owner', NULL, NULL,
       '2026-07-18T18:00:00.000Z', 'user_access_owner',
       '2026-06-01T00:00:00.000Z', '2026-07-18T18:00:00.000Z'),
      ('grant_access_other', 'user_access_other', 'track',
       'track_access_other', '["stream"]', 'active',
       '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL,
       'Other fictional access.', 'user_access_owner', NULL, NULL, NULL, NULL,
       '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, resource_type, resource_id,
       actions_json, state, starts_at, expires_at, remaining_uses,
       download_disposition, stripe_environment, livemode,
       last_operation_key, created_at, updated_at)
    VALUES
      ('entitlement_access_membership', 'user_access_customer', 'membership',
       'membership_fixture', 'release', 'release_access_membership',
       '["view"]', 'active', '2026-07-01T00:00:00.000Z',
       '2099-01-01T00:00:00.000Z', NULL, NULL,
       'test', 0, 'access_membership_test',
       '2026-07-04T00:00:00.000Z', '2026-07-04T00:00:00.000Z'),
      ('entitlement_access_subscription', 'user_access_customer',
       'subscription', 'subscription_fixture', 'collection',
       'collection_access_subscription', '["view"]', 'active',
       '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL, NULL,
       'test', 0, 'access_subscription_test',
       '2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z'),
      ('entitlement_access_license', 'user_access_customer', 'license',
       'license_fixture', 'license-document', 'license_document_future',
       '["view"]', 'active', '2026-07-01T00:00:00.000Z',
       '2099-01-01T00:00:00.000Z', NULL, NULL,
       'test', 0, 'access_license_test',
       '2026-07-06T00:00:00.000Z', '2026-07-06T00:00:00.000Z'),
      ('entitlement_access_credit', 'user_access_customer', 'credit',
       'credit_fixture', 'track', 'track_access_credit', '["download"]',
       'active', '2026-07-01T00:00:00.000Z',
       '2099-01-01T00:00:00.000Z', 2, 'attachment',
       'test', 0, 'access_credit_test',
       '2026-07-07T00:00:00.000Z', '2026-07-07T00:00:00.000Z'),
      ('entitlement_access_expired', 'user_access_customer', 'membership',
       'membership_expired_fixture', 'release', 'release_access_expired',
       '["view"]', 'active', '2026-06-01T00:00:00.000Z',
       '2026-07-18T17:59:59.000Z', NULL, NULL,
       NULL, NULL, NULL,
       '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('entitlement_access_other', 'user_access_other', 'membership',
       'membership_other_fixture', 'track', 'track_access_other',
       '["stream"]', 'active', '2026-07-01T00:00:00.000Z',
       '2099-01-01T00:00:00.000Z', NULL, NULL,
       'test', 0, 'access_other_test',
       '2026-07-08T00:00:00.000Z', '2026-07-08T00:00:00.000Z');

    INSERT INTO download_events
      (id, user_id, resource_type, resource_id, entitlement_id,
       access_source, byte_length, request_id, delivered_at, created_at)
    VALUES
      ('download_access_track', 'user_access_customer', 'track',
       'track_access_credit', 'entitlement_access_credit', 'grant', 4321,
       'private_request_customer_track', '2026-07-18T17:00:00.000Z',
       '2026-07-18T17:00:00.000Z'),
      ('download_access_release', 'user_access_customer', 'release',
       'release_access_membership', 'entitlement_access_membership',
       'account', 8765, 'private_request_customer_release',
       '2026-07-18T16:00:00.000Z', '2026-07-18T16:00:00.000Z'),
      ('download_access_other', 'user_access_other', 'track',
       'track_access_other', 'entitlement_access_other', 'grant', 9999,
       'private_request_other_track', '2026-07-18T15:00:00.000Z',
       '2026-07-18T15:00:00.000Z'),
      ('download_access_anonymous', NULL, 'track', 'track_access_grant', NULL,
       'public', 1111, 'private_request_anonymous_track',
       '2026-07-18T14:00:00.000Z', '2026-07-18T14:00:00.000Z');
  `);
}

function seedReadyCustomerDownload(database) {
  const sha256 = "b".repeat(64);
  database
    .prepare(
      `INSERT INTO media_objects
         (id, object_key, kind, visibility, owner_user_id, content_type,
          byte_length, etag, source_version, status, approval_state,
          content_sha256, duration_ms, revision, approved_by_user_id,
          approved_at)
       VALUES
         ('media_access_download_source', 'originals/access-download/v1',
          'audio', 'protected', 'user_access_owner', 'audio/wav', 16,
          'access-download-source-etag', 1, 'ready', 'approved', ?, 1000, 1,
          'user_access_owner', '2026-07-01T00:00:00.000Z')`,
    )
    .run(sha256);
  database
    .prepare(
      `INSERT INTO media_derivatives
         (id, source_media_id, kind, processing_profile, processing_version,
          object_key, status, approval_state, content_type, format,
          duration_ms, byte_length, content_sha256, revision,
          approved_by_user_id, approved_at)
       VALUES
         ('derivative_access_download_ready', 'media_access_download_source',
          'download', 'download-main', '1',
          'derivatives/access-download/v1', 'ready', 'approved',
          'audio/flac', 'flac', 1000, 8, ?, 1, 'user_access_owner',
          '2026-07-01T00:00:00.000Z')`,
    )
    .run(sha256);
  database.exec(`
    INSERT INTO track_revisions
      (id, track_id, revision, title, stream_mode, download_mode)
    VALUES
      ('track_access_credit_revision_2', 'track_access_credit', 2,
       'Private draft credit track', 'protected', 'protected');

    UPDATE tracks
    SET draft_revision_id = 'track_access_credit_revision_2'
    WHERE id = 'track_access_credit';

    UPDATE track_revisions
    SET original_media_id = 'media_access_download_source',
        download_derivative_id = 'derivative_access_download_ready'
    WHERE id = 'track_access_credit_revision_1';

    UPDATE entitlements
    SET actions_json = '["view","download"]'
    WHERE id = 'entitlement_access_membership';

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, resource_type, resource_id,
       actions_json, state, starts_at, expires_at)
    VALUES
      ('entitlement_access_unready_download', 'user_access_customer',
       'membership', 'membership_unready_fixture', 'track',
       'track_access_revoked', '["download"]', 'active',
       '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
  `);
}

function mapById(values) {
  return new Map(values.map((value) => [value.id, value]));
}

function mapLiveResources(values) {
  return new Map(values.map((value) => [value.resource.resourceId, value]));
}

function assertLiveResource(
  resources,
  resourceId,
  expectedResource,
  expectedAction,
  expectedSource,
) {
  const item = resources.get(resourceId);
  assert.ok(item, `Expected live access for ${resourceId}.`);
  assert.deepEqual(item.resource, expectedResource);
  assert.deepEqual(item.actions, [expectedAction]);
  assert.deepEqual(
    item.sources.map(({ sourceType, explanation, commerceTestMode }) => ({
      sourceType,
      explanation,
      commerceTestMode,
    })),
    [expectedSource],
  );
}

test("core customer access reads require active D1 customer authority", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerPrincipals(memory.database);

  assert.deepEqual(
    await readCustomerAccessLibrary(
      memory.binding,
      identity("user_access_customer"),
      DECISION_TIME,
    ),
    {
      resources: [],
      grantHistory: [],
      entitlementHistory: [],
      downloadHistory: [],
    },
  );

  await assertRuntimeError(
    readCustomerAccessLibrary(
      memory.binding,
      identity("user_access_revoked"),
      DECISION_TIME,
    ),
    null,
    403,
  );
  await assertRuntimeError(
    readCustomerAccessLibrary(
      memory.binding,
      identity("user_access_disabled"),
      DECISION_TIME,
    ),
    null,
    403,
  );
});

test("customer access projection resolves current access, retained history, and exact-user downloads", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerPrincipals(memory.database);
  seedPublishedCatalog(memory.database);
  seedAccessAndHistory(memory.database);
  activateCustomerLibrary(memory.database);

  const projection = await readCustomerAccessLibrary(
    memory.binding,
    identity("user_access_customer"),
    DECISION_TIME,
  );
  const live = mapLiveResources(projection.resources);

  assert.equal(live.size, 5);
  assertLiveResource(
    live,
    "track_access_grant",
    {
      resourceType: "track",
      resourceId: "track_access_grant",
      available: true,
      title: "Published grant track",
      href: "/music/tracks/grant-track",
    },
    "stream",
    {
      sourceType: "grant",
      explanation: "Artist access grant",
      commerceTestMode: false,
    },
  );
  assertLiveResource(
    live,
    "release_access_membership",
    {
      resourceType: "release",
      resourceId: "release_access_membership",
      available: true,
      title: "Published membership release",
      href: "/music/releases/membership-release",
    },
    "view",
    {
      sourceType: "membership",
      explanation: "Membership entitlement",
      commerceTestMode: true,
    },
  );
  assertLiveResource(
    live,
    "collection_access_subscription",
    {
      resourceType: "collection",
      resourceId: "collection_access_subscription",
      available: true,
      title: "Published subscription collection",
      href: "/music/collections/subscription-collection",
    },
    "view",
    {
      sourceType: "subscription",
      explanation: "Subscription entitlement",
      commerceTestMode: true,
    },
  );
  assertLiveResource(
    live,
    "license_document_future",
    {
      resourceType: "license-document",
      resourceId: "license_document_future",
      available: false,
      title: "Unavailable resource",
      href: null,
    },
    "view",
    {
      sourceType: "license",
      explanation: "License entitlement",
      commerceTestMode: true,
    },
  );
  assertLiveResource(
    live,
    "track_access_credit",
    {
      resourceType: "track",
      resourceId: "track_access_credit",
      available: true,
      title: "Published credit track",
      href: "/music/tracks/credit-track",
    },
    "download",
    {
      sourceType: "credit",
      explanation: "Credit entitlement",
      commerceTestMode: true,
    },
  );
  assert.equal(live.has("track_access_revoked"), false);
  assert.equal(live.has("release_access_expired"), false);
  assert.equal(live.has("track_access_other"), false);

  const grants = mapById(projection.grantHistory);
  assert.equal(grants.size, 3);
  assert.deepEqual(
    {
      storedState: grants.get("grant_access_track")?.storedState,
      effectiveState: grants.get("grant_access_track")?.effectiveState,
      explanation: grants.get("grant_access_track")?.explanation,
    },
    {
      storedState: "active",
      effectiveState: "active",
      explanation: "Artist access grant",
    },
  );
  assert.deepEqual(
    {
      storedState: grants.get("grant_access_expired")?.storedState,
      effectiveState: grants.get("grant_access_expired")?.effectiveState,
      expiredAt: grants.get("grant_access_expired")?.expiredAt,
    },
    {
      storedState: "expired",
      effectiveState: "expired",
      expiredAt: "2026-07-18T18:00:00.000Z",
    },
  );
  assert.deepEqual(
    {
      storedState: grants.get("grant_access_revoked")?.storedState,
      effectiveState: grants.get("grant_access_revoked")?.effectiveState,
      explanation: grants.get("grant_access_revoked")?.explanation,
      resource: grants.get("grant_access_revoked")?.resource,
    },
    {
      storedState: "revoked",
      effectiveState: "revoked",
      explanation: "Artist access grant",
      resource: {
        resourceType: "track",
        resourceId: "track_access_revoked",
        available: true,
        title: "Published revoked track",
        href: "/music/tracks/revoked-track",
      },
    },
  );

  const entitlements = mapById(projection.entitlementHistory);
  assert.equal(entitlements.size, 5);
  for (const [id, sourceType, explanation] of [
    ["entitlement_access_membership", "membership", "Membership entitlement"],
    [
      "entitlement_access_subscription",
      "subscription",
      "Subscription entitlement",
    ],
    ["entitlement_access_license", "license", "License entitlement"],
    ["entitlement_access_credit", "credit", "Credit entitlement"],
  ]) {
    assert.deepEqual(
      {
        sourceType: entitlements.get(id)?.sourceType,
        explanation: entitlements.get(id)?.explanation,
        effectiveState: entitlements.get(id)?.effectiveState,
        commerceTestMode: entitlements.get(id)?.commerceTestMode,
      },
      {
        sourceType,
        explanation,
        effectiveState: "active",
        commerceTestMode: true,
      },
    );
  }
  assert.deepEqual(
    {
      storedState: entitlements.get("entitlement_access_expired")?.storedState,
      effectiveState: entitlements.get("entitlement_access_expired")
        ?.effectiveState,
      commerceTestMode: entitlements.get("entitlement_access_expired")
        ?.commerceTestMode,
      resource: entitlements.get("entitlement_access_expired")?.resource,
    },
    {
      storedState: "active",
      effectiveState: "expired",
      commerceTestMode: false,
      resource: {
        resourceType: "release",
        resourceId: "release_access_expired",
        available: true,
        title: "Published expired release",
        href: "/music/releases/expired-release",
      },
    },
  );

  const downloads = mapById(projection.downloadHistory);
  assert.equal(downloads.size, 2);
  assert.deepEqual(
    {
      entitlementId: downloads.get("download_access_track")?.entitlementId,
      accessSource: downloads.get("download_access_track")?.accessSource,
      commerceTestMode: downloads.get("download_access_track")
        ?.commerceTestMode,
      byteLength: downloads.get("download_access_track")?.byteLength,
      resource: downloads.get("download_access_track")?.resource,
    },
    {
      entitlementId: "entitlement_access_credit",
      accessSource: "grant",
      commerceTestMode: true,
      byteLength: 4321,
      resource: {
        resourceType: "track",
        resourceId: "track_access_credit",
        available: true,
        title: "Published credit track",
        href: "/music/tracks/credit-track",
      },
    },
  );
  assert.equal(
    downloads.get("download_access_release")?.resource.title,
    "Published membership release",
  );
  for (const download of projection.downloadHistory) {
    assert.equal("requestId" in download, false);
    assert.equal("mediaDerivativeId" in download, false);
  }

  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes("Private draft"), false);
  assert.equal(serialized.includes("Other customer track"), false);
  assert.equal(serialized.includes("entitlement_access_other"), false);
  assert.equal(serialized.includes("download_access_other"), false);
  assert.equal(serialized.includes("private_request_"), false);
});

test("customer access projects a download control only for an authorized ready track while downloads are active", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerPrincipals(memory.database);
  seedPublishedCatalog(memory.database);
  seedAccessAndHistory(memory.database);
  seedReadyCustomerDownload(memory.database);
  setDownloadsActive(memory.database, true);

  const active = mapLiveResources(
    (
      await readCustomerAccessLibrary(
        memory.binding,
        identity("user_access_customer"),
        DECISION_TIME,
      )
    ).resources,
  );
  assert.equal(
    active.get("track_access_credit")?.downloadUrl,
    "/api/media/tracks/track_access_credit/download?revision=track_access_credit_revision_1",
  );
  assert.equal(
    active
      .get("track_access_credit")
      ?.downloadUrl.includes("track_access_credit_revision_2"),
    false,
  );
  assert.equal(active.get("release_access_membership")?.downloadUrl, null);
  assert.equal(active.get("track_access_revoked")?.downloadUrl, null);

  setDownloadsActive(memory.database, false);
  const inactive = mapLiveResources(
    (
      await readCustomerAccessLibrary(
        memory.binding,
        identity("user_access_customer"),
        DECISION_TIME,
      )
    ).resources,
  );
  assert.equal(inactive.get("track_access_credit")?.downloadUrl, null);
});
