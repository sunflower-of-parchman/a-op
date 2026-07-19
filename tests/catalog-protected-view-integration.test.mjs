import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  readCatalogCollection,
  readCatalogRelease,
  readCatalogTrack,
  readPublicCollection,
  readPublicRelease,
  readPublicTrack,
} = await import("../db/catalog-read.ts");

const NOW = "2026-07-18T18:00:00.000Z";
const CUSTOMER = Object.freeze({
  userId: "user_view_customer",
  roles: ["customer"],
});
const OTHER_CUSTOMER = Object.freeze({
  userId: "user_view_other",
  roles: ["customer"],
});
const OWNER = Object.freeze({ userId: "user_view_owner", roles: ["owner"] });

function request(identity) {
  return { identity, now: NOW };
}

function seedPrincipals(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_view_owner', 'view-owner@example.invalid',
       'view-owner@example.invalid', 'active'),
      ('user_view_customer', 'view-customer@example.invalid',
       'view-customer@example.invalid', 'active'),
      ('user_view_other', 'view-other@example.invalid',
       'view-other@example.invalid', 'active');
  `);
}

function seedCatalog(database) {
  database.exec(`
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('track_view_public', 'view-public-track', 'track_view_public_rev',
       'track_view_public_rev', 'published', '2026-07-01T00:00:00.000Z'),
      ('track_view_account', 'view-account-track', 'track_view_account_rev',
       'track_view_account_rev', 'published', '2026-07-02T00:00:00.000Z'),
      ('track_view_protected', 'view-protected-track',
       'track_view_protected_rev', 'track_view_protected_rev', 'published',
       '2026-07-03T00:00:00.000Z'),
      ('track_view_revoked', 'view-revoked-track', 'track_view_revoked_rev',
       'track_view_revoked_rev', 'published', '2026-07-04T00:00:00.000Z'),
      ('track_view_expired', 'view-expired-track', 'track_view_expired_rev',
       'track_view_expired_rev', 'published', '2026-07-05T00:00:00.000Z'),
      ('track_view_unavailable', 'view-unavailable-track',
       'track_view_unavailable_rev', 'track_view_unavailable_rev',
       'published', '2026-07-06T00:00:00.000Z'),
      ('track_view_draft', 'view-draft-track', 'track_view_draft_rev', NULL,
       'draft', NULL),
      ('track_view_nested', 'view-nested-track', 'track_view_nested_rev',
       'track_view_nested_rev', 'published', '2026-07-07T00:00:00.000Z');

    INSERT INTO track_revisions
      (id, track_id, revision, title, description, view_mode, stream_mode,
       download_mode, tags_json)
    VALUES
      ('track_view_public_rev', 'track_view_public', 1,
       'Public view track', 'Anonymous catalog detail.', 'public',
       'unavailable', 'unavailable', '[]'),
      ('track_view_account_rev', 'track_view_account', 1,
       'Account view track', 'Signed-in catalog detail.', 'account',
       'unavailable', 'unavailable', '[]'),
      ('track_view_protected_rev', 'track_view_protected', 1,
       'Protected view track', 'Exact grant catalog detail.', 'protected',
       'unavailable', 'unavailable', '[]'),
      ('track_view_revoked_rev', 'track_view_revoked', 1,
       'Revoked view track', 'Revoked catalog detail.', 'protected',
       'unavailable', 'unavailable', '[]'),
      ('track_view_expired_rev', 'track_view_expired', 1,
       'Expired view track', 'Expired catalog detail.', 'protected',
       'unavailable', 'unavailable', '[]'),
      ('track_view_unavailable_rev', 'track_view_unavailable', 1,
       'Unavailable view track', 'Unavailable catalog detail.', 'unavailable',
       'unavailable', 'unavailable', '[]'),
      ('track_view_draft_rev', 'track_view_draft', 1,
       'Draft view track', 'Draft catalog detail.', 'public', 'unavailable',
       'unavailable', '[]'),
      ('track_view_nested_rev', 'track_view_nested', 1,
       'Nested protected track', 'Requires its own exact view authority.',
       'protected', 'unavailable', 'unavailable', '[]');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('release_view_public', 'view-public-release',
       'release_view_public_rev', 'release_view_public_rev', 'published',
       '2026-07-08T00:00:00.000Z'),
      ('release_view_protected', 'view-protected-release',
       'release_view_protected_rev', 'release_view_protected_rev', 'published',
       '2026-07-09T00:00:00.000Z');

    INSERT INTO release_revisions
      (id, release_id, revision, title, description, view_mode, tags_json)
    VALUES
      ('release_view_public_rev', 'release_view_public', 1,
       'Public view release', 'Anonymous release detail.', 'public', '[]'),
      ('release_view_protected_rev', 'release_view_protected', 1,
       'Protected view release', 'Entitled release detail.', 'protected', '[]');

    INSERT INTO release_tracks
      (id, release_revision_id, track_id, track_revision_id, position,
       disc_number, track_number)
    VALUES
      ('release_track_view_public', 'release_view_public_rev',
       'track_view_public', 'track_view_public_rev', 1, 1, 1),
      ('release_track_view_protected_public', 'release_view_protected_rev',
       'track_view_public', 'track_view_public_rev', 1, 1, 1),
      ('release_track_view_protected_nested', 'release_view_protected_rev',
       'track_view_nested', 'track_view_nested_rev', 2, 1, 2);

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('collection_view_public', 'view-public-collection',
       'collection_view_public_rev', 'collection_view_public_rev', 'published',
       '2026-07-10T00:00:00.000Z'),
      ('collection_view_account', 'view-account-collection',
       'collection_view_account_rev', 'collection_view_account_rev',
       'published', '2026-07-11T00:00:00.000Z');

    INSERT INTO collection_revisions
      (id, collection_id, revision, title, description, view_mode, tags_json)
    VALUES
      ('collection_view_public_rev', 'collection_view_public', 1,
       'Public view collection', 'Anonymous collection detail.', 'public',
       '[]'),
      ('collection_view_account_rev', 'collection_view_account', 1,
       'Account view collection', 'Signed-in collection detail.', 'account',
       '[]');

    INSERT INTO collection_tracks
      (id, collection_revision_id, track_id, track_revision_id, position)
    VALUES
      ('collection_track_view_public', 'collection_view_public_rev',
       'track_view_public', 'track_view_public_rev', 1),
      ('collection_track_view_account', 'collection_view_account_rev',
       'track_view_public', 'track_view_public_rev', 1);
  `);
}

function seedAccess(database) {
  database.exec(`
    INSERT INTO access_grants
      (id, grantee_user_id, resource_type, resource_id, actions_json, state,
       starts_at, expires_at, reason, granted_by_user_id, revoked_at)
    VALUES
      ('grant_view_protected', 'user_view_customer', 'track',
       'track_view_protected', '["view"]', 'active',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
       'Fictional exact view access.', 'user_view_owner', NULL),
      ('grant_view_revoked', 'user_view_customer', 'track',
       'track_view_revoked', '["view"]', 'revoked',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
       'Fictional revoked view access.', 'user_view_owner',
       '2026-07-18T17:00:00.000Z');

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, grant_id, resource_type,
       resource_id, actions_json, state, starts_at, expires_at)
    VALUES
      ('entitlement_view_protected', 'user_view_customer', 'grant',
       'grant_view_protected', 'grant_view_protected', 'track',
       'track_view_protected', '["view"]', 'active',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'),
      ('entitlement_view_revoked', 'user_view_customer', 'grant',
       'grant_view_revoked', 'grant_view_revoked', 'track',
       'track_view_revoked', '["view"]', 'active',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, grant_id, resource_type,
       resource_id, actions_json, state, starts_at, expires_at)
    VALUES
      ('entitlement_view_expired', 'user_view_customer', 'membership',
       'membership_view_expired', NULL, 'track', 'track_view_expired',
       '["view"]', 'active', '2026-07-01T00:00:00.000Z',
       '2026-07-18T17:59:59.000Z'),
      ('entitlement_view_release', 'user_view_customer', 'membership',
       'membership_view_release', NULL, 'release',
       'release_view_protected', '["view"]', 'active',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
  `);
}

function seedAccountViewProtectedStream(database) {
  const sha256 = "a".repeat(64);
  database
    .prepare(
      `INSERT INTO media_objects
         (id, object_key, kind, visibility, owner_user_id, content_type,
          byte_length, etag, source_version, status, approval_state,
          content_sha256, duration_ms, revision, approved_by_user_id,
          approved_at)
       VALUES
         ('media_view_stream_source', 'originals/view-stream/v1', 'audio',
          'protected', 'user_view_owner', 'audio/wav', 16,
          'view-stream-source-etag', 1, 'ready', 'approved', ?, 1000, 1,
          'user_view_owner', '2026-07-01T00:00:00.000Z')`,
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
         ('derivative_view_stream', 'media_view_stream_source', 'streaming',
          'stream-main', '1', 'derivatives/view-stream/v1', 'ready',
          'approved', 'audio/mpeg', 'mp3', 1000, 8, ?, 1,
          'user_view_owner', '2026-07-01T00:00:00.000Z')`,
    )
    .run(sha256);
  database.exec(`
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('track_view_stream', 'view-stream-track', 'track_view_stream_rev',
       'track_view_stream_rev', 'published',
       '2026-07-12T00:00:00.000Z');

    INSERT INTO track_revisions
      (id, track_id, revision, title, description, view_mode, stream_mode,
       download_mode, original_media_id, streaming_derivative_id, tags_json)
    VALUES
      ('track_view_stream_rev', 'track_view_stream', 1,
       'Account view protected stream', 'Current identity delivery control.',
       'account', 'protected', 'unavailable', 'media_view_stream_source',
       'derivative_view_stream', '[]');

    INSERT INTO access_grants
      (id, grantee_user_id, resource_type, resource_id, actions_json, state,
       starts_at, expires_at, reason, granted_by_user_id)
    VALUES
      ('grant_view_stream', 'user_view_customer', 'track',
       'track_view_stream', '["stream"]', 'active',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
       'Fictional stream access.', 'user_view_owner');

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, grant_id, resource_type,
       resource_id, actions_json, state, starts_at, expires_at)
    VALUES
      ('entitlement_view_stream', 'user_view_customer', 'grant',
       'grant_view_stream', 'grant_view_stream', 'track',
       'track_view_stream', '["stream"]', 'active',
       '2026-07-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
  `);
}

test("catalog detail views preserve public and account visibility without exposing hidden records", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);
  seedCatalog(memory.database);

  assert.equal(
    (await readCatalogTrack(memory.binding, "view-public-track", request(null)))
      ?.title,
    "Public view track",
  );
  assert.equal(
    (
      await readCatalogRelease(
        memory.binding,
        "view-public-release",
        request(null),
      )
    )?.title,
    "Public view release",
  );
  assert.equal(
    (
      await readCatalogCollection(
        memory.binding,
        "view-public-collection",
        request(null),
      )
    )?.title,
    "Public view collection",
  );

  assert.equal(
    await readCatalogTrack(memory.binding, "view-account-track", request(null)),
    null,
  );
  assert.equal(
    (
      await readCatalogTrack(
        memory.binding,
        "view-account-track",
        request(CUSTOMER),
      )
    )?.title,
    "Account view track",
  );
  assert.equal(
    await readCatalogCollection(
      memory.binding,
      "view-account-collection",
      request(null),
    ),
    null,
  );
  assert.equal(
    (
      await readCatalogCollection(
        memory.binding,
        "view-account-collection",
        request(CUSTOMER),
      )
    )?.title,
    "Account view collection",
  );

  assert.equal(
    await readCatalogTrack(
      memory.binding,
      "view-unavailable-track",
      request(OWNER),
    ),
    null,
  );
  assert.equal(
    await readCatalogTrack(memory.binding, "view-draft-track", request(OWNER)),
    null,
  );

  assert.equal(
    await readPublicTrack(memory.binding, "view-account-track"),
    null,
  );
  assert.equal(
    await readPublicRelease(memory.binding, "view-protected-release"),
    null,
  );
  assert.equal(
    await readPublicCollection(memory.binding, "view-account-collection"),
    null,
  );
});

test("protected catalog detail requires exact active user and entitlement authority", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);
  seedCatalog(memory.database);
  seedAccess(memory.database);

  assert.equal(
    await readCatalogTrack(
      memory.binding,
      "view-protected-track",
      request(null),
    ),
    null,
  );
  assert.equal(
    await readCatalogTrack(
      memory.binding,
      "view-protected-track",
      request(OTHER_CUSTOMER),
    ),
    null,
  );
  assert.equal(
    (
      await readCatalogTrack(
        memory.binding,
        "view-protected-track",
        request(CUSTOMER),
      )
    )?.title,
    "Protected view track",
  );

  const release = await readCatalogRelease(
    memory.binding,
    "view-protected-release",
    request(CUSTOMER),
  );
  assert.equal(release?.title, "Protected view release");
  assert.deepEqual(
    release?.tracks.map(({ track }) => track.id),
    ["track_view_public"],
  );
  assert.equal(
    await readCatalogRelease(
      memory.binding,
      "view-protected-release",
      request(OTHER_CUSTOMER),
    ),
    null,
  );

  assert.equal(
    await readCatalogTrack(
      memory.binding,
      "view-revoked-track",
      request(CUSTOMER),
    ),
    null,
  );
  assert.equal(
    await readCatalogTrack(
      memory.binding,
      "view-expired-track",
      request(CUSTOMER),
    ),
    null,
  );

  memory.database
    .prepare(
      `UPDATE entitlements
       SET state = 'revoked'
       WHERE id = 'entitlement_view_protected'`,
    )
    .run();
  assert.equal(
    await readCatalogTrack(
      memory.binding,
      "view-protected-track",
      request(CUSTOMER),
    ),
    null,
  );
});

test("account detail exposes a ready protected stream only for the current authorized identity", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);
  seedAccountViewProtectedStream(memory.database);

  const expectedUrl =
    "/api/media/tracks/track_view_stream/stream?revision=track_view_stream_rev";
  const allowed = await readCatalogTrack(
    memory.binding,
    "view-stream-track",
    request(CUSTOMER),
  );
  assert.equal(allowed?.tracks[0]?.track.streamUrl, expectedUrl);
  assert.equal(
    (
      await readCatalogTrack(
        memory.binding,
        "view-stream-track",
        request(OTHER_CUSTOMER),
      )
    )?.tracks[0]?.track.streamUrl,
    null,
  );
  assert.equal(
    await readCatalogTrack(memory.binding, "view-stream-track", request(null)),
    null,
  );
  assert.equal(
    await readPublicTrack(memory.binding, "view-stream-track"),
    null,
  );

  memory.database.exec(`
    UPDATE access_grants
    SET actions_json = '["view"]'
    WHERE id = 'grant_view_stream';
    UPDATE entitlements
    SET actions_json = '["view"]'
    WHERE id = 'entitlement_view_stream';
  `);
  assert.equal(
    (
      await readCatalogTrack(
        memory.binding,
        "view-stream-track",
        request(CUSTOMER),
      )
    )?.tracks[0]?.track.streamUrl,
    null,
  );

  memory.database.exec(`
    UPDATE access_grants
    SET actions_json = '["stream"]',
        state = 'revoked',
        revoked_at = '2026-07-18T17:00:00.000Z'
    WHERE id = 'grant_view_stream';
    UPDATE entitlements
    SET actions_json = '["stream"]'
    WHERE id = 'entitlement_view_stream';
  `);
  assert.equal(
    (
      await readCatalogTrack(
        memory.binding,
        "view-stream-track",
        request(CUSTOMER),
      )
    )?.tracks[0]?.track.streamUrl,
    null,
  );
});
