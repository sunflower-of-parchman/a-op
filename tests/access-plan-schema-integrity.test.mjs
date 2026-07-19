import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const ACCESS_PLAN_TABLES = [
  "access_grant_sets",
  "access_plan_items",
  "access_plans",
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

test("0014 adds an empty constrained access-plan authority spine", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    const accessPlanMigrationIndex = migrations.names.findIndex((name) =>
      /^0014_.+\.sql$/.test(name),
    );
    assert.equal(accessPlanMigrationIndex, 14);
    applyThrough(database, migrations, accessPlanMigrationIndex);

    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      6,
    );
    for (const table of ACCESS_PLAN_TABLES) {
      assert.equal(
        database.prepare(`SELECT COUNT(*) AS count FROM \`${table}\``).get()
          .count,
        0,
        `${table} must begin empty.`,
      );
    }

    assert.ok(
      indexNames(database, "access_plans").has("access_plans_slug_unique"),
    );
    assert.ok(
      indexNames(database, "access_plan_items").has(
        "access_plan_items_position_unique",
      ),
    );
    assert.ok(
      indexNames(database, "access_grants").has(
        "access_grants_set_item_unique",
      ),
    );
    assert.equal(
      indexNames(database, "access_grants").has(
        "__access_grants_identity_migration_unique",
      ),
      false,
    );
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("0014 preserves existing grants, entitlements, and delivery history", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 13);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES
        ('user_access_customer', 'access@example.invalid',
         'access@example.invalid'),
        ('user_access_owner', 'owner@example.invalid',
         'owner@example.invalid');
      INSERT INTO access_grants
        (id, grantee_user_id, resource_type, resource_id, actions_json,
         remaining_uses, reason, granted_by_user_id, last_operation_key)
      VALUES
        ('grant_existing', 'user_access_customer', 'track', 'track_existing',
         '["stream","download"]', 2, 'Existing grant', 'user_access_owner',
         'grant.create:existing');
      INSERT INTO entitlements
        (id, user_id, source_type, source_id, grant_id, resource_type,
         resource_id, actions_json, remaining_uses, last_operation_key)
      VALUES
        ('entitlement_existing', 'user_access_customer', 'grant',
         'grant_existing', 'grant_existing', 'track', 'track_existing',
         '["stream","download"]', 2, 'entitlement.create:existing');
      INSERT INTO download_events
        (id, user_id, resource_type, resource_id, entitlement_id,
         access_source, byte_length, request_id)
      VALUES
        ('download_existing', 'user_access_customer', 'track',
         'track_existing', 'entitlement_existing', 'grant', 24,
         'request_existing');
    `);

    applyMigration(database, migrations.contents[14]);

    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT id, grant_set_id, access_plan_id, access_plan_item_id, actions_json,
                    remaining_uses, last_operation_key
             FROM access_grants WHERE id = 'grant_existing'`,
          )
          .get(),
      },
      {
        id: "grant_existing",
        grant_set_id: null,
        access_plan_id: null,
        access_plan_item_id: null,
        actions_json: '["stream","download"]',
        remaining_uses: 2,
        last_operation_key: "grant.create:existing",
      },
    );
    assert.equal(
      database
        .prepare(
          "SELECT grant_id FROM entitlements WHERE id = 'entitlement_existing'",
        )
        .get().grant_id,
      "grant_existing",
    );
    assert.equal(
      database
        .prepare(
          "SELECT entitlement_id FROM download_events WHERE id = 'download_existing'",
        )
        .get().entitlement_id,
      "entitlement_existing",
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      6,
    );
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("0014 rejects legacy grant entitlements bound to the wrong customer or resource", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 13);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES
        ('user_guard_customer', 'guard@example.invalid',
         'guard@example.invalid'),
        ('user_guard_other', 'guard-other@example.invalid',
         'guard-other@example.invalid');
      INSERT INTO access_grants
        (id, grantee_user_id, resource_type, resource_id, actions_json,
         reason)
      VALUES
        ('grant_guard', 'user_guard_customer', 'track', 'track_guard',
         '["stream"]', 'Guard fixture');
      INSERT INTO entitlements
        (id, user_id, source_type, source_id, grant_id, resource_type,
         resource_id, actions_json)
      VALUES
        ('entitlement_guard_invalid', 'user_guard_other', 'grant',
         'grant_guard', 'grant_guard', 'track', 'track_other', '["stream"]');
    `);

    assert.throws(
      () => applyMigration(database, migrations.contents[14]),
      /check constraint/i,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM entitlements WHERE id = 'entitlement_guard_invalid'",
        )
        .get().count,
      1,
    );
  } finally {
    database.close();
  }
});

test("access-plan constraints reject ambiguous or inconsistent stored facts", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 14);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES
        ('user_plan_customer', 'plan@example.invalid', 'plan@example.invalid'),
        ('user_plan_other', 'plan-other@example.invalid',
         'plan-other@example.invalid'),
        ('user_plan_owner', 'plan-owner@example.invalid',
         'plan-owner@example.invalid');
      INSERT INTO access_plans
        (id, slug, name, created_by_user_id)
      VALUES
        ('plan_one', 'plan-one', 'Plan one', 'user_plan_owner'),
        ('plan_two', 'plan-two', 'Plan two', 'user_plan_owner');
      INSERT INTO access_plan_items
        (id, access_plan_id, position, resource_type, resource_id,
         actions_json)
      VALUES
        ('plan_item_one', 'plan_one', 1, 'track', 'track_one',
         '["stream"]'),
        ('plan_item_two', 'plan_two', 1, 'track', 'track_two',
         '["stream"]');
      INSERT INTO access_grant_sets
        (id, access_plan_id, access_plan_revision, grantee_user_id, state,
         reason, granted_by_user_id, activated_at)
      VALUES
        ('grant_set_one', 'plan_one', 1, 'user_plan_customer', 'active',
         'Access', 'user_plan_owner', CURRENT_TIMESTAMP),
        ('grant_set_other', 'plan_one', 1, 'user_plan_other', 'active',
         'Other access', 'user_plan_owner', CURRENT_TIMESTAMP);
      INSERT INTO access_grants
        (id, grantee_user_id, grant_set_id, access_plan_id, access_plan_item_id,
         resource_type, resource_id, actions_json, granted_by_user_id)
      VALUES
        ('grant_plan_one', 'user_plan_customer', 'grant_set_one',
         'plan_one', 'plan_item_one', 'track', 'track_one', '["stream"]',
         'user_plan_owner');
    `);

    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_plan_items
            (id, access_plan_id, position, resource_type, resource_id,
             actions_json)
          VALUES
            ('plan_item_empty_actions', 'plan_one', 2, 'track', 'track_two',
             '[]');
        `),
      /check constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_plan_items
            (id, access_plan_id, position, resource_type, resource_id,
             actions_json)
          VALUES
            ('plan_item_duplicate_position', 'plan_one', 1, 'track',
             'track_two', '["stream"]');
        `),
      /unique constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grants
            (id, grantee_user_id, grant_set_id, access_plan_id,
             access_plan_item_id, resource_type, resource_id, actions_json)
          VALUES
            ('grant_wrong_customer', 'user_plan_customer', 'grant_set_other',
             'plan_one', 'plan_item_one', 'track', 'track_one', '["stream"]');
        `),
      /foreign key constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grants
            (id, grantee_user_id, grant_set_id, access_plan_id,
             access_plan_item_id, resource_type, resource_id, actions_json)
          VALUES
            ('grant_wrong_plan_item', 'user_plan_customer', 'grant_set_one',
             'plan_one', 'plan_item_two', 'track', 'track_two', '["stream"]');
        `),
      /foreign key constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO entitlements
            (id, user_id, source_type, source_id, grant_id, resource_type,
             resource_id, actions_json)
          VALUES
            ('entitlement_wrong_customer', 'user_plan_other', 'grant',
             'grant_plan_one', 'grant_plan_one', 'track', 'track_one',
             '["stream"]');
        `),
      /foreign key constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO entitlements
            (id, user_id, source_type, source_id, grant_id, resource_type,
             resource_id, actions_json)
          VALUES
            ('entitlement_wrong_resource', 'user_plan_customer', 'grant',
             'grant_plan_one', 'grant_plan_one', 'track', 'track_two',
             '["stream"]');
        `),
      /foreign key constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_plan_items
            (id, access_plan_id, position, resource_type, resource_id,
             actions_json)
          VALUES
            ('plan_item_duplicate_resource', 'plan_one', 2, 'track',
             'track_one', '["download"]');
        `),
      /unique constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grant_sets
            (id, access_plan_id, access_plan_revision, grantee_user_id, state, reason,
             granted_by_user_id)
          VALUES
            ('grant_set_missing_marker', 'plan_one', 1, 'user_plan_customer',
             'revoked', 'Invalid', 'user_plan_owner');
        `),
      /check constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grant_sets
            (id, access_plan_id, access_plan_revision, grantee_user_id, starts_at, expires_at,
             reason, granted_by_user_id)
          VALUES
            ('grant_set_invalid_window', 'plan_one', 1, 'user_plan_customer',
             '2026-07-20T00:00:00.000Z', '2026-07-19T00:00:00.000Z',
             'Invalid', 'user_plan_owner');
        `),
      /check constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grants
            (id, grantee_user_id, grant_set_id, access_plan_id, resource_type, resource_id,
             actions_json)
          VALUES
            ('grant_partial_link', 'user_plan_customer', 'grant_set_one', 'plan_one',
             'track', 'track_two', '["stream"]');
        `),
      /check constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grants
            (id, grantee_user_id, grant_set_id, access_plan_id, access_plan_item_id,
             resource_type, resource_id, actions_json)
          VALUES
            ('grant_duplicate_item', 'user_plan_customer', 'grant_set_one',
             'plan_one', 'plan_item_one', 'track', 'track_one', '["stream"]');
        `),
      /unique constraint/i,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grant_sets
            (id, access_plan_id, access_plan_revision, grantee_user_id, reason)
          VALUES
            ('grant_set_missing_plan', 'plan_missing', 1, 'user_plan_customer',
             'Invalid');
        `),
      /foreign key constraint/i,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
