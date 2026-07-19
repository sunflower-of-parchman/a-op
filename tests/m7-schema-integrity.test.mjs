import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const M7_TABLES = [
  "contact_consent_versions",
  "contact_forms",
  "contact_notes",
  "contact_submissions",
  "content_section_revisions",
  "content_sections",
  "course_progress",
  "course_revisions",
  "course_sections",
  "courses",
  "editorial_posts",
  "lesson_items",
  "lessons",
  "page_revision_sections",
  "update_reads",
  "updates",
  "video_revisions",
  "video_transcripts",
  "videos",
];

async function readMigrations() {
  const directory = new URL("../drizzle/", import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  const contents = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  return { contents, names };
}

function applyMigration(database, sql) {
  for (const statement of sql
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    database.exec(statement);
  }
}

function assertClean(database) {
  assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.deepEqual(
    database
      .prepare(
        `SELECT type, name FROM sqlite_master
         WHERE name LIKE '__new_%'
         ORDER BY type, name`,
      )
      .all(),
    [],
  );
}

test("the M7 migration checkpoint creates the 86-table schema version 13 with clean references", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.ok(migrations.names.length >= 26);
    assert.match(migrations.names[20], /^0020_.+\.sql$/);
    assert.match(migrations.names[21], /^0021_.+\.sql$/);
    assert.match(migrations.names[22], /^0022_.+\.sql$/);
    assert.match(migrations.names[23], /^0023_.+\.sql$/);
    assert.match(migrations.names[24], /^0024_.+\.sql$/);
    assert.match(migrations.names[25], /^0025_.+\.sql$/);

    for (let index = 0; index < 26; index += 1) {
      applyMigration(database, migrations.contents[index]);
      if (index >= 20) assertClean(database);
    }

    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map(({ name }) => name);
    assert.equal(tables.length, 86);
    assert.deepEqual(
      M7_TABLES.filter((table) => !tables.includes(table)),
      [],
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      13,
    );
    assert.equal(
      database
        .prepare(
          "SELECT footer_text FROM artist_config_revisions WHERE id = 'artist_revision_1'",
        )
        .get().footer_text,
      "Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data.",
    );

    const courseAccessPlanForeignKey = database
      .prepare("PRAGMA foreign_key_list(`course_revisions`)")
      .all()
      .find(
        ({ from, table }) =>
          from === "access_plan_id" && table === "access_plans",
      );
    assert.equal(courseAccessPlanForeignKey?.to, "id");

    const accessGrantSql = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'access_grants'",
      )
      .get().sql;
    assert.match(accessGrantSql, /'course'/);
    assert.match(accessGrantSql, /'lesson'/);
  } finally {
    database.close();
  }
});

test("the contact-details migration preserves consent and inquiries while adding empty public fields", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (let index = 0; index < 25; index += 1) {
      applyMigration(database, migrations.contents[index]);
    }
    database.exec(`
      INSERT INTO contact_forms
        (id, form_key, title, description, categories_json, state,
         current_consent_version, delivery_adapter, revision)
      VALUES
        ('contact_preserved', 'contact', 'Contact', 'Preserved form',
         '["General"]', 'active', 1, 'stored_only', 1);
      INSERT INTO contact_consent_versions
        (id, contact_form_id, version, consent_text, effective_at)
      VALUES
        ('consent_preserved', 'contact_preserved', 1,
         'Preserved consent.', '2026-07-19T10:00:00.000Z');
      INSERT INTO contact_submissions
        (id, contact_form_id, consent_version_id, name, email,
         normalized_email, category, subject, message, state, request_id,
         consented_at, revision)
      VALUES
        ('submission_preserved', 'contact_preserved', 'consent_preserved',
         'Fictional Listener', 'listener@example.invalid',
         'listener@example.invalid', 'General', 'Preserved subject',
         'Preserved message.', 'new', 'request_preserved',
         '2026-07-19T10:01:00.000Z', 1);
    `);

    applyMigration(database, migrations.contents[25]);
    assertClean(database);
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT booking_information, public_contact_details
             FROM contact_forms WHERE id = 'contact_preserved'`,
          )
          .get(),
      },
      { booking_information: "", public_contact_details: "" },
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM contact_consent_versions WHERE id = 'consent_preserved'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM contact_submissions WHERE id = 'submission_preserved'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      13,
    );
  } finally {
    database.close();
  }
});

test("the private order-update migration preserves receipts and rejects public order activity", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (let index = 0; index < 24; index += 1) {
      applyMigration(database, migrations.contents[index]);
    }
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('user_update_receipt', 'receipt@example.invalid',
              'receipt@example.invalid', 'active');
      INSERT INTO updates
        (id, slug, title, body_json, audience, resource_type, resource_id,
         state, published_at, revision)
      VALUES
        ('update_order_private', 'order-private', 'Private test order',
         '[{"type":"paragraph","text":"Fictional order activity."}]',
         'account', 'order', 'order_fictional', 'published',
         '2026-07-19T09:00:00.000Z', 1);
      INSERT INTO update_reads
        (id, update_id, user_id, read_at, last_operation_key)
      VALUES
        ('update_read_preserved', 'update_order_private',
         'user_update_receipt', '2026-07-19T09:01:00.000Z',
         'update.read.mark:user_update_receipt:preserved');
    `);

    applyMigration(database, migrations.contents[24]);
    assertClean(database);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM update_reads WHERE id = 'update_read_preserved'",
        )
        .get().count,
      1,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO updates
            (id, slug, title, body_json, audience, resource_type, resource_id,
             state, revision)
          VALUES
            ('update_order_public', 'order-public', 'Public order',
             '[{"type":"paragraph","text":"Invalid public order."}]',
             'public', 'order', 'order_fictional', 'draft', 1)
        `),
      /updates_order_audience_private|CHECK constraint failed/,
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      12,
    );
  } finally {
    database.close();
  }
});
