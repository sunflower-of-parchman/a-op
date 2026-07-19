import {
  ACCESS_RESOURCE_TYPES,
  readAccessFacts,
  type AccessResourceType,
} from "./access-read.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import {
  ACCESS_ALLOW_REASONS,
  ACCESS_DENIAL_REASONS,
  decideAccess,
} from "@/lib/access/decide-access.ts";
import { CURRENT_OPERATIONAL_SCHEMA_VERSION } from "@/lib/operations/schema-version.ts";
import type {
  AccessExplanationInput,
  OperationsAccessExplanation,
  OperationsAuditEvent,
  OperationsFailure,
  OperationsMediaJob,
  OperationsOverview,
} from "@/lib/operations/types.ts";
import {
  REDACTED_VALUE,
  RuntimeError,
  containsSensitiveValue,
  redactForJson,
  type SafeJsonObject,
  type SafeJsonValue,
} from "@/lib/runtime/index.ts";

interface DiagnosticRow {
  installation_status: unknown;
  schema_version: unknown;
  table_count: unknown;
  active_user_count: unknown;
  active_owner_count: unknown;
  active_editor_count: unknown;
  active_customer_count: unknown;
  source_count: unknown;
  ready_source_count: unknown;
  failed_source_count: unknown;
  derivative_count: unknown;
  ready_derivative_count: unknown;
  failed_derivative_count: unknown;
  job_count: unknown;
  pending_job_count: unknown;
  processing_job_count: unknown;
  ready_job_count: unknown;
  failed_job_count: unknown;
  stale_job_count: unknown;
}

interface MediaJobRow {
  id: unknown;
  source_media_id: unknown;
  derivative_kind: unknown;
  status: unknown;
  attempt_count: unknown;
  last_error_code: unknown;
  lease_expires_at: unknown;
  stale: unknown;
  created_at: unknown;
  updated_at: unknown;
  finished_at: unknown;
}

interface AuditRow {
  id: unknown;
  action: unknown;
  subject_type: unknown;
  subject_id: unknown;
  details_json: unknown;
  result_json: unknown;
  created_at: unknown;
}

interface FailureRow {
  id: unknown;
  component: unknown;
  code: unknown;
  severity: unknown;
  subject_type: unknown;
  subject_id: unknown;
  occurrence_count: unknown;
  first_occurred_at: unknown;
  last_occurred_at: unknown;
  resolved_at: unknown;
}

interface ActiveCustomerRow {
  status: unknown;
}

interface ResolvedResourceRow {
  resource_status: unknown;
  access_mode: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/;
const SAFE_LABEL = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;
const RESOURCE_TYPES = new Set<string>(ACCESS_RESOURCE_TYPES);
const AUDIT_VALUE_KEYS =
  /(?:^|_)(?:id|ids|state|status|type|kind|mode|reason|source|action|actions|environment|livemode|allowed|replayed|revision|version|count|position|quantity|bytes?|length|starts?|expires?|created|updated|finished|completed|published|occurred|resolved)(?:_|$)/i;
const PROVIDER_OR_PRIVATE_KEY =
  /(?:stripe|provider|payment|checkout|card|billing|payload|raw|secret|signature|token|cookie|email|address|customer|object.?key|file.?path|local.?path)/i;
const PROVIDER_IDENTIFIER =
  /^(?:acct_|ba_|card_|ch_|cs_(?:test|live)_|cus_|evt_|in_|li_|pi_|pm_|price_|prod_|seti_|src_|sub_|tok_)/i;
const SAFE_AUDIT_REASON_VALUES = new Set<string>([
  ...ACCESS_ALLOW_REASONS,
  ...ACCESS_DENIAL_REASONS,
]);

function integrity(message: string): never {
  throw new Error(`Operations integrity error: ${message}`);
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function safeLabel(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_LABEL.test(value)) {
    return integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function safeCode(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_CODE.test(value)) {
    return integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function projectSafeIdentifier(value: unknown, label: string): string {
  const identifier = safeId(value, label);
  return PROVIDER_IDENTIFIER.test(identifier) ||
    containsSensitiveValue(identifier)
    ? REDACTED_VALUE
    : identifier;
}

function projectSafeLabel(value: unknown, label: string): string {
  const projected = safeLabel(value, label);
  return containsSensitiveValue(projected) ? REDACTED_VALUE : projected;
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function booleanInteger(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value === 1;
}

function requireSafeActorUserId(value: string): string {
  if (!SAFE_ID.test(value)) {
    throw new TypeError("A safe owner user ID is required.");
  }
  return value;
}

async function requireActiveOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<{ allowed: unknown }>();
  if (row?.allowed === 1) return;
  throw new RuntimeError("ROLE_REQUIRED", "An active owner role is required.", {
    status: 403,
    publicMessage: "This account cannot view operations.",
  });
}

function filterAuditValue(value: SafeJsonValue, key = "root"): SafeJsonValue {
  if (PROVIDER_OR_PRIVATE_KEY.test(key)) return REDACTED_VALUE;
  if (key.toLowerCase().replace(/[^a-z0-9]/g, "") === "reason") {
    return typeof value === "string" && SAFE_AUDIT_REASON_VALUES.has(value)
      ? value
      : REDACTED_VALUE;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return AUDIT_VALUE_KEYS.test(key) ? value : REDACTED_VALUE;
  }
  if (typeof value === "string") {
    if (value === REDACTED_VALUE) return value;
    if (!AUDIT_VALUE_KEYS.test(key)) return REDACTED_VALUE;
    if (Number.isFinite(Date.parse(value))) {
      return new Date(Date.parse(value)).toISOString();
    }
    return (SAFE_ID.test(value) || SAFE_CODE.test(value)) &&
      !PROVIDER_IDENTIFIER.test(value)
      ? value
      : REDACTED_VALUE;
  }
  if (Array.isArray(value)) {
    if (!AUDIT_VALUE_KEYS.test(key)) return REDACTED_VALUE;
    return Object.freeze(
      value.slice(0, 32).map((item) => filterAuditValue(item, key)),
    );
  }
  const output: Record<string, SafeJsonValue> = {};
  for (const [index, [childKey, childValue]] of Object.entries(value)
    .slice(0, 64)
    .entries()) {
    const outputKey = PROVIDER_OR_PRIVATE_KEY.test(childKey)
      ? `redactedPrivateField${index + 1}`
      : AUDIT_VALUE_KEYS.test(childKey) &&
          /^[a-z][a-z0-9_]{0,63}$/i.test(childKey)
        ? childKey
        : `redactedField${index + 1}`;
    output[outputKey] = filterAuditValue(childValue, childKey);
  }
  return Object.freeze(output);
}

/** Re-parses and re-redacts stored JSON before any audit detail reaches a client. */
export function projectSafeAuditJson(value: unknown): SafeJsonObject {
  let parsed: unknown = {};
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }
  const redacted = redactForJson(parsed);
  if (
    redacted === null ||
    Array.isArray(redacted) ||
    typeof redacted !== "object"
  ) {
    return Object.freeze({});
  }
  const filtered = filterAuditValue(redacted);
  return filtered !== null &&
    !Array.isArray(filtered) &&
    typeof filtered === "object"
    ? (filtered as SafeJsonObject)
    : Object.freeze({});
}

async function countR2Objects(bucket: R2Bucket): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  const visited = new Set<string>();
  for (let page = 0; page < 10_000; page += 1) {
    const result = await bucket.list({
      limit: 1_000,
      ...(cursor ? { cursor } : {}),
    });
    total += result.objects.length;
    if (!result.truncated) return total;
    if (!result.cursor || visited.has(result.cursor)) {
      throw new Error("R2 pagination did not advance.");
    }
    visited.add(result.cursor);
    cursor = result.cursor;
  }
  throw new Error("R2 diagnostic pagination exceeded its bound.");
}

function projectJob(row: MediaJobRow): OperationsMediaJob {
  const status = row.status;
  if (
    status !== "pending" &&
    status !== "processing" &&
    status !== "ready" &&
    status !== "failed"
  ) {
    return integrity("D1 returned an invalid media-job status.");
  }
  const stale = booleanInteger(row.stale, "media-job stale flag");
  return Object.freeze({
    id: projectSafeIdentifier(row.id, "media-job ID"),
    sourceMediaId: projectSafeIdentifier(
      row.source_media_id,
      "media source ID",
    ),
    derivativeKind: projectSafeLabel(row.derivative_kind, "derivative kind"),
    status,
    attemptCount: count(row.attempt_count, "media-job attempt count"),
    retryable: status === "failed" || stale,
    stale,
    lastErrorCode:
      row.last_error_code === null
        ? null
        : safeCode(row.last_error_code, "media-job error code"),
    leaseExpiresAt: nullableTimestamp(
      row.lease_expires_at,
      "media-job lease expiry",
    ),
    createdAt: timestamp(row.created_at, "media-job creation timestamp"),
    updatedAt: timestamp(row.updated_at, "media-job update timestamp"),
    finishedAt: nullableTimestamp(
      row.finished_at,
      "media-job finish timestamp",
    ),
  });
}

function projectAudit(row: AuditRow): OperationsAuditEvent {
  return Object.freeze({
    id: projectSafeIdentifier(row.id, "audit ID"),
    action: projectSafeLabel(row.action, "audit action"),
    subjectType: projectSafeLabel(row.subject_type, "audit subject type"),
    subjectId: projectSafeIdentifier(row.subject_id, "audit subject ID"),
    details: projectSafeAuditJson(row.details_json),
    result: projectSafeAuditJson(row.result_json),
    createdAt: timestamp(row.created_at, "audit creation timestamp"),
  });
}

function projectFailure(row: FailureRow): OperationsFailure {
  if (row.severity !== "warning" && row.severity !== "error") {
    return integrity("D1 returned an invalid operational-failure severity.");
  }
  if ((row.subject_type === null) !== (row.subject_id === null)) {
    return integrity("D1 returned an incomplete operational-failure subject.");
  }
  return Object.freeze({
    id: projectSafeIdentifier(row.id, "operational-failure ID"),
    component: projectSafeLabel(row.component, "operational-failure component"),
    code: safeCode(row.code, "operational-failure code"),
    severity: row.severity,
    subjectType:
      row.subject_type === null
        ? null
        : projectSafeLabel(
            row.subject_type,
            "operational-failure subject type",
          ),
    subjectId:
      row.subject_id === null
        ? null
        : projectSafeIdentifier(
            row.subject_id,
            "operational-failure subject ID",
          ),
    occurrenceCount: count(row.occurrence_count, "operational-failure count"),
    firstOccurredAt: timestamp(
      row.first_occurred_at,
      "first occurrence timestamp",
    ),
    lastOccurredAt: timestamp(
      row.last_occurred_at,
      "last occurrence timestamp",
    ),
    resolvedAt: nullableTimestamp(row.resolved_at, "resolution timestamp"),
  });
}

export async function readOperationsOverview(
  binding: D1Database,
  bucket: R2Bucket,
  rawActorUserId: string,
  now = new Date(),
): Promise<OperationsOverview> {
  const actorUserId = requireSafeActorUserId(rawActorUserId);
  const generatedAt = new Date(now).toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new TypeError("A valid operations diagnostic time is required.");
  }
  await requireActiveOwner(binding, actorUserId);
  const authority = activeOwnerCondition(actorUserId);
  const [diagnostic, jobsResult, failuresResult, auditResult, storage] =
    await Promise.all([
      binding
        .prepare(
          `SELECT
             COALESCE((SELECT status FROM installation_state WHERE id = 'installation'), 'unavailable') AS installation_status,
             (SELECT schema_version FROM installation_state WHERE id = 'installation') AS schema_version,
             (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%') AS table_count,
             (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_user_count,
             (SELECT COUNT(DISTINCT users.id) FROM users JOIN role_assignments ON role_assignments.user_id = users.id AND role_assignments.role_key = 'owner' AND role_assignments.revoked_at IS NULL WHERE users.status = 'active') AS active_owner_count,
             (SELECT COUNT(DISTINCT users.id) FROM users JOIN role_assignments ON role_assignments.user_id = users.id AND role_assignments.role_key = 'editor' AND role_assignments.revoked_at IS NULL WHERE users.status = 'active') AS active_editor_count,
             (SELECT COUNT(DISTINCT users.id) FROM users JOIN role_assignments ON role_assignments.user_id = users.id AND role_assignments.role_key = 'customer' AND role_assignments.revoked_at IS NULL WHERE users.status = 'active') AS active_customer_count,
             (SELECT COUNT(*) FROM media_objects) AS source_count,
             (SELECT COUNT(*) FROM media_objects WHERE status = 'ready') AS ready_source_count,
             (SELECT COUNT(*) FROM media_objects WHERE status = 'failed') AS failed_source_count,
             (SELECT COUNT(*) FROM media_derivatives) AS derivative_count,
             (SELECT COUNT(*) FROM media_derivatives WHERE status = 'ready') AS ready_derivative_count,
             (SELECT COUNT(*) FROM media_derivatives WHERE status = 'failed') AS failed_derivative_count,
             (SELECT COUNT(*) FROM media_jobs) AS job_count,
             (SELECT COUNT(*) FROM media_jobs WHERE status = 'pending') AS pending_job_count,
             (SELECT COUNT(*) FROM media_jobs WHERE status = 'processing') AS processing_job_count,
             (SELECT COUNT(*) FROM media_jobs WHERE status = 'ready') AS ready_job_count,
             (SELECT COUNT(*) FROM media_jobs WHERE status = 'failed') AS failed_job_count,
             (SELECT COUNT(*) FROM media_jobs WHERE status = 'processing' AND lease_expires_at IS NOT NULL AND julianday(lease_expires_at) <= julianday(?)) AS stale_job_count
           WHERE ${authority.sql}`,
        )
        .bind(generatedAt, ...authority.bindings)
        .first<DiagnosticRow>(),
      binding
        .prepare(
          `SELECT id, source_media_id, derivative_kind, status, attempt_count,
                  last_error_code, lease_expires_at,
                  CASE WHEN status = 'processing' AND lease_expires_at IS NOT NULL
                         AND julianday(lease_expires_at) <= julianday(?)
                       THEN 1 ELSE 0 END AS stale,
                  created_at, updated_at, finished_at
           FROM media_jobs
           WHERE ${authority.sql}
           ORDER BY updated_at DESC, id ASC
           LIMIT 100`,
        )
        .bind(generatedAt, ...authority.bindings)
        .all<MediaJobRow>(),
      binding
        .prepare(
          `SELECT id, component, code, severity, subject_type, subject_id,
                  occurrence_count, first_occurred_at, last_occurred_at,
                  resolved_at
           FROM operational_failures
           WHERE ${authority.sql}
           ORDER BY resolved_at IS NOT NULL ASC, last_occurred_at DESC, id ASC
           LIMIT 100`,
        )
        .bind(...authority.bindings)
        .all<FailureRow>(),
      binding
        .prepare(
          `SELECT id, action, subject_type, subject_id, details_json,
                  result_json, created_at
           FROM audit_events
           WHERE ${authority.sql}
           ORDER BY created_at DESC, id ASC
           LIMIT 100`,
        )
        .bind(...authority.bindings)
        .all<AuditRow>(),
      countR2Objects(bucket).then(
        (objectCount) => ({ status: "healthy" as const, objectCount }),
        () => ({ status: "unavailable" as const, objectCount: null }),
      ),
    ]);
  await requireActiveOwner(binding, actorUserId);
  if (!diagnostic) return integrity("D1 returned no owner diagnostic row.");
  const installationStatus = diagnostic.installation_status;
  if (
    installationStatus !== "pending" &&
    installationStatus !== "active" &&
    installationStatus !== "unavailable"
  ) {
    return integrity("D1 returned an invalid installation status.");
  }
  const schemaVersion =
    diagnostic.schema_version === null
      ? null
      : count(diagnostic.schema_version, "schema version");
  const activeOwnerCount = count(
    diagnostic.active_owner_count,
    "active owner count",
  );
  const failedSourceCount = count(
    diagnostic.failed_source_count,
    "failed media-source count",
  );
  const failedDerivativeCount = count(
    diagnostic.failed_derivative_count,
    "failed derivative count",
  );
  const failedJobCount = count(diagnostic.failed_job_count, "failed job count");
  const staleJobCount = count(diagnostic.stale_job_count, "stale job count");
  const recentFailures = Object.freeze(
    failuresResult.results.map(projectFailure),
  );
  return Object.freeze({
    generatedAt,
    database: Object.freeze({
      status:
        installationStatus === "active" &&
        schemaVersion === CURRENT_OPERATIONAL_SCHEMA_VERSION
          ? "healthy"
          : "attention",
      installationStatus,
      schemaVersion,
      expectedSchemaVersion: CURRENT_OPERATIONAL_SCHEMA_VERSION,
      tableCount: count(diagnostic.table_count, "D1 table count"),
    }),
    storage: Object.freeze(storage),
    identity: Object.freeze({
      status: activeOwnerCount > 0 ? "healthy" : "attention",
      activeUserCount: count(diagnostic.active_user_count, "active user count"),
      activeOwnerCount,
      activeEditorCount: count(
        diagnostic.active_editor_count,
        "active editor count",
      ),
      activeCustomerCount: count(
        diagnostic.active_customer_count,
        "active customer count",
      ),
    }),
    media: Object.freeze({
      status:
        failedSourceCount === 0 && failedDerivativeCount === 0
          ? "healthy"
          : "attention",
      sourceCount: count(diagnostic.source_count, "media-source count"),
      readySourceCount: count(
        diagnostic.ready_source_count,
        "ready media-source count",
      ),
      failedSourceCount,
      derivativeCount: count(diagnostic.derivative_count, "derivative count"),
      readyDerivativeCount: count(
        diagnostic.ready_derivative_count,
        "ready derivative count",
      ),
      failedDerivativeCount,
    }),
    jobs: Object.freeze({
      status:
        failedJobCount === 0 && staleJobCount === 0 ? "healthy" : "attention",
      totalCount: count(diagnostic.job_count, "media-job count"),
      pendingCount: count(diagnostic.pending_job_count, "pending job count"),
      processingCount: count(
        diagnostic.processing_job_count,
        "processing job count",
      ),
      readyCount: count(diagnostic.ready_job_count, "ready job count"),
      failedCount: failedJobCount,
      staleCount: staleJobCount,
    }),
    recentJobs: Object.freeze(jobsResult.results.map(projectJob)),
    recentFailures,
    recentAuditEvents: Object.freeze(auditResult.results.map(projectAudit)),
  });
}

function resourceQuery(resourceType: AccessResourceType): string {
  switch (resourceType) {
    case "track":
      return `SELECT tracks.publication_state AS resource_status,
                     CASE ?2 WHEN 'view' THEN track_revisions.view_mode
                              WHEN 'stream' THEN track_revisions.stream_mode
                              ELSE track_revisions.download_mode END AS access_mode
              FROM tracks
              JOIN track_revisions ON track_revisions.id = tracks.published_revision_id
                                  AND track_revisions.track_id = tracks.id
              WHERE tracks.id = ?1 AND tracks.publication_state = 'published'`;
    case "release":
      return `SELECT releases.publication_state AS resource_status,
                     CASE WHEN ?2 = 'view' THEN release_revisions.view_mode
                          ELSE 'protected' END AS access_mode
              FROM releases
              JOIN release_revisions ON release_revisions.id = releases.published_revision_id
                                    AND release_revisions.release_id = releases.id
              WHERE releases.id = ?1 AND releases.publication_state = 'published'`;
    case "collection":
      return `SELECT collections.publication_state AS resource_status,
                     CASE WHEN ?2 = 'view' THEN collection_revisions.view_mode
                          ELSE 'protected' END AS access_mode
              FROM collections
              JOIN collection_revisions ON collection_revisions.id = collections.published_revision_id
                                       AND collection_revisions.collection_id = collections.id
              WHERE collections.id = ?1 AND collections.publication_state = 'published'`;
    case "course":
      return `SELECT courses.publication_state AS resource_status,
                     CASE WHEN ?2 = 'view' THEN course_revisions.access_mode
                          ELSE 'protected' END AS access_mode
              FROM courses
              JOIN course_revisions ON course_revisions.id = courses.published_revision_id
                                   AND course_revisions.course_id = courses.id
              WHERE courses.id = ?1 AND courses.publication_state = 'published'`;
    case "lesson":
      return `SELECT courses.publication_state AS resource_status,
                     CASE lessons.access_mode WHEN 'inherit' THEN course_revisions.access_mode
                                              ELSE lessons.access_mode END AS access_mode
              FROM lessons
              JOIN course_revisions ON course_revisions.id = lessons.course_revision_id
              JOIN courses ON courses.id = course_revisions.course_id
                          AND courses.published_revision_id = course_revisions.id
              WHERE lessons.id = ?1 AND courses.publication_state = 'published'`;
    case "license-document":
      return `SELECT license_documents.state AS resource_status,
                     'protected' AS access_mode
              FROM license_documents
              WHERE license_documents.id = ?1`;
  }
}

export async function readOwnerAccessExplanation(
  binding: D1Database,
  rawActorUserId: string,
  input: AccessExplanationInput,
  now = new Date(),
): Promise<OperationsAccessExplanation> {
  const actorUserId = requireSafeActorUserId(rawActorUserId);
  if (
    !SAFE_ID.test(input.customerUserId) ||
    !SAFE_ID.test(input.resourceId) ||
    !RESOURCE_TYPES.has(input.resourceType)
  ) {
    throw new TypeError("Safe customer and resource identifiers are required.");
  }
  const decidedAt = new Date(now).toISOString();
  if (!Number.isFinite(Date.parse(decidedAt))) {
    throw new TypeError("A valid access-decision time is required.");
  }
  await requireActiveOwner(binding, actorUserId);
  const authority = activeOwnerCondition(actorUserId);
  const [customer, resource] = await Promise.all([
    binding
      .prepare(
        `SELECT users.status AS status
         FROM users
         JOIN role_assignments ON role_assignments.user_id = users.id
                              AND role_assignments.role_key = 'customer'
                              AND role_assignments.revoked_at IS NULL
         WHERE users.id = ?1 AND users.status = 'active'
           AND ${authority.sql}
         LIMIT 1`,
      )
      .bind(input.customerUserId, ...authority.bindings)
      .first<ActiveCustomerRow>(),
    binding
      .prepare(
        `${resourceQuery(input.resourceType)}
         AND ?2 IN ('view', 'stream', 'download')
         AND ${authority.sql}
         LIMIT 1`,
      )
      .bind(input.resourceId, input.action, ...authority.bindings)
      .first<ResolvedResourceRow>(),
  ]);
  if (!customer || customer.status !== "active") {
    throw new RuntimeError(
      "CUSTOMER_NOT_FOUND",
      "The active customer was not found.",
      {
        status: 404,
        publicMessage: "That active customer was not found.",
      },
    );
  }
  if (!resource) {
    throw new RuntimeError(
      "RESOURCE_NOT_FOUND",
      "The current resource was not found.",
      {
        status: 404,
        publicMessage: "That current resource was not found.",
      },
    );
  }
  const accessMode = resource.access_mode;
  if (
    accessMode !== "public" &&
    accessMode !== "account" &&
    accessMode !== "protected" &&
    accessMode !== "unavailable"
  ) {
    return integrity("D1 returned an invalid resource access mode.");
  }
  const resourceStatus = safeLabel(resource.resource_status, "resource status");
  const identity = {
    userId: input.customerUserId,
    roles: ["customer"] as const,
  };
  const projection = await readAccessFacts(binding, {
    identity,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    now: decidedAt,
  });
  const decision = await decideAccess({
    identity,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    now: decidedAt,
    facts: {
      publicActions: accessMode === "public" ? [input.action] : [],
      accountActions: accessMode === "account" ? [input.action] : [],
      grants: accessMode === "unavailable" ? [] : projection.facts.grants,
    },
  });
  await requireActiveOwner(binding, actorUserId);
  return Object.freeze({
    customerUserId: input.customerUserId,
    customerStatus: "active",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceStatus,
    accessMode,
    action: input.action,
    decidedAt,
    decision: Object.freeze(decision),
    sources: projection.sources,
  });
}
