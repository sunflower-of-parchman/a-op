import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [catalogWrite, { setMediaSourceApproval }] = await Promise.all([
  import("../db/catalog-write.ts"),
  import("../db/media-admin.ts"),
]);
const {
  publishCollection,
  publishRelease,
  publishTrack,
  saveCollectionDraft,
  saveReleaseDraft,
  saveTrackDraft,
} = catalogWrite;

const ARTWORK_SOURCE_ID = "media_guard_artwork_source";
const ARTWORK_DERIVATIVE_ID = "derivative_guard_artwork";
const ARTWORK_SHA256 = "b".repeat(64);

function seedOwner(database) {
  database
    .prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES ('user_owner', 'owner@example.invalid',
               'owner@example.invalid', 'active')`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO role_assignments
         (id, user_id, role_key, assigned_by_user_id)
       VALUES ('role_owner', 'user_owner', 'owner', 'user_owner')`,
    )
    .run();
}

function seedApprovedArtwork(database) {
  database
    .prepare(
      `INSERT INTO media_objects
         (id, object_key, kind, visibility, owner_user_id, content_type,
          byte_length, etag, source_version, status, approval_state,
          content_sha256, duration_ms, channels, sample_rate, revision,
          approved_by_user_id, approved_at)
       VALUES (?, ?, 'image', 'public', 'user_owner', 'image/webp', 128,
               'artwork-source-etag', 1, 'ready', 'approved', ?, NULL, NULL,
               NULL, 1, 'user_owner', CURRENT_TIMESTAMP)`,
    )
    .run(
      ARTWORK_SOURCE_ID,
      `originals/${ARTWORK_SOURCE_ID}/v1`,
      ARTWORK_SHA256,
    );
  database
    .prepare(
      `INSERT INTO media_derivatives
         (id, source_media_id, kind, processing_profile, processing_version,
          object_key, status, approval_state, content_type, format,
          bitrate_kbps, duration_ms, channels, sample_rate, byte_length,
          content_sha256, revision, approved_by_user_id, approved_at)
       VALUES (?, ?, 'artwork', 'catalog-artwork', '1', ?, 'ready',
               'approved', 'image/webp', 'webp', NULL, NULL, NULL, NULL, 96,
               ?, 1, 'user_owner', CURRENT_TIMESTAMP)`,
    )
    .run(
      ARTWORK_DERIVATIVE_ID,
      ARTWORK_SOURCE_ID,
      `derivatives/${ARTWORK_SOURCE_ID}/catalog-artwork-v1.webp`,
      ARTWORK_SHA256,
    );
}

function trackInput() {
  return {
    slug: "artwork-guard-track",
    title: "Artwork guard track",
    subtitle: null,
    description: "A fictional, asset-free publication guard proof.",
    durationMs: null,
    isrc: null,
    copyrightNotice: "",
    explicit: false,
    viewMode: "public",
    streamMode: "unavailable",
    downloadMode: "unavailable",
    originalMediaId: null,
    streamingDerivativeId: null,
    downloadDerivativeId: null,
    tags: ["Fictional"],
    credits: [],
  };
}

function releaseInput(trackId) {
  return {
    slug: "artwork-guard-release",
    releaseType: "single",
    title: "Artwork guard release",
    subtitle: null,
    description: "A published release with approved artwork.",
    releaseDate: "2026-07-18",
    catalogNumber: null,
    copyrightNotice: "",
    viewMode: "public",
    artworkDerivativeId: ARTWORK_DERIVATIVE_ID,
    tags: ["Fictional"],
    tracks: [{ trackId, discNumber: 1, trackNumber: 1 }],
    credits: [],
  };
}

function collectionInput(trackId) {
  return {
    slug: "artwork-guard-collection",
    title: "Artwork guard collection",
    description: "A published collection with approved artwork.",
    viewMode: "public",
    artworkDerivativeId: ARTWORK_DERIVATIVE_ID,
    tags: ["Fictional"],
    trackIds: [trackId],
    credits: [],
  };
}

let requestSequence = 0;
function context(idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId: "user_owner",
    idempotencyKey,
    requestId: `request_artwork_guard_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

for (const parentKind of ["release", "collection"]) {
  test(`approved artwork source cannot be rejected while a published ${parentKind} uses its derivative`, async (t) => {
    const memory = await createInMemoryD1();
    t.after(() => memory.close());
    seedOwner(memory.database);
    seedApprovedArtwork(memory.database);

    const trackDraft = await saveTrackDraft(
      memory.binding,
      trackInput(),
      0,
      context(`${parentKind}-track-draft`),
    );
    await publishTrack(
      memory.binding,
      "artwork-guard-track",
      1,
      context(`${parentKind}-track-publish`),
    );

    if (parentKind === "release") {
      await saveReleaseDraft(
        memory.binding,
        releaseInput(trackDraft.value.id),
        0,
        context("release-draft"),
      );
      await publishRelease(
        memory.binding,
        "artwork-guard-release",
        1,
        context("release-publish"),
      );
    } else {
      await saveCollectionDraft(
        memory.binding,
        collectionInput(trackDraft.value.id),
        0,
        context("collection-draft"),
      );
      await publishCollection(
        memory.binding,
        "artwork-guard-collection",
        1,
        context("collection-publish"),
      );
    }

    const aggregateTable =
      parentKind === "release" ? "releases" : "collections";
    assert.deepEqual(
      {
        ...memory.database
          .prepare(
            `SELECT publication_state, version
             FROM ${aggregateTable} LIMIT 1`,
          )
          .get(),
      },
      { publication_state: "published", version: 2 },
    );

    await assertRuntimeCode(
      setMediaSourceApproval(
        memory.binding,
        ARTWORK_SOURCE_ID,
        1,
        "rejected",
        context(`${parentKind}-source-reject`),
      ),
      "MEDIA_APPROVAL_BLOCKED",
    );

    assert.deepEqual(
      {
        ...memory.database
          .prepare(
            `SELECT approval_state, revision, approved_by_user_id,
                    approved_at IS NOT NULL AS has_approved_at
             FROM media_objects WHERE id = ?`,
          )
          .get(ARTWORK_SOURCE_ID),
      },
      {
        approval_state: "approved",
        revision: 1,
        approved_by_user_id: "user_owner",
        has_approved_at: 1,
      },
    );
    assert.equal(
      memory.database
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_events
           WHERE action = 'media.source.reject'
             AND subject_id = ?`,
        )
        .get(ARTWORK_SOURCE_ID).count,
      0,
    );
  });
}
