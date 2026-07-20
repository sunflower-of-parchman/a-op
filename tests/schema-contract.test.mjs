import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { D1_BOOTSTRAP_STATEMENTS } from "../db/bootstrap.ts";
import { MODULE_KEYS } from "../lib/modules/index.ts";

const m1Tables = [
  "audit_events",
  "media_objects",
  "profiles",
  "role_assignments",
  "roles",
  "runtime_proofs",
  "users",
];

const expectedTables = [
  "access_grant_sets",
  "access_grant_templates",
  "access_grants",
  "access_plan_items",
  "access_plans",
  "artist_config",
  "artist_config_revisions",
  "artist_domains",
  "artist_modules",
  "audit_events",
  "checkout_sessions",
  "collection_revisions",
  "collection_tracks",
  "collections",
  "commerce_binding_intents",
  "commerce_events",
  "commerce_prices",
  "commerce_products",
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
  "credit_accounts",
  "credit_grant_lots",
  "credit_ledger_entries",
  "credit_reservation_allocations",
  "credit_reservations",
  "credits",
  "download_events",
  "editor_permissions",
  "editorial_posts",
  "entitlements",
  "export_manifests",
  "favorites",
  "fulfillment_events",
  "installation_state",
  "issued_licenses",
  "legal_document_versions",
  "legal_documents",
  "lesson_items",
  "lessons",
  "license_document_jobs",
  "license_documents",
  "license_events",
  "license_offers",
  "license_options",
  "license_requests",
  "license_terms",
  "license_terms_versions",
  "listening_history",
  "media_derivatives",
  "media_job_attempts",
  "media_jobs",
  "media_objects",
  "membership_credit_rules",
  "membership_plan_revisions",
  "membership_plans",
  "memberships",
  "module_registry_state",
  "navigation_items",
  "navigation_sets",
  "operational_failures",
  "order_items",
  "orders",
  "page_revision_sections",
  "page_revisions",
  "pages",
  "playlist_tracks",
  "playlists",
  "profiles",
  "release_revisions",
  "release_tracks",
  "releases",
  "role_assignments",
  "roles",
  "runtime_proofs",
  "setup_applications",
  "setup_state",
  "subscription_events",
  "subscription_plans",
  "subscriptions",
  "telemetry_aggregate_days",
  "telemetry_daily_aggregates",
  "telemetry_events",
  "telemetry_settings",
  "track_revisions",
  "tracks",
  "update_reads",
  "updates",
  "users",
  "video_revisions",
  "video_transcripts",
  "videos",
];

const expectedNavigationItemSeeds = [
  "nav_footer_1_faq",
  "nav_footer_1_privacy",
  "nav_footer_1_repository",
  "nav_footer_1_terms",
  "nav_primary_1_about",
  "nav_primary_1_contact",
  "nav_primary_1_courses",
  "nav_primary_1_licensing",
  "nav_primary_1_membership",
  "nav_primary_1_music",
  "nav_primary_1_videos",
  "nav_primary_1_whats_new",
];

const expectedPageSeeds = [
  "page_about",
  "page_contact",
  "page_courses",
  "page_faq",
  "page_licensing",
  "page_membership",
  "page_music",
  "page_privacy",
  "page_terms",
  "page_videos",
  "page_whats_new",
];

function extractSeedIds(sql, table) {
  return [
    ...sql.matchAll(
      new RegExp(
        "INSERT INTO `" + table + "` \\([^)]*\\) VALUES \\(\\s*'([^']+)'",
        "g",
      ),
    ),
  ]
    .map((match) => match[1])
    .sort();
}

async function readForwardMigrations() {
  const directory = new URL("../drizzle/", import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  assert.ok(names.length > 0, "At least one generated migration is required.");

  const contents = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  return { contents, names, sql: contents.join("\n") };
}

function applyMigration(database, sql) {
  for (const statement of sql
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    database.exec(statement);
  }
}

function applyLegacyCascadeMigration(database, sql) {
  for (const statement of sql
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (statement.startsWith("CREATE TABLE `__new_navigation_sets`")) {
      database.exec("PRAGMA foreign_keys=ON");
    }
    database.exec(statement);
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

function neutralChildState(database) {
  return {
    navigationItems: database
      .prepare(
        `SELECT id, navigation_set_id, version, item_key, label, href,
                position, module_key, external
         FROM navigation_items
         ORDER BY id`,
      )
      .all()
      .map((row) => ({ ...row })),
    pageRevisions: database
      .prepare(
        `SELECT id, page_id, revision, module_key, kind, title,
                introduction, body_text, created_by_user_id
         FROM page_revisions
         ORDER BY id`,
      )
      .all()
      .map((row) => ({ ...row })),
  };
}

test("schema and forward migrations cover the authority and music foundations", async () => {
  const [
    schema,
    migrations,
    journalJson,
    m2SnapshotJson,
    repairSnapshotJson,
    musicSnapshotJson,
    integritySnapshotJson,
    constraintsSnapshotJson,
    domainChecksSnapshotJson,
    customerSnapshotJson,
    accessSnapshotJson,
    anonymousDownloadSnapshotJson,
    anonymousDownloadConstraintSnapshotJson,
    accessPlanSnapshotJson,
    commerceSnapshotJson,
    orderSourceSnapshotJson,
    manualEntitlementSnapshotJson,
    m7FoundationSnapshotJson,
    m7AccessSnapshotJson,
    m7CourseReferenceSnapshotJson,
    structuredContentSnapshotJson,
    privateOrderUpdateSnapshotJson,
    contactDetailsSnapshotJson,
    m8FoundationSnapshotJson,
    m8TelemetryTotalsSnapshotJson,
    m8LegalPointersSnapshotJson,
    m9SetupSnapshotJson,
    m9AccessTemplateSnapshotJson,
    m9CommerceBindingSnapshotJson,
    m9CreditRuleSnapshotJson,
  ] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readForwardMigrations(),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/meta/0004_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0005_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0006_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0007_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0008_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0009_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0010_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0011_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0012_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0013_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0014_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0015_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0016_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0017_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0018_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0019_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0020_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0021_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0022_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0023_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0024_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0025_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0026_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0027_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0028_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0029_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0030_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0031_snapshot.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/meta/0032_snapshot.json", import.meta.url),
      "utf8",
    ),
  ]);

  const schemaTables = [...schema.matchAll(/sqliteTable\(\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
  const migrationTables = [
    ...migrations.sql.matchAll(/CREATE TABLE `([^`]+)`/g),
  ]
    .map((match) => match[1])
    .filter((table) => !table.startsWith("__new_"))
    .filter((table, index, tables) => tables.indexOf(table) === index)
    .sort();
  const bootstrapTables = D1_BOOTSTRAP_STATEMENTS.filter((statement) =>
    statement.startsWith("CREATE TABLE IF NOT EXISTS"),
  )
    .map(
      (statement) =>
        statement.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/)?.[1],
    )
    .filter(Boolean)
    .sort();

  assert.deepEqual(schemaTables, expectedTables);
  assert.deepEqual(migrationTables, expectedTables);
  assert.deepEqual(bootstrapTables, m1Tables);

  for (const role of ["owner", "editor", "customer"]) {
    assert.match(migrations.sql, new RegExp(`VALUES \\('${role}'`));
    assert.ok(
      D1_BOOTSTRAP_STATEMENTS.some((statement) =>
        statement.includes(`VALUES ('${role}'`),
      ),
    );
  }

  assert.deepEqual(
    extractSeedIds(migrations.sql, "artist_modules"),
    [...MODULE_KEYS].sort(),
  );
  assert.deepEqual(extractSeedIds(migrations.sql, "navigation_sets"), [
    "footer",
    "primary",
  ]);
  assert.deepEqual(
    extractSeedIds(migrations.sql, "navigation_items"),
    expectedNavigationItemSeeds,
  );
  assert.deepEqual(extractSeedIds(migrations.sql, "pages"), expectedPageSeeds);
  assert.deepEqual(
    extractSeedIds(migrations.sql, "page_revisions"),
    expectedPageSeeds.map((id) => `${id}_revision_1`),
  );
  assert.deepEqual(extractSeedIds(migrations.sql, "installation_state"), [
    "installation",
  ]);
  assert.deepEqual(extractSeedIds(migrations.sql, "module_registry_state"), [
    "registry",
  ]);
  assert.deepEqual(extractSeedIds(migrations.sql, "artist_config"), ["artist"]);
  assert.deepEqual(extractSeedIds(migrations.sql, "artist_config_revisions"), [
    "artist_revision_1",
  ]);
  assert.match(
    migrations.sql,
    /INSERT INTO `setup_state`[\s\S]*?VALUES \('setup', 'unconfigured'/,
  );

  assert.doesNotMatch(
    migrations.sql,
    /INSERT INTO `(?:users|role_assignments|editor_permissions)`/,
  );
  assert.match(
    migrations.sql,
    /WHERE "role_assignments"\."revoked_at" is null/,
  );
  assert.match(
    migrations.sql,
    /WHERE "editor_permissions"\."revoked_at" is null/,
  );
  assert.match(migrations.sql, /ALTER TABLE `profiles` ADD `revision`/);
  assert.equal(migrations.names.length, 34);
  assert.match(migrations.names.at(-1), /^0033_.+\.sql$/);
  assert.ok(
    migrations.names.every((name) => /^\d+_.+\.sql$/.test(name)),
    "Migration discovery must remain independent of generated names.",
  );

  const journal = JSON.parse(journalJson);
  assert.deepEqual(
    journal.entries.map(({ tag }) => `${tag}.sql`),
    migrations.names,
  );
  assert.deepEqual(
    journal.entries.map(({ idx }) => idx),
    migrations.names.map((_, index) => index),
  );

  const m2Snapshot = JSON.parse(m2SnapshotJson);
  const repairSnapshot = JSON.parse(repairSnapshotJson);
  const musicSnapshot = JSON.parse(musicSnapshotJson);
  const integritySnapshot = JSON.parse(integritySnapshotJson);
  const constraintsSnapshot = JSON.parse(constraintsSnapshotJson);
  const domainChecksSnapshot = JSON.parse(domainChecksSnapshotJson);
  const customerSnapshot = JSON.parse(customerSnapshotJson);
  const accessSnapshot = JSON.parse(accessSnapshotJson);
  const anonymousDownloadSnapshot = JSON.parse(anonymousDownloadSnapshotJson);
  const anonymousDownloadConstraintSnapshot = JSON.parse(
    anonymousDownloadConstraintSnapshotJson,
  );
  const accessPlanSnapshot = JSON.parse(accessPlanSnapshotJson);
  const commerceSnapshot = JSON.parse(commerceSnapshotJson);
  const orderSourceSnapshot = JSON.parse(orderSourceSnapshotJson);
  const manualEntitlementSnapshot = JSON.parse(manualEntitlementSnapshotJson);
  const m7FoundationSnapshot = JSON.parse(m7FoundationSnapshotJson);
  const m7AccessSnapshot = JSON.parse(m7AccessSnapshotJson);
  const m7CourseReferenceSnapshot = JSON.parse(m7CourseReferenceSnapshotJson);
  const structuredContentSnapshot = JSON.parse(structuredContentSnapshotJson);
  const privateOrderUpdateSnapshot = JSON.parse(privateOrderUpdateSnapshotJson);
  const contactDetailsSnapshot = JSON.parse(contactDetailsSnapshotJson);
  const m8FoundationSnapshot = JSON.parse(m8FoundationSnapshotJson);
  const m8TelemetryTotalsSnapshot = JSON.parse(m8TelemetryTotalsSnapshotJson);
  const m8LegalPointersSnapshot = JSON.parse(m8LegalPointersSnapshotJson);
  const m9SetupSnapshot = JSON.parse(m9SetupSnapshotJson);
  const m9AccessTemplateSnapshot = JSON.parse(m9AccessTemplateSnapshotJson);
  const m9CommerceBindingSnapshot = JSON.parse(m9CommerceBindingSnapshotJson);
  const m9CreditRuleSnapshot = JSON.parse(m9CreditRuleSnapshotJson);
  const m2SnapshotId = m2Snapshot.id;
  const repairSnapshotId = repairSnapshot.id;
  const repairSnapshotPreviousId = repairSnapshot.prevId;
  const m2SnapshotShape = { ...m2Snapshot };
  const repairSnapshotShape = { ...repairSnapshot };
  delete m2SnapshotShape.id;
  delete m2SnapshotShape.prevId;
  delete repairSnapshotShape.id;
  delete repairSnapshotShape.prevId;
  assert.notEqual(repairSnapshotId, m2SnapshotId);
  assert.equal(repairSnapshotPreviousId, m2SnapshotId);
  assert.deepEqual(repairSnapshotShape, m2SnapshotShape);
  assert.equal(musicSnapshot.prevId, repairSnapshotId);
  assert.notEqual(musicSnapshot.id, repairSnapshotId);
  assert.equal(integritySnapshot.prevId, musicSnapshot.id);
  assert.notEqual(integritySnapshot.id, musicSnapshot.id);
  assert.equal(constraintsSnapshot.prevId, integritySnapshot.id);
  assert.notEqual(constraintsSnapshot.id, integritySnapshot.id);
  assert.equal(domainChecksSnapshot.prevId, constraintsSnapshot.id);
  assert.notEqual(domainChecksSnapshot.id, constraintsSnapshot.id);
  assert.equal(customerSnapshot.prevId, domainChecksSnapshot.id);
  assert.notEqual(customerSnapshot.id, domainChecksSnapshot.id);
  assert.equal(accessSnapshot.prevId, customerSnapshot.id);
  assert.notEqual(accessSnapshot.id, customerSnapshot.id);
  assert.equal(anonymousDownloadSnapshot.prevId, accessSnapshot.id);
  assert.notEqual(anonymousDownloadSnapshot.id, accessSnapshot.id);
  assert.equal(
    anonymousDownloadConstraintSnapshot.prevId,
    anonymousDownloadSnapshot.id,
  );
  assert.notEqual(
    anonymousDownloadConstraintSnapshot.id,
    anonymousDownloadSnapshot.id,
  );
  assert.equal(
    accessPlanSnapshot.prevId,
    anonymousDownloadConstraintSnapshot.id,
  );
  assert.notEqual(
    accessPlanSnapshot.id,
    anonymousDownloadConstraintSnapshot.id,
  );
  assert.equal(commerceSnapshot.prevId, accessPlanSnapshot.id);
  assert.notEqual(commerceSnapshot.id, accessPlanSnapshot.id);
  assert.equal(orderSourceSnapshot.prevId, commerceSnapshot.id);
  assert.notEqual(orderSourceSnapshot.id, commerceSnapshot.id);
  assert.equal(manualEntitlementSnapshot.prevId, orderSourceSnapshot.id);
  assert.notEqual(manualEntitlementSnapshot.id, orderSourceSnapshot.id);
  assert.equal(m7FoundationSnapshot.prevId, manualEntitlementSnapshot.id);
  assert.notEqual(m7FoundationSnapshot.id, manualEntitlementSnapshot.id);
  assert.equal(m7AccessSnapshot.prevId, m7FoundationSnapshot.id);
  assert.notEqual(m7AccessSnapshot.id, m7FoundationSnapshot.id);
  assert.equal(m7CourseReferenceSnapshot.prevId, m7AccessSnapshot.id);
  assert.notEqual(m7CourseReferenceSnapshot.id, m7AccessSnapshot.id);
  assert.equal(structuredContentSnapshot.prevId, m7CourseReferenceSnapshot.id);
  assert.notEqual(structuredContentSnapshot.id, m7CourseReferenceSnapshot.id);
  assert.equal(privateOrderUpdateSnapshot.prevId, structuredContentSnapshot.id);
  assert.notEqual(privateOrderUpdateSnapshot.id, structuredContentSnapshot.id);
  assert.equal(contactDetailsSnapshot.prevId, privateOrderUpdateSnapshot.id);
  assert.notEqual(contactDetailsSnapshot.id, privateOrderUpdateSnapshot.id);
  assert.equal(m8FoundationSnapshot.prevId, contactDetailsSnapshot.id);
  assert.notEqual(m8FoundationSnapshot.id, contactDetailsSnapshot.id);
  assert.equal(m8TelemetryTotalsSnapshot.prevId, m8FoundationSnapshot.id);
  assert.notEqual(m8TelemetryTotalsSnapshot.id, m8FoundationSnapshot.id);
  assert.equal(m8LegalPointersSnapshot.prevId, m8TelemetryTotalsSnapshot.id);
  assert.notEqual(m8LegalPointersSnapshot.id, m8TelemetryTotalsSnapshot.id);
  assert.equal(m9SetupSnapshot.prevId, m8LegalPointersSnapshot.id);
  assert.notEqual(m9SetupSnapshot.id, m8LegalPointersSnapshot.id);
  assert.equal(m9AccessTemplateSnapshot.prevId, m9SetupSnapshot.id);
  assert.notEqual(m9AccessTemplateSnapshot.id, m9SetupSnapshot.id);
  assert.equal(m9CommerceBindingSnapshot.prevId, m9AccessTemplateSnapshot.id);
  assert.notEqual(m9CommerceBindingSnapshot.id, m9AccessTemplateSnapshot.id);
  assert.equal(m9CreditRuleSnapshot.prevId, m9CommerceBindingSnapshot.id);
  assert.notEqual(m9CreditRuleSnapshot.id, m9CommerceBindingSnapshot.id);
});

test("forward migrations preserve authority data and add music and customer schemas", async () => {
  const migrations = await readForwardMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    for (let index = 0; index < migrations.contents.length; index += 1) {
      if (/^0006_/.test(migrations.names[index])) {
        database.exec(
          `INSERT INTO media_objects
            (id, object_key, kind, visibility, content_type, byte_length, etag)
           VALUES
            ('media_schema_preservation', 'originals/schema-preservation', 'audio',
             'protected', 'audio/mpeg', 24, 'etag-preserved')`,
        );
      }
      applyMigration(database, migrations.contents[index]);
    }

    assert.deepEqual(
      database
        .prepare("SELECT id FROM navigation_items ORDER BY id")
        .all()
        .map(({ id }) => id),
      expectedNavigationItemSeeds,
    );
    assert.deepEqual(
      database
        .prepare("SELECT id FROM page_revisions ORDER BY id")
        .all()
        .map(({ id }) => id),
      expectedPageSeeds.map((id) => `${id}_revision_1`),
    );

    const revisionMetadata = database
      .prepare(
        `SELECT id, module_key, kind
         FROM page_revisions
         WHERE id IN (
           'page_courses_revision_1',
           'page_music_revision_1',
           'page_privacy_revision_1'
         )
         ORDER BY id`,
      )
      .all()
      .map(({ id, module_key: moduleKey, kind }) => ({ id, moduleKey, kind }));
    assert.deepEqual(revisionMetadata, [
      {
        id: "page_courses_revision_1",
        moduleKey: "courses",
        kind: "standard",
      },
      { id: "page_music_revision_1", moduleKey: null, kind: "system" },
      { id: "page_privacy_revision_1", moduleKey: null, kind: "legal" },
    ]);
    assert.equal(
      database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM page_revisions
           JOIN pages ON pages.id = page_revisions.page_id
           WHERE page_revisions.module_key IS NOT pages.module_key
              OR page_revisions.kind IS NOT pages.kind`,
        )
        .get().count,
      0,
    );

    const installation = database
      .prepare(
        "SELECT schema_version, last_operation_key FROM installation_state WHERE id = 'installation'",
      )
      .get();
    assert.equal(installation.schema_version, 19);
    assert.equal(installation.last_operation_key, null);

    const registry = database
      .prepare(
        "SELECT revision, last_operation_key FROM module_registry_state WHERE id = 'registry'",
      )
      .get();
    assert.equal(registry.revision, 1);
    assert.equal(registry.last_operation_key, null);

    for (const table of [
      "artist_config",
      "editor_permissions",
      "installation_state",
      "module_registry_state",
      "navigation_sets",
      "pages",
      "profiles",
      "role_assignments",
    ]) {
      assert.ok(
        tableColumns(database, table).has("last_operation_key"),
        `${table} must retain its operation marker.`,
      );
    }

    const revisionColumns = tableColumns(database, "page_revisions");
    assert.ok(revisionColumns.has("module_key"));
    assert.equal(revisionColumns.get("kind").notnull, 1);
    assert.equal(revisionColumns.get("kind").dflt_value, "'standard'");
    const preservedMedia = database
      .prepare(
        `SELECT object_key, status, approval_state, source_version,
                content_type, byte_length, etag,
                created_at = updated_at AS timestamps_preserved
         FROM media_objects
         WHERE id = 'media_schema_preservation'`,
      )
      .get();
    assert.deepEqual(
      { ...preservedMedia },
      {
        object_key: "originals/schema-preservation",
        status: "ready",
        approval_state: "pending",
        source_version: 1,
        content_type: "audio/mpeg",
        byte_length: 24,
        etag: "etag-preserved",
        timestamps_preserved: 1,
      },
    );
    const permissionSql = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'editor_permissions'",
      )
      .get().sql;
    assert.match(permissionSql, /catalog\.write/);
    assert.match(permissionSql, /media\.write/);
    for (const table of [
      "collections",
      "collection_revisions",
      "collection_tracks",
      "credits",
      "media_derivatives",
      "media_jobs",
      "media_job_attempts",
      "releases",
      "release_revisions",
      "release_tracks",
      "tracks",
      "track_revisions",
    ]) {
      assert.equal(
        database.prepare(`SELECT COUNT(*) AS count FROM \`${table}\``).get()
          .count,
        0,
      );
    }
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("repair migration restores an already-damaged M2 seed without duplication", async () => {
  const migrations = await readForwardMigrations();
  const repairIndex = migrations.names.findIndex((name) => /^0005_/.test(name));
  assert.equal(repairIndex, 5);

  const database = new DatabaseSync(":memory:");
  try {
    for (let index = 0; index < repairIndex; index += 1) {
      if (/^0003_/.test(migrations.names[index])) {
        applyLegacyCascadeMigration(database, migrations.contents[index]);
      } else {
        applyMigration(database, migrations.contents[index]);
      }
    }

    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM navigation_items").get()
        .count,
      0,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM page_revisions").get()
        .count,
      0,
    );

    applyMigration(database, migrations.contents[repairIndex]);
    applyMigration(database, migrations.contents[repairIndex]);
    for (
      let index = repairIndex + 1;
      index < migrations.contents.length;
      index += 1
    ) {
      applyMigration(database, migrations.contents[index]);
    }

    assert.deepEqual(
      database
        .prepare("SELECT id FROM navigation_items ORDER BY id")
        .all()
        .map(({ id }) => id),
      expectedNavigationItemSeeds,
    );
    assert.deepEqual(
      database
        .prepare("SELECT id FROM page_revisions ORDER BY id")
        .all()
        .map(({ id }) => id),
      expectedPageSeeds.map((id) => `${id}_revision_1`),
    );
    assert.equal(
      database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM page_revisions
           JOIN pages ON pages.id = page_revisions.page_id
           WHERE page_revisions.module_key IS NOT pages.module_key
              OR page_revisions.kind IS NOT pages.kind`,
        )
        .get().count,
      0,
    );

    const correctedDatabase = new DatabaseSync(":memory:");
    try {
      for (const migration of migrations.contents) {
        applyMigration(correctedDatabase, migration);
      }
      assert.deepEqual(
        neutralChildState(database),
        neutralChildState(correctedDatabase),
      );
    } finally {
      correctedDatabase.close();
    }

    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("repair migration leaves changed parents and replacement children untouched", async () => {
  const migrations = await readForwardMigrations();
  const repairIndex = migrations.names.findIndex((name) => /^0005_/.test(name));
  const database = new DatabaseSync(":memory:");

  try {
    for (let index = 0; index < repairIndex; index += 1) {
      if (/^0003_/.test(migrations.names[index])) {
        applyLegacyCascadeMigration(database, migrations.contents[index]);
      } else {
        applyMigration(database, migrations.contents[index]);
      }
    }

    database.exec(
      `UPDATE navigation_sets
       SET revision = 2, last_operation_key = 'artist-nav-operation'
       WHERE id = 'primary'`,
    );
    database.exec(
      `INSERT INTO navigation_items
         (id, navigation_set_id, version, item_key, label, href, position, external)
       VALUES
         ('artist_footer_item', 'footer', 1, 'artist-link', 'Artist link', '/artist-link', 20, 0)`,
    );
    database.exec(
      `UPDATE pages
       SET version = 2, last_operation_key = 'artist-page-operation'
       WHERE id = 'page_about'`,
    );
    database.exec(
      `INSERT INTO page_revisions
         (id, page_id, revision, module_key, kind, title, introduction, body_text)
       VALUES
         ('artist_music_revision', 'page_music', 2, NULL, 'system', 'Artist music', '', '')`,
    );

    applyMigration(database, migrations.contents[repairIndex]);
    for (
      let index = repairIndex + 1;
      index < migrations.contents.length;
      index += 1
    ) {
      applyMigration(database, migrations.contents[index]);
    }

    assert.deepEqual(
      database
        .prepare("SELECT id FROM navigation_items ORDER BY id")
        .all()
        .map(({ id }) => id),
      ["artist_footer_item"],
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM page_revisions WHERE page_id = 'page_about'",
        )
        .get().count,
      0,
    );
    assert.deepEqual(
      database
        .prepare(
          "SELECT id FROM page_revisions WHERE page_id = 'page_music' ORDER BY id",
        )
        .all()
        .map(({ id }) => id),
      ["artist_music_revision"],
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM page_revisions").get()
        .count,
      expectedPageSeeds.length - 2 + 1,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("Sites, Worker, and local runtime bindings remain logically aligned", async () => {
  const [hosting, workerTypes, localConfig, viteConfig] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../worker-configuration.d.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.local.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.deepEqual(JSON.parse(hosting), { d1: "DB", r2: "MEDIA" });
  assert.match(workerTypes, /DB:\s*D1Database/);
  assert.match(workerTypes, /MEDIA:\s*R2Bucket/);
  assert.match(workerTypes, /AOP_OWNER_BOOTSTRAP_EMAIL\?:\s*string/);
  assert.match(localConfig, /"binding": "DB"/);
  assert.match(localConfig, /"binding": "MEDIA"/);
  assert.match(localConfig, /"migrations_dir": "\.\/drizzle"/);
  assert.match(viteConfig, /configPath:\s*"\.\/wrangler\.local\.jsonc"/);
  assert.doesNotMatch(
    `${hosting}\n${localConfig}`,
    /AOP_RUNTIME_ENV|AOP_SIMULATION_MODE/,
  );
  assert.doesNotMatch(
    `${hosting}\n${localConfig}\n${viteConfig}`,
    /AOP_OWNER_BOOTSTRAP_EMAIL/,
  );
});
