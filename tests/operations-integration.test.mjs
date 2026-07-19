import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  projectSafeAuditJson,
  readOperationsOverview,
  readOwnerAccessExplanation,
} = await import("../db/operations-read.ts");
const { retryMediaJob } = await import("../db/operations-write.ts");

const OWNER = "user_operations_owner";
const CUSTOMER = "user_operations_customer";

class CountOnlyR2 {
  pages = [
    ["private/customer-one/object", "private/customer-two/object"],
    ["secret/final/object"],
  ];

  async list(options = {}) {
    const index = options.cursor ? Number(options.cursor) : 0;
    const keys = this.pages[index] ?? [];
    return {
      objects: keys.map((key) => ({ key })),
      truncated: index + 1 < this.pages.length,
      ...(index + 1 < this.pages.length ? { cursor: String(index + 1) } : {}),
      delimitedPrefixes: [],
    };
  }
}

function seedOperations(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'operations-owner@example.invalid',
       'operations-owner@example.invalid', 'active'),
      ('${CUSTOMER}', 'operations-customer@example.invalid',
       'operations-customer@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('${OWNER}', 'Fictional operations owner'),
      ('${CUSTOMER}', 'Fictional operations customer');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_operations_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_operations_customer', '${CUSTOMER}', 'customer', '${OWNER}');

    INSERT INTO media_objects
      (id, object_key, kind, visibility, owner_user_id, content_type,
       byte_length, status, approval_state, content_sha256, created_at,
       updated_at)
    VALUES
      ('media_operations_failed', 'originals/operations-failed', 'audio',
       'protected', '${OWNER}', 'audio/wav', 10, 'failed', 'pending', NULL,
       '2026-07-19T09:00:00.000Z', '2026-07-19T09:00:00.000Z'),
      ('media_operations_stale', 'originals/operations-stale', 'audio',
       'protected', '${OWNER}', 'audio/wav', 20, 'ready', 'approved',
       '${"a".repeat(64)}', '2026-07-19T09:00:00.000Z',
       '2026-07-19T09:00:00.000Z');
    INSERT INTO media_jobs
      (id, source_media_id, derivative_kind, processing_profile,
       processing_version, status, attempt_count, last_error_code,
       created_at, updated_at, finished_at)
    VALUES
      ('job_operations_failed', 'media_operations_failed', 'streaming',
       'stream-standard', '1', 'failed', 2, 'TRANSCODE_FAILED',
       '2026-07-19T09:01:00.000Z', '2026-07-19T09:02:00.000Z',
       '2026-07-19T09:02:00.000Z');
    INSERT INTO media_job_attempts
      (id, job_id, attempt, status, lease_token, error_code,
       evidence_json, created_at, finished_at)
    VALUES
      ('attempt_operations_failed_1', 'job_operations_failed', 1, 'failed',
       'lease-failed-1', 'TRANSCODE_FAILED', '{}',
       '2026-07-19T09:01:00.000Z', '2026-07-19T09:01:30.000Z'),
      ('attempt_operations_failed_2', 'job_operations_failed', 2, 'failed',
       'lease-failed-2', 'TRANSCODE_FAILED', '{}',
       '2026-07-19T09:01:31.000Z', '2026-07-19T09:02:00.000Z');
    INSERT INTO media_jobs
      (id, source_media_id, derivative_kind, processing_profile,
       processing_version, status, lease_token, lease_expires_at,
       attempt_count, created_at, updated_at)
    VALUES
      ('job_operations_stale', 'media_operations_stale', 'download',
       'download-standard', '1', 'processing', 'lease-stale-3',
       '2026-07-19T09:30:00.000Z', 3,
       '2026-07-19T09:05:00.000Z', '2026-07-19T09:05:00.000Z');
    INSERT INTO media_job_attempts
      (id, job_id, attempt, status, lease_token, evidence_json, created_at)
    VALUES
      ('attempt_operations_stale_3', 'job_operations_stale', 3, 'processing',
       'lease-stale-3', '{"objectKey":"private/media/key"}',
       '2026-07-19T09:05:00.000Z');

    INSERT INTO audit_events
      (id, actor_user_id, action, subject_type, subject_id,
       details_json, result_json, created_at)
    VALUES
      ('audit_operations_seed', '${OWNER}', 'media.source.register',
       'media-source', 'media_operations_failed',
       '{"status":"failed","email":"private@example.invalid","objectKey":"private/object","stripePayload":{"card":"4242"}}',
       '{"resourceId":"media_operations_failed","state":"failed","title":"Private title"}',
       '2026-07-19T09:03:00.000Z'),
      ('audit_operations_sensitive', '${OWNER}', 'commerce.checkout.inspect',
       'checkout-session', 'cs_test_FictionalCheckoutSession0004',
       '{"state":"sk_test_FictionalBoundaryValue0001","source":"evt_FictionalProviderEvent0002","environment":"whsec_FictionalBoundaryValue0003","id":"4242424242424242","reason":"artist-entered-private-reason"}',
       '{"status":"failed"}', '2026-07-19T08:30:00.000Z');
    INSERT INTO operational_failures
      (id, component, code, severity, subject_type, subject_id,
       occurrence_count, first_occurred_at, last_occurred_at)
    VALUES
      ('failure_operations_seed', 'media', 'TRANSCODE_FAILED', 'error',
       'media-job', 'job_operations_failed', 2,
       '2026-07-19T09:01:30.000Z', '2026-07-19T09:02:00.000Z'),
      ('failure_operations_sensitive', 'application', 'PROVIDER_FAILURE',
       'warning', 'checkout-session', 'cus_FictionalCustomerObject0005', 1,
       '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('track_operations_protected', 'operations-protected',
       'track_operations_revision', 'track_operations_revision',
       'published', '2026-07-19T08:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_operations_revision', 'track_operations_protected', 1,
       'Protected fictional track', 'protected', 'protected', 'protected');
    INSERT INTO entitlements
      (id, user_id, source_type, source_id, resource_type, resource_id,
       actions_json, state, starts_at, expires_at, created_at, updated_at)
    VALUES
      ('entitlement_operations_membership', '${CUSTOMER}', 'membership',
       'membership_operations_source', 'track', 'track_operations_protected',
       '["view","stream"]', 'active', '2026-07-19T08:00:00.000Z',
       '2027-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z',
       '2026-07-19T08:00:00.000Z');
  `);
}

test("operations overview exposes only counts, stable IDs, timestamps, and re-redacted audit JSON", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOperations(memory.database);

  const overview = await readOperationsOverview(
    memory.binding,
    new CountOnlyR2(),
    OWNER,
    new Date("2026-07-19T10:00:00.000Z"),
  );
  assert.equal(overview.storage.objectCount, 3);
  assert.equal(overview.jobs.failedCount, 1);
  assert.equal(overview.jobs.staleCount, 1);
  assert.deepEqual(
    overview.recentJobs
      .map(({ id, attemptCount, retryable, stale }) => ({
        id,
        attemptCount,
        retryable,
        stale,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    [
      {
        id: "job_operations_failed",
        attemptCount: 2,
        retryable: true,
        stale: false,
      },
      {
        id: "job_operations_stale",
        attemptCount: 3,
        retryable: true,
        stale: true,
      },
    ],
  );
  assert.equal(overview.recentFailures[0].code, "TRANSCODE_FAILED");
  assert.equal(
    overview.recentFailures.find(({ code }) => code === "PROVIDER_FAILURE")
      ?.subjectId,
    "[REDACTED]",
  );
  assert.equal(
    overview.recentAuditEvents.find(
      ({ action }) => action === "commerce.checkout.inspect",
    )?.subjectId,
    "[REDACTED]",
  );
  const serialized = JSON.stringify(overview);
  assert.doesNotMatch(
    serialized,
    /private\/customer|private@example|private\/object|4242|Private title|FictionalBoundary|FictionalProvider|FictionalCheckout|FictionalCustomer|artist-entered-private-reason/,
  );
  assert.match(serialized, /\[REDACTED\]/);
  assert.match(serialized, /media_operations_failed/);

  await assert.rejects(
    readOperationsOverview(
      memory.binding,
      new CountOnlyR2(),
      CUSTOMER,
      new Date("2026-07-19T10:00:00.000Z"),
    ),
    /active owner role/i,
  );
});

test("audit projection exposes only enumerated reason values and sanitized operational evidence", () => {
  assert.deepEqual(
    projectSafeAuditJson(
      JSON.stringify({
        reason: "not-authorized",
        reason_code: "ACCESS_DENIED",
        status: "failed",
      }),
    ),
    {
      reason: "not-authorized",
      reason_code: "ACCESS_DENIED",
      status: "failed",
    },
  );

  const projected = projectSafeAuditJson(
    JSON.stringify({
      reason: "artist-entered-private-reason",
      state: "sk_live_FictionalBoundaryValue0001",
      source: "pm_FictionalPaymentMethod0002",
      environment: "whsec_FictionalBoundaryValue0003",
      id: "4242-4242-4242-4242",
      action:
        "https://checkout.stripe.com/c/pay/cs_test_FictionalCheckoutSession0004",
    }),
  );
  const serialized = JSON.stringify(projected);
  assert.deepEqual(new Set(Object.values(projected)), new Set(["[REDACTED]"]));
  assert.doesNotMatch(
    serialized,
    /artist-entered|FictionalBoundary|FictionalPayment|FictionalCheckout|4242/,
  );
});

test("operations diagnostics mark a migration-behind installation for attention", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOperations(memory.database);
  memory.database.exec(
    "UPDATE installation_state SET schema_version = 13 WHERE id = 'installation'",
  );

  const overview = await readOperationsOverview(
    memory.binding,
    new CountOnlyR2(),
    OWNER,
    new Date("2026-07-19T10:00:00.000Z"),
  );
  assert.equal(overview.database.schemaVersion, 13);
  assert.equal(overview.database.expectedSchemaVersion, 19);
  assert.equal(overview.database.status, "attention");
});

test("failed and stale media-job retries preserve attempts, audit once, and replay idempotently", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOperations(memory.database);
  const now = new Date("2026-07-19T10:00:00.000Z");
  const failedContext = {
    actorUserId: OWNER,
    idempotencyKey: "operations-retry-failed-0001",
    requestId: "request_operations_failed_0001",
  };
  const first = await retryMediaJob(
    memory.binding,
    { jobId: "job_operations_failed", expectedAttemptCount: 2 },
    failedContext,
    now,
  );
  const replay = await retryMediaJob(
    memory.binding,
    { jobId: "job_operations_failed", expectedAttemptCount: 2 },
    failedContext,
    new Date("2026-07-19T11:00:00.000Z"),
  );
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, first.value);
  assert.equal(
    scalar(
      memory.database,
      "SELECT attempt_count FROM media_jobs WHERE id = 'job_operations_failed'",
    ),
    2,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM media_job_attempts WHERE job_id = 'job_operations_failed'",
    ),
    2,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'operations.media_job.retry' AND subject_id = 'job_operations_failed'",
    ),
    1,
  );

  const stale = await retryMediaJob(
    memory.binding,
    { jobId: "job_operations_stale", expectedAttemptCount: 3 },
    {
      actorUserId: OWNER,
      idempotencyKey: "operations-retry-stale-0001",
      requestId: "request_operations_stale_0001",
    },
    now,
  );
  assert.equal(stale.value.previousStatus, "stale");
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT media_jobs.status, media_jobs.attempt_count,
                media_job_attempts.status AS attempt_status
         FROM media_jobs
         JOIN media_job_attempts ON media_job_attempts.job_id = media_jobs.id
                              AND media_job_attempts.attempt = 3
         WHERE media_jobs.id = 'job_operations_stale'`,
        )
        .get(),
    },
    { status: "pending", attempt_count: 3, attempt_status: "stale" },
  );
});

test("owner access explanation resolves the exact D1 customer and resource through decideAccess", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOperations(memory.database);

  const explanation = await readOwnerAccessExplanation(
    memory.binding,
    OWNER,
    {
      customerUserId: CUSTOMER,
      resourceType: "track",
      resourceId: "track_operations_protected",
      action: "stream",
    },
    new Date("2026-07-19T10:00:00.000Z"),
  );
  assert.equal(explanation.resourceStatus, "published");
  assert.equal(explanation.accessMode, "protected");
  assert.deepEqual(explanation.decision, {
    allowed: true,
    reason: "entitlement",
    source: "membership",
    entitlementId: "entitlement_operations_membership",
    expiresAt: "2027-07-19T08:00:00.000Z",
    sourceExplanation: "Membership entitlement",
  });
  assert.equal(explanation.sources.length, 1);

  await assert.rejects(
    readOwnerAccessExplanation(
      memory.binding,
      OWNER,
      {
        customerUserId: "user_missing_customer",
        resourceType: "track",
        resourceId: "track_operations_protected",
        action: "view",
      },
      new Date("2026-07-19T10:00:00.000Z"),
    ),
    /active customer was not found/i,
  );
});
