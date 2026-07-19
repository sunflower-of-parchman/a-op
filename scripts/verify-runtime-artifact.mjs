import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const workerConfiguration = JSON.parse(
  await readFile("dist/server/wrangler.json", "utf8"),
);

assert.equal(workerConfiguration.vars?.AOP_RUNTIME_ENV, "production");
assert.equal(workerConfiguration.vars?.AOP_SIMULATION_MODE, "off");
assert.notEqual(workerConfiguration.vars?.AOP_RUNTIME_ENV, "test");
assert.notEqual(workerConfiguration.vars?.AOP_SIMULATION_MODE, "runtime-lab");
assert.equal(
  Object.hasOwn(workerConfiguration.vars ?? {}, "AOP_OWNER_BOOTSTRAP_EMAIL"),
  false,
);
assert.equal(workerConfiguration.d1_databases?.[0]?.binding, "DB");
assert.equal(workerConfiguration.r2_buckets?.[0]?.binding, "MEDIA");

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

const expectedModuleSeeds = [
  "contact",
  "courses",
  "customer-library",
  "downloads",
  "licensing",
  "memberships",
  "subscriptions",
  "telemetry",
  "video",
  "whats-new",
];

async function migrationNames(directory) {
  return (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
}

async function readMigrations(directory, names) {
  return (
    await Promise.all(
      names.map((name) => readFile(join(directory, name), "utf8")),
    )
  ).join("\n");
}

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

const sourceMigrationDirectory = "drizzle";
const packagedMigrationDirectory = "dist/.openai/drizzle";
const [packagedHosting, sourceMigrationNames, packagedMigrationNames] =
  await Promise.all([
    readFile("dist/.openai/hosting.json", "utf8"),
    migrationNames(sourceMigrationDirectory),
    migrationNames(packagedMigrationDirectory),
  ]);

assert.deepEqual(JSON.parse(packagedHosting), { d1: "DB", r2: "MEDIA" });
assert.deepEqual(packagedMigrationNames, sourceMigrationNames);
assert.equal(sourceMigrationNames.length, 33);
assert.match(sourceMigrationNames.at(-1), /^0032_.+\.sql$/);

const [sourceMigrations, packagedMigrations] = await Promise.all([
  readMigrations(sourceMigrationDirectory, sourceMigrationNames),
  readMigrations(packagedMigrationDirectory, packagedMigrationNames),
]);
assert.equal(packagedMigrations, sourceMigrations);
const packagedMigrationTables = [
  ...packagedMigrations.matchAll(/CREATE TABLE `([^`]+)`/g),
]
  .map((match) => match[1])
  .filter((table) => !table.startsWith("__new_"))
  .filter((table, index, tables) => tables.indexOf(table) === index)
  .sort();

assert.deepEqual(packagedMigrationTables, expectedTables);
for (const role of ["owner", "editor", "customer"]) {
  assert.ok(packagedMigrations.includes(`VALUES ('${role}'`));
}
assert.deepEqual(
  extractSeedIds(packagedMigrations, "artist_modules"),
  expectedModuleSeeds,
);
assert.deepEqual(extractSeedIds(packagedMigrations, "navigation_sets"), [
  "footer",
  "primary",
]);
assert.deepEqual(extractSeedIds(packagedMigrations, "installation_state"), [
  "installation",
]);
assert.deepEqual(extractSeedIds(packagedMigrations, "artist_config"), [
  "artist",
]);
assert.deepEqual(extractSeedIds(packagedMigrations, "module_registry_state"), [
  "registry",
]);
assert.match(
  packagedMigrations,
  /INSERT INTO `setup_state`[\s\S]*?VALUES \('setup', 'unconfigured'/,
);
assert.doesNotMatch(
  packagedMigrations,
  /INSERT INTO `(?:users|role_assignments|editor_permissions)`/,
);
for (const table of [
  "artist_config",
  "editor_permissions",
  "navigation_sets",
  "pages",
  "profiles",
  "role_assignments",
]) {
  assert.ok(
    packagedMigrations.includes(
      `ALTER TABLE \`${table}\` ADD \`last_operation_key\` text`,
    ),
    `${table} operation marker is absent from the packaged migrations.`,
  );
}
assert.match(
  packagedMigrations,
  /ALTER TABLE `page_revisions` ADD `module_key` text/,
);
assert.match(
  packagedMigrations,
  /ALTER TABLE `page_revisions` ADD `kind` text DEFAULT 'standard' NOT NULL/,
);
assert.match(packagedMigrations, /UPDATE `page_revisions`\s+SET `module_key`/);
assert.match(packagedMigrations, /WITH `neutral_navigation_items`/);
assert.match(packagedMigrations, /WITH `neutral_page_revisions`/);

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await textFiles(path)));
    else if (/\.(?:css|html|js|json|map|txt)$/.test(entry.name))
      files.push(path);
  }
  return files;
}

const clientFiles = await textFiles("dist/client");
const prohibitedClientValues = [
  "runtime-lab/range-proof-v1",
  "owner@a-op.invalid",
  "editor@a-op.invalid",
  "customer@a-op.invalid",
  "AOP_SIMULATION_MODE",
  "AOP_RUNTIME_ENV",
  "AOP_OWNER_BOOTSTRAP_EMAIL",
  "MEDIA_PUBLICATION_MAX_BYTES",
  "oai-authenticated-user-email",
  "SELECT COUNT(*) AS role_count FROM roles",
  "INSERT INTO runtime_proofs",
  "cardNumber",
  "card_number",
  "paymentMethodData",
  "payment_method_data",
  "billingAddress",
  "billing_address",
  "client_secret",
  "pk_live_",
  "sk_live_",
  "rk_live_",
  "sk_test_",
  "whsec_",
];

for (const file of clientFiles) {
  const contents = await readFile(file, "utf8");
  for (const value of prohibitedClientValues) {
    assert.equal(
      contents.includes(value),
      false,
      `${file} contains server-only runtime value ${value}`,
    );
  }
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    productionSimulationMode: "off",
    clientFilesScanned: clientFiles.length,
    serverOnlyValuesFound: 0,
    packagedMigrationFiles: packagedMigrationNames.length,
    packagedMigrationTables: packagedMigrationTables.length,
    packagedModuleSeeds: expectedModuleSeeds.length,
  })}\n`,
);
