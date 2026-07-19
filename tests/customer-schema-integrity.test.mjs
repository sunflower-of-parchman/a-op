import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const CUSTOMER_TABLES = [
  "access_grants",
  "download_events",
  "entitlements",
  "favorites",
  "listening_history",
  "playlist_tracks",
  "playlists",
];

async function readMigrations() {
  const directory = new URL("../drizzle/", import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  const contents = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  return { names, contents };
}

function applyMigration(database, sql) {
  for (const statement of sql
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    database.exec(statement);
  }
}

function applyThrough(database, migrations, lastIndex) {
  for (let index = 0; index <= lastIndex; index += 1) {
    applyMigration(database, migrations.contents[index]);
  }
}

function indexNames(database, table) {
  return new Set(
    database
      .prepare(`PRAGMA index_list(\`${table}\`)`)
      .all()
      .map(({ name }) => name),
  );
}

test("fresh customer migrations create an empty constrained access spine", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.match(migrations.names[10], /^0010_.+\.sql$/);
    assert.match(migrations.names[11], /^0011_.+\.sql$/);
    assert.match(migrations.names[12], /^0012_.+\.sql$/);
    assert.match(migrations.names[13], /^0013_.+\.sql$/);
    applyThrough(database, migrations, migrations.contents.length - 1);

    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      6,
    );
    for (const table of CUSTOMER_TABLES) {
      assert.equal(
        database.prepare(`SELECT COUNT(*) AS count FROM \`${table}\``).get()
          .count,
        0,
        `${table} must begin empty.`,
      );
    }

    const requiredIndexes = {
      access_grants: ["access_grants_grantee_state_resource_idx"],
      download_events: ["download_events_request_unique"],
      entitlements: ["entitlements_source_resource_unique"],
      favorites: [
        "favorites_user_release_unique",
        "favorites_user_track_unique",
      ],
      listening_history: ["listening_history_user_track_unique"],
      playlist_tracks: [
        "playlist_tracks_position_unique",
        "playlist_tracks_track_unique",
      ],
      playlists: ["playlists_user_state_updated_idx"],
    };
    for (const [table, required] of Object.entries(requiredIndexes)) {
      const actual = indexNames(database, table);
      for (const name of required) {
        assert.ok(actual.has(name), `${table} must contain ${name}.`);
      }
    }

    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("0012 and 0013 allow anonymous public downloads and reject every anonymous protected source", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.match(migrations.names[12], /^0012_.+\.sql$/);
    assert.match(migrations.names[13], /^0013_.+\.sql$/);
    applyThrough(database, migrations, 11);
    applyMigration(database, migrations.contents[12]);

    database.exec(`
      INSERT INTO download_events
        (id, user_id, resource_type, resource_id, access_source, byte_length,
         request_id)
      VALUES
        ('download_anonymous_public_before_constraint', NULL, 'track',
         'track_public', 'public', 8, 'request_anonymous_public_before');
    `);

    applyMigration(database, migrations.contents[13]);

    assert.equal(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM download_events
           WHERE id = 'download_anonymous_public_before_constraint'
             AND user_id IS NULL
             AND access_source = 'public'`,
        )
        .get().count,
      1,
    );

    database.exec(`
      INSERT INTO download_events
        (id, user_id, resource_type, resource_id, access_source, byte_length,
         request_id)
      VALUES
        ('download_anonymous_public_after_constraint', NULL, 'track',
         'track_public', 'public', 8, 'request_anonymous_public_after');

      INSERT INTO users (id, email, normalized_email)
      VALUES ('user_download_customer', 'download@example.invalid',
              'download@example.invalid');
      INSERT INTO download_events
        (id, user_id, resource_type, resource_id, access_source, byte_length,
         request_id)
      VALUES
        ('download_account_customer', 'user_download_customer', 'track',
         'track_account', 'account', 8, 'request_account_customer');
    `);

    for (const source of ["account", "role", "ownership", "grant"]) {
      assert.throws(
        () =>
          database
            .prepare(
              `INSERT INTO download_events
                 (id, user_id, resource_type, resource_id, access_source,
                  byte_length, request_id)
               VALUES (?, NULL, 'track', 'track_protected', ?, 8, ?)`,
            )
            .run(
              `download_anonymous_${source}`,
              source,
              `request_anonymous_${source}`,
            ),
        /check constraint/i,
      );
    }

    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM download_events").get()
        .count,
      3,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("0011 preserves customer state and freezes existing history to a track revision", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 10);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES ('user_listener', 'listener@example.invalid', 'listener@example.invalid');
      INSERT INTO profiles (user_id, display_name)
      VALUES ('user_listener', 'Listener');
      INSERT INTO role_assignments (id, user_id, role_key)
      VALUES ('role_listener', 'user_listener', 'customer');

      INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id, publication_state)
      VALUES
        ('track_history', 'track-history', 'track_history_revision_2',
         'track_history_revision_1', 'published');
      INSERT INTO track_revisions (id, track_id, revision, title)
      VALUES
        ('track_history_revision_1', 'track_history', 1, 'History one'),
        ('track_history_revision_2', 'track_history', 2, 'History two');

      INSERT INTO favorites
        (id, user_id, target_type, track_id, state, last_operation_key)
      VALUES
        ('favorite_history', 'user_listener', 'track', 'track_history',
         'active', 'favorite.save:test');
      INSERT INTO playlists
        (id, user_id, name, state, last_operation_key)
      VALUES
        ('playlist_history', 'user_listener', 'History', 'active',
         'playlist.create:test');
      INSERT INTO playlist_tracks (id, playlist_id, track_id, position)
      VALUES
        ('playlist_track_history', 'playlist_history', 'track_history', 1);
      INSERT INTO listening_history
        (id, user_id, track_id, position_ms, meaningful_listen_count,
         last_operation_key)
      VALUES
        ('history_listener_track', 'user_listener', 'track_history', 12000, 1,
         'history.checkpoint:test');
    `);

    applyMigration(database, migrations.contents[11]);

    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT track_revision_id, position_ms, meaningful_listen_count
           FROM listening_history WHERE id = 'history_listener_track'`,
          )
          .get(),
      },
      {
        track_revision_id: "track_history_revision_1",
        position_ms: 12000,
        meaningful_listen_count: 1,
      },
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM favorites WHERE id = 'favorite_history'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM playlist_tracks WHERE id = 'playlist_track_history'",
        )
        .get().count,
      1,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("customer constraints reject ambiguous targets, duplicate order, and invalid access facts", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, migrations.contents.length - 1);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES
        ('user_listener', 'listener@example.invalid', 'listener@example.invalid'),
        ('user_owner', 'owner@example.invalid', 'owner@example.invalid');
      INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id, publication_state)
      VALUES
        ('track_one', 'track-one', 'track_one_revision_1',
         'track_one_revision_1', 'published'),
        ('track_two', 'track-two', 'track_two_revision_1',
         'track_two_revision_1', 'published');
      INSERT INTO track_revisions (id, track_id, revision, title)
      VALUES
        ('track_one_revision_1', 'track_one', 1, 'Track one'),
        ('track_two_revision_1', 'track_two', 1, 'Track two');
      INSERT INTO playlists (id, user_id, name)
      VALUES ('playlist_one', 'user_listener', 'One');
      INSERT INTO playlist_tracks (id, playlist_id, track_id, position)
      VALUES ('playlist_track_one', 'playlist_one', 'track_one', 1);
    `);

    assert.throws(
      () =>
        database.exec(`
          INSERT INTO favorites
            (id, user_id, target_type, track_id, release_id)
          VALUES
            ('favorite_invalid', 'user_listener', 'track', 'track_one',
             'release_missing');
        `),
      /constraint|foreign key/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO playlist_tracks (id, playlist_id, track_id, position)
          VALUES ('playlist_track_duplicate', 'playlist_one', 'track_two', 1);
        `),
      /unique constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO listening_history
            (id, user_id, track_id, track_revision_id)
          VALUES
            ('history_wrong_revision', 'user_listener', 'track_one',
             'track_two_revision_1');
        `),
      /foreign key constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grants
            (id, grantee_user_id, resource_type, resource_id, actions_json,
             granted_by_user_id)
          VALUES
            ('grant_invalid', 'user_listener', 'track', 'track_one', '{}',
             'user_owner');
        `),
      /check constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO entitlements
            (id, user_id, source_type, source_id, resource_type, resource_id,
             actions_json)
          VALUES
            ('entitlement_invalid', 'user_listener', 'grant', 'grant_missing',
             'track', 'track_one', '["stream"]');
        `),
      /check constraint/i,
    );
  } finally {
    database.close();
  }
});
