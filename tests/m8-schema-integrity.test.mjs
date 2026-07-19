import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const M8_TABLES = [
  "legal_document_versions",
  "legal_documents",
  "operational_failures",
  "telemetry_aggregate_days",
  "telemetry_daily_aggregates",
  "telemetry_events",
  "telemetry_settings",
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

test("the M8 foundation creates 93 tables, safe starters, and schema version 15", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.ok(migrations.names.length >= 29);
    assert.match(migrations.names[28], /^0028_.+\.sql$/);
    for (const migration of migrations.contents.slice(0, 29))
      applyMigration(database, migration);
    assertClean(database);

    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map(({ name }) => name);
    assert.equal(tables.length, 93);
    assert.deepEqual(
      M8_TABLES.filter((table) => !tables.includes(table)),
      [],
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      15,
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT collection_mode, retention_days, meaningful_listen_seconds,
                    revision
             FROM telemetry_settings WHERE id = 'telemetry'`,
          )
          .get(),
      },
      {
        collection_mode: "consent_required",
        retention_days: 30,
        meaningful_listen_seconds: 10,
        revision: 1,
      },
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT id, draft_version_id, approved_version_id,
                  published_version_id
           FROM legal_documents ORDER BY id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: "privacy",
          draft_version_id: "legal_privacy_version_1",
          approved_version_id: null,
          published_version_id: null,
        },
        {
          id: "terms",
          draft_version_id: "legal_terms_version_1",
          approved_version_id: null,
          published_version_id: null,
        },
      ],
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) AS count FROM legal_document_versions")
        .get().count,
      2,
    );
    const legalText = database
      .prepare(
        `SELECT group_concat(body_text, ' ') AS body
         FROM legal_document_versions`,
      )
      .get().body;
    assert.match(legalText, /Artist|artist/);
    assert.match(legalText, /accepts no real payment/);
    assert.throws(
      () =>
        database.exec(
          `UPDATE legal_documents
           SET draft_version_id = 'legal_terms_version_1'
           WHERE id = 'privacy'`,
        ),
      /FOREIGN KEY constraint failed/,
    );
  } finally {
    database.close();
  }
});

test("the M8 migration preserves existing publishing, contact, and commerce state", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (let index = 0; index < 26; index += 1) {
      applyMigration(database, migrations.contents[index]);
    }
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('m8_customer', 'm8@example.invalid', 'm8@example.invalid', 'active');
      INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id,
         event_created_at, raw_body_digest, facts_fingerprint, status,
         stripe_environment, livemode, processed_at)
      VALUES
        ('m8_event', 'evt_test_m8', 'checkout.session.completed',
         'cs_test_m8', '2026-07-19T09:40:00.000Z',
         '${"a".repeat(64)}', '${"b".repeat(64)}', 'completed', 'test', 0,
         '2026-07-19T09:40:00.000Z');
      INSERT INTO contact_forms
        (id, form_key, title, description, booking_information,
         public_contact_details, categories_json, state,
         current_consent_version, delivery_adapter, revision)
      VALUES
        ('m8_contact', 'contact', 'Contact', '', '', '', '["General"]',
         'active', 1, 'stored_only', 1);
      INSERT INTO contact_consent_versions
        (id, contact_form_id, version, consent_text, effective_at)
      VALUES
        ('m8_consent', 'm8_contact', 1, 'Consent.',
         '2026-07-19T09:40:00.000Z');
    `);

    applyMigration(database, migrations.contents[26]);
    database.exec(`
      INSERT INTO telemetry_events
        (id, session_id, user_id, event_name, resource_type, resource_id,
         consent_basis, day_utc, occurred_at)
      VALUES
        ('m8_telemetry_1', '11111111-1111-4111-8111-111111111111',
         'm8_customer', 'music-view', 'site', 'site', 'explicit',
         '2026-07-18', '2026-07-18T09:00:00.000Z'),
        ('m8_telemetry_2', '11111111-1111-4111-8111-111111111111',
         'm8_customer', 'contact-view', 'contact', 'contact', 'explicit',
         '2026-07-18', '2026-07-18T09:01:00.000Z'),
        ('m8_telemetry_3', '22222222-2222-4222-8222-222222222222',
         NULL, 'music-view', 'site', 'site', 'explicit',
         '2026-07-18', '2026-07-18T09:02:00.000Z');
      INSERT INTO telemetry_aggregate_days
        (day_utc, source_event_count, group_count, finalized_at,
         last_operation_key)
      VALUES
        ('2026-07-18', 3, 2, '2026-07-19T00:00:00.000Z',
         'telemetry:aggregate:m8');
    `);
    applyMigration(database, migrations.contents[27]);
    database.exec("BEGIN");
    try {
      applyMigration(database, migrations.contents[28]);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    assertClean(database);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM commerce_events WHERE id = 'm8_event'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM contact_forms WHERE id = 'm8_contact'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM contact_consent_versions WHERE id = 'm8_consent'",
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
      15,
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT source_event_count, group_count, session_count,
                    linked_user_count
             FROM telemetry_aggregate_days WHERE day_utc = '2026-07-18'`,
          )
          .get(),
      },
      {
        source_event_count: 3,
        group_count: 2,
        session_count: 2,
        linked_user_count: 1,
      },
    );
  } finally {
    database.close();
  }
});
