import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [catalogWrite, catalogRead] = await Promise.all([
  import("../db/catalog-write.ts"),
  import("../db/catalog-read.ts"),
]);

const {
  publishRelease,
  publishTrack,
  saveReleaseDraft,
  saveTrackDraft,
  unpublishRelease,
  unpublishTrack,
} = catalogWrite;
const { readPublicMusicIndex, readPublicRelease, readPublicTrack } =
  catalogRead;

function seedAuthority(database) {
  const insertUser = database.prepare(
    `INSERT INTO users (id, email, normalized_email, status)
     VALUES (?, ?, ?, 'active')`,
  );
  const users = [
    ["user_owner", "owner@example.invalid"],
    ["user_editor", "editor@example.invalid"],
    ["user_unscoped", "unscoped@example.invalid"],
    ["user_customer", "customer@example.invalid"],
  ];
  for (const [id, email] of users) insertUser.run(id, email, email);

  const insertRole = database.prepare(
    `INSERT INTO role_assignments
       (id, user_id, role_key, assigned_by_user_id)
     VALUES (?, ?, ?, 'user_owner')`,
  );
  insertRole.run("role_owner", "user_owner", "owner");
  insertRole.run("role_editor", "user_editor", "editor");
  insertRole.run("role_unscoped", "user_unscoped", "editor");
  insertRole.run("role_customer", "user_customer", "customer");

  database
    .prepare(
      `INSERT INTO editor_permissions
         (id, user_id, permission_key, scope_id, assigned_by_user_id)
       VALUES ('permission_editor_catalog', 'user_editor', 'catalog.write', '*',
               'user_owner')`,
    )
    .run();
}

function trackInput(overrides = {}) {
  return {
    slug: "memory-track",
    title: "Memory track, first revision",
    subtitle: null,
    description: "A fictional, asset-free catalog proof.",
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
    tags: ["Fictional", "Proof"],
    credits: [
      {
        name: "Fictional Musician",
        role: "Composer",
        details: "",
      },
    ],
    ...overrides,
  };
}

function releaseInput(trackId, overrides = {}) {
  return {
    slug: "memory-release",
    releaseType: "single",
    title: "Memory release",
    subtitle: null,
    description: "A frozen release revision.",
    releaseDate: "2026-07-18",
    catalogNumber: null,
    copyrightNotice: "",
    viewMode: "public",
    artworkDerivativeId: null,
    tags: ["Fictional"],
    tracks: [{ trackId, discNumber: 1, trackNumber: 1 }],
    credits: [],
    ...overrides,
  };
}

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_catalog_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

test("catalog write, frozen read, replay, and dependency journey stays durable and public-safe", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthority(memory.database);

  await assertRuntimeCode(
    saveTrackDraft(
      memory.binding,
      trackInput(),
      0,
      context("user_unscoped", "unscoped-create"),
    ),
    "STALE_STATE",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM tracks"), 0);

  const firstDraft = await saveTrackDraft(
    memory.binding,
    trackInput(),
    0,
    context("user_editor", "track-draft-one"),
  );
  assert.equal(firstDraft.replayed, false);
  assert.deepEqual(
    {
      created: firstDraft.value.created,
      revision: firstDraft.value.revision,
      version: firstDraft.value.version,
      publishedRevisionId: firstDraft.value.publishedRevisionId,
    },
    { created: true, revision: 1, version: 1, publishedRevisionId: null },
  );

  await assertRuntimeCode(
    publishTrack(
      memory.binding,
      "memory-track",
      1,
      context("user_editor", "editor-cannot-publish"),
    ),
    "STALE_STATE",
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT publication_state, version, published_revision_id
       FROM tracks WHERE id = ?`,
        )
        .get(firstDraft.value.id),
    },
    {
      publication_state: "draft",
      version: 1,
      published_revision_id: null,
    },
  );

  const publishContext = context("user_owner", "track-publish-one");
  const firstPublish = await publishTrack(
    memory.binding,
    "memory-track",
    1,
    publishContext,
  );
  assert.equal(firstPublish.replayed, false);
  assert.equal(firstPublish.value.version, 2);
  assert.equal(
    firstPublish.value.publishedRevisionId,
    firstDraft.value.revisionId,
  );

  const replay = await publishTrack(
    memory.binding,
    "memory-track",
    1,
    publishContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, firstPublish.value);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE idempotency_key = 'track.publish:user_owner:track-publish-one'`,
    ),
    1,
  );
  await assertRuntimeCode(
    publishTrack(memory.binding, "memory-track", 2, publishContext),
    "IDEMPOTENCY_CONFLICT",
  );

  const revisionCountBeforeStaleWrite = scalar(
    memory.database,
    "SELECT COUNT(*) FROM track_revisions",
  );
  await assertRuntimeCode(
    saveTrackDraft(
      memory.binding,
      trackInput({ title: "Stale edit" }),
      1,
      context("user_editor", "stale-track-draft"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM track_revisions"),
    revisionCountBeforeStaleWrite,
  );

  const releaseDraft = await saveReleaseDraft(
    memory.binding,
    releaseInput(firstDraft.value.id),
    0,
    context("user_editor", "release-draft-one"),
  );
  const releasePublish = await publishRelease(
    memory.binding,
    "memory-release",
    1,
    context("user_owner", "release-publish-one"),
  );
  assert.equal(releasePublish.value.version, 2);
  assert.equal(
    memory.database
      .prepare(
        `SELECT track_revision_id FROM release_tracks
         WHERE release_revision_id = ?`,
      )
      .get(releaseDraft.value.revisionId).track_revision_id,
    firstDraft.value.revisionId,
  );

  const privateSecondDraft = await saveTrackDraft(
    memory.binding,
    trackInput({
      title: "Memory track, second revision",
      description: "The current published track after its second publication.",
    }),
    2,
    context("user_editor", "track-draft-two"),
  );
  assert.equal(privateSecondDraft.value.version, 3);
  assert.equal(
    (await readPublicTrack(memory.binding, "memory-track")).title,
    "Memory track, first revision",
  );

  const secondPublish = await publishTrack(
    memory.binding,
    "memory-track",
    3,
    context("user_owner", "track-publish-two"),
  );
  assert.equal(secondPublish.value.version, 4);

  const [publicTrack, publicRelease, publicIndex] = await Promise.all([
    readPublicTrack(memory.binding, "memory-track"),
    readPublicRelease(memory.binding, "memory-release"),
    readPublicMusicIndex(memory.binding, { sort: "title" }),
  ]);
  assert.equal(publicTrack.title, "Memory track, second revision");
  assert.equal(
    publicRelease.tracks[0].track.title,
    "Memory track, first revision",
  );
  assert.equal(publicRelease.tracks[0].track.streamUrl, null);
  assert.deepEqual(Object.keys(publicTrack).sort(), [
    "artwork",
    "credits",
    "date",
    "description",
    "id",
    "kind",
    "slug",
    "subtitle",
    "tags",
    "title",
    "tracks",
  ]);
  assert.equal(publicIndex.catalogSize, 2);

  const publicJson = JSON.stringify({
    publicTrack,
    publicRelease,
    publicIndex,
  });
  for (const forbidden of [
    "draftRevisionId",
    "publishedRevisionId",
    "objectKey",
    "contentSha256",
    "lastOperationKey",
    "derivatives/",
    "owner@example.invalid",
    "editor@example.invalid",
  ]) {
    assert.equal(publicJson.includes(forbidden), false, forbidden);
  }

  await assertRuntimeCode(
    unpublishTrack(
      memory.binding,
      "memory-track",
      4,
      context("user_owner", "blocked-track-unpublish"),
    ),
    "TRACK_IN_PUBLISHED_CATALOG",
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(`SELECT publication_state, version FROM tracks WHERE id = ?`)
        .get(firstDraft.value.id),
    },
    { publication_state: "published", version: 4 },
  );

  const releaseUnpublish = await unpublishRelease(
    memory.binding,
    "memory-release",
    2,
    context("user_owner", "release-unpublish-one"),
  );
  const trackUnpublish = await unpublishTrack(
    memory.binding,
    "memory-track",
    4,
    context("user_owner", "track-unpublish-one"),
  );
  assert.equal(releaseUnpublish.value.version, 3);
  assert.equal(trackUnpublish.value.version, 5);
  assert.equal(await readPublicRelease(memory.binding, "memory-release"), null);
  assert.equal(await readPublicTrack(memory.binding, "memory-track"), null);

  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_derivatives"),
    0,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});
