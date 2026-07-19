import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const STRICT_TEST_TABLES = [
  "checkout_sessions",
  "commerce_events",
  "commerce_prices",
  "credit_accounts",
  "credit_grant_lots",
  "credit_ledger_entries",
  "credit_reservations",
  "fulfillment_events",
  "issued_licenses",
  "license_documents",
  "license_events",
  "license_requests",
  "memberships",
  "order_items",
  "orders",
  "subscription_events",
  "subscriptions",
];

const M6_TABLES = [
  "checkout_sessions",
  "commerce_events",
  "commerce_prices",
  "commerce_products",
  "credit_accounts",
  "credit_grant_lots",
  "credit_ledger_entries",
  "credit_reservation_allocations",
  "credit_reservations",
  "fulfillment_events",
  "issued_licenses",
  "license_document_jobs",
  "license_documents",
  "license_events",
  "license_offers",
  "license_options",
  "license_requests",
  "license_terms",
  "license_terms_versions",
  "membership_plan_revisions",
  "membership_plans",
  "memberships",
  "order_items",
  "orders",
  "subscription_events",
  "subscription_plans",
  "subscriptions",
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

function tableNames(database) {
  return database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map(({ name }) => name);
}

function tableSql(database, table) {
  return database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1")
    .get(table).sql;
}

function columnNames(database, table) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(\`${table}\`)`)
      .all()
      .map(({ name }) => name),
  );
}

function assertConstraint(database, sql, name) {
  assert.throws(
    () => database.exec(sql),
    new RegExp(`(?:CHECK constraint failed: )?${name}`, "i"),
  );
}

function assertClean(database) {
  assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.deepEqual(
    database
      .prepare(
        `SELECT type, name FROM sqlite_master
         WHERE name LIKE '__new_%'
            OR name LIKE '__access_%'
            OR name LIKE '__commerce_%'
         ORDER BY type, name`,
      )
      .all(),
    [],
  );
}

test("the M6 20-migration checkpoint creates the 67-table schema version 9 without bridge residue", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    assert.ok(migrations.names.length >= 20);
    assert.match(migrations.names[19], /^0019_.+\.sql$/);
    applyThrough(database, migrations, 19);

    const tables = tableNames(database);
    assert.equal(tables.length, 67);
    assert.deepEqual(
      M6_TABLES.filter((table) => !tables.includes(table)),
      [],
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      9,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("0015 keeps foreign keys disabled across each replacement and reenables them last", async () => {
  const migrations = await readMigrations();
  const sql = migrations.contents[15];
  const orderedFragments = [
    "PRAGMA foreign_keys=OFF",
    "CREATE TABLE `__new_download_events`",
    "INSERT INTO `__new_download_events`",
    "DROP TABLE `download_events`",
    "ALTER TABLE `__new_download_events` RENAME TO `download_events`",
    "CREATE TABLE `__new_installation_state`",
    "INSERT INTO `__new_installation_state`",
    "DROP TABLE `installation_state`",
    "ALTER TABLE `__new_installation_state` RENAME TO `installation_state`",
    "CREATE TABLE `__new_entitlements`",
    "INSERT INTO `__new_entitlements`",
    "DROP TABLE `entitlements`",
    "ALTER TABLE `__new_entitlements` RENAME TO `entitlements`",
    "CREATE INDEX `entitlements_expiry_idx`",
    "PRAGMA foreign_keys=ON",
  ];
  let previous = -1;
  for (const fragment of orderedFragments) {
    const current = sql.indexOf(fragment);
    assert.ok(current > previous, `${fragment} is out of migration order.`);
    previous = current;
  }
  assert.equal(sql.trim().endsWith("PRAGMA foreign_keys=ON;"), true);
  assert.equal((sql.match(/PRAGMA foreign_keys=OFF/g) ?? []).length, 1);
  assert.equal((sql.match(/PRAGMA foreign_keys=ON/g) ?? []).length, 1);
});

test("0016 keeps foreign keys disabled across both linked replacements and reenables them last", async () => {
  const migrations = await readMigrations();
  const sql = migrations.contents[16];
  const orderedFragments = [
    "PRAGMA foreign_keys=OFF",
    "CREATE TABLE `__new_download_events`",
    "INSERT INTO `__new_download_events`",
    "DROP TABLE `download_events`",
    "ALTER TABLE `__new_download_events` RENAME TO `download_events`",
    "CREATE TABLE `__new_entitlements`",
    "INSERT INTO `__new_entitlements`",
    "DROP TABLE `entitlements`",
    "ALTER TABLE `__new_entitlements` RENAME TO `entitlements`",
    "CREATE INDEX `entitlements_expiry_idx`",
    "PRAGMA foreign_keys=ON",
  ];
  let previous = -1;
  for (const fragment of orderedFragments) {
    const current = sql.indexOf(fragment);
    assert.ok(current > previous, `${fragment} is out of migration order.`);
    previous = current;
  }
  assert.equal(sql.trim().endsWith("PRAGMA foreign_keys=ON;"), true);
  assert.equal((sql.match(/PRAGMA foreign_keys=OFF/g) ?? []).length, 1);
  assert.equal((sql.match(/PRAGMA foreign_keys=ON/g) ?? []).length, 1);
});

test("0017 keeps foreign keys disabled while replacing linked entitlements", async () => {
  const migrations = await readMigrations();
  const sql = migrations.contents[17];
  const orderedFragments = [
    "PRAGMA foreign_keys=OFF",
    "CREATE TABLE `__new_entitlements`",
    "INSERT INTO `__new_entitlements`",
    "DROP TABLE `entitlements`",
    "ALTER TABLE `__new_entitlements` RENAME TO `entitlements`",
    "PRAGMA foreign_keys=ON",
  ];
  let previous = -1;
  for (const fragment of orderedFragments) {
    const current = sql.indexOf(fragment);
    assert.ok(current > previous, `${fragment} is out of migration order.`);
    previous = current;
  }
  assert.equal((sql.match(/PRAGMA foreign_keys=OFF/g) ?? []).length, 1);
  assert.equal((sql.match(/PRAGMA foreign_keys=ON/g) ?? []).length, 1);
});

test("0018 keeps foreign keys disabled across the linked order replacement and advances schema version last", async () => {
  const migrations = await readMigrations();
  const sql = migrations.contents[18];
  const orderedFragments = [
    "PRAGMA foreign_keys=OFF",
    "CREATE TABLE `__new_orders`",
    "INSERT INTO `__new_orders`",
    "DROP TABLE `orders`",
    "ALTER TABLE `__new_orders` RENAME TO `orders`",
    "CREATE UNIQUE INDEX `orders_checkout_session_unique`",
    "CREATE TABLE `__new_installation_state`",
    'SELECT "id", "status", "owner_user_id", 8',
    "DROP TABLE `installation_state`",
    "ALTER TABLE `__new_installation_state` RENAME TO `installation_state`",
    "PRAGMA foreign_keys=ON",
  ];
  let previous = -1;
  for (const fragment of orderedFragments) {
    const current = sql.indexOf(fragment);
    assert.ok(current > previous, `${fragment} is out of migration order.`);
    previous = current;
  }
  assert.equal(sql.trim().endsWith("PRAGMA foreign_keys=ON;"), true);
  assert.equal((sql.match(/PRAGMA foreign_keys=OFF/g) ?? []).length, 1);
  assert.equal((sql.match(/PRAGMA foreign_keys=ON/g) ?? []).length, 1);
});

test("0018 preserves initial Checkout orders and permits distinct invoice-backed renewal orders", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");
  const digestA = "a".repeat(64);
  const digestB = "b".repeat(64);

  try {
    applyThrough(database, migrations, 17);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES ('user_m6_renewal', 'renewal@example.invalid',
              'renewal@example.invalid');
      INSERT INTO commerce_products
        (id, slug, name, description, product_type, credit_kind,
         credit_quantity, state)
      VALUES ('product_m6_renewal', 'renewal-credits', 'Renewal credits',
              'Fictional renewal benefit.', 'download-credits', 'download', 1,
              'active');
      INSERT INTO commerce_prices
        (id, commerce_product_id, amount_minor, currency, billing_interval,
         interval_count, stripe_price_id)
      VALUES ('price_m6_renewal', 'product_m6_renewal', 700, 'USD', 'month', 1,
              'price_M6RenewalTest001');
      INSERT INTO checkout_sessions
        (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
         status, stripe_checkout_session_id, stripe_checkout_url,
         stripe_subscription_id, amount_minor, currency, idempotency_key,
         request_fingerprint)
      VALUES ('checkout_m6_initial', 'user_m6_renewal', 'product_m6_renewal',
              'price_m6_renewal', 'subscription', 'completed',
              'cs_test_M6InitialRenewal001',
              'https://checkout.stripe.com/c/pay/m6-initial',
              'sub_M6Renewal001', 700, 'USD', 'checkout:m6-initial',
              '${digestA}');
      INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id,
         checkout_session_id, event_created_at, raw_body_digest,
         facts_fingerprint, status, processed_at)
      VALUES ('event_m6_initial', 'evt_M6InitialRenewal001', 'invoice.paid',
              'in_M6InitialRenewal001', 'checkout_m6_initial',
              '2026-07-19T00:00:00.000Z', '${digestA}', '${digestB}',
              'completed', '2026-07-19T00:00:01.000Z');
      INSERT INTO orders
        (id, customer_user_id, checkout_session_id, commerce_event_id, status,
         total_minor, currency, stripe_subscription_id, completed_at)
      VALUES ('order_m6_initial', 'user_m6_renewal', 'checkout_m6_initial',
              'event_m6_initial', 'fulfilled', 700, 'USD',
              'sub_M6Renewal001', '2026-07-19T00:00:01.000Z');
    `);

    applyMigration(database, migrations.contents[18]);
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT id, checkout_session_id, stripe_subscription_id, status
             FROM orders WHERE id = 'order_m6_initial'`,
          )
          .get(),
      },
      {
        id: "order_m6_initial",
        checkout_session_id: "checkout_m6_initial",
        stripe_subscription_id: "sub_M6Renewal001",
        status: "fulfilled",
      },
    );

    database.exec(`
      INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id, event_created_at,
         raw_body_digest, facts_fingerprint, status, processed_at)
      VALUES ('event_m6_cycle', 'evt_M6RenewalCycle001', 'invoice.paid',
              'in_M6RenewalCycle001', '2026-08-19T00:00:00.000Z',
              '${digestB}', '${digestA}', 'completed',
              '2026-08-19T00:00:01.000Z');
      INSERT INTO orders
        (id, customer_user_id, checkout_session_id, commerce_event_id, status,
         total_minor, currency, stripe_subscription_id, completed_at)
      VALUES ('order_m6_cycle', 'user_m6_renewal', NULL, 'event_m6_cycle',
              'fulfilled', 700, 'USD', 'sub_M6Renewal001',
              '2026-08-19T00:00:01.000Z');
    `);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE stripe_subscription_id = 'sub_M6Renewal001'",
        )
        .get().count,
      2,
    );
    database.exec(`
      INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id, event_created_at,
         raw_body_digest, facts_fingerprint, status)
      VALUES ('event_m6_missing_source', 'evt_M6MissingSource001',
              'invoice.paid', 'in_M6MissingSource001',
              '2026-09-19T00:00:00.000Z', '${digestA}', '${digestB}',
              'processing');
    `);
    assertConstraint(
      database,
      `INSERT INTO orders
        (id, customer_user_id, checkout_session_id, commerce_event_id, status,
         total_minor, currency, stripe_subscription_id)
       VALUES ('order_m6_missing_source', 'user_m6_renewal', NULL,
               'event_m6_missing_source', 'pending', 700, 'USD', NULL)`,
      "orders_source_link_valid",
    );
    assert.throws(
      () =>
        database.exec(`INSERT INTO orders
          (id, customer_user_id, checkout_session_id, commerce_event_id,
           status, total_minor, currency, stripe_subscription_id)
         VALUES ('order_m6_duplicate_checkout', 'user_m6_renewal',
                 'checkout_m6_initial', 'event_m6_cycle', 'pending', 700,
                 'USD', 'sub_M6Renewal001')`),
      /UNIQUE constraint failed/,
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      8,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("0019 preserves repeated subscription-state evidence while provider objects stay unique for fulfillment", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 19);
    const fulfillmentIndex = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'fulfillment_events_provider_object_unique'",
      )
      .get().sql;
    assert.match(fulfillmentIndex, /WHERE .*kind.*<> 'subscription_state'/i);
    const stripeEventIndex = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'subscription_events_stripe_event_unique'",
      )
      .get().sql;
    assert.match(stripeEventIndex, /stripe_event_id/i);
    assert.equal(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM sqlite_master
           WHERE type = 'index'
             AND name = 'subscription_events_provider_object_idx'`,
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
      9,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("0015 through 0017 preserve existing grants, legacy commerce entitlements, downloads, and catalog credits", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 14);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES
        ('user_m6_customer', 'm6-customer@example.invalid',
         'm6-customer@example.invalid'),
        ('user_m6_owner', 'm6-owner@example.invalid',
         'm6-owner@example.invalid');
      INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id,
         publication_state, published_at)
      VALUES
        ('track_m6_existing', 'm6-existing-track', 'track_m6_revision',
         'track_m6_revision', 'published', '2026-07-18T00:00:00.000Z');
      INSERT INTO track_revisions
        (id, track_id, revision, title, view_mode, stream_mode,
         download_mode, tags_json)
      VALUES
        ('track_m6_revision', 'track_m6_existing', 1, 'Existing M6 track',
         'protected', 'protected', 'protected', '[]');
      INSERT INTO credits
        (id, track_revision_id, name, role, details, position)
      VALUES
        ('catalog_credit_m6', 'track_m6_revision', 'Fictional Performer',
         'Performer', 'Catalog authorship metadata', 1);
      INSERT INTO access_grants
        (id, grantee_user_id, resource_type, resource_id, actions_json,
         remaining_uses, reason, granted_by_user_id, last_operation_key)
      VALUES
        ('grant_m6_existing', 'user_m6_customer', 'track',
         'track_m6_existing', '["view","stream","download"]', 4,
         'Existing direct grant', 'user_m6_owner', 'grant.m6.existing');
      INSERT INTO entitlements
        (id, user_id, source_type, source_id, grant_id, resource_type,
         resource_id, actions_json, remaining_uses, last_operation_key)
      VALUES
        ('entitlement_m6_grant', 'user_m6_customer', 'grant',
         'grant_m6_existing', 'grant_m6_existing', 'track',
         'track_m6_existing', '["view","stream","download"]', 4,
         'entitlement.m6.grant'),
        ('entitlement_m6_membership', 'user_m6_customer', 'membership',
         'membership_m6_legacy', NULL, 'track', 'track_m6_existing',
         '["view"]', NULL, NULL),
        ('entitlement_m6_subscription', 'user_m6_customer', 'subscription',
         'subscription_m6_legacy', NULL, 'track', 'track_m6_existing',
         '["stream"]', NULL, NULL),
        ('entitlement_m6_license', 'user_m6_customer', 'license',
         'license_m6_legacy', NULL, 'track', 'track_m6_existing',
         '["download"]', 1, NULL),
        ('entitlement_m6_credit', 'user_m6_customer', 'credit',
         'credit_m6_legacy', NULL, 'track', 'track_m6_existing',
         '["download"]', 2, NULL);
      INSERT INTO download_events
        (id, user_id, resource_type, resource_id, entitlement_id,
         access_source, byte_length, request_id, delivered_at)
      VALUES
        ('download_m6_grant', 'user_m6_customer', 'track',
         'track_m6_existing', 'entitlement_m6_grant', 'grant', 101,
         'request_m6_grant', '2026-07-18T01:00:00.000Z'),
        ('download_m6_membership', 'user_m6_customer', 'track',
         'track_m6_existing', 'entitlement_m6_membership', 'grant', 102,
         'request_m6_membership', '2026-07-18T02:00:00.000Z'),
        ('download_m6_subscription', 'user_m6_customer', 'track',
         'track_m6_existing', 'entitlement_m6_subscription', 'grant', 103,
         'request_m6_subscription', '2026-07-18T03:00:00.000Z'),
        ('download_m6_license', 'user_m6_customer', 'track',
         'track_m6_existing', 'entitlement_m6_license', 'grant', 104,
         'request_m6_license', '2026-07-18T04:00:00.000Z'),
        ('download_m6_credit', 'user_m6_customer', 'track',
         'track_m6_existing', 'entitlement_m6_credit', 'grant', 105,
         'request_m6_credit', '2026-07-18T05:00:00.000Z');
    `);

    applyMigration(database, migrations.contents[15]);
    applyMigration(database, migrations.contents[16]);
    applyMigration(database, migrations.contents[17]);

    assert.deepEqual(
      database
        .prepare(
          `SELECT id, source_type, source_id, grant_id, remaining_uses,
                  stripe_environment, livemode, fulfillment_event_id,
                  credit_reservation_id, last_operation_key
           FROM entitlements
           WHERE id LIKE 'entitlement_m6_%'
           ORDER BY id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: "entitlement_m6_credit",
          source_type: "credit",
          source_id: "credit_m6_legacy",
          grant_id: null,
          remaining_uses: 2,
          stripe_environment: null,
          livemode: null,
          fulfillment_event_id: null,
          credit_reservation_id: null,
          last_operation_key: null,
        },
        {
          id: "entitlement_m6_grant",
          source_type: "grant",
          source_id: "grant_m6_existing",
          grant_id: "grant_m6_existing",
          remaining_uses: 4,
          stripe_environment: null,
          livemode: null,
          fulfillment_event_id: null,
          credit_reservation_id: null,
          last_operation_key: "entitlement.m6.grant",
        },
        {
          id: "entitlement_m6_license",
          source_type: "license",
          source_id: "license_m6_legacy",
          grant_id: null,
          remaining_uses: 1,
          stripe_environment: null,
          livemode: null,
          fulfillment_event_id: null,
          credit_reservation_id: null,
          last_operation_key: null,
        },
        {
          id: "entitlement_m6_membership",
          source_type: "membership",
          source_id: "membership_m6_legacy",
          grant_id: null,
          remaining_uses: null,
          stripe_environment: null,
          livemode: null,
          fulfillment_event_id: null,
          credit_reservation_id: null,
          last_operation_key: null,
        },
        {
          id: "entitlement_m6_subscription",
          source_type: "subscription",
          source_id: "subscription_m6_legacy",
          grant_id: null,
          remaining_uses: null,
          stripe_environment: null,
          livemode: null,
          fulfillment_event_id: null,
          credit_reservation_id: null,
          last_operation_key: null,
        },
      ],
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT id, entitlement_id, access_source, entitlement_source_type,
                  entitlement_source_id, credit_reservation_id,
                  stripe_environment, livemode, byte_length, delivered_at
           FROM download_events
           WHERE id LIKE 'download_m6_%'
           ORDER BY id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        ["credit", 105, "2026-07-18T05:00:00.000Z"],
        ["grant", 101, "2026-07-18T01:00:00.000Z"],
        ["license", 104, "2026-07-18T04:00:00.000Z"],
        ["membership", 102, "2026-07-18T02:00:00.000Z"],
        ["subscription", 103, "2026-07-18T03:00:00.000Z"],
      ].map(([kind, byteLength, deliveredAt]) => ({
        id: `download_m6_${kind}`,
        entitlement_id: `entitlement_m6_${kind}`,
        access_source: "grant",
        entitlement_source_type: null,
        entitlement_source_id: null,
        credit_reservation_id: null,
        stripe_environment: null,
        livemode: null,
        byte_length: byteLength,
        delivered_at: deliveredAt,
      })),
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT id, track_revision_id, name, role, details, position
             FROM credits WHERE id = 'catalog_credit_m6'`,
          )
          .get(),
      },
      {
        id: "catalog_credit_m6",
        track_revision_id: "track_m6_revision",
        name: "Fictional Performer",
        role: "Performer",
        details: "Catalog authorship metadata",
        position: 1,
      },
    );
    assert.equal(
      database
        .prepare(
          "SELECT schema_version FROM installation_state WHERE id = 'installation'",
        )
        .get().schema_version,
      7,
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("test-only storage rejects live facts and keeps legacy non-commerce facts nullable", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 19);
    for (const table of STRICT_TEST_TABLES) {
      const sql = tableSql(database, table);
      assert.match(sql, new RegExp(`CONSTRAINT "${table}_test_only"`, "i"));
      assert.match(
        sql,
        new RegExp(
          `"${table}"\\."stripe_environment"\\s*=\\s*'test'\\s+and\\s+"${table}"\\."livemode"\\s*=\\s*0`,
          "i",
        ),
      );
    }
    assert.match(
      tableSql(database, "entitlements"),
      /CONSTRAINT "entitlements_commerce_environment_valid"/,
    );
    assert.match(
      tableSql(database, "download_events"),
      /CONSTRAINT "download_events_commerce_environment_valid"/,
    );

    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES ('user_m6_test_boundary', 'boundary@example.invalid',
              'boundary@example.invalid');
      INSERT INTO credit_accounts
        (id, customer_user_id, credit_kind, available_balance)
      VALUES
        ('credit_account_m6_valid', 'user_m6_test_boundary', 'download', 2);
      INSERT INTO entitlements
        (id, user_id, source_type, source_id, resource_type, resource_id,
         actions_json, stripe_environment, livemode, fulfillment_event_id,
         last_operation_key)
      VALUES
        ('entitlement_m6_order_valid', 'user_m6_test_boundary', 'order',
         'order_m6_valid', 'track', 'track_m6_order', '["view","download"]',
         'test', 0, 'fulfillment_m6_order_valid',
         'entitlement.m6.order.valid'),
        ('entitlement_m6_manual_valid', 'user_m6_test_boundary', 'membership',
         'membership_m6_manual', 'track', 'track_m6_manual', '["view"]',
         'test', 0, NULL, 'membership.owner.activate:manual-valid');
      INSERT INTO download_events
        (id, user_id, resource_type, resource_id, entitlement_id,
         access_source, entitlement_source_type, entitlement_source_id,
         stripe_environment, livemode, byte_length, request_id)
      VALUES
        ('download_m6_order_valid', 'user_m6_test_boundary', 'track',
         'track_m6_order', 'entitlement_m6_order_valid', 'order', 'order',
         'order_m6_valid', 'test', 0, 1, 'request_m6_order_valid');
    `);
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT stripe_environment, livemode
             FROM credit_accounts WHERE id = 'credit_account_m6_valid'`,
          )
          .get(),
      },
      { stripe_environment: "test", livemode: 0 },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT source_type, stripe_environment, livemode,
                    fulfillment_event_id, last_operation_key
             FROM entitlements WHERE id = 'entitlement_m6_manual_valid'`,
          )
          .get(),
      },
      {
        source_type: "membership",
        stripe_environment: "test",
        livemode: 0,
        fulfillment_event_id: null,
        last_operation_key: "membership.owner.activate:manual-valid",
      },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            `SELECT e.source_type, e.stripe_environment,
                    e.livemode AS entitlement_livemode,
                    d.access_source, d.entitlement_source_type,
                    d.stripe_environment AS delivery_environment,
                    d.livemode AS delivery_livemode
             FROM entitlements e
             JOIN download_events d ON d.entitlement_id = e.id
             WHERE e.id = 'entitlement_m6_order_valid'`,
          )
          .get(),
      },
      {
        source_type: "order",
        stripe_environment: "test",
        entitlement_livemode: 0,
        access_source: "order",
        entitlement_source_type: "order",
        delivery_environment: "test",
        delivery_livemode: 0,
      },
    );

    assertConstraint(
      database,
      `INSERT INTO credit_accounts
         (id, customer_user_id, credit_kind, stripe_environment, livemode)
       VALUES ('credit_account_m6_live', 'user_m6_test_boundary', 'license',
               'live', 1)`,
      "credit_accounts_test_only",
    );
    const digestA = "a".repeat(64);
    const digestB = "b".repeat(64);
    assertConstraint(
      database,
      `INSERT INTO commerce_events
         (id, stripe_event_id, event_type, stripe_object_id, event_created_at,
          raw_body_digest, facts_fingerprint, stripe_environment, livemode)
       VALUES ('commerce_event_m6_live', 'evt_m6_live',
               'checkout.session.completed', 'cs_test_m6_live',
               '2026-07-18T00:00:00.000Z', '${digestA}', '${digestB}',
               'live', 1)`,
      "commerce_events_test_only",
    );
    assertConstraint(
      database,
      `INSERT INTO entitlements
         (id, user_id, source_type, source_id, resource_type, resource_id,
          actions_json, stripe_environment, livemode)
       VALUES ('entitlement_m6_live', 'user_m6_test_boundary', 'order',
               'order_m6_live', 'track', 'track_m6_live', '["view"]',
               'live', 1)`,
      "entitlements_commerce_environment_valid",
    );
    assertConstraint(
      database,
      `INSERT INTO entitlements
         (id, user_id, source_type, source_id, resource_type, resource_id,
          actions_json, stripe_environment, livemode, last_operation_key)
       VALUES ('entitlement_m6_order_without_fulfillment',
               'user_m6_test_boundary', 'order', 'order_m6_without_event',
               'track', 'track_m6_without_event', '["view"]', 'test', 0,
               'entitlement.m6.order.without-event')`,
      "entitlements_commerce_environment_valid",
    );
    assertConstraint(
      database,
      `INSERT INTO download_events
         (id, user_id, resource_type, resource_id, access_source,
          stripe_environment, livemode, byte_length, request_id)
       VALUES ('download_m6_live', 'user_m6_test_boundary', 'track',
               'track_m6_live', 'order', 'live', 1, 1,
               'request_m6_live')`,
      "download_events_commerce_environment_valid",
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("state, credit, terms, and licensing checks reject contradictory records", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 19);
    database.exec(`
      INSERT INTO users (id, email, normalized_email)
      VALUES ('user_m6_constraints', 'constraints@example.invalid',
              'constraints@example.invalid');
      INSERT INTO credit_accounts
        (id, customer_user_id, credit_kind, available_balance)
      VALUES ('credit_account_m6_constraints', 'user_m6_constraints',
              'download', 3);
      INSERT INTO license_terms
        (id, slug, state, current_version, created_by_user_id)
      VALUES ('license_terms_m6', 'license-terms-m6', 'draft', 1,
              'user_m6_constraints');
      INSERT INTO license_terms_versions
        (id, license_terms_id, version, name, title, general_terms,
         created_by_user_id)
      VALUES ('license_terms_version_m6', 'license_terms_m6', 1,
              'Fictional terms', 'Fictional license terms',
              'Fictional general terms.', 'user_m6_constraints');
    `);

    assertConstraint(
      database,
      `INSERT INTO membership_plans (id, slug, state, current_revision)
       VALUES ('membership_plan_m6_invalid', 'membership-plan-m6-invalid',
               'live', 1)`,
      "membership_plans_state_valid",
    );
    assertConstraint(
      database,
      `INSERT INTO credit_accounts
         (id, customer_user_id, credit_kind, available_balance)
       VALUES ('credit_account_m6_negative', 'user_m6_constraints',
               'license', -1)`,
      "credit_accounts_balances_nonnegative",
    );
    assertConstraint(
      database,
      `INSERT INTO credit_grant_lots
         (id, credit_account_id, customer_user_id, credit_kind, origin_type,
          origin_id, quantity_granted, quantity_available, state,
          last_operation_key)
       VALUES ('credit_lot_m6_invalid', 'credit_account_m6_constraints',
               'user_m6_constraints', 'download', 'owner', 'owner_m6', 2, 1,
               'active', 'credit-lot-m6-invalid')`,
      "credit_grant_lots_quantities_valid",
    );
    assertConstraint(
      database,
      `INSERT INTO credit_reservations
         (id, credit_account_id, customer_user_id, credit_kind, purpose_type,
          purpose_id, quantity, state, expires_at, request_id,
          last_operation_key)
       VALUES ('credit_reservation_m6_invalid',
               'credit_account_m6_constraints', 'user_m6_constraints',
               'download', 'download', 'download_m6', 1, 'consumed',
               '2026-07-19T00:00:00.000Z', 'request_m6_reservation',
               'credit-reservation-m6-invalid')`,
      "credit_reservations_terminal_state_valid",
    );
    assertConstraint(
      database,
      `INSERT INTO license_terms
         (id, slug, state, current_version)
       VALUES ('license_terms_m6_invalid', 'License-Terms-M6', 'draft', 1)`,
      "license_terms_slug_normalized",
    );
    assertConstraint(
      database,
      `INSERT INTO license_terms_versions
         (id, license_terms_id, version, name, title, general_terms)
       VALUES ('license_terms_version_m6_invalid', 'license_terms_m6', 2,
               'Invalid terms', 'Invalid terms', '')`,
      "license_terms_versions_content_length_valid",
    );
    assertConstraint(
      database,
      `INSERT INTO license_options
         (id, license_terms_id, license_terms_version_id,
          license_terms_version, option_key, label, usage_category,
          allowed_media_json, attribution_text, license_credit_cost, position)
       VALUES ('license_option_m6_invalid', 'license_terms_m6',
               'license_terms_version_m6', 1, 'invalid-option',
               'Invalid option', 'Fictional usage', '[]',
               'Artist credit required', 0, 1)`,
      "license_options_credit_cost_positive",
    );
    assertClean(database);
  } finally {
    database.close();
  }
});

test("catalog authorship credits remain distinct from customer credit balances", async () => {
  const migrations = await readMigrations();
  const database = new DatabaseSync(":memory:");

  try {
    applyThrough(database, migrations, 19);
    const catalogColumns = columnNames(database, "credits");
    const commerceColumns = columnNames(database, "credit_accounts");
    for (const column of [
      "release_revision_id",
      "track_revision_id",
      "collection_revision_id",
      "name",
      "role",
      "details",
      "position",
    ]) {
      assert.equal(catalogColumns.has(column), true);
    }
    for (const column of [
      "customer_user_id",
      "credit_kind",
      "available_balance",
      "reserved_balance",
      "consumed_balance",
    ]) {
      assert.equal(catalogColumns.has(column), false);
      assert.equal(commerceColumns.has(column), true);
    }
    assertClean(database);
  } finally {
    database.close();
  }
});
