import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  parseLicenseIntendedUseSnapshotJson,
  parseLicenseTermsSnapshotJson,
} from "@/lib/licensing/snapshot.ts";
import type {
  LicenseDocumentJobStatus,
  LicenseDocumentState,
  LicenseIntendedUseSnapshot,
  LicenseTermsSnapshot,
} from "@/lib/licensing/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { createMutationFingerprint } from "@/lib/runtime/idempotency.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const PRIVATE_OBJECT_KEY = /^[a-z0-9][a-z0-9._/-]{0,511}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const DELIVERY_ACCESS_SOURCES = new Set([
  "role",
  "grant",
  "order",
  "membership",
  "subscription",
  "license",
  "credit",
]);
export const LICENSE_DOCUMENT_CONTENT_TYPE = "text/plain; charset=utf-8";

interface CountRow {
  count: number;
}

interface WorkflowRow {
  document_id: unknown;
  document_state: unknown;
  document_revision: unknown;
  document_media_object_id: unknown;
  document_content_digest: unknown;
  document_byte_length: unknown;
  document_failure_category: unknown;
  document_environment: unknown;
  document_livemode: unknown;
  job_id: unknown;
  job_status: unknown;
  job_attempts: unknown;
  job_worker_id: unknown;
  job_lease_token: unknown;
  job_lease_expires_at: unknown;
  issued_license_id: unknown;
  customer_user_id: unknown;
  issued_license_state: unknown;
  issued_at: unknown;
  expires_at: unknown;
  terms_snapshot_json: unknown;
  issued_environment: unknown;
  issued_livemode: unknown;
  request_terms_snapshot_json: unknown;
  intended_use_snapshot_json: unknown;
  media_object_id: unknown;
  media_object_key: unknown;
  media_kind: unknown;
  media_visibility: unknown;
  media_content_type: unknown;
  media_byte_length: unknown;
  media_status: unknown;
  media_approval_state: unknown;
  media_content_sha256: unknown;
}

interface DeliveryAuditRow {
  request_fingerprint: unknown;
  details_json: unknown;
  result_json: unknown;
}

export interface LicenseDocumentMediaRecord {
  readonly id: string;
  /** Server-only R2 key. Never return this record to a browser component. */
  readonly objectKey: string;
  readonly contentType: typeof LICENSE_DOCUMENT_CONTENT_TYPE;
  readonly byteLength: number;
  readonly contentDigest: string;
}

export interface LicenseDocumentWorkflowRecord {
  readonly documentId: string;
  readonly documentState: LicenseDocumentState;
  readonly documentRevision: number;
  readonly documentContentDigest: string | null;
  readonly documentByteLength: number | null;
  readonly documentFailureCategory: string | null;
  readonly jobId: string;
  readonly jobStatus: LicenseDocumentJobStatus;
  readonly jobAttempts: number;
  readonly jobWorkerId: string | null;
  readonly jobLeaseToken: string | null;
  readonly jobLeaseExpiresAt: string | null;
  readonly issuedLicenseId: string;
  readonly issuedLicenseState: "active" | "revoked" | "expired";
  readonly customerUserId: string;
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly termsSnapshot: LicenseTermsSnapshot;
  readonly intendedUseSnapshot: LicenseIntendedUseSnapshot;
  readonly media: LicenseDocumentMediaRecord | null;
}

export interface LicenseDocumentReadyReceipt {
  readonly documentId: string;
  readonly issuedLicenseId: string;
  readonly customerUserId: string;
  readonly state: "ready";
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly revision: number;
  readonly jobId: string;
  readonly jobStatus: "complete";
  readonly attempts: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface ClaimedLicenseDocumentJob {
  readonly documentRevision: number;
  readonly attempt: number;
}

function unsafeInput(message: string): RuntimeError {
  return new RuntimeError("LICENSE_DOCUMENT_INPUT_INVALID", message, {
    status: 400,
    publicMessage: "That license document request is invalid.",
  });
}

function integrity(message: string): RuntimeError {
  return new RuntimeError("LICENSE_DOCUMENT_INTEGRITY", message, {
    status: 500,
    publicMessage: "The saved license document could not be read safely.",
  });
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

export function requireLicenseDocumentId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw unsafeInput("A safe license document identifier is required.");
  }
  return value;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : safeId(value, label);
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  return value === null ? null : positiveInteger(value, label);
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function documentState(value: unknown): LicenseDocumentState {
  if (
    value !== "queued" &&
    value !== "processing" &&
    value !== "ready" &&
    value !== "failed"
  ) {
    throw integrity("D1 returned an invalid license document state.");
  }
  return value;
}

function jobStatus(value: unknown): LicenseDocumentJobStatus {
  if (
    value !== "queued" &&
    value !== "processing" &&
    value !== "complete" &&
    value !== "failed"
  ) {
    throw integrity("D1 returned an invalid license document job state.");
  }
  return value;
}

function issuedLicenseState(value: unknown): "active" | "revoked" | "expired" {
  if (value !== "active" && value !== "revoked" && value !== "expired") {
    throw integrity("D1 returned an invalid issued license state.");
  }
  return value;
}

function testBoundary(environment: unknown, livemode: unknown, label: string) {
  if (environment !== "test" || livemode !== 0) {
    throw integrity(`D1 returned an invalid ${label} commerce boundary.`);
  }
}

function readMedia(row: WorkflowRow): LicenseDocumentMediaRecord | null {
  if (row.media_object_id === null) {
    if (
      row.media_object_key !== null ||
      row.media_content_type !== null ||
      row.media_byte_length !== null ||
      row.media_content_sha256 !== null
    ) {
      throw integrity("D1 returned a partial license document media record.");
    }
    return null;
  }
  const objectKey = row.media_object_key;
  const contentDigest = row.media_content_sha256;
  if (
    typeof objectKey !== "string" ||
    !PRIVATE_OBJECT_KEY.test(objectKey) ||
    objectKey.includes("..") ||
    row.media_kind !== "document" ||
    row.media_visibility !== "protected" ||
    row.media_content_type !== LICENSE_DOCUMENT_CONTENT_TYPE ||
    row.media_status !== "ready" ||
    row.media_approval_state !== "approved" ||
    typeof contentDigest !== "string" ||
    !SHA256.test(contentDigest)
  ) {
    throw integrity("D1 returned invalid protected license document media.");
  }
  return Object.freeze({
    id: safeId(row.media_object_id, "license document media ID"),
    objectKey,
    contentType: LICENSE_DOCUMENT_CONTENT_TYPE,
    byteLength: positiveInteger(
      row.media_byte_length,
      "license document media byte length",
    ),
    contentDigest,
  });
}

function mapWorkflowRow(row: WorkflowRow): LicenseDocumentWorkflowRecord {
  testBoundary(
    row.document_environment,
    row.document_livemode,
    "license document",
  );
  testBoundary(row.issued_environment, row.issued_livemode, "issued license");
  if (
    typeof row.terms_snapshot_json !== "string" ||
    row.terms_snapshot_json !== row.request_terms_snapshot_json ||
    typeof row.intended_use_snapshot_json !== "string"
  ) {
    throw integrity(
      "The issued license no longer matches its immutable request snapshots.",
    );
  }
  const state = documentState(row.document_state);
  const digest =
    row.document_content_digest === null
      ? null
      : typeof row.document_content_digest === "string" &&
          SHA256.test(row.document_content_digest)
        ? row.document_content_digest
        : (() => {
            throw integrity("D1 returned an invalid document digest.");
          })();
  const byteLength = nullablePositiveInteger(
    row.document_byte_length,
    "license document byte length",
  );
  const media = readMedia(row);
  const mediaObjectId = nullableId(
    row.document_media_object_id,
    "document media reference",
  );
  if (
    (state === "ready" &&
      (media === null ||
        mediaObjectId !== media.id ||
        digest !== media.contentDigest ||
        byteLength !== media.byteLength)) ||
    (state !== "ready" && mediaObjectId !== null)
  ) {
    throw integrity("D1 returned inconsistent license document media state.");
  }

  return Object.freeze({
    documentId: safeId(row.document_id, "license document ID"),
    documentState: state,
    documentRevision: positiveInteger(
      row.document_revision,
      "license document revision",
    ),
    documentContentDigest: digest,
    documentByteLength: byteLength,
    documentFailureCategory: nullableText(
      row.document_failure_category,
      "license document failure category",
    ),
    jobId: safeId(row.job_id, "license document job ID"),
    jobStatus: jobStatus(row.job_status),
    jobAttempts: nonnegativeInteger(row.job_attempts, "document job attempts"),
    jobWorkerId: nullableId(row.job_worker_id, "document worker ID"),
    jobLeaseToken: nullableId(row.job_lease_token, "document lease token"),
    jobLeaseExpiresAt: nullableTimestamp(
      row.job_lease_expires_at,
      "document lease expiry",
    ),
    issuedLicenseId: safeId(row.issued_license_id, "issued license ID"),
    issuedLicenseState: issuedLicenseState(row.issued_license_state),
    customerUserId: safeId(row.customer_user_id, "license customer ID"),
    issuedAt: timestamp(row.issued_at, "license issuance time"),
    expiresAt: nullableTimestamp(row.expires_at, "license expiry time"),
    termsSnapshot: parseLicenseTermsSnapshotJson(row.terms_snapshot_json),
    intendedUseSnapshot: parseLicenseIntendedUseSnapshotJson(
      row.intended_use_snapshot_json,
    ),
    media,
  });
}

export async function readLicenseDocumentWorkflowRecord(
  binding: D1Database,
  rawDocumentId: string,
): Promise<LicenseDocumentWorkflowRecord | null> {
  const documentId = requireLicenseDocumentId(rawDocumentId);
  const row = await binding
    .prepare(
      `SELECT
         document.id AS document_id,
         document.state AS document_state,
         document.revision AS document_revision,
         document.media_object_id AS document_media_object_id,
         document.content_digest AS document_content_digest,
         document.byte_length AS document_byte_length,
         document.failure_category AS document_failure_category,
         document.stripe_environment AS document_environment,
         document.livemode AS document_livemode,
         job.id AS job_id,
         job.status AS job_status,
         job.attempts AS job_attempts,
         job.worker_id AS job_worker_id,
         job.lease_token AS job_lease_token,
         job.lease_expires_at AS job_lease_expires_at,
         issued.id AS issued_license_id,
         issued.customer_user_id AS customer_user_id,
         issued.state AS issued_license_state,
         issued.issued_at AS issued_at,
         issued.expires_at AS expires_at,
         issued.terms_snapshot_json AS terms_snapshot_json,
         issued.stripe_environment AS issued_environment,
         issued.livemode AS issued_livemode,
         request.terms_snapshot_json AS request_terms_snapshot_json,
         request.intended_use_snapshot_json AS intended_use_snapshot_json,
         media.id AS media_object_id,
         media.object_key AS media_object_key,
         media.kind AS media_kind,
         media.visibility AS media_visibility,
         media.content_type AS media_content_type,
         media.byte_length AS media_byte_length,
         media.status AS media_status,
         media.approval_state AS media_approval_state,
         media.content_sha256 AS media_content_sha256
       FROM license_documents AS document
       JOIN license_document_jobs AS job
         ON job.license_document_id = document.id
       JOIN issued_licenses AS issued
         ON issued.id = document.issued_license_id
        AND issued.customer_user_id = document.customer_user_id
       JOIN license_requests AS request
         ON request.id = issued.license_request_id
        AND request.customer_user_id = issued.customer_user_id
       LEFT JOIN media_objects AS media
         ON media.id = document.media_object_id
       WHERE document.id = ?1
       LIMIT 1`,
    )
    .bind(documentId)
    .first<WorkflowRow>();
  return row ? mapWorkflowRow(row) : null;
}

export function readyLicenseDocumentReceipt(
  record: LicenseDocumentWorkflowRecord,
): LicenseDocumentReadyReceipt {
  if (
    record.documentState !== "ready" ||
    record.jobStatus !== "complete" ||
    record.media === null ||
    record.documentContentDigest !== record.media.contentDigest ||
    record.documentByteLength !== record.media.byteLength
  ) {
    throw integrity("The license document is not in a complete ready state.");
  }
  return Object.freeze({
    documentId: record.documentId,
    issuedLicenseId: record.issuedLicenseId,
    customerUserId: record.customerUserId,
    state: "ready",
    contentDigest: record.media.contentDigest,
    byteLength: record.media.byteLength,
    revision: record.documentRevision,
    jobId: record.jobId,
    jobStatus: "complete",
    attempts: record.jobAttempts,
    stripeEnvironment: "test",
    livemode: false,
  });
}

export async function requireLicenseDocumentOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  if (!SAFE_ID.test(actorUserId))
    throw unsafeInput("Owner identity is invalid.");
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "LICENSE_DOCUMENT_OWNER_REQUIRED",
    "License document generation requires live owner authority.",
    { status: 403, publicMessage: "Owner access is required for this action." },
  );
}

export async function claimLicenseDocumentJob(
  binding: D1Database,
  input: {
    readonly record: LicenseDocumentWorkflowRecord;
    readonly expectedRevision: number;
    readonly actorUserId: string;
    readonly operationKey: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly claimedAt: string;
    readonly leaseExpiresAt: string;
  },
): Promise<ClaimedLicenseDocumentJob> {
  const { record } = input;
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    input.expectedRevision !== record.documentRevision ||
    !SAFE_ID.test(input.workerId) ||
    !SAFE_ID.test(input.leaseToken)
  ) {
    throw new RuntimeError(
      "LICENSE_DOCUMENT_STALE",
      "The license document changed before its job could be claimed.",
      {
        status: 409,
        publicMessage: "The license document changed. Reload and try again.",
      },
    );
  }
  const claimedAt = timestamp(input.claimedAt, "document claim time");
  const leaseExpiresAt = timestamp(
    input.leaseExpiresAt,
    "document lease expiry",
  );
  if (Date.parse(leaseExpiresAt) <= Date.parse(claimedAt)) {
    throw unsafeInput("The document lease expiry must follow its claim time.");
  }
  const claimable =
    record.jobStatus === "queued" ||
    record.jobStatus === "failed" ||
    (record.jobStatus === "processing" &&
      record.jobLeaseExpiresAt !== null &&
      Date.parse(record.jobLeaseExpiresAt) <= Date.parse(claimedAt));
  if (
    !claimable ||
    (record.documentState !== "queued" &&
      record.documentState !== "failed" &&
      record.documentState !== "processing")
  ) {
    throw new RuntimeError(
      "LICENSE_DOCUMENT_JOB_BUSY",
      "The license document job is not claimable.",
      {
        status: 409,
        publicMessage: "That license document job is already in progress.",
      },
    );
  }
  const authority = activeOwnerCondition(input.actorUserId);
  const nextAttempt = record.jobAttempts + 1;
  const nextRevision = record.documentRevision + 1;
  const staleLeaseCondition =
    record.jobStatus === "processing"
      ? "AND lease_token = ? AND lease_expires_at = ? AND lease_expires_at <= ?"
      : "";
  const staleLeaseBindings =
    record.jobStatus === "processing"
      ? [record.jobLeaseToken, record.jobLeaseExpiresAt, claimedAt]
      : [];
  const results = await runAtomicBatch(binding, [
    binding
      .prepare(
        `UPDATE license_document_jobs
         SET status = 'processing', attempts = ?, worker_id = ?,
             lease_token = ?, lease_expires_at = ?, failure_category = NULL,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND license_document_id = ? AND status = ?
           AND attempts = ? ${staleLeaseCondition}
           AND EXISTS (
             SELECT 1 FROM license_documents
             WHERE id = ? AND state = ? AND revision = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        nextAttempt,
        input.workerId,
        input.leaseToken,
        leaseExpiresAt,
        input.operationKey,
        record.jobId,
        record.documentId,
        record.jobStatus,
        record.jobAttempts,
        ...staleLeaseBindings,
        record.documentId,
        record.documentState,
        record.documentRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE license_documents
         SET state = 'processing', media_object_id = NULL,
             content_digest = NULL, byte_length = NULL,
             failure_category = NULL, revision = ?, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM license_document_jobs
             WHERE id = ? AND license_document_id = ?
               AND status = 'processing' AND attempts = ?
               AND worker_id = ? AND lease_token = ? AND lease_expires_at = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        nextRevision,
        input.operationKey,
        record.documentId,
        record.documentState,
        record.documentRevision,
        record.jobId,
        record.documentId,
        nextAttempt,
        input.workerId,
        input.leaseToken,
        leaseExpiresAt,
        ...authority.bindings,
      ),
  ]);
  if (results.some((result) => changedRows(result) !== 1)) {
    throw new RuntimeError(
      "LICENSE_DOCUMENT_STALE",
      "The license document job changed while it was claimed.",
      {
        status: 409,
        publicMessage: "The license document changed. Reload and try again.",
      },
    );
  }
  return Object.freeze({
    documentRevision: nextRevision,
    attempt: nextAttempt,
  });
}

export async function finalizeLicenseDocumentJob(
  binding: D1Database,
  input: {
    readonly record: LicenseDocumentWorkflowRecord;
    readonly claimed: ClaimedLicenseDocumentJob;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly operationKey: string;
    readonly requestFingerprint: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly mediaObjectId: string;
    readonly objectKey: string;
    readonly contentDigest: string;
    readonly byteLength: number;
    readonly completedAt: string;
  },
): Promise<LicenseDocumentReadyReceipt> {
  const mediaObjectId = safeId(input.mediaObjectId, "document media ID");
  if (
    !PRIVATE_OBJECT_KEY.test(input.objectKey) ||
    input.objectKey.includes("..") ||
    !SHA256.test(input.contentDigest) ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1
  ) {
    throw integrity("The rendered license document metadata is invalid.");
  }
  const completedAt = timestamp(input.completedAt, "document completion time");
  const authority = activeOwnerCondition(input.actorUserId);
  const readyRevision = input.claimed.documentRevision + 1;
  const receipt: LicenseDocumentReadyReceipt = Object.freeze({
    documentId: input.record.documentId,
    issuedLicenseId: input.record.issuedLicenseId,
    customerUserId: input.record.customerUserId,
    state: "ready",
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    revision: readyRevision,
    jobId: input.record.jobId,
    jobStatus: "complete",
    attempts: input.claimed.attempt,
    stripeEnvironment: "test",
    livemode: false,
  });
  const eventId = `license_event_${crypto.randomUUID()}`;
  const documentReadyCondition = `EXISTS (
    SELECT 1 FROM license_documents
    WHERE id = ? AND issued_license_id = ? AND customer_user_id = ?
      AND state = 'ready' AND media_object_id = ?
      AND content_digest = ? AND byte_length = ? AND revision = ?
      AND stripe_environment = 'test' AND livemode = 0
  ) AND EXISTS (
    SELECT 1 FROM license_document_jobs
    WHERE id = ? AND license_document_id = ? AND status = 'complete'
      AND attempts = ? AND lease_token IS NULL AND lease_expires_at IS NULL
  ) AND ${authority.sql}`;
  const documentReadyBindings: readonly (number | string)[] = [
    input.record.documentId,
    input.record.issuedLicenseId,
    input.record.customerUserId,
    mediaObjectId,
    input.contentDigest,
    input.byteLength,
    readyRevision,
    input.record.jobId,
    input.record.documentId,
    input.claimed.attempt,
    ...authority.bindings,
  ];
  const results = await runAtomicBatch(binding, [
    binding
      .prepare(
        `INSERT OR IGNORE INTO media_objects
          (id, object_key, kind, visibility, owner_user_id, content_type,
           byte_length, source_version, status, approval_state,
           content_sha256, revision, approved_by_user_id, approved_at,
           last_operation_key)
         SELECT ?, ?, 'document', 'protected', NULL, ?, ?, 1, 'ready',
                'approved', ?, 1, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM license_document_jobs
           WHERE id = ? AND license_document_id = ?
             AND status = 'processing' AND attempts = ?
             AND worker_id = ? AND lease_token = ?
         ) AND EXISTS (
           SELECT 1 FROM license_documents
           WHERE id = ? AND state = 'processing' AND revision = ?
         ) AND ${authority.sql}`,
      )
      .bind(
        mediaObjectId,
        input.objectKey,
        LICENSE_DOCUMENT_CONTENT_TYPE,
        input.byteLength,
        input.contentDigest,
        input.actorUserId,
        completedAt,
        input.operationKey,
        input.record.jobId,
        input.record.documentId,
        input.claimed.attempt,
        input.workerId,
        input.leaseToken,
        input.record.documentId,
        input.claimed.documentRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE license_documents
         SET state = 'ready', media_object_id = ?, content_digest = ?,
             byte_length = ?, failure_category = NULL, revision = ?,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND issued_license_id = ? AND customer_user_id = ?
           AND state = 'processing' AND revision = ?
           AND EXISTS (
             SELECT 1 FROM license_document_jobs
             WHERE id = ? AND license_document_id = ?
               AND status = 'processing' AND attempts = ?
               AND worker_id = ? AND lease_token = ?
           )
           AND EXISTS (
             SELECT 1 FROM media_objects
             WHERE id = ? AND object_key = ? AND kind = 'document'
               AND visibility = 'protected' AND content_type = ?
               AND byte_length = ? AND content_sha256 = ?
               AND status = 'ready' AND approval_state = 'approved'
           )
           AND ${authority.sql}`,
      )
      .bind(
        mediaObjectId,
        input.contentDigest,
        input.byteLength,
        readyRevision,
        input.operationKey,
        input.record.documentId,
        input.record.issuedLicenseId,
        input.record.customerUserId,
        input.claimed.documentRevision,
        input.record.jobId,
        input.record.documentId,
        input.claimed.attempt,
        input.workerId,
        input.leaseToken,
        mediaObjectId,
        input.objectKey,
        LICENSE_DOCUMENT_CONTENT_TYPE,
        input.byteLength,
        input.contentDigest,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE license_document_jobs
         SET status = 'complete', worker_id = NULL, lease_token = NULL,
             lease_expires_at = NULL, failure_category = NULL,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND license_document_id = ?
           AND status = 'processing' AND attempts = ?
           AND worker_id = ? AND lease_token = ?
           AND EXISTS (
             SELECT 1 FROM license_documents
             WHERE id = ? AND state = 'ready' AND media_object_id = ?
               AND content_digest = ? AND byte_length = ? AND revision = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        input.operationKey,
        input.record.jobId,
        input.record.documentId,
        input.claimed.attempt,
        input.workerId,
        input.leaseToken,
        input.record.documentId,
        mediaObjectId,
        input.contentDigest,
        input.byteLength,
        readyRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO license_events
          (id, customer_user_id, license_request_id, issued_license_id,
           event_type, actor_user_id, source, details_json, idempotency_key,
           stripe_environment, livemode)
         SELECT ?, ?, NULL, ?, 'document_ready', ?, 'owner', ?, ?, 'test', 0
         WHERE ${documentReadyCondition}`,
      )
      .bind(
        eventId,
        input.record.customerUserId,
        input.record.issuedLicenseId,
        input.actorUserId,
        JSON.stringify({
          documentId: input.record.documentId,
          contentDigest: input.contentDigest,
          byteLength: input.byteLength,
          stripeEnvironment: "test",
          livemode: false,
        }),
        input.operationKey,
        ...documentReadyBindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: input.actorUserId,
        action: "license.document.generate",
        subjectType: "license-document",
        subjectId: input.record.documentId,
        idempotencyKey: input.operationKey,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        details: {
          issuedLicenseId: input.record.issuedLicenseId,
          contentDigest: input.contentDigest,
          byteLength: input.byteLength,
          attempt: input.claimed.attempt,
          stripeEnvironment: "test",
          livemode: false,
        },
        result: { ...receipt },
      },
      `${documentReadyCondition} AND EXISTS (
        SELECT 1 FROM license_events
        WHERE id = ? AND idempotency_key = ? AND event_type = 'document_ready'
      )`,
      [...documentReadyBindings, eventId, input.operationKey],
    ),
  ]);
  if (
    changedRows(results[1]) !== 1 ||
    changedRows(results[2]) !== 1 ||
    changedRows(results[3]) !== 1 ||
    changedRows(results[4]) !== 1
  ) {
    throw integrity("The license document did not finalize atomically.");
  }
  return receipt;
}

export async function failLicenseDocumentJob(
  binding: D1Database,
  input: {
    readonly record: LicenseDocumentWorkflowRecord;
    readonly claimed: ClaimedLicenseDocumentJob;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly operationKey: string;
    readonly requestFingerprint: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly failureCategory: string;
  },
): Promise<boolean> {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(input.failureCategory)) {
    throw integrity("The license document failure category is invalid.");
  }
  const authority = activeOwnerCondition(input.actorUserId);
  const failedRevision = input.claimed.documentRevision + 1;
  const failureKey = `${input.operationKey}:failed:${input.claimed.attempt}`;
  const eventId = `license_event_${crypto.randomUUID()}`;
  const failedCondition = `EXISTS (
    SELECT 1 FROM license_documents
    WHERE id = ? AND state = 'failed' AND revision = ?
      AND failure_category = ? AND media_object_id IS NULL
  ) AND EXISTS (
    SELECT 1 FROM license_document_jobs
    WHERE id = ? AND license_document_id = ? AND status = 'failed'
      AND attempts = ? AND failure_category = ?
      AND lease_token IS NULL AND lease_expires_at IS NULL
  ) AND ${authority.sql}`;
  const failedBindings: readonly (number | string)[] = [
    input.record.documentId,
    failedRevision,
    input.failureCategory,
    input.record.jobId,
    input.record.documentId,
    input.claimed.attempt,
    input.failureCategory,
    ...authority.bindings,
  ];
  const results = await runAtomicBatch(binding, [
    binding
      .prepare(
        `UPDATE license_documents
         SET state = 'failed', media_object_id = NULL,
             content_digest = NULL, byte_length = NULL,
             failure_category = ?, revision = ?, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = 'processing' AND revision = ?
           AND EXISTS (
             SELECT 1 FROM license_document_jobs
             WHERE id = ? AND license_document_id = ?
               AND status = 'processing' AND attempts = ?
               AND worker_id = ? AND lease_token = ?
           ) AND ${authority.sql}`,
      )
      .bind(
        input.failureCategory,
        failedRevision,
        failureKey,
        input.record.documentId,
        input.claimed.documentRevision,
        input.record.jobId,
        input.record.documentId,
        input.claimed.attempt,
        input.workerId,
        input.leaseToken,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE license_document_jobs
         SET status = 'failed', worker_id = NULL, lease_token = NULL,
             lease_expires_at = NULL, failure_category = ?,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND license_document_id = ?
           AND status = 'processing' AND attempts = ?
           AND worker_id = ? AND lease_token = ?
           AND EXISTS (
             SELECT 1 FROM license_documents
             WHERE id = ? AND state = 'failed' AND revision = ?
               AND failure_category = ?
           ) AND ${authority.sql}`,
      )
      .bind(
        input.failureCategory,
        failureKey,
        input.record.jobId,
        input.record.documentId,
        input.claimed.attempt,
        input.workerId,
        input.leaseToken,
        input.record.documentId,
        failedRevision,
        input.failureCategory,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO license_events
          (id, customer_user_id, license_request_id, issued_license_id,
           event_type, actor_user_id, source, details_json, idempotency_key,
           stripe_environment, livemode)
         SELECT ?, ?, NULL, ?, 'document_failed', ?, 'owner', ?, ?, 'test', 0
         WHERE ${failedCondition}`,
      )
      .bind(
        eventId,
        input.record.customerUserId,
        input.record.issuedLicenseId,
        input.actorUserId,
        JSON.stringify({
          documentId: input.record.documentId,
          failureCategory: input.failureCategory,
          attempt: input.claimed.attempt,
          stripeEnvironment: "test",
          livemode: false,
        }),
        failureKey,
        ...failedBindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: input.actorUserId,
        action: "license.document.generate_failed",
        subjectType: "license-document",
        subjectId: input.record.documentId,
        idempotencyKey: failureKey,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        details: {
          issuedLicenseId: input.record.issuedLicenseId,
          attempt: input.claimed.attempt,
          stripeEnvironment: "test",
          livemode: false,
        },
        result: { failureCategory: input.failureCategory },
      },
      `${failedCondition} AND EXISTS (
        SELECT 1 FROM license_events WHERE id = ? AND idempotency_key = ?
      )`,
      [...failedBindings, eventId, failureKey],
    ),
  ]);
  return results.every((result) => changedRows(result) === 1);
}

export async function recordLicenseDocumentDelivery(
  binding: D1Database,
  input: {
    readonly requestId: string;
    readonly actorUserId: string;
    readonly documentId: string;
    readonly issuedLicenseId: string;
    readonly entitlementId: string | null;
    readonly accessSource: string;
    readonly contentDigest: string;
    readonly byteLength: number;
    readonly deliveredAt: string;
    readonly telemetry?: TelemetryMutationRequestContext;
  },
): Promise<void> {
  const documentId = requireLicenseDocumentId(input.documentId);
  const issuedLicenseId = safeId(input.issuedLicenseId, "issued license ID");
  const actorUserId = safeId(input.actorUserId, "delivery actor ID");
  const entitlementId = nullableId(input.entitlementId, "entitlement ID");
  const deliveredAt = timestamp(input.deliveredAt, "document delivery time");
  if (
    !SHA256.test(input.contentDigest) ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    !DELIVERY_ACCESS_SOURCES.has(input.accessSource)
  ) {
    throw integrity("The license document delivery evidence is invalid.");
  }
  const details = Object.freeze({
    issuedLicenseId,
    entitlementId,
    accessSource: input.accessSource,
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    deliveredAt,
    stripeEnvironment: "test",
    livemode: false,
  });
  const result = Object.freeze({ delivered: true, documentId });
  const fingerprint = await createMutationFingerprint({
    operation: "license.document.deliver",
    actorUserId,
    documentId,
    ...details,
  });
  const idempotencyKey = `license.document.deliver:${input.requestId}`;
  const audit = binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id,
         details_json, result_json)
       VALUES (?, ?, 'license.document.deliver', 'license-document', ?,
               ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      actorUserId,
      documentId,
      idempotencyKey,
      fingerprint,
      input.requestId,
      JSON.stringify(details),
      JSON.stringify(result),
    );
  const telemetry = await prepareServerTelemetryEvent(binding, {
    eventName: "protected-resource-delivered",
    resourceType: "protected-resource",
    resourceId: documentId,
    sourceOperationKey: idempotencyKey,
    userId: actorUserId,
    requestContext: input.telemetry,
    occurredAt: new Date(deliveredAt),
    durableCondition: {
      sql: `EXISTS (
        SELECT 1 FROM audit_events
        WHERE idempotency_key = ? AND request_fingerprint = ?
          AND action = 'license.document.deliver'
          AND subject_type = 'license-document' AND subject_id = ?
      )`,
      bindings: [idempotencyKey, fingerprint, documentId],
    },
  });
  let batchFailure: unknown = null;
  try {
    await runAtomicBatch(binding, [audit, telemetry]);
  } catch (error) {
    batchFailure = error;
  }
  const row = await binding
    .prepare(
      `SELECT request_fingerprint, details_json, result_json
       FROM audit_events WHERE idempotency_key = ?1 LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<DeliveryAuditRow>();
  if (
    row &&
    row.request_fingerprint === fingerprint &&
    row.details_json === JSON.stringify(details) &&
    row.result_json === JSON.stringify(result)
  ) {
    return;
  }
  if (!row && batchFailure !== null) throw batchFailure;
  throw new RuntimeError(
    "IDEMPOTENCY_CONFLICT",
    "The request ID already identifies a different delivery.",
    {
      status: 409,
      publicMessage:
        "That download request was already used for another delivery.",
    },
  );
}
