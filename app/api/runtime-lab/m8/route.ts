import { env } from "cloudflare:workers";
import { runAtomicBatch } from "@/db/d1.ts";
import {
  readJsonMutation,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError, resolveSimulationMode } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

const SNAPSHOT_PREFIX = "m8-runtime-snapshot:";
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const COUNT_KEYS = [
  "users",
  "profiles",
  "roleAssignments",
  "artistModules",
  "mediaObjects",
  "mediaJobs",
  "operationalFailures",
  "telemetrySettings",
  "telemetryEvents",
  "legalDocuments",
  "legalDocumentVersions",
  "auditEvents",
  "runtimeProofs",
] as const;

type D1Scalar = string | number | null;
type D1Row = Record<string, D1Scalar>;
type CountKey = (typeof COUNT_KEYS)[number];
type TableCounts = Readonly<Record<CountKey, number>>;

interface ModuleState {
  readonly module_key: "telemetry";
  readonly active: number;
  readonly revision: number;
  readonly settings_json: string;
  readonly activated_at: string | null;
  readonly deactivated_at: string | null;
  readonly updated_by_user_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface TelemetrySettingsState {
  readonly id: "telemetry";
  readonly collection_mode: "disabled" | "consent_required" | "anonymous";
  readonly retention_days: number;
  readonly meaningful_listen_seconds: number;
  readonly revision: number;
  readonly updated_by_user_id: string | null;
  readonly last_operation_key: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface LegalDocumentState {
  readonly id: "privacy";
  readonly title: string;
  readonly draft_version_id: string;
  readonly approved_version_id: string | null;
  readonly published_version_id: string | null;
  readonly current_version: number;
  readonly revision: number;
  readonly last_operation_key: string | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface RunFacts {
  readonly runId: string;
  readonly shortId: string;
  readonly ownerId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly ownerRoleId: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly customerDisplayName: string;
  readonly customerRoleId: string;
  readonly mediaId: string;
  readonly mediaJobId: string;
  readonly operationalFailureId: string;
  readonly operationalFailureCode: string;
  readonly auditId: string;
  readonly auditMarker: string;
  readonly legalDocumentId: "privacy";
  readonly legalTitle: string;
  readonly legalIntroduction: string;
  readonly legalBody: string;
}

interface M8Snapshot {
  readonly version: 1;
  readonly run: RunFacts;
  readonly baselineCounts: TableCounts;
  readonly baselineModule: ModuleState;
  readonly baselineTelemetrySettings: TelemetrySettingsState;
  readonly baselineLegalDocument: LegalDocumentState;
}

function runtimeLabEnabled(): boolean {
  return resolveSimulationMode({
    AOP_RUNTIME_ENV: env.AOP_RUNTIME_ENV,
    AOP_SIMULATION_MODE: env.AOP_SIMULATION_MODE,
  }).enabled;
}

function runtimeError(
  code: string,
  message: string,
  status: number,
): RuntimeError {
  return new RuntimeError(code, message, {
    status,
    publicMessage: message,
  });
}

function unavailable(): never {
  throw runtimeError("NOT_FOUND", "The requested resource was not found.", 404);
}

function requireLab(): void {
  if (!runtimeLabEnabled()) unavailable();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
  return value;
}

function requireBeginInput(value: unknown): void {
  const input = requireExactObject(value, ["action"]);
  if (input.action !== "begin") {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
}

function requireRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) {
    throw runtimeError("INVALID_INPUT", "Provide a valid runtime run ID.", 400);
  }
  return value;
}

function requireCleanupInput(value: unknown): string {
  const input = requireExactObject(value, ["runId"]);
  return requireRunId(input.runId);
}

function factsForRun(runId: string): RunFacts {
  const shortId = runId.replaceAll("-", "").slice(0, 12);
  return Object.freeze({
    runId,
    shortId,
    ownerId: `user_m8_owner_${shortId}`,
    ownerEmail: `m8-owner-${shortId}@a-op.invalid`,
    ownerDisplayName: `Fictional M8 Owner ${shortId}`,
    ownerRoleId: `role_m8_owner_${shortId}`,
    customerId: `user_m8_customer_${shortId}`,
    customerEmail: `m8-customer-${shortId}@a-op.invalid`,
    customerDisplayName: `Fictional M8 Customer ${shortId}`,
    customerRoleId: `role_m8_customer_${shortId}`,
    mediaId: `media_m8_failed_${shortId}`,
    mediaJobId: `job_m8_failed_${shortId}`,
    operationalFailureId: `failure_m8_${shortId}`,
    operationalFailureCode: "FICTIONAL_MEDIA_PROCESSING_FAILED",
    auditId: `audit_m8_${shortId}`,
    auditMarker: `fictional-internal-diagnostic-${shortId}`,
    legalDocumentId: "privacy",
    legalTitle: `Fictional privacy notice ${shortId}`,
    legalIntroduction: `Fictional owner-reviewed introduction ${shortId}.`,
    legalBody: `Fictional privacy terms for the Milestone 8 runtime journey ${shortId}.`,
  });
}

async function firstRow<T>(
  sql: string,
  bindings: readonly D1Scalar[] = [],
): Promise<T | null> {
  return env.DB.prepare(sql)
    .bind(...bindings)
    .first<T>();
}

function countValue(row: D1Row, key: CountKey): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw runtimeError(
      "M8_RUNTIME_STATE_INVALID",
      "The Milestone 8 runtime state contains an invalid table count.",
      500,
    );
  }
  return value as number;
}

async function readTableCounts(): Promise<TableCounts> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM profiles) AS profiles,
       (SELECT COUNT(*) FROM role_assignments) AS roleAssignments,
       (SELECT COUNT(*) FROM artist_modules) AS artistModules,
       (SELECT COUNT(*) FROM media_objects) AS mediaObjects,
       (SELECT COUNT(*) FROM media_jobs) AS mediaJobs,
       (SELECT COUNT(*) FROM operational_failures) AS operationalFailures,
       (SELECT COUNT(*) FROM telemetry_settings) AS telemetrySettings,
       (SELECT COUNT(*) FROM telemetry_events) AS telemetryEvents,
       (SELECT COUNT(*) FROM legal_documents) AS legalDocuments,
       (SELECT COUNT(*) FROM legal_document_versions) AS legalDocumentVersions,
       (SELECT COUNT(*) FROM audit_events) AS auditEvents,
       (SELECT COUNT(*) FROM runtime_proofs) AS runtimeProofs`,
  );
  if (!row) {
    throw runtimeError(
      "M8_RUNTIME_STATE_INVALID",
      "The Milestone 8 runtime table counts are unavailable.",
      500,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      COUNT_KEYS.map((key) => [key, countValue(row, key)]),
    ) as Record<CountKey, number>,
  );
}

async function readModuleState(): Promise<ModuleState> {
  const row = await firstRow<ModuleState>(
    `SELECT module_key, active, revision, settings_json, activated_at,
            deactivated_at, updated_by_user_id, created_at, updated_at
     FROM artist_modules WHERE module_key = 'telemetry' LIMIT 1`,
  );
  if (!row) {
    throw runtimeError(
      "M8_RUNTIME_STATE_INVALID",
      "The Milestone 8 runtime telemetry module is unavailable.",
      500,
    );
  }
  return row;
}

async function readTelemetrySettingsState(): Promise<TelemetrySettingsState> {
  const row = await firstRow<TelemetrySettingsState>(
    `SELECT id, collection_mode, retention_days,
            meaningful_listen_seconds, revision, updated_by_user_id,
            last_operation_key, created_at, updated_at
     FROM telemetry_settings WHERE id = 'telemetry' LIMIT 1`,
  );
  if (!row) {
    throw runtimeError(
      "M8_RUNTIME_STATE_INVALID",
      "The Milestone 8 runtime telemetry settings are unavailable.",
      500,
    );
  }
  return row;
}

async function readLegalDocumentState(): Promise<LegalDocumentState> {
  const row = await firstRow<LegalDocumentState>(
    `SELECT id, title, draft_version_id, approved_version_id,
            published_version_id, current_version, revision,
            last_operation_key, published_at, created_at, updated_at
     FROM legal_documents WHERE id = 'privacy' LIMIT 1`,
  );
  if (!row) {
    throw runtimeError(
      "M8_RUNTIME_STATE_INVALID",
      "The Milestone 8 runtime privacy document is unavailable.",
      500,
    );
  }
  return row;
}

function parseSnapshot(value: string): M8Snapshot {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw runtimeError(
      "M8_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 8 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  if (!isPlainRecord(candidate) || candidate.version !== 1) {
    throw runtimeError(
      "M8_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 8 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const run = candidate.run;
  const counts = candidate.baselineCounts;
  if (
    !isPlainRecord(run) ||
    !isPlainRecord(counts) ||
    !isPlainRecord(candidate.baselineModule) ||
    !isPlainRecord(candidate.baselineTelemetrySettings) ||
    !isPlainRecord(candidate.baselineLegalDocument) ||
    typeof run.runId !== "string" ||
    !RUN_ID_PATTERN.test(run.runId) ||
    typeof run.ownerId !== "string" ||
    !SAFE_ID.test(run.ownerId) ||
    typeof run.customerId !== "string" ||
    !SAFE_ID.test(run.customerId)
  ) {
    throw runtimeError(
      "M8_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 8 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
      throw runtimeError(
        "M8_RUNTIME_SNAPSHOT_INVALID",
        "The Milestone 8 runtime cleanup snapshot is invalid.",
        500,
      );
    }
  }
  return candidate as unknown as M8Snapshot;
}

async function readSnapshot(runId: string): Promise<M8Snapshot> {
  const row = await firstRow<{ value: string }>(
    "SELECT value FROM runtime_proofs WHERE key = ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}${runId}`],
  );
  if (!row) unavailable();
  const snapshot = parseSnapshot(row.value);
  if (snapshot.run.runId !== runId) {
    throw runtimeError(
      "M8_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 8 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  return snapshot;
}

async function beginRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  requireBeginInput(await readJsonMutation(request));
  const active = await firstRow<{ key: string }>(
    "SELECT key FROM runtime_proofs WHERE key LIKE ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}%`],
  );
  if (active) {
    throw runtimeError(
      "M8_RUNTIME_RUN_ACTIVE",
      "A Milestone 8 runtime journey is already active.",
      409,
    );
  }

  const run = factsForRun(crypto.randomUUID());
  const snapshot: M8Snapshot = Object.freeze({
    version: 1,
    run,
    baselineCounts: await readTableCounts(),
    baselineModule: await readModuleState(),
    baselineTelemetrySettings: await readTelemetrySettingsState(),
    baselineLegalDocument: await readLegalDocumentState(),
  });

  await runAtomicBatch(env.DB, [
    env.DB.prepare(
      `INSERT INTO runtime_proofs (key, value, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(`${SNAPSHOT_PREFIX}${run.runId}`, JSON.stringify(snapshot)),
    env.DB.prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES (?1, ?2, ?2, 'active')`,
    ).bind(run.ownerId, run.ownerEmail),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(run.ownerId, run.ownerDisplayName),
    env.DB.prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
       VALUES (?1, ?2, 'owner', ?2)`,
    ).bind(run.ownerRoleId, run.ownerId),
    env.DB.prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES (?1, ?2, ?2, 'active')`,
    ).bind(run.customerId, run.customerEmail),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(run.customerId, run.customerDisplayName),
    env.DB.prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
       VALUES (?1, ?2, 'customer', ?3)`,
    ).bind(run.customerRoleId, run.customerId, run.ownerId),
    env.DB.prepare(
      `UPDATE artist_modules
       SET active = 1,
           activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
           deactivated_at = NULL,
           updated_by_user_id = ?1,
           updated_at = CURRENT_TIMESTAMP
       WHERE module_key = 'telemetry'`,
    ).bind(run.ownerId),
    env.DB.prepare(
      `UPDATE telemetry_settings
       SET collection_mode = 'consent_required', retention_days = 30,
           meaningful_listen_seconds = 10, updated_by_user_id = ?1,
           last_operation_key = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = 'telemetry'`,
    ).bind(run.ownerId),
    env.DB.prepare(
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, owner_user_id, content_type,
         byte_length, status, approval_state, revision)
       VALUES (?1, ?2, 'other', 'protected', ?3,
               'application/octet-stream', 0, 'failed', 'rejected', 1)`,
    ).bind(
      run.mediaId,
      `runtime-lab/m8-${run.shortId}/failed-diagnostic`,
      run.ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO media_jobs
        (id, source_media_id, derivative_kind, processing_profile,
         processing_version, status, requested_by_user_id, attempt_count,
         last_error_code, finished_at)
       VALUES (?1, ?2, 'other', 'runtime-m8-diagnostic', 'v1', 'failed',
               ?3, 1, ?4, CURRENT_TIMESTAMP)`,
    ).bind(
      run.mediaJobId,
      run.mediaId,
      run.ownerId,
      run.operationalFailureCode,
    ),
    env.DB.prepare(
      `INSERT INTO operational_failures
        (id, component, code, severity, request_id, subject_type, subject_id,
         occurrence_count, first_occurred_at, last_occurred_at)
       VALUES (?1, 'media', ?2, 'error', ?3, 'media-job', ?4, 1,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).bind(
      run.operationalFailureId,
      run.operationalFailureCode,
      `m8-runtime-${run.shortId}`,
      run.mediaJobId,
    ),
    env.DB.prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id, idempotency_key,
         request_id, details_json, result_json)
       VALUES (?1, ?2, 'runtime.m8.diagnostic', 'media-job', ?3, ?4, ?5,
               ?6, '{"status":"failed"}')`,
    ).bind(
      run.auditId,
      run.ownerId,
      run.mediaJobId,
      `m8-runtime-diagnostic-${run.runId}`,
      `m8-runtime-${run.shortId}`,
      JSON.stringify({
        status: "failed",
        diagnosticNote: run.auditMarker,
        reason: "fictional-runtime-diagnostic",
      }),
    ),
  ]);

  return apiJson({ run }, requestId, 201);
}

async function readArtifactCounts(run: RunFacts): Promise<D1Row> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM runtime_proofs WHERE key = ?1) AS proofs,
       (SELECT COUNT(*) FROM users WHERE id IN (?2, ?3)) AS users,
       (SELECT COUNT(*) FROM profiles WHERE user_id IN (?2, ?3)) AS profiles,
       (SELECT COUNT(*) FROM role_assignments WHERE user_id IN (?2, ?3)) AS roles,
       (SELECT COUNT(*) FROM media_objects WHERE id = ?4) AS mediaObjects,
       (SELECT COUNT(*) FROM media_jobs WHERE id = ?5) AS mediaJobs,
       (SELECT COUNT(*) FROM operational_failures WHERE id = ?6) AS operationalFailures,
       (SELECT COUNT(*) FROM telemetry_events WHERE user_id = ?3) AS telemetryEvents,
       (SELECT COUNT(*) FROM legal_document_versions
        WHERE document_id = 'privacy' AND created_by_user_id = ?2) AS legalVersions,
       (SELECT COUNT(*) FROM audit_events WHERE actor_user_id = ?2) AS auditEvents`,
    [
      `${SNAPSHOT_PREFIX}${run.runId}`,
      run.ownerId,
      run.customerId,
      run.mediaId,
      run.mediaJobId,
      run.operationalFailureId,
    ],
  );
  if (!row) {
    throw runtimeError(
      "M8_RUNTIME_STATE_INVALID",
      "The Milestone 8 runtime artifact state is unavailable.",
      500,
    );
  }
  return row;
}

async function readRunState(
  runId: string,
  requestId: string,
): Promise<Response> {
  const snapshot = await readSnapshot(runId);
  return apiJson(
    {
      run: snapshot.run,
      state: {
        artifacts: await readArtifactCounts(snapshot.run),
        module: await readModuleState(),
        telemetrySettings: await readTelemetrySettingsState(),
        legalDocument: await readLegalDocumentState(),
      },
    },
    requestId,
  );
}

function countsEqual(left: TableCounts, right: TableCounts): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function statesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function cleanupRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const runId = requireCleanupInput(await readJsonMutation(request));
  const snapshot = await readSnapshot(runId);
  const { run } = snapshot;
  const moduleState = snapshot.baselineModule;
  const settings = snapshot.baselineTelemetrySettings;
  const legal = snapshot.baselineLegalDocument;

  await runAtomicBatch(env.DB, [
    env.DB.prepare(
      `UPDATE legal_documents
       SET title = ?1, draft_version_id = ?2, approved_version_id = ?3,
           published_version_id = ?4, current_version = ?5, revision = ?6,
           last_operation_key = ?7, published_at = ?8, created_at = ?9,
           updated_at = ?10
       WHERE id = 'privacy'`,
    ).bind(
      legal.title,
      legal.draft_version_id,
      legal.approved_version_id,
      legal.published_version_id,
      legal.current_version,
      legal.revision,
      legal.last_operation_key,
      legal.published_at,
      legal.created_at,
      legal.updated_at,
    ),
    env.DB.prepare(
      `DELETE FROM legal_document_versions
       WHERE document_id = 'privacy' AND created_by_user_id = ?1`,
    ).bind(run.ownerId),
    env.DB.prepare("DELETE FROM telemetry_events WHERE user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare("DELETE FROM audit_events WHERE actor_user_id = ?1").bind(
      run.ownerId,
    ),
    env.DB.prepare("DELETE FROM operational_failures WHERE id = ?1").bind(
      run.operationalFailureId,
    ),
    env.DB.prepare("DELETE FROM media_jobs WHERE id = ?1").bind(run.mediaJobId),
    env.DB.prepare("DELETE FROM media_objects WHERE id = ?1").bind(run.mediaId),
    env.DB.prepare(
      `UPDATE telemetry_settings
       SET collection_mode = ?1, retention_days = ?2,
           meaningful_listen_seconds = ?3, revision = ?4,
           updated_by_user_id = ?5, last_operation_key = ?6,
           created_at = ?7, updated_at = ?8
       WHERE id = 'telemetry'`,
    ).bind(
      settings.collection_mode,
      settings.retention_days,
      settings.meaningful_listen_seconds,
      settings.revision,
      settings.updated_by_user_id,
      settings.last_operation_key,
      settings.created_at,
      settings.updated_at,
    ),
    env.DB.prepare(
      `UPDATE artist_modules
       SET active = ?1, revision = ?2, settings_json = ?3,
           activated_at = ?4, deactivated_at = ?5, updated_by_user_id = ?6,
           created_at = ?7, updated_at = ?8
       WHERE module_key = 'telemetry'`,
    ).bind(
      moduleState.active,
      moduleState.revision,
      moduleState.settings_json,
      moduleState.activated_at,
      moduleState.deactivated_at,
      moduleState.updated_by_user_id,
      moduleState.created_at,
      moduleState.updated_at,
    ),
    env.DB.prepare(
      "DELETE FROM role_assignments WHERE user_id IN (?1, ?2)",
    ).bind(run.ownerId, run.customerId),
    env.DB.prepare("DELETE FROM profiles WHERE user_id IN (?1, ?2)").bind(
      run.ownerId,
      run.customerId,
    ),
    env.DB.prepare("DELETE FROM users WHERE id IN (?1, ?2)").bind(
      run.ownerId,
      run.customerId,
    ),
    env.DB.prepare("DELETE FROM runtime_proofs WHERE key = ?1").bind(
      `${SNAPSHOT_PREFIX}${run.runId}`,
    ),
  ]);

  const retained = await readArtifactCounts(run);
  const retainedVerificationRows = Object.values(retained).reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0,
  );
  const restoredCounts = await readTableCounts();
  const restoredModule = await readModuleState();
  const restoredSettings = await readTelemetrySettingsState();
  const restoredLegal = await readLegalDocumentState();
  const countDifferences = Object.fromEntries(
    COUNT_KEYS.filter(
      (key) => restoredCounts[key] !== snapshot.baselineCounts[key],
    ).map((key) => [
      key,
      {
        baseline: snapshot.baselineCounts[key],
        restored: restoredCounts[key],
      },
    ]),
  );
  const moduleStateRestored = statesEqual(
    restoredModule,
    snapshot.baselineModule,
  );
  const telemetrySettingsRestored = statesEqual(
    restoredSettings,
    snapshot.baselineTelemetrySettings,
  );
  const legalDocumentRestored = statesEqual(
    restoredLegal,
    snapshot.baselineLegalDocument,
  );
  if (
    retainedVerificationRows !== 0 ||
    !countsEqual(restoredCounts, snapshot.baselineCounts) ||
    !moduleStateRestored ||
    !telemetrySettingsRestored ||
    !legalDocumentRestored
  ) {
    throw new RuntimeError(
      "M8_RUNTIME_CLEANUP_FAILED",
      "The Milestone 8 runtime state was not restored exactly.",
      {
        status: 500,
        publicMessage:
          "The Milestone 8 runtime state was not restored exactly.",
        details: {
          retainedVerificationRows,
          countDifferences,
          moduleStateRestored,
          telemetrySettingsRestored,
          legalDocumentRestored,
        },
      },
    );
  }

  return apiJson(
    {
      cleanup: {
        restored: true,
        retainedVerificationRows,
        baselineCountsRestored: true,
        moduleStateRestored: true,
        telemetrySettingsRestored: true,
        legalDocumentRestored: true,
        r2ObjectsTouched: 0,
        mediaBytesCreated: 0,
        temporaryFilesCreated: 0,
      },
    },
    requestId,
  );
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("runtime.m8_begin_failed", async (requestId) => {
    requireLab();
    return beginRun(request, requestId);
  });
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute("runtime.m8_read_failed", async (requestId) => {
    requireLab();
    const runId = new URL(request.url).searchParams.get("run");
    if (!runId) {
      throw runtimeError("INVALID_INPUT", "Provide a runtime run ID.", 400);
    }
    return readRunState(requireRunId(runId), requestId);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return runApiRoute("runtime.m8_cleanup_failed", async (requestId) => {
    requireLab();
    return cleanupRun(request, requestId);
  });
}
