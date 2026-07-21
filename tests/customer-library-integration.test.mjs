import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [customerRead, customerWrite] = await Promise.all([
  import("../db/customer-read.ts"),
  import("../db/customer-write.ts"),
]);

const {
  readCustomerFavoriteState,
  readCustomerFavorites,
  readCustomerLibrary,
  readCustomerPlaylist,
  readCustomerPlaylists,
  readListeningHistory,
  readResumePosition,
} = customerRead;
const {
  archiveCustomerPlaylist,
  checkpointListeningHistory,
  createCustomerPlaylist,
  replaceCustomerPlaylist,
  setCustomerFavorite,
} = customerWrite;

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_customer_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function seedCustomerDomain(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_customer_one', 'one@example.invalid', 'one@example.invalid', 'active'),
      ('user_customer_two', 'two@example.invalid', 'two@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('user_customer_one', 'Customer one'),
      ('user_customer_two', 'Customer two');
    INSERT INTO role_assignments (id, user_id, role_key)
    VALUES
      ('role_customer_one', 'user_customer_one', 'customer'),
      ('role_customer_two', 'user_customer_two', 'customer');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('track_one', 'track-one', 'track_one_revision_1',
       'track_one_revision_1', 'published'),
      ('track_two', 'track-two', 'track_two_revision_1',
       'track_two_revision_1', 'published'),
      ('track_draft', 'track-draft', 'track_draft_revision_1', NULL, 'draft');
    INSERT INTO track_revisions
      (id, track_id, revision, title, subtitle, duration_ms, stream_mode)
    VALUES
      ('track_one_revision_1', 'track_one', 1, 'Track one, original', NULL,
       100000, 'public'),
      ('track_two_revision_1', 'track_two', 1, 'Track two', NULL,
       90000, 'public'),
      ('track_draft_revision_1', 'track_draft', 1, 'Draft track', NULL,
       80000, 'public');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('release_one', 'release-one', 'release_one_revision_1',
       'release_one_revision_1', 'published');
    INSERT INTO release_revisions (id, release_id, revision, title)
    VALUES ('release_one_revision_1', 'release_one', 1, 'Release one');

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('collection_one', 'collection-one', 'collection_one_revision_1',
       'collection_one_revision_1', 'published');
    INSERT INTO collection_revisions (id, collection_id, revision, title)
    VALUES ('collection_one_revision_1', 'collection_one', 1, 'Collection one');
  `);
}

test("collection favorites persist and resolve to the public collection", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerDomain(memory.database);
  memory.database.exec(
    `UPDATE artist_modules SET active = 1 WHERE module_key = 'customer-library'`,
  );

  const saved = await setCustomerFavorite(
    memory.binding,
    {
      targetType: "collection",
      targetId: "collection_one",
      active: true,
      expectedRevision: null,
    },
    context("user_customer_one", "favorite-collection-one"),
  );
  assert.equal(saved.value.active, true);
  assert.deepEqual(
    await readCustomerFavoriteState(
      memory.binding,
      "user_customer_one",
      "collection",
      "collection_one",
    ),
    {
      targetType: "collection",
      targetId: "collection_one",
      active: true,
      revision: 1,
    },
  );
  const favorites = await readCustomerFavorites(
    memory.binding,
    "user_customer_one",
  );
  assert.equal(favorites[0].resource.kind, "collection");
  assert.equal(favorites[0].resource.href, "/music/collections/collection-one");
});

test("customer favorites, playlists, history, replay, CAS, and isolation remain durable", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerDomain(memory.database);

  await assertRuntimeCode(
    setCustomerFavorite(
      memory.binding,
      {
        targetType: "track",
        targetId: "track_one",
        active: true,
        expectedRevision: null,
      },
      context("user_customer_one", "favorite-inactive"),
    ),
    "MODULE_INACTIVE",
  );

  memory.database.exec(
    `UPDATE artist_modules SET active = 1 WHERE module_key = 'customer-library'`,
  );

  const favoriteContext = context("user_customer_one", "favorite-track-one");
  const favorite = await setCustomerFavorite(
    memory.binding,
    {
      targetType: "track",
      targetId: "track_one",
      active: true,
      expectedRevision: null,
    },
    favoriteContext,
  );
  assert.equal(favorite.replayed, false);
  assert.equal(favorite.value.revision, 1);
  assert.equal(
    scalar(
      memory.database,
      "SELECT last_operation_key FROM favorites WHERE user_id = 'user_customer_one' AND track_id = 'track_one'",
    ),
    "favorite.set:user_customer_one:favorite-track-one",
  );
  assert.equal(
    (
      await setCustomerFavorite(
        memory.binding,
        {
          targetType: "track",
          targetId: "track_one",
          active: true,
          expectedRevision: null,
        },
        favoriteContext,
      )
    ).replayed,
    true,
  );
  assert.equal(
    (await readCustomerFavorites(memory.binding, "user_customer_one")).length,
    1,
  );
  assert.equal(
    (await readCustomerFavorites(memory.binding, "user_customer_two")).length,
    0,
  );

  await assertRuntimeCode(
    setCustomerFavorite(
      memory.binding,
      {
        targetType: "track",
        targetId: "track_one",
        active: false,
        expectedRevision: 1,
      },
      context("user_customer_two", "cross-customer-favorite"),
    ),
    "STALE_STATE",
  );
  await assertRuntimeCode(
    setCustomerFavorite(
      memory.binding,
      {
        targetType: "track",
        targetId: "track_draft",
        active: true,
        expectedRevision: null,
      },
      context("user_customer_one", "draft-favorite"),
    ),
    "CUSTOMER_RESOURCE_UNAVAILABLE",
  );

  const created = await createCustomerPlaylist(
    memory.binding,
    {
      name: "First playlist",
      description: "Ordered customer music.",
      trackIds: ["track_one", "track_two"],
    },
    context("user_customer_one", "playlist-create"),
  );
  assert.equal(created.value.revision, 1);
  assert.deepEqual(
    (
      await readCustomerPlaylist(
        memory.binding,
        "user_customer_one",
        created.value.id,
      )
    ).tracks.map(({ track }) => track.id),
    ["track_one", "track_two"],
  );
  assert.equal(
    await readCustomerPlaylist(
      memory.binding,
      "user_customer_two",
      created.value.id,
    ),
    null,
  );

  const replaced = await replaceCustomerPlaylist(
    memory.binding,
    created.value.id,
    {
      name: "Reordered playlist",
      description: "Complete ordered replacement.",
      trackIds: ["track_two", "track_one"],
      expectedRevision: 1,
    },
    context("user_customer_one", "playlist-replace"),
  );
  assert.equal(replaced.value.revision, 2);
  assert.deepEqual(
    (
      await readCustomerPlaylists(memory.binding, "user_customer_one")
    )[0].tracks.map(({ track }) => track.id),
    ["track_two", "track_one"],
  );
  await assertRuntimeCode(
    replaceCustomerPlaylist(
      memory.binding,
      created.value.id,
      {
        name: "Cross customer",
        description: "",
        trackIds: [],
        expectedRevision: 2,
      },
      context("user_customer_two", "cross-customer-playlist"),
    ),
    "STALE_STATE",
  );

  const firstCheckpoint = await checkpointListeningHistory(
    memory.binding,
    {
      trackId: "track_one",
      positionMs: 150_000,
      meaningful: true,
      expectedRevision: null,
    },
    context("user_customer_one", "history-one"),
  );
  assert.equal(firstCheckpoint.value.trackRevisionId, "track_one_revision_1");
  assert.deepEqual(
    await readResumePosition(memory.binding, "user_customer_one", "track_one"),
    { trackId: "track_one", positionMs: 100_000, revision: 1 },
  );

  memory.database.exec(`
    INSERT INTO track_revisions
      (id, track_id, revision, title, subtitle, duration_ms, stream_mode)
    VALUES
      ('track_one_revision_2', 'track_one', 2, 'Track one, current', NULL,
       80000, 'public');
    UPDATE tracks
    SET draft_revision_id = 'track_one_revision_2',
        published_revision_id = 'track_one_revision_2'
    WHERE id = 'track_one';
    UPDATE tracks
    SET published_revision_id = NULL, publication_state = 'draft'
    WHERE id = 'track_two';
  `);

  const historyBeforeNextCheckpoint = await readListeningHistory(
    memory.binding,
    "user_customer_one",
  );
  assert.equal(
    historyBeforeNextCheckpoint[0].listenedRevision.title,
    "Track one, original",
  );
  assert.equal(
    historyBeforeNextCheckpoint[0].track.title,
    "Track one, current",
  );
  assert.equal(historyBeforeNextCheckpoint[0].resumePositionMs, 80_000);
  const playlistWithUnavailable = await readCustomerPlaylist(
    memory.binding,
    "user_customer_one",
    created.value.id,
  );
  assert.equal(playlistWithUnavailable.tracks[0].track.available, false);
  assert.equal(playlistWithUnavailable.tracks[0].track.streamUrl, null);

  const nextCheckpoint = await checkpointListeningHistory(
    memory.binding,
    {
      trackId: "track_one",
      positionMs: 70_000,
      meaningful: false,
      expectedRevision: 1,
    },
    context("user_customer_one", "history-two"),
  );
  assert.deepEqual(nextCheckpoint.value, {
    trackId: "track_one",
    trackRevisionId: "track_one_revision_2",
    positionMs: 70_000,
    meaningfulListenCount: 1,
    revision: 2,
  });
  assert.equal(
    scalar(
      memory.database,
      "SELECT last_operation_key FROM listening_history WHERE user_id = 'user_customer_one' AND track_id = 'track_one'",
    ),
    "listening.checkpoint:user_customer_one:history-two",
  );

  const archived = await archiveCustomerPlaylist(
    memory.binding,
    created.value.id,
    { expectedRevision: 2 },
    context("user_customer_one", "playlist-archive"),
  );
  assert.equal(archived.value.state, "archived");
  assert.equal(
    scalar(
      memory.database,
      "SELECT last_operation_key FROM playlists WHERE id = ?",
      created.value.id,
    ),
    "playlist.archive:user_customer_one:playlist-archive",
  );
  assert.equal(
    await readCustomerPlaylist(
      memory.binding,
      "user_customer_one",
      created.value.id,
    ),
    null,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?",
      created.value.id,
    ),
    2,
  );

  const library = await readCustomerLibrary(
    memory.binding,
    "user_customer_one",
  );
  assert.equal(library.favorites.length, 1);
  assert.equal(library.playlists.length, 0);
  assert.equal(library.listeningHistory.length, 1);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key LIKE 'favorite.set:user_customer_one:%' OR idempotency_key LIKE 'playlist.%:user_customer_one:%' OR idempotency_key LIKE 'listening.checkpoint:user_customer_one:%'",
    ),
    6,
  );

  memory.database.exec(
    `UPDATE role_assignments SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = 'role_customer_one'`,
  );
  await assertRuntimeCode(
    setCustomerFavorite(
      memory.binding,
      {
        targetType: "track",
        targetId: "track_one",
        active: false,
        expectedRevision: 1,
      },
      context("user_customer_one", "revoked-customer-favorite"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT revision FROM favorites WHERE user_id = 'user_customer_one' AND track_id = 'track_one'",
    ),
    1,
  );
});

test("public favorite state preserves the current revision after removal", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerDomain(memory.database);
  memory.database.exec(
    `UPDATE artist_modules SET active = 1 WHERE module_key = 'customer-library'`,
  );

  await setCustomerFavorite(
    memory.binding,
    {
      targetType: "track",
      targetId: "track_one",
      active: true,
      expectedRevision: null,
    },
    context("user_customer_one", "favorite-state-create"),
  );
  assert.deepEqual(
    await readCustomerFavoriteState(
      memory.binding,
      "user_customer_one",
      "track",
      "track_one",
    ),
    {
      targetType: "track",
      targetId: "track_one",
      active: true,
      revision: 1,
    },
  );

  await setCustomerFavorite(
    memory.binding,
    {
      targetType: "track",
      targetId: "track_one",
      active: false,
      expectedRevision: 1,
    },
    context("user_customer_one", "favorite-state-remove"),
  );
  assert.deepEqual(
    await readCustomerFavoriteState(
      memory.binding,
      "user_customer_one",
      "track",
      "track_one",
    ),
    {
      targetType: "track",
      targetId: "track_one",
      active: false,
      revision: 2,
    },
  );
  assert.equal(
    await readCustomerFavoriteState(
      memory.binding,
      "user_customer_two",
      "track",
      "track_one",
    ),
    null,
  );
});
