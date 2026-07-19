import { prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import {
  EXTERNAL_ACTION_KINDS,
  type ExternalActionKind,
} from "@/lib/setup/types.ts";

const HEX_DIGEST = /^[a-f0-9]{64}$/;
const SAFE_CODE = /^[A-Z0-9_]{1,96}$/;
const SAFE_KEY = /^[a-zA-Z0-9:_-]{16,160}$/;
const SAFE_ACTION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export type SetupLifecycleStatus =
  "unconfigured" | "applying" | "applied" | "attention_required";

export interface SetupApplicationSummary {
  readonly id: string;
  readonly applicationKey: string;
  readonly proposalHash: string;
  readonly proposalSchemaVersion: number;
  readonly sourceStateFingerprint: string;
  readonly approvalHash: string;
  readonly status: "applying" | "applied" | "failed";
  readonly resultStateFingerprint: string | null;
  readonly operationCount: number;
  readonly mediaObjectCount: number;
  readonly mediaByteCount: number;
  readonly safeFailureCode: string | null;
  readonly approvedAt: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface ExportManifestSummary {
  readonly id: string;
  readonly exportKey: string;
  readonly schemaVersion: number;
  readonly sourceStateFingerprint: string;
  readonly manifestSha256: string | null;
  readonly fileCount: number;
  readonly mediaObjectCount: number;
  readonly byteCount: number;
  readonly status: "preparing" | "ready" | "verified" | "failed";
  readonly safeFailureCode: string | null;
  readonly createdAt: string;
  readonly verifiedAt: string | null;
}

export interface SetupWorkspace {
  readonly state: {
    readonly status: SetupLifecycleStatus;
    readonly proposalSchemaVersion: number | null;
    readonly lastProposalHash: string | null;
    readonly stateFingerprint: string | null;
    readonly revision: number;
    readonly updatedAt: string;
  };
  readonly applications: readonly SetupApplicationSummary[];
  readonly exports: readonly ExportManifestSummary[];
}

export interface BeginSetupApplicationInput {
  readonly proposalHash: string;
  readonly proposalSchemaVersion: number;
  readonly sourceStateFingerprint: string;
  readonly approvalHash: string;
  readonly approvedAt: string;
  readonly operationCount: number;
}

export interface SetupMutationContext {
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
}

export interface BeginSetupApplicationResult {
  readonly application: SetupApplicationSummary;
  readonly replayed: boolean;
}

export interface SetupExternalActionApprovalReceipt {
  readonly actionId: string;
  readonly kind: ExternalActionKind;
  readonly target: string;
  readonly actionHash: string;
  readonly approvalHash: string;
  readonly approvedAt: string;
  readonly approvedBy: "michael";
}

interface SetupStateRow {
  status: string;
  proposal_schema_version: number | null;
  last_proposal_hash: string | null;
  state_fingerprint: string | null;
  revision: number;
  updated_at: string;
}

interface SetupApplicationRow {
  id: string;
  application_key: string;
  proposal_hash: string;
  proposal_schema_version: number;
  source_state_fingerprint: string;
  approval_hash: string;
  status: string;
  result_state_fingerprint: string | null;
  operation_count: number;
  media_object_count: number;
  media_byte_count: number;
  safe_failure_code: string | null;
  approved_at: string;
  started_at: string;
  completed_at: string | null;
}

interface ExportManifestRow {
  id: string;
  export_key: string;
  schema_version: number;
  source_state_fingerprint: string;
  manifest_sha256: string | null;
  file_count: number;
  media_object_count: number;
  byte_count: number;
  status: string;
  safe_failure_code: string | null;
  created_at: string;
  verified_at: string | null;
}

function setupError(
  code: string,
  message: string,
  publicMessage: string,
  status = 409,
): RuntimeError {
  return new RuntimeError(code, message, { status, publicMessage });
}

export function normalizeSetupDigest(value: string, label: string): string {
  const digest = value.startsWith("sha256:") ? value.slice(7) : value;
  if (!HEX_DIGEST.test(digest)) {
    throw setupError(
      "SETUP_HASH_INVALID",
      `${label} must be a SHA-256 digest.`,
      "The setup proposal or approval hash is invalid.",
      400,
    );
  }
  return digest;
}

export function contractSetupDigest(value: string | null): string | null {
  return value === null ? null : `sha256:${value}`;
}

function safeKey(value: string, label: string): string {
  if (!SAFE_KEY.test(value)) {
    throw setupError(
      "SETUP_KEY_INVALID",
      `${label} is not a safe setup key.`,
      "The setup operation key is invalid.",
      400,
    );
  }
  return value;
}

function safeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw setupError(
      "SETUP_COUNT_INVALID",
      `${label} must be a nonnegative safe integer.`,
      "The setup operation counts are invalid.",
      400,
    );
  }
  return value;
}

function safeDate(value: string, label: string): string {
  if (
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw setupError(
      "SETUP_DATE_INVALID",
      `${label} must be an ISO UTC timestamp.`,
      "The setup approval timestamp is invalid.",
      400,
    );
  }
  return value;
}

function safeExternalActionTarget(value: string): string {
  if (
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw setupError(
      "SETUP_EXTERNAL_APPROVAL_INVALID",
      "External-action approval targets must be bounded printable text.",
      "An external-action approval receipt is invalid.",
      400,
    );
  }
  return value;
}

function externalActionApprovalReceipts(
  values: readonly SetupExternalActionApprovalReceipt[],
): readonly SetupExternalActionApprovalReceipt[] {
  if (values.length > 32) {
    throw setupError(
      "SETUP_EXTERNAL_APPROVAL_INVALID",
      "A setup application accepts at most 32 external-action approvals.",
      "Too many external-action approvals were provided.",
      400,
    );
  }
  const actionIds = new Set<string>();
  const receipts = values.map((value) => {
    if (!SAFE_ACTION_ID.test(value.actionId) || actionIds.has(value.actionId)) {
      throw setupError(
        "SETUP_EXTERNAL_APPROVAL_INVALID",
        "External-action approval action identifiers must be safe and unique.",
        "An external-action approval receipt is invalid.",
        400,
      );
    }
    actionIds.add(value.actionId);
    if (!EXTERNAL_ACTION_KINDS.includes(value.kind)) {
      throw setupError(
        "SETUP_EXTERNAL_APPROVAL_INVALID",
        "The external-action approval kind is unsupported.",
        "An external-action approval receipt is invalid.",
        400,
      );
    }
    if (value.approvedBy !== "michael") {
      throw setupError(
        "SETUP_EXTERNAL_APPROVAL_INVALID",
        "External actions require Michael's action-specific approval.",
        "An external-action approval receipt is invalid.",
        400,
      );
    }
    return Object.freeze({
      actionId: value.actionId,
      kind: value.kind,
      target: safeExternalActionTarget(value.target),
      actionHash: `sha256:${normalizeSetupDigest(value.actionHash, "external action hash")}`,
      approvalHash: `sha256:${normalizeSetupDigest(value.approvalHash, "external approval hash")}`,
      approvedAt: safeDate(value.approvedAt, "external approval timestamp"),
      approvedBy: "michael" as const,
    });
  });
  return Object.freeze(
    receipts.sort((left, right) => left.actionId.localeCompare(right.actionId)),
  );
}

function setupStatus(value: string): SetupLifecycleStatus {
  if (
    value === "unconfigured" ||
    value === "applying" ||
    value === "applied" ||
    value === "attention_required"
  ) {
    return value;
  }
  throw setupError(
    "SETUP_STATE_INVALID",
    "The stored setup lifecycle status is invalid.",
    "The setup state is not available.",
    500,
  );
}

function applicationStatus(value: string): SetupApplicationSummary["status"] {
  if (value === "applying" || value === "applied" || value === "failed") {
    return value;
  }
  throw setupError(
    "SETUP_APPLICATION_INVALID",
    "The stored setup application status is invalid.",
    "The setup application history is not available.",
    500,
  );
}

function exportStatus(value: string): ExportManifestSummary["status"] {
  if (
    value === "preparing" ||
    value === "ready" ||
    value === "verified" ||
    value === "failed"
  ) {
    return value;
  }
  throw setupError(
    "EXPORT_MANIFEST_INVALID",
    "The stored export manifest status is invalid.",
    "The export history is not available.",
    500,
  );
}

function applicationSummary(row: SetupApplicationRow): SetupApplicationSummary {
  return Object.freeze({
    id: row.id,
    applicationKey: row.application_key,
    proposalHash: `sha256:${row.proposal_hash}`,
    proposalSchemaVersion: row.proposal_schema_version,
    sourceStateFingerprint: `sha256:${row.source_state_fingerprint}`,
    approvalHash: `sha256:${row.approval_hash}`,
    status: applicationStatus(row.status),
    resultStateFingerprint: contractSetupDigest(row.result_state_fingerprint),
    operationCount: safeCount(row.operation_count, "operation count"),
    mediaObjectCount: safeCount(row.media_object_count, "media object count"),
    mediaByteCount: safeCount(row.media_byte_count, "media byte count"),
    safeFailureCode: row.safe_failure_code,
    approvedAt: row.approved_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
}

function exportSummary(row: ExportManifestRow): ExportManifestSummary {
  return Object.freeze({
    id: row.id,
    exportKey: row.export_key,
    schemaVersion: row.schema_version,
    sourceStateFingerprint: row.source_state_fingerprint,
    manifestSha256: row.manifest_sha256,
    fileCount: safeCount(row.file_count, "export file count"),
    mediaObjectCount: safeCount(row.media_object_count, "export media count"),
    byteCount: safeCount(row.byte_count, "export byte count"),
    status: exportStatus(row.status),
    safeFailureCode: row.safe_failure_code,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  });
}

async function requireOwner(binding: D1Database, ownerUserId: string) {
  const authority = activeOwnerCondition(ownerUserId);
  const row = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<{ allowed: number }>();
  if (row?.allowed !== 1) {
    throw setupError(
      "ROLE_REQUIRED",
      "Setup administration requires an active owner role.",
      "Only the active owner can operate setup.",
      403,
    );
  }
}

export async function readSetupWorkspace(
  binding: D1Database,
  ownerUserId: string,
): Promise<SetupWorkspace> {
  await requireOwner(binding, ownerUserId);
  const [state, applications, exports] = await Promise.all([
    binding
      .prepare(
        `SELECT status, proposal_schema_version, last_proposal_hash,
                state_fingerprint, revision, updated_at
         FROM setup_state
         WHERE id = 'setup'
         LIMIT 1`,
      )
      .first<SetupStateRow>(),
    binding
      .prepare(
        `SELECT id, application_key, proposal_hash, proposal_schema_version,
                source_state_fingerprint, approval_hash, status,
                result_state_fingerprint, operation_count, media_object_count,
                media_byte_count, safe_failure_code, approved_at, started_at,
                completed_at
         FROM setup_applications
         ORDER BY created_at DESC, id DESC
         LIMIT 20`,
      )
      .all<SetupApplicationRow>(),
    binding
      .prepare(
        `SELECT id, export_key, schema_version, source_state_fingerprint,
                manifest_sha256, file_count, media_object_count, byte_count,
                status, safe_failure_code, created_at, verified_at
         FROM export_manifests
         ORDER BY created_at DESC, id DESC
         LIMIT 20`,
      )
      .all<ExportManifestRow>(),
  ]);
  if (!state) {
    throw setupError(
      "SETUP_STATE_MISSING",
      "The setup singleton is missing.",
      "The setup state is not available.",
      500,
    );
  }
  return Object.freeze({
    state: Object.freeze({
      status: setupStatus(state.status),
      proposalSchemaVersion: state.proposal_schema_version,
      lastProposalHash: contractSetupDigest(state.last_proposal_hash),
      stateFingerprint: contractSetupDigest(state.state_fingerprint),
      revision: safeCount(state.revision, "setup revision"),
      updatedAt: state.updated_at,
    }),
    applications: Object.freeze(applications.results.map(applicationSummary)),
    exports: Object.freeze(exports.results.map(exportSummary)),
  });
}

async function readApplicationByKey(
  binding: D1Database,
  applicationKey: string,
): Promise<SetupApplicationSummary | null> {
  const row = await binding
    .prepare(
      `SELECT id, application_key, proposal_hash, proposal_schema_version,
              source_state_fingerprint, approval_hash, status,
              result_state_fingerprint, operation_count, media_object_count,
              media_byte_count, safe_failure_code, approved_at, started_at,
              completed_at
       FROM setup_applications
       WHERE application_key = ?1
       LIMIT 1`,
    )
    .bind(applicationKey)
    .first<SetupApplicationRow>();
  return row ? applicationSummary(row) : null;
}

export async function readSetupApplicationByProposalHash(
  binding: D1Database,
  proposalHash: string,
  ownerUserId: string,
): Promise<SetupApplicationSummary | null> {
  const digest = normalizeSetupDigest(proposalHash, "proposal hash");
  await requireOwner(binding, ownerUserId);
  return readApplicationByKey(
    binding,
    safeKey(`setup:application:${digest}`, "application key"),
  );
}

function applicationId(proposalDigest: string, actorUserId: string): string {
  const actorDigest = actorUserId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  return `setup_${proposalDigest.slice(0, 32)}_${actorDigest}`;
}

export async function beginSetupApplication(
  binding: D1Database,
  input: BeginSetupApplicationInput,
  context: SetupMutationContext,
): Promise<BeginSetupApplicationResult> {
  const proposalHash = normalizeSetupDigest(
    input.proposalHash,
    "proposal hash",
  );
  const sourceFingerprint = normalizeSetupDigest(
    input.sourceStateFingerprint,
    "source-state fingerprint",
  );
  const approvalHash = normalizeSetupDigest(
    input.approvalHash,
    "approval hash",
  );
  const proposalSchemaVersion = safeCount(
    input.proposalSchemaVersion,
    "proposal schema version",
  );
  if (proposalSchemaVersion < 1) {
    throw setupError(
      "SETUP_SCHEMA_VERSION_INVALID",
      "The setup proposal schema version must be positive.",
      "The setup proposal version is invalid.",
      400,
    );
  }
  const operationCount = safeCount(input.operationCount, "operation count");
  const approvedAt = safeDate(input.approvedAt, "approval timestamp");
  const applicationKey = safeKey(
    `setup:application:${proposalHash}`,
    "application key",
  );
  const id = applicationId(proposalHash, context.actorUserId);
  const operationKey = safeKey(`setup:apply:${proposalHash}`, "operation key");

  await requireOwner(binding, context.actorUserId);
  const existing = await readApplicationByKey(binding, applicationKey);
  if (existing) {
    if (
      existing.proposalHash !== `sha256:${proposalHash}` ||
      existing.sourceStateFingerprint !== `sha256:${sourceFingerprint}` ||
      existing.approvalHash !== `sha256:${approvalHash}` ||
      existing.proposalSchemaVersion !== proposalSchemaVersion ||
      existing.operationCount !== operationCount
    ) {
      throw setupError(
        "SETUP_APPLICATION_CONFLICT",
        "The proposal application key is already bound to different facts.",
        "This setup proposal conflicts with its saved application record.",
      );
    }
    if (existing.status === "applied" || existing.status === "applying") {
      return { application: existing, replayed: existing.status === "applied" };
    }
  }

  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `INSERT INTO setup_applications
          (id, application_key, proposal_hash, proposal_schema_version,
           source_state_fingerprint, approval_hash, approved_by_user_id,
           approved_at, status, operation_count, result_json,
           last_operation_key)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'applying', ?9, '{}', ?10
         WHERE ${authority.sql}
         ON CONFLICT(application_key) DO UPDATE SET
           status = 'applying',
           result_state_fingerprint = NULL,
           safe_failure_code = NULL,
           completed_at = NULL,
           updated_at = CURRENT_TIMESTAMP,
           last_operation_key = excluded.last_operation_key
         WHERE setup_applications.status = 'failed'
           AND setup_applications.proposal_hash = excluded.proposal_hash
           AND setup_applications.proposal_schema_version = excluded.proposal_schema_version
           AND setup_applications.source_state_fingerprint = excluded.source_state_fingerprint
           AND setup_applications.approval_hash = excluded.approval_hash
           AND setup_applications.operation_count = excluded.operation_count`,
      )
      .bind(
        id,
        applicationKey,
        proposalHash,
        proposalSchemaVersion,
        sourceFingerprint,
        approvalHash,
        context.actorUserId,
        approvedAt,
        operationCount,
        operationKey,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE setup_state
         SET status = 'applying',
             proposal_schema_version = ?1,
             last_proposal_hash = ?2,
             last_application_id = ?3,
             state_fingerprint = NULL,
             revision = revision + 1,
             last_operation_key = ?4,
             updated_by_user_id = ?5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 'setup'
           AND ${authority.sql}`,
      )
      .bind(
        proposalSchemaVersion,
        proposalHash,
        id,
        operationKey,
        context.actorUserId,
        ...authority.bindings,
      ),
  ];
  await runAtomicBatch(binding, statements);
  const started = await readApplicationByKey(binding, applicationKey);
  if (!started || started.status !== "applying") {
    throw setupError(
      "SETUP_APPLICATION_START_FAILED",
      "The setup application could not enter the applying state.",
      "The setup application could not start.",
    );
  }
  return { application: started, replayed: false };
}

export async function completeSetupApplication(
  binding: D1Database,
  input: {
    readonly applicationKey: string;
    readonly resultStateFingerprint: string;
    readonly operationCount: number;
    readonly mediaObjectCount: number;
    readonly mediaByteCount: number;
    readonly externalActionApprovals?: readonly SetupExternalActionApprovalReceipt[];
  },
  context: SetupMutationContext,
): Promise<SetupApplicationSummary> {
  const applicationKey = safeKey(input.applicationKey, "application key");
  const resultFingerprint = normalizeSetupDigest(
    input.resultStateFingerprint,
    "result-state fingerprint",
  );
  const operationCount = safeCount(input.operationCount, "operation count");
  const mediaObjectCount = safeCount(
    input.mediaObjectCount,
    "media object count",
  );
  const mediaByteCount = safeCount(input.mediaByteCount, "media byte count");
  const externalApprovals = externalActionApprovalReceipts(
    input.externalActionApprovals ?? [],
  );
  await requireOwner(binding, context.actorUserId);
  const existing = await readApplicationByKey(binding, applicationKey);
  if (!existing) {
    throw setupError(
      "SETUP_APPLICATION_MISSING",
      "The setup application does not exist.",
      "The setup application is not available.",
      404,
    );
  }
  if (existing.status === "applied") return existing;
  if (existing.status !== "applying") {
    throw setupError(
      "SETUP_APPLICATION_NOT_APPLYING",
      "The setup application is not in the applying state.",
      "Resume the approved setup application before completing it.",
    );
  }
  if (existing.operationCount !== operationCount) {
    throw setupError(
      "SETUP_APPLICATION_CONFLICT",
      "The completed operation count differs from the approved plan.",
      "The setup result does not match the approved plan.",
    );
  }
  const result = JSON.stringify({
    status: "applied",
    operationCount,
    mediaObjectCount,
    mediaByteCount,
    externalActionApprovals: externalApprovals,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  await runAtomicBatch(binding, [
    binding
      .prepare(
        `UPDATE setup_applications
         SET status = 'applied',
             result_state_fingerprint = ?1,
             media_object_count = ?2,
             media_byte_count = ?3,
             result_json = ?4,
             safe_failure_code = NULL,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE application_key = ?5
           AND status = 'applying'
           AND operation_count = ?6
           AND ${authority.sql}`,
      )
      .bind(
        resultFingerprint,
        mediaObjectCount,
        mediaByteCount,
        result,
        applicationKey,
        operationCount,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE setup_state
         SET status = 'applied',
             state_fingerprint = ?1,
             revision = revision + 1,
             updated_by_user_id = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 'setup'
           AND last_application_id = ?3
           AND status = 'applying'
           AND ${authority.sql}`,
      )
      .bind(
        resultFingerprint,
        context.actorUserId,
        existing.id,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: "setup.apply.complete",
        subjectType: "setup_application",
        subjectId: existing.id,
        idempotencyKey: operationKeyForAudit(context),
        requestFingerprint: normalizeSetupDigest(
          existing.approvalHash,
          "approval hash",
        ),
        requestId: context.requestId,
        details: {
          operationCount,
          externalActionApprovalCount: externalApprovals.length,
        },
        result: {
          status: "applied",
          operationCount,
          mediaObjectCount,
          mediaByteCount,
          externalActionApprovalCount: externalApprovals.length,
        },
      },
      `EXISTS (
        SELECT 1 FROM setup_applications
        WHERE id = ? AND status = 'applied'
          AND result_state_fingerprint = ?
      ) AND ${authority.sql}`,
      [existing.id, resultFingerprint, ...authority.bindings],
    ),
  ]);
  const completed = await readApplicationByKey(binding, applicationKey);
  if (!completed || completed.status !== "applied") {
    throw setupError(
      "SETUP_APPLICATION_COMPLETE_FAILED",
      "The setup application did not reach the applied state.",
      "The setup application could not be completed.",
    );
  }
  return completed;
}

function operationKeyForAudit(context: SetupMutationContext): string {
  return `setup.apply.complete:${context.actorUserId}:${context.idempotencyKey}`;
}

export async function failSetupApplication(
  binding: D1Database,
  applicationKey: string,
  failureCode: string,
  actorUserId: string,
): Promise<void> {
  const key = safeKey(applicationKey, "application key");
  if (!SAFE_CODE.test(failureCode)) {
    throw setupError(
      "SETUP_FAILURE_CODE_INVALID",
      "Setup failure codes must be fixed uppercase identifiers.",
      "The setup failure status is invalid.",
      400,
    );
  }
  await requireOwner(binding, actorUserId);
  const existing = await readApplicationByKey(binding, key);
  if (!existing || existing.status !== "applying") return;
  const authority = activeOwnerCondition(actorUserId);
  await runAtomicBatch(binding, [
    binding
      .prepare(
        `UPDATE setup_applications
         SET status = 'failed', safe_failure_code = ?1,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND status = 'applying'
           AND ${authority.sql}`,
      )
      .bind(failureCode, existing.id, ...authority.bindings),
    binding
      .prepare(
        `UPDATE setup_state
         SET status = 'attention_required',
             revision = revision + 1,
             updated_by_user_id = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 'setup' AND last_application_id = ?2
           AND ${authority.sql}`,
      )
      .bind(actorUserId, existing.id, ...authority.bindings),
  ]);
}
