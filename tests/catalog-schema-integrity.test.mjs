import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const M3_TABLES = [
  "collection_revisions",
  "collection_tracks",
  "collections",
  "credits",
  "media_derivatives",
  "media_job_attempts",
  "media_jobs",
  "media_objects",
  "release_revisions",
  "release_tracks",
  "releases",
  "track_revisions",
  "tracks",
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

function applyMigrations(database, migrations, lastIndex) {
  for (let index = 0; index <= lastIndex; index += 1) {
    applyMigration(database, migrations.contents[index]);
  }
}

function tableColumns(database, table) {
  return new Map(
    database
      .prepare(`PRAGMA table_info(\`${table}\`)`)
      .all()
      .map((column) => [column.name, column]),
  );
}

function indexNames(database, table) {
  return new Set(
    database
      .prepare(`PRAGMA index_list(\`${table}\`)`)
      .all()
      .map(({ name }) => name),
  );
}

function assertConstraint(database, sql, pattern) {
  assert.throws(() => database.exec(sql), pattern);
}

function insertTrackGraph(database) {
  database.exec(`
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('track_one', 'track-one', 'track_one_revision_2', 'track_one_revision_1', 'published'),
      ('track_two', 'track-two', 'track_two_revision_2', 'track_two_revision_1', 'published'),
      ('track_three', 'track-three', 'track_three_revision_1', 'track_three_revision_1', 'published');

    INSERT INTO track_revisions (id, track_id, revision, title)
    VALUES
      ('track_one_revision_1', 'track_one', 1, 'Track one, first revision'),
      ('track_one_revision_2', 'track_one', 2, 'Track one, second revision'),
      ('track_two_revision_1', 'track_two', 1, 'Track two, first revision'),
      ('track_two_revision_2', 'track_two', 2, 'Track two, second revision'),
      ('track_three_revision_1', 'track_three', 1, 'Track three, first revision');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('release_one', 'release-one', 'release_one_revision_1',
       'release_one_revision_1', 'published');

    INSERT INTO release_revisions (id, release_id, revision, title)
    VALUES ('release_one_revision_1', 'release_one', 1, 'Release one');

    INSERT INTO release_tracks
      (id, release_revision_id, track_id, track_revision_id, position,
       disc_number, track_number)
    VALUES
      ('release_track_one', 'release_one_revision_1', 'track_one',
       'track_one_revision_1', 1, 1, 1),
      ('release_track_two', 'release_one_revision_1', 'track_two',
       'track_two_revision_1', 2, 1, 2);

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('collection_one', 'collection-one', 'collection_one_revision_1',
       'collection_one_revision_1', 'published');

    INSERT INTO collection_revisions (id, collection_id, revision, title)
    VALUES
      ('collection_one_revision_1', 'collection_one', 1, 'Collection one');

    INSERT INTO collection_tracks
      (id, collection_revision_id, track_id, track_revision_id, position)
    VALUES
      ('collection_track_one', 'collection_one_revision_1', 'track_one',
       'track_one_revision_1', 1);
  `);
}

test("fresh migrations 0006 through 0009 leave the neutral M3 schema empty and enforced", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.match(migrations.names[6], /^0006_.+\.sql$/);
    assert.match(migrations.names[7], /^0007_.+\.sql$/);
    assert.match(migrations.names[8], /^0008_.+\.sql$/);
    assert.match(migrations.names[9], /^0009_.+\.sql$/);
    applyMigrations(database, migrations, migrations.contents.length - 1);

    for (const table of M3_TABLES) {
      assert.equal(
        database.prepare(`SELECT COUNT(*) AS count FROM \`${table}\``).get()
          .count,
        0,
        `${table} must start empty.`,
      );
    }

    assert.deepEqual(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '__new_%'",
        )
        .all(),
      [],
    );

    for (const table of ["release_tracks", "collection_tracks"]) {
      const revisionColumn = tableColumns(database, table).get(
        "track_revision_id",
      );
      assert.ok(revisionColumn);
      assert.equal(revisionColumn.notnull, 1);
      const revisionForeignKey = database
        .prepare(`PRAGMA foreign_key_list(\`${table}\`)`)
        .all()
        .filter(({ table: parent }) => parent === "track_revisions")
        .sort((left, right) => left.seq - right.seq);
      assert.deepEqual(
        revisionForeignKey.map(({ from, to, on_delete: onDelete }) => ({
          from,
          to,
          onDelete,
        })),
        [
          { from: "track_id", to: "track_id", onDelete: "RESTRICT" },
          { from: "track_revision_id", to: "id", onDelete: "RESTRICT" },
        ],
      );
    }

    for (const table of ["media_objects", "media_derivatives"]) {
      const revisionColumn = tableColumns(database, table).get("revision");
      assert.ok(revisionColumn);
      assert.equal(revisionColumn.notnull, 1);
      assert.equal(revisionColumn.dflt_value, "1");
    }

    const expectedIndexes = {
      collection_tracks: [
        "collection_tracks_position_unique",
        "collection_tracks_revision_unique",
        "collection_tracks_track_unique",
      ],
      credits: [
        "credits_collection_position_unique",
        "credits_release_position_unique",
        "credits_track_position_unique",
      ],
      media_jobs: ["media_jobs_profile_unique"],
      release_tracks: [
        "release_tracks_number_unique",
        "release_tracks_position_unique",
        "release_tracks_revision_unique",
        "release_tracks_track_unique",
      ],
      track_revisions: ["track_revisions_owner_id_unique"],
    };
    for (const [table, names] of Object.entries(expectedIndexes)) {
      const actual = indexNames(database, table);
      for (const name of names) {
        assert.ok(actual.has(name), `${table} must contain ${name}.`);
      }
    }

    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("0007 through 0009 preserve frozen revisions and valid media metadata", async () => {
  const migrations = await readMigrations();
  const migration6 = migrations.names.findIndex((name) => /^0006_/.test(name));
  const migration7 = migrations.names.findIndex((name) => /^0007_/.test(name));
  const migration8 = migrations.names.findIndex((name) => /^0008_/.test(name));
  const migration9 = migrations.names.findIndex((name) => /^0009_/.test(name));
  const database = new DatabaseSync(":memory:");

  try {
    assert.equal(migration6, 6);
    assert.equal(migration7, 7);
    assert.equal(migration8, 8);
    assert.equal(migration9, 9);
    applyMigrations(database, migrations, migration6);

    database.exec(`
      INSERT INTO media_objects
        (id, object_key, kind, visibility, content_type, byte_length,
         source_version, status, content_sha256)
      VALUES
        ('media_backfill', 'originals/media_backfill/v1', 'audio', 'protected',
         'audio/wav', 32, 1, 'ready', '${"b".repeat(64)}');

      INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, content_type, byte_length, content_sha256)
      VALUES
        ('derivative_backfill', 'media_backfill', 'streaming', 'stream-main',
         '1', 'derivatives/media_backfill/stream-main-v1', 'ready',
         'audio/mpeg', 16, '${"c".repeat(64)}');

      INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id, publication_state)
      VALUES
        ('track_published', 'track-published', 'track_published_revision_2',
         'track_published_revision_1', 'published'),
        ('track_draft', 'track-draft', 'track_draft_revision_1', NULL, 'draft');

      INSERT INTO track_revisions (id, track_id, revision, title)
      VALUES
        ('track_published_revision_1', 'track_published', 1, 'Published one'),
        ('track_published_revision_2', 'track_published', 2, 'Published two'),
        ('track_draft_revision_1', 'track_draft', 1, 'Draft one'),
        ('track_draft_revision_2', 'track_draft', 2, 'Draft two');

      INSERT INTO releases
        (id, slug, draft_revision_id, published_revision_id, publication_state)
      VALUES
        ('release_backfill', 'release-backfill', 'release_backfill_revision_1',
         'release_backfill_revision_1', 'published');
      INSERT INTO release_revisions (id, release_id, revision, title)
      VALUES
        ('release_backfill_revision_1', 'release_backfill', 1, 'Release backfill');
      INSERT INTO release_tracks
        (id, release_revision_id, track_id, position, disc_number, track_number)
      VALUES
        ('release_backfill_published', 'release_backfill_revision_1',
         'track_published', 1, 1, 1),
        ('release_backfill_draft', 'release_backfill_revision_1',
         'track_draft', 2, 1, 2);

      INSERT INTO collections
        (id, slug, draft_revision_id, published_revision_id, publication_state)
      VALUES
        ('collection_backfill', 'collection-backfill',
         'collection_backfill_revision_1', 'collection_backfill_revision_1',
         'published');
      INSERT INTO collection_revisions (id, collection_id, revision, title)
      VALUES
        ('collection_backfill_revision_1', 'collection_backfill', 1,
         'Collection backfill');
      INSERT INTO collection_tracks
        (id, collection_revision_id, track_id, position)
      VALUES
        ('collection_backfill_track', 'collection_backfill_revision_1',
         'track_published', 1);
    `);

    applyMigration(database, migrations.contents[migration7]);
    applyMigration(database, migrations.contents[migration8]);
    applyMigration(database, migrations.contents[migration9]);

    assert.deepEqual(
      database
        .prepare(
          `SELECT id, track_revision_id
           FROM release_tracks
           ORDER BY position`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: "release_backfill_published",
          track_revision_id: "track_published_revision_1",
        },
        {
          id: "release_backfill_draft",
          track_revision_id: "track_draft_revision_1",
        },
      ],
    );
    assert.equal(
      database
        .prepare(
          "SELECT track_revision_id FROM collection_tracks WHERE id = 'collection_backfill_track'",
        )
        .get().track_revision_id,
      "track_published_revision_1",
    );

    database.exec(`
      UPDATE tracks
      SET published_revision_id = 'track_published_revision_2'
      WHERE id = 'track_published';
      UPDATE tracks
      SET draft_revision_id = 'track_draft_revision_2',
          published_revision_id = 'track_draft_revision_2',
          publication_state = 'published'
      WHERE id = 'track_draft';
    `);

    assert.deepEqual(
      database
        .prepare(
          `SELECT release_tracks.track_revision_id, track_revisions.title
           FROM release_tracks
           JOIN track_revisions
             ON track_revisions.id = release_tracks.track_revision_id
           ORDER BY release_tracks.position`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          track_revision_id: "track_published_revision_1",
          title: "Published one",
        },
        {
          track_revision_id: "track_draft_revision_1",
          title: "Draft one",
        },
      ],
    );
    assert.equal(
      database
        .prepare(
          "SELECT revision FROM media_objects WHERE id = 'media_backfill'",
        )
        .get().revision,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT revision FROM media_derivatives WHERE id = 'derivative_backfill'",
        )
        .get().revision,
      1,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("final M3 constraints reject invalid ownership, kinds, duplicates, and unsafe metadata", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyMigrations(database, migrations, migrations.contents.length - 1);
    insertTrackGraph(database);

    assertConstraint(
      database,
      `INSERT INTO release_tracks
        (id, release_revision_id, track_id, track_revision_id, position,
         disc_number, track_number)
       VALUES
        ('release_duplicate_number', 'release_one_revision_1', 'track_three',
         'track_three_revision_1', 3, 1, 2)`,
      /UNIQUE constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO release_tracks
        (id, release_revision_id, track_id, track_revision_id, position,
         disc_number, track_number)
       VALUES
        ('release_duplicate_track', 'release_one_revision_1', 'track_one',
         'track_one_revision_2', 3, 1, 3)`,
      /UNIQUE constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO release_tracks
        (id, release_revision_id, track_id, track_revision_id, position,
         disc_number, track_number)
       VALUES
        ('release_missing_revision', 'release_one_revision_1', 'track_three',
         'track_revision_missing', 3, 1, 3)`,
      /FOREIGN KEY constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO release_tracks
        (id, release_revision_id, track_id, track_revision_id, position,
         disc_number, track_number)
       VALUES
        ('release_cross_track_revision', 'release_one_revision_1',
         'track_three', 'track_one_revision_2', 3, 1, 3)`,
      /FOREIGN KEY constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO collection_tracks
        (id, collection_revision_id, track_id, track_revision_id, position)
       VALUES
        ('collection_duplicate_track', 'collection_one_revision_1',
         'track_one', 'track_one_revision_2', 2)`,
      /UNIQUE constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO collection_tracks
        (id, collection_revision_id, track_id, track_revision_id, position)
       VALUES
        ('collection_cross_track_revision', 'collection_one_revision_1',
         'track_two', 'track_three_revision_1', 2)`,
      /FOREIGN KEY constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO collection_tracks
        (id, collection_revision_id, track_id, track_revision_id, position)
       VALUES
        ('collection_duplicate_position', 'collection_one_revision_1',
         'track_two', 'track_two_revision_1', 1)`,
      /UNIQUE constraint failed/,
    );

    database.exec(`
      INSERT INTO credits
        (id, release_revision_id, name, role, position)
      VALUES
        ('credit_release_one', 'release_one_revision_1', 'Fictional Musician',
         'Composer', 1);
      INSERT INTO credits
        (id, track_revision_id, name, role, position)
      VALUES
        ('credit_track_one', 'track_one_revision_1', 'Fictional Musician',
         'Performer', 1);
      INSERT INTO credits
        (id, collection_revision_id, name, role, position)
      VALUES
        ('credit_collection_one', 'collection_one_revision_1',
         'Fictional Musician', 'Curator', 1);
    `);
    for (const [id, subjectColumn, subjectId] of [
      [
        "credit_release_duplicate",
        "release_revision_id",
        "release_one_revision_1",
      ],
      ["credit_track_duplicate", "track_revision_id", "track_one_revision_1"],
      [
        "credit_collection_duplicate",
        "collection_revision_id",
        "collection_one_revision_1",
      ],
    ]) {
      assertConstraint(
        database,
        `INSERT INTO credits
          (id, ${subjectColumn}, name, role, position)
         VALUES ('${id}', '${subjectId}', 'Another Musician', 'Role', 1)`,
        /UNIQUE constraint failed/,
      );
    }

    database.exec(`
      INSERT INTO media_objects
        (id, object_key, kind, visibility, content_type, byte_length,
         source_version, status, content_sha256)
      VALUES
        ('media_one', 'originals/media_one/v1', 'audio', 'protected',
         'audio/wav', 64, 1, 'ready', '${"d".repeat(64)}'),
        ('media_runtime_compatibility', 'runtime-lab/compatibility-proof',
         'other', 'protected', 'application/octet-stream', 0, 1, 'pending',
         NULL);

      INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, content_type, byte_length, content_sha256)
      VALUES
        ('derivative_one', 'media_one', 'streaming', 'stream-main', '1',
         'derivatives/media_one/stream-main-v1', 'ready', 'audio/mpeg', 32,
         '${"e".repeat(64)}');

      INSERT INTO media_jobs
        (id, source_media_id, derivative_kind, processing_profile,
         processing_version)
      VALUES
        ('job_one', 'media_one', 'streaming', 'stream-main', '1');
    `);

    assertConstraint(
      database,
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, content_type, byte_length)
       VALUES
        ('media_bad_namespace', 'derivatives/not-an-original', 'audio',
         'protected', 'audio/wav', 1)`,
      /media_objects_key_namespace/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, content_type, byte_length)
       VALUES
        ('media_bad_kind', 'originals/media_bad_kind/v1', 'executable',
         'protected', 'application/octet-stream', 1)`,
      /media_objects_kind_valid/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, content_type, byte_length, revision)
       VALUES
        ('media_bad_revision', 'originals/media_bad_revision/v1', 'audio',
         'protected', 'audio/wav', 1, 0)`,
      /media_objects_revision_positive/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, content_type, byte_length)
       VALUES
        ('derivative_bad_namespace', 'media_one', 'download', 'download-main',
         '1', 'originals/not-a-derivative', 'ready', 'audio/flac', 4)`,
      /media_derivatives_key_namespace/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         status)
       VALUES
        ('derivative_bad_kind', 'media_one', 'executable', 'bad-kind', '1',
         'pending')`,
      /media_derivatives_kind_valid/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, content_type, byte_length, revision)
       VALUES
        ('derivative_bad_revision', 'media_one', 'download', 'download-main',
         '1', 'derivatives/media_one/download-main-v1', 'ready', 'audio/flac',
         4, 0)`,
      /media_derivatives_revision_positive/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         status)
       VALUES
        ('derivative_incomplete', 'media_one', 'download', 'download-main',
         '1', 'ready')`,
      /media_derivatives_ready_complete/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_jobs
        (id, source_media_id, derivative_kind, processing_profile,
         processing_version)
       VALUES
        ('job_duplicate', 'media_one', 'streaming', 'stream-main', '1')`,
      /UNIQUE constraint failed/,
    );
    assertConstraint(
      database,
      `INSERT INTO media_jobs
        (id, source_media_id, derivative_kind, processing_profile,
         processing_version)
       VALUES
        ('job_bad_kind', 'media_one', 'executable', 'bad-kind', '1')`,
      /media_jobs_derivative_kind_valid/,
    );

    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT release_tracks.track_revision_id, track_revisions.title
             FROM release_tracks
             JOIN track_revisions
               ON track_revisions.id = release_tracks.track_revision_id
             WHERE release_tracks.id = 'release_track_one'`,
          )
          .get(),
      },
      {
        track_revision_id: "track_one_revision_1",
        title: "Track one, first revision",
      },
    );
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
