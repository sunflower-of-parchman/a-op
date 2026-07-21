import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const M9_TABLES = [
  "access_grant_templates",
  "commerce_binding_intents",
  "export_manifests",
  "membership_credit_rules",
  "setup_applications",
  "setup_state",
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

test("the M9 foundation creates 99 tables and an inert setup checkpoint", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.ok(migrations.names.length >= 35);
    assert.match(migrations.names[34], /^0034_.+\.sql$/);
    for (const migration of migrations.contents.slice(0, 35))
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
    assert.equal(tables.length, 99);
    assert.deepEqual(
      M9_TABLES.filter((table) => !tables.includes(table)),
      [],
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      19,
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT id, status, proposal_schema_version, last_proposal_hash,
                    last_application_id, state_fingerprint, revision
             FROM setup_state WHERE id = 'setup'`,
          )
          .get(),
      },
      {
        id: "setup",
        status: "unconfigured",
        proposal_schema_version: null,
        last_proposal_hash: null,
        last_application_id: null,
        state_fingerprint: null,
        revision: 1,
      },
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM setup_applications").get()
        .count,
      0,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM export_manifests").get()
        .count,
      0,
    );
  } finally {
    database.close();
  }
});

test("M9 setup and export records enforce hashes, lifecycle, and portable-only state", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (const migration of migrations.contents.slice(0, 35))
      applyMigration(database, migration);
    const proposalHash = "a".repeat(64);
    const approvalHash = "b".repeat(64);
    const sourceFingerprint = "c".repeat(64);
    const resultFingerprint = "d".repeat(64);
    const manifestHash = "e".repeat(64);
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('m9_owner', 'm9-owner@example.invalid',
              'm9-owner@example.invalid', 'active');
      INSERT INTO setup_applications
        (id, application_key, proposal_hash, proposal_schema_version,
         source_state_fingerprint, approval_hash, approved_by_user_id,
         approved_at, status, result_state_fingerprint, operation_count,
         result_json, last_operation_key, completed_at)
      VALUES
        ('setup_application_m9', 'setup:application:m9:0001',
         '${proposalHash}', 1, '${sourceFingerprint}', '${approvalHash}',
         'm9_owner', '2026-07-19T11:00:00.000Z', 'applied',
         '${resultFingerprint}', 14, '{"status":"applied"}',
         'setup:application:m9:0001', '2026-07-19T11:00:01.000Z');
      UPDATE setup_state
      SET status = 'applied',
          proposal_schema_version = 1,
          last_proposal_hash = '${proposalHash}',
          last_application_id = 'setup_application_m9',
          state_fingerprint = '${resultFingerprint}',
          revision = 2,
          updated_by_user_id = 'm9_owner'
      WHERE id = 'setup';
      INSERT INTO export_manifests
        (id, export_key, schema_version, source_state_fingerprint,
         manifest_sha256, file_count, media_object_count, byte_count,
         status, exported_by_user_id, last_operation_key)
      VALUES
        ('export_manifest_m9', 'export:manifest:m9:0001', 19,
         '${resultFingerprint}', '${manifestHash}', 4, 0, 4096, 'ready',
         'm9_owner', 'export:manifest:m9:0001');
    `);

    assert.equal(
      database
        .prepare("SELECT status FROM setup_state WHERE id = 'setup'")
        .get().status,
      "applied",
    );
    assert.equal(
      database
        .prepare(
          "SELECT contains_customer_data FROM export_manifests WHERE id = 'export_manifest_m9'",
        )
        .get().contains_customer_data,
      0,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO setup_applications
            (id, application_key, proposal_hash, proposal_schema_version,
             source_state_fingerprint, approval_hash, approved_by_user_id,
             approved_at, status)
          VALUES ('setup_bad_hash', 'setup:application:m9:bad0', 'live', 1,
                  '${sourceFingerprint}', '${approvalHash}', 'm9_owner',
                  '2026-07-19T11:01:00.000Z', 'applying')`),
      /CHECK constraint failed: setup_applications_proposal_hash_valid/,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO export_manifests
            (id, export_key, schema_version, source_state_fingerprint,
             manifest_sha256, status, contains_customer_data,
             exported_by_user_id)
          VALUES ('export_customer_data', 'export:manifest:m9:bad0', 19,
                  '${sourceFingerprint}', '${manifestHash}', 'ready', 1,
                  'm9_owner')`),
      /CHECK constraint failed: export_manifests_portable_only/,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("the M9 migrations preserve existing artist, access, and commerce records", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (const migration of migrations.contents.slice(0, 29)) {
      applyMigration(database, migration);
    }
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('m9_preserved_user', 'm9-preserved@example.invalid',
              'm9-preserved@example.invalid', 'active');
      INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         details_json, result_json)
      VALUES ('m9_preserved_audit', 'm9_preserved_user', 'setup.preflight',
              'installation', 'installation', '{}', '{}');
      INSERT INTO access_plans
        (id, slug, name, description, state, revision)
      VALUES ('m9_preserved_access', 'm9-preserved-access',
              'Preserved access', 'Existing portable definition.',
              'active', 3);
    `);

    for (const migration of migrations.contents.slice(29, 35)) {
      applyMigration(database, migration);
    }
    assertClean(database);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE id = 'm9_preserved_user'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE id = 'm9_preserved_audit'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT revision FROM access_plans WHERE id = 'm9_preserved_access'",
        )
        .get().revision,
      3,
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      19,
    );
  } finally {
    database.close();
  }
});

test("access grant templates bind an exact access-plan revision and remain operation-idempotent", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (const migration of migrations.contents.slice(0, 35))
      applyMigration(database, migration);
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('m9_template_owner', 'm9-template-owner@example.invalid',
              'm9-template-owner@example.invalid', 'active');
      INSERT INTO access_plans
        (id, slug, name, description, state, revision)
      VALUES ('m9_template_plan', 'm9-template-plan', 'Template plan',
              'A fictional protected-delivery definition.', 'active', 2);
      INSERT INTO access_grant_templates
        (id, template_key, label, access_plan_id, access_plan_revision,
         default_duration_days, created_by_user_id, last_operation_key)
      VALUES ('m9_template', 'supporter-access', 'Supporter access',
              'm9_template_plan', 2, 30, 'm9_template_owner',
              'setup:customer-access:m9-template');
    `);

    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT template_key, access_plan_id, access_plan_revision,
                    default_duration_days, state, revision
             FROM access_grant_templates WHERE id = 'm9_template'`,
          )
          .get(),
      },
      {
        template_key: "supporter-access",
        access_plan_id: "m9_template_plan",
        access_plan_revision: 2,
        default_duration_days: 30,
        state: "active",
        revision: 1,
      },
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grant_templates
            (id, template_key, label, access_plan_id, access_plan_revision)
          VALUES ('m9_bad_template_revision', 'bad-revision', 'Bad revision',
                  'm9_template_plan', 1)`),
      /FOREIGN KEY constraint failed/,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grant_templates
            (id, template_key, label, access_plan_id, access_plan_revision,
             default_duration_days)
          VALUES ('m9_bad_template_duration', 'bad-duration', 'Bad duration',
                  'm9_template_plan', 2, 0)`),
      /CHECK constraint failed: access_grant_templates_duration_valid/,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO access_grant_templates
            (id, template_key, label, access_plan_id, access_plan_revision,
             last_operation_key)
          VALUES ('m9_duplicate_operation', 'duplicate-operation',
                  'Duplicate operation', 'm9_template_plan', 2,
                  'setup:customer-access:m9-template')`),
      /UNIQUE constraint failed: access_grant_templates.last_operation_key/,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("membership credit rules bind one exact plan revision with cadence and operation integrity", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (const migration of migrations.contents.slice(0, 35))
      applyMigration(database, migration);
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('m9_credit_owner', 'm9-credit-owner@example.invalid',
              'm9-credit-owner@example.invalid', 'active');
      INSERT INTO membership_plans
        (id, slug, state, current_revision, created_by_user_id)
      VALUES ('m9_credit_membership', 'm9-credit-membership', 'active', 2,
              'm9_credit_owner');
      INSERT INTO membership_plan_revisions
        (id, membership_plan_id, revision, name, download_credits,
         license_credits, created_by_user_id)
      VALUES ('m9_credit_membership_r2', 'm9_credit_membership', 2,
              'Fictional credit membership', 2, 1, 'm9_credit_owner');
      INSERT INTO subscription_plans
        (id, slug, name, membership_plan_id, membership_plan_revision_id,
         membership_plan_revision, billing_interval, interval_count, state,
         revision, created_by_user_id)
      VALUES ('m9_credit_subscription', 'm9-credit-subscription',
              'Fictional monthly credits', 'm9_credit_membership',
              'm9_credit_membership_r2', 2, 'month', 1, 'active', 3,
              'm9_credit_owner');
      INSERT INTO membership_credit_rules
        (id, rule_key, credit_kind, membership_plan_id,
         membership_plan_revision_id, membership_plan_revision, amount,
         cadence, created_by_user_id, last_operation_key)
      VALUES ('m9_membership_download_rule', 'membership-download',
              'download', 'm9_credit_membership',
              'm9_credit_membership_r2', 2, 2, 'once', 'm9_credit_owner',
              'setup:credit:membership-download');
      INSERT INTO membership_credit_rules
        (id, rule_key, credit_kind, subscription_plan_id,
         subscription_plan_revision, amount, cadence, created_by_user_id,
         last_operation_key)
      VALUES ('m9_subscription_license_rule', 'subscription-license',
              'license', 'm9_credit_subscription', 3, 1, 'month',
              'm9_credit_owner', 'setup:credit:subscription-license');
    `);

    assert.deepEqual(
      database
        .prepare(
          `SELECT rule_key, credit_kind, amount, cadence, state, revision,
                  membership_plan_id, membership_plan_revision,
                  subscription_plan_id, subscription_plan_revision
           FROM membership_credit_rules ORDER BY rule_key`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          rule_key: "membership-download",
          credit_kind: "download",
          amount: 2,
          cadence: "once",
          state: "active",
          revision: 1,
          membership_plan_id: "m9_credit_membership",
          membership_plan_revision: 2,
          subscription_plan_id: null,
          subscription_plan_revision: null,
        },
        {
          rule_key: "subscription-license",
          credit_kind: "license",
          amount: 1,
          cadence: "month",
          state: "active",
          revision: 1,
          membership_plan_id: null,
          membership_plan_revision: null,
          subscription_plan_id: "m9_credit_subscription",
          subscription_plan_revision: 3,
        },
      ],
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO membership_credit_rules
            (id, rule_key, credit_kind, membership_plan_id,
             membership_plan_revision_id, membership_plan_revision, amount,
             cadence)
          VALUES ('m9_bad_credit_cadence', 'bad-credit-cadence', 'license',
                  'm9_credit_membership', 'm9_credit_membership_r2', 2, 1,
                  'month')`),
      /CHECK constraint failed: membership_credit_rules_subject_valid/,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO membership_credit_rules
            (id, rule_key, credit_kind, subscription_plan_id,
             subscription_plan_revision, amount, cadence)
          VALUES ('m9_bad_credit_revision', 'bad-credit-revision', 'download',
                  'm9_credit_subscription', 2, 1, 'month')`),
      /FOREIGN KEY constraint failed/,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO membership_credit_rules
            (id, rule_key, credit_kind, subscription_plan_id,
             subscription_plan_revision, amount, cadence,
             last_operation_key)
          VALUES ('m9_duplicate_credit_operation',
                  'duplicate-credit-operation', 'download',
                  'm9_credit_subscription', 3, 1, 'month',
                  'setup:credit:membership-download')`),
      /UNIQUE constraint failed: membership_credit_rules.last_operation_key/,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("commerce binding intents preserve exact provider-neutral Test Mode subjects and prices", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (const migration of migrations.contents.slice(0, 35))
      applyMigration(database, migration);
    database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES ('m9_binding_owner', 'm9-binding-owner@example.invalid',
              'm9-binding-owner@example.invalid', 'active');
      INSERT INTO tracks
        (id, slug, draft_revision_id, publication_state, version)
      VALUES ('m9_binding_track', 'm9-binding-track',
              'm9_binding_track_r1', 'draft', 1);
      INSERT INTO track_revisions
        (id, track_id, revision, title, description, copyright_notice,
         view_mode, stream_mode, download_mode)
      VALUES ('m9_binding_track_r1', 'm9_binding_track', 1,
              'Fictional binding track', '', '', 'public', 'unavailable',
              'unavailable');
      INSERT INTO membership_plans
        (id, slug, state, current_revision, created_by_user_id)
      VALUES ('m9_binding_membership', 'm9-binding-membership', 'draft', 1,
              'm9_binding_owner');
      INSERT INTO membership_plan_revisions
        (id, membership_plan_id, revision, name, description,
         created_by_user_id)
      VALUES ('m9_binding_membership_r1', 'm9_binding_membership', 1,
              'Fictional membership', '', 'm9_binding_owner');
      INSERT INTO subscription_plans
        (id, slug, name, membership_plan_id, membership_plan_revision_id,
         membership_plan_revision, billing_interval, interval_count, state,
         revision, created_by_user_id)
      VALUES ('m9_binding_subscription', 'm9-binding-subscription',
              'Fictional subscription', 'm9_binding_membership',
              'm9_binding_membership_r1', 1, 'month', 1, 'draft', 1,
              'm9_binding_owner');
      INSERT INTO license_terms
        (id, slug, state, current_version, created_by_user_id)
      VALUES ('m9_binding_terms', 'm9-binding-terms', 'draft', 1,
              'm9_binding_owner');
      INSERT INTO license_terms_versions
        (id, license_terms_id, version, name, title, general_terms,
         created_by_user_id)
      VALUES ('m9_binding_terms_v1', 'm9_binding_terms', 1,
              'Fictional terms', 'Fictional terms', 'Fictional terms body.',
              'm9_binding_owner');
      INSERT INTO license_options
        (id, license_terms_id, license_terms_version_id,
         license_terms_version, option_key, label, usage_category,
         allowed_media_json, attribution_required, exclusive,
         requires_approval, license_credit_cost, includes_track_download,
         position)
      VALUES ('m9_binding_option', 'm9_binding_terms',
              'm9_binding_terms_v1', 1, 'film', 'Film', 'film', '["film"]',
              0, 0, 0, 1, 1, 1);

      INSERT INTO commerce_binding_intents
        (id, intent_key, intent_kind, name, membership_plan_id,
         membership_plan_revision_id, membership_plan_revision, amount_minor,
         currency, billing_interval, interval_count, created_by_user_id,
         last_operation_key)
      VALUES ('m9_binding_membership_intent', 'membership-supporter',
              'membership', 'Supporter', 'm9_binding_membership',
              'm9_binding_membership_r1', 1, 1200, 'USD', 'one_time', 1,
              'm9_binding_owner', 'setup:binding:membership-supporter');
      INSERT INTO commerce_binding_intents
        (id, intent_key, intent_kind, name, subscription_plan_id,
         subscription_plan_revision, amount_minor, currency,
         billing_interval, interval_count, created_by_user_id,
         last_operation_key)
      VALUES ('m9_binding_subscription_intent', 'subscription-supporter',
              'subscription', 'Supporter monthly', 'm9_binding_subscription',
              1, 900, 'USD', 'month', 1, 'm9_binding_owner',
              'setup:binding:subscription-supporter');
      INSERT INTO commerce_binding_intents
        (id, intent_key, intent_kind, name, track_id, track_revision_id,
         track_revision, license_terms_id, license_terms_version_id,
         license_terms_version, license_option_id, amount_minor, currency,
         billing_interval, interval_count, created_by_user_id,
         last_operation_key)
      VALUES ('m9_binding_license_intent', 'license-film', 'license',
              'Film license', 'm9_binding_track', 'm9_binding_track_r1', 1,
              'm9_binding_terms', 'm9_binding_terms_v1', 1,
              'm9_binding_option', 2400, 'USD', 'one_time', 1,
              'm9_binding_owner', 'setup:binding:license-film');
    `);

    assert.deepEqual(
      database
        .prepare(
          `SELECT intent_key, intent_kind, amount_minor, currency,
                  billing_interval, binding_state, stripe_environment,
                  livemode, commerce_product_id, commerce_price_id
           FROM commerce_binding_intents ORDER BY intent_key`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          intent_key: "license-film",
          intent_kind: "license",
          amount_minor: 2400,
          currency: "USD",
          billing_interval: "one_time",
          binding_state: "pending",
          stripe_environment: "test",
          livemode: 0,
          commerce_product_id: null,
          commerce_price_id: null,
        },
        {
          intent_key: "membership-supporter",
          intent_kind: "membership",
          amount_minor: 1200,
          currency: "USD",
          billing_interval: "one_time",
          binding_state: "pending",
          stripe_environment: "test",
          livemode: 0,
          commerce_product_id: null,
          commerce_price_id: null,
        },
        {
          intent_key: "subscription-supporter",
          intent_kind: "subscription",
          amount_minor: 900,
          currency: "USD",
          billing_interval: "month",
          binding_state: "pending",
          stripe_environment: "test",
          livemode: 0,
          commerce_product_id: null,
          commerce_price_id: null,
        },
      ],
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO commerce_binding_intents
            (id, intent_key, intent_kind, name, membership_plan_id,
             membership_plan_revision_id, membership_plan_revision,
             amount_minor, currency, billing_interval, stripe_environment,
             livemode)
          VALUES ('m9_live_binding', 'membership-live', 'membership', 'Live',
                  'm9_binding_membership', 'm9_binding_membership_r1', 1,
                  100, 'USD', 'one_time', 'live', 1)`),
      /CHECK constraint failed: commerce_binding_intents_test_only/,
    );
    assert.throws(
      () =>
        database.exec(`
          INSERT INTO commerce_binding_intents
            (id, intent_key, intent_kind, name, subscription_plan_id,
             subscription_plan_revision, amount_minor, currency,
             billing_interval, binding_state)
          VALUES ('m9_bad_bound_binding', 'subscription-bad-bound',
                  'subscription', 'Bad bound', 'm9_binding_subscription', 1,
                  100, 'USD', 'month', 'bound')`),
      /CHECK constraint failed: commerce_binding_intents_binding_valid/,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});
