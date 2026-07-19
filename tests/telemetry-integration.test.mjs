import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const telemetryWrite = await import("../db/telemetry-write.ts");
const telemetryRead = await import("../db/telemetry-read.ts");
const telemetryValidation = await import("../lib/telemetry/validation.ts");

const {
  aggregateTelemetryDay,
  pruneTelemetryEvents,
  recordTelemetryEvent,
  updateTelemetrySettings,
} = telemetryWrite;
const { readTelemetryAdminWorkspace, readTelemetryPublicConfiguration } =
  telemetryRead;
const { validatePublicTelemetryEvent, validateTelemetryEvent } =
  telemetryValidation;

const OWNER = "user_telemetry_owner";
const CUSTOMER = "user_telemetry_customer";
const SESSION_ONE = "11111111-1111-4111-8111-111111111111";
const SESSION_TWO = "22222222-2222-4222-8222-222222222222";

let requestSequence = 0;
function ownerContext(key) {
  requestSequence += 1;
  return {
    actorUserId: OWNER,
    idempotencyKey: key,
    requestId: `request_telemetry_${requestSequence}`,
  };
}

function eventContext(overrides = {}) {
  return {
    sessionId: SESSION_ONE,
    userId: CUSTOMER,
    consent: "granted",
    privacySignal: null,
    browserObserved: true,
    ...overrides,
  };
}

function trackEvent(overrides = {}) {
  return {
    eventName: "track-view",
    resourceType: "track",
    resourceId: "track_telemetry_public",
    ...overrides,
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    UPDATE artist_modules
    SET active = 1, activated_at = CURRENT_TIMESTAMP
    WHERE module_key IN ('telemetry', 'memberships', 'licensing');

    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'telemetry-owner@example.invalid',
       'telemetry-owner@example.invalid', 'active'),
      ('${CUSTOMER}', 'telemetry-customer@example.invalid',
       'telemetry-customer@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_telemetry_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_telemetry_customer', '${CUSTOMER}', 'customer', '${OWNER}');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id, publication_state)
    VALUES
      ('track_telemetry_public', 'telemetry-public',
       'track_telemetry_public_revision_1',
       'track_telemetry_public_revision_1', 'published'),
      ('track_telemetry_draft', 'telemetry-draft',
       'track_telemetry_draft_revision_1', NULL, 'draft');
    INSERT INTO track_revisions
      (id, track_id, revision, title, duration_ms, view_mode, stream_mode)
    VALUES
      ('track_telemetry_public_revision_1', 'track_telemetry_public', 1,
       'Public telemetry track', 120000, 'public', 'public'),
      ('track_telemetry_draft_revision_1', 'track_telemetry_draft', 1,
       'Draft telemetry track', 120000, 'public', 'public');

    INSERT INTO membership_plans
      (id, slug, state, current_revision, created_by_user_id)
    VALUES
      ('membership_plan_telemetry', 'telemetry-membership', 'active', 1,
       '${OWNER}');
    INSERT INTO membership_plan_revisions
      (id, membership_plan_id, revision, name, benefits_json,
       download_credits, license_credits, duration_days, created_by_user_id)
    VALUES
      ('membership_plan_telemetry_revision_1', 'membership_plan_telemetry', 1,
       'Telemetry membership', '["Member access"]', 0, 0, 30, '${OWNER}');
    INSERT INTO commerce_products
      (id, slug, name, product_type, membership_plan_id,
       membership_plan_revision_id, membership_plan_revision, state, revision)
    VALUES
      ('commerce_membership_telemetry', 'telemetry-membership-product',
       'Telemetry membership product', 'membership',
       'membership_plan_telemetry', 'membership_plan_telemetry_revision_1', 1,
       'active', 1);
    INSERT INTO commerce_products
      (id, slug, name, product_type, resource_type, resource_id, state, revision)
    VALUES
      ('commerce_license_telemetry', 'telemetry-license-product',
       'Telemetry license product', 'license', 'track',
       'track_telemetry_public', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode,
       revision)
    VALUES
      ('commerce_price_membership_telemetry',
       'commerce_membership_telemetry', 500, 'USD', 'month', 1,
       'price_test_TelemetryMembership001', 1, 'test', 0, 1),
      ('commerce_price_license_telemetry', 'commerce_license_telemetry', 1200,
       'USD', 'one_time', 1, 'price_test_TelemetryLicense001', 1, 'test', 0, 1);
    INSERT INTO license_terms
      (id, slug, state, current_version, created_by_user_id)
    VALUES
      ('license_terms_telemetry', 'telemetry-license-terms', 'active', 1,
       '${OWNER}');
    INSERT INTO license_terms_versions
      (id, license_terms_id, version, name, title, general_terms,
       created_by_user_id)
    VALUES
      ('license_terms_telemetry_version_1', 'license_terms_telemetry', 1,
       'Telemetry terms', 'Telemetry license', 'Fictional test terms.',
       '${OWNER}');
    INSERT INTO license_options
      (id, license_terms_id, license_terms_version_id, license_terms_version,
       option_key, label, usage_category, allowed_media_json, territory,
       attribution_required, attribution_text, exclusive, requires_approval,
       license_credit_cost, includes_track_download, position)
    VALUES
      ('license_option_telemetry', 'license_terms_telemetry',
       'license_terms_telemetry_version_1', 1, 'telemetry-use',
       'Telemetry use', 'Synchronization', '["Film"]', 'Worldwide', 1,
       'Music by the artist', 0, 1, 1, 1, 1);
    INSERT INTO license_offers
      (id, slug, track_id, track_revision_id, license_terms_id,
       license_terms_version_id, license_terms_version, license_option_id,
       commerce_product_id, commerce_price_id, state, revision,
       created_by_user_id)
    VALUES
      ('license_offer_telemetry', 'telemetry-license-offer',
       'track_telemetry_public', 'track_telemetry_public_revision_1',
       'license_terms_telemetry', 'license_terms_telemetry_version_1', 1,
       'license_option_telemetry', 'commerce_license_telemetry',
       'commerce_price_license_telemetry', 'active', 1, '${OWNER}');
  `);
  return memory;
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

test("browser telemetry accepts only exact observable fields and published resources", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  assert.throws(
    () =>
      validatePublicTelemetryEvent({
        eventName: "license-issued",
        resourceType: "license",
        resourceId: "license_internal",
      }),
    /server-owned telemetry fact/,
  );
  assert.throws(
    () => validatePublicTelemetryEvent({ ...trackEvent(), url: "/music?q=x" }),
    /missing or unsupported fields/,
  );
  assert.throws(
    () =>
      validatePublicTelemetryEvent({
        eventName: "music-view",
        resourceType: "site",
        resourceId: "not-site",
      }),
    /exact site resource identifier/,
  );
  assert.throws(
    () =>
      validateTelemetryEvent({
        ...trackEvent(),
        resourceId: "https://example.invalid/private?email=listener",
      }),
    /resource identifier is invalid/,
  );

  const recorded = await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext(),
    new Date("2026-07-18T12:00:00.000Z"),
  );
  assert.deepEqual(recorded, { recorded: true, reason: "recorded" });
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    1,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT event_name, resource_type, resource_id, user_id,
                consent_basis, day_utc
         FROM telemetry_events`,
        )
        .get(),
    },
    {
      event_name: "track-view",
      resource_type: "track",
      resource_id: "track_telemetry_public",
      user_id: CUSTOMER,
      consent_basis: "explicit",
      day_utc: "2026-07-18",
    },
  );

  const draft = await recordTelemetryEvent(
    memory.binding,
    trackEvent({ resourceId: "track_telemetry_draft" }),
    eventContext({ sessionId: SESSION_TWO }),
    new Date("2026-07-18T12:01:00.000Z"),
  );
  assert.equal(draft.recorded, false);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    1,
  );
});

test("consent, browser privacy signals, module state, anonymous mode, and D1 threshold apply on every event", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const undecided = await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext({ consent: "undecided" }),
  );
  assert.equal(undecided.reason, "consent-required");
  const denied = await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext({ consent: "denied" }),
  );
  assert.equal(denied.reason, "consent-denied");
  const gpc = await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext({ privacySignal: "global-privacy-control" }),
  );
  assert.equal(gpc.reason, "privacy-signal");

  const settings = await updateTelemetrySettings(
    memory.binding,
    {
      collectionMode: "anonymous",
      retentionDays: 30,
      meaningfulListenSeconds: 25,
      expectedRevision: 1,
    },
    ownerContext("telemetry.settings.anonymous"),
    new Date("2026-07-19T12:00:00.000Z"),
  );
  assert.equal(settings.value.revision, 2);

  const below = await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "meaningful-listen",
      resourceType: "track",
      resourceId: "track_telemetry_public",
      playedTimeMs: 24_999,
    },
    eventContext({ consent: "undecided" }),
  );
  assert.equal(below.reason, "below-threshold");
  const meaningful = await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "meaningful-listen",
      resourceType: "track",
      resourceId: "track_telemetry_public",
      playedTimeMs: 25_000,
    },
    eventContext({ consent: "undecided" }),
  );
  assert.equal(meaningful.recorded, true);
  assert.deepEqual(
    {
      ...memory.database
        .prepare("SELECT user_id, consent_basis FROM telemetry_events")
        .get(),
    },
    { user_id: null, consent_basis: "not_required" },
  );

  memory.database
    .prepare(
      "UPDATE artist_modules SET active = 0 WHERE module_key = 'telemetry'",
    )
    .run();
  const disabledImmediately = await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext(),
  );
  assert.equal(disabledImmediately.reason, "module-inactive");
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    1,
  );
});

test("active membership products and licensing offers record their exact public DTO identifiers", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const membership = await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "membership-view",
      resourceType: "membership",
      resourceId: "commerce_membership_telemetry",
    },
    eventContext(),
    new Date("2026-07-18T12:00:00.000Z"),
  );
  const licensing = await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "licensing-view",
      resourceType: "license",
      resourceId: "license_offer_telemetry",
    },
    eventContext({ sessionId: SESSION_TWO }),
    new Date("2026-07-18T12:01:00.000Z"),
  );

  assert.deepEqual(membership, { recorded: true, reason: "recorded" });
  assert.deepEqual(licensing, { recorded: true, reason: "recorded" });
  const internalPlan = await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "membership-view",
      resourceType: "membership",
      resourceId: "membership_plan_telemetry",
    },
    eventContext(),
    new Date("2026-07-18T12:02:00.000Z"),
  );
  const internalOption = await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "licensing-view",
      resourceType: "license",
      resourceId: "license_option_telemetry",
    },
    eventContext({ sessionId: SESSION_TWO }),
    new Date("2026-07-18T12:03:00.000Z"),
  );
  assert.deepEqual(internalPlan, {
    recorded: false,
    reason: "settings-changed",
  });
  assert.deepEqual(internalOption, {
    recorded: false,
    reason: "settings-changed",
  });
  assert.deepEqual(
    memory.database
      .prepare(
        `SELECT event_name, resource_id
         FROM telemetry_events
         ORDER BY event_name`,
      )
      .all()
      .map((row) => ({ ...row })),
    [
      { event_name: "licensing-view", resource_id: "license_offer_telemetry" },
      {
        event_name: "membership-view",
        resource_id: "commerce_membership_telemetry",
      },
    ],
  );
});

test("public configuration resolves HttpOnly-cookie state and GPC or DNT without storing it", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const granted = await readTelemetryPublicConfiguration(
    memory.binding,
    new Headers({ cookie: "aop_telemetry_consent=granted" }),
  );
  assert.equal(granted.collecting, true);
  assert.equal(granted.consent, "granted");

  const dnt = await readTelemetryPublicConfiguration(
    memory.binding,
    new Headers({
      cookie: "aop_telemetry_consent=granted",
      dnt: "1",
    }),
  );
  assert.equal(dnt.collecting, false);
  assert.equal(dnt.privacySignal, "do-not-track");

  const gpc = await readTelemetryPublicConfiguration(
    memory.binding,
    new Headers({ "sec-gpc": "1" }),
    "granted",
  );
  assert.equal(gpc.collecting, false);
  assert.equal(gpc.privacySignal, "global-privacy-control");
});

test("completed UTC-day aggregation is idempotent, owner-only, and preserves aggregate facts through safe pruning", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  await updateTelemetrySettings(
    memory.binding,
    {
      collectionMode: "consent_required",
      retentionDays: 1,
      meaningfulListenSeconds: 10,
      expectedRevision: 1,
    },
    ownerContext("telemetry.settings.retention"),
    new Date("2026-07-16T10:00:00.000Z"),
  );
  await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext(),
    new Date("2026-07-17T10:00:00.000Z"),
  );
  await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext({ sessionId: SESSION_TWO, userId: null }),
    new Date("2026-07-17T11:00:00.000Z"),
  );
  await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "music-view",
      resourceType: "site",
      resourceId: "site",
    },
    eventContext(),
    new Date("2026-07-17T12:00:00.000Z"),
  );

  const context = ownerContext("telemetry.aggregate.2026-07-17");
  const aggregated = await aggregateTelemetryDay(
    memory.binding,
    "2026-07-17",
    context,
    new Date("2026-07-19T01:00:00.000Z"),
  );
  const replay = await aggregateTelemetryDay(
    memory.binding,
    "2026-07-17",
    context,
    new Date("2026-07-19T02:00:00.000Z"),
  );
  const secondOperation = await aggregateTelemetryDay(
    memory.binding,
    "2026-07-17",
    ownerContext("telemetry.aggregate.same-day.second-key"),
    new Date("2026-07-19T03:00:00.000Z"),
  );
  assert.equal(aggregated.replayed, false);
  assert.deepEqual(aggregated.value, {
    dayUtc: "2026-07-17",
    sourceEventCount: 3,
    groupCount: 2,
    sessionCount: 2,
    linkedUserCount: 1,
    finalizedAt: "2026-07-19T01:00:00.000Z",
  });
  assert.equal(replay.replayed, true);
  assert.equal(secondOperation.replayed, true);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_aggregate_days"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_daily_aggregates"),
    2,
  );

  const dashboard = await readTelemetryAdminWorkspace(
    memory.binding,
    OWNER,
    "2026-07-17",
    "2026-07-17",
  );
  assert.deepEqual(dashboard.totals, {
    eventCount: 3,
    sessionCount: 2,
    linkedUserCount: 1,
  });
  assert.deepEqual(dashboard.rows.map((row) => row.resourceId).sort(), [
    "site",
    "track_telemetry_public",
  ]);
  assert.equal(
    dashboard.rows.every((row) => !Object.hasOwn(row, "userId")),
    true,
  );

  memory.database
    .prepare(
      "UPDATE role_assignments SET revoked_at = CURRENT_TIMESTAMP WHERE id = 'role_telemetry_owner'",
    )
    .run();
  await assertRuntimeCode(
    readTelemetryAdminWorkspace(
      memory.binding,
      OWNER,
      "2026-07-17",
      "2026-07-17",
    ),
    "TELEMETRY_OWNER_REQUIRED",
  );
  memory.database
    .prepare(
      "UPDATE role_assignments SET revoked_at = NULL WHERE id = 'role_telemetry_owner'",
    )
    .run();

  const pruned = await pruneTelemetryEvents(
    memory.binding,
    ownerContext("telemetry.prune.safe"),
    new Date("2026-07-19T12:00:00.000Z"),
  );
  assert.equal(pruned.value.deletedEventCount, 3);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT SUM(event_count) FROM telemetry_daily_aggregates",
    ),
    3,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_aggregate_days"),
    1,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT source_event_count, group_count, session_count,
                  linked_user_count
           FROM telemetry_aggregate_days WHERE day_utc = '2026-07-17'`,
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

  const receipts = memory.database
    .prepare(
      `SELECT action, details_json, result_json
       FROM audit_events
       WHERE action LIKE 'telemetry.%'
       ORDER BY action`,
    )
    .all();
  assert.ok(receipts.length >= 3);
  const serialized = JSON.stringify(receipts);
  assert.doesNotMatch(
    serialized,
    /sessionId|userId|email|cookie|url|search|card|stripe/i,
  );
});

test("live telemetry totals count each session and linked account once per UTC day", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const day = "2026-07-18";

  await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext(),
    new Date(`${day}T10:00:00.000Z`),
  );
  await recordTelemetryEvent(
    memory.binding,
    {
      eventName: "music-view",
      resourceType: "site",
      resourceId: "site",
    },
    eventContext(),
    new Date(`${day}T10:01:00.000Z`),
  );
  await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext({ sessionId: SESSION_TWO, userId: null }),
    new Date(`${day}T10:02:00.000Z`),
  );

  const dashboard = await readTelemetryAdminWorkspace(
    memory.binding,
    OWNER,
    day,
    day,
    new Date(`${day}T12:00:00.000Z`),
  );
  assert.deepEqual(dashboard.totals, {
    eventCount: 3,
    sessionCount: 2,
    linkedUserCount: 1,
  });
  assert.equal(dashboard.rows.length, 2);
});

test("retention refuses to delete any unaggregated eligible day", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  await updateTelemetrySettings(
    memory.binding,
    {
      collectionMode: "consent_required",
      retentionDays: 1,
      meaningfulListenSeconds: 10,
      expectedRevision: 1,
    },
    ownerContext("telemetry.settings.prune-refusal"),
    new Date("2026-07-16T10:00:00.000Z"),
  );
  await recordTelemetryEvent(
    memory.binding,
    trackEvent(),
    eventContext(),
    new Date("2026-07-17T10:00:00.000Z"),
  );
  await assertRuntimeCode(
    pruneTelemetryEvents(
      memory.binding,
      ownerContext("telemetry.prune.refused"),
      new Date("2026-07-19T12:00:00.000Z"),
    ),
    "TELEMETRY_AGGREGATION_REQUIRED",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM telemetry_events"),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'telemetry.events.prune'",
    ),
    0,
  );
});
