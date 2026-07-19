import { env } from "cloudflare:workers";
import { runAtomicBatch } from "@/db/d1.ts";
import {
  readJsonMutation,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError, resolveSimulationMode } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

const SNAPSHOT_PREFIX = "m5-runtime-snapshot:";
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COUNT_KEYS = [
  "users",
  "profiles",
  "roleAssignments",
  "tracks",
  "trackRevisions",
  "accessPlans",
  "accessPlanItems",
  "accessGrantSets",
  "accessGrants",
  "entitlements",
  "auditEvents",
  "runtimeProofs",
] as const;

type D1Scalar = string | number | null;
type D1Row = Record<string, D1Scalar>;
type CountKey = (typeof COUNT_KEYS)[number];
type TableCounts = Readonly<Record<CountKey, number>>;

interface RunFacts {
  readonly runId: string;
  readonly shortId: string;
  readonly ownerId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly customerDisplayName: string;
  readonly customerRoleId: string;
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly trackSlug: string;
  readonly trackTitle: string;
  readonly planSlug: string;
  readonly operationKeys: {
    readonly createPlan: string;
    readonly issuePlan: string;
    readonly revokeGrant: string;
  };
}

interface M5Snapshot {
  readonly version: 1;
  readonly run: RunFacts;
  readonly baselineCounts: TableCounts;
}

interface OwnerRow {
  readonly id: string;
  readonly email: string;
  readonly display_name: string | null;
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

function operationKey(runId: string, name: string): string {
  return `m5-${runId}-${name}`;
}

function factsForRun(runId: string, owner: OwnerRow): RunFacts {
  const shortId = runId.replaceAll("-", "").slice(0, 12);
  const customerId = `user_m5_customer_${shortId}`;
  const trackId = `track_m5_${shortId}`;
  return Object.freeze({
    runId,
    shortId,
    ownerId: owner.id,
    ownerEmail: owner.email,
    ownerDisplayName: owner.display_name ?? "Fictional Owner",
    customerId,
    customerEmail: `m5-customer-${shortId}@a-op.invalid`,
    customerDisplayName: `Fictional M5 Customer ${shortId}`,
    customerRoleId: `role_m5_customer_${shortId}`,
    trackId,
    trackRevisionId: `track_revision_m5_${shortId}`,
    trackSlug: `runtime-protected-track-${shortId}`,
    trackTitle: `Fictional protected track ${shortId}`,
    planSlug: `runtime-access-${shortId}`,
    operationKeys: Object.freeze({
      createPlan: operationKey(runId, "create-plan"),
      issuePlan: operationKey(runId, "issue-plan"),
      revokeGrant: operationKey(runId, "revoke-grant"),
    }),
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

async function currentOwner(): Promise<OwnerRow> {
  const owner = await firstRow<OwnerRow>(
    `SELECT users.id, users.email, profiles.display_name
     FROM users
     JOIN role_assignments
       ON role_assignments.user_id = users.id
      AND role_assignments.role_key = 'owner'
      AND role_assignments.revoked_at IS NULL
     LEFT JOIN profiles ON profiles.user_id = users.id
     WHERE users.status = 'active'
     ORDER BY CASE users.normalized_email
                WHEN 'owner@a-op.invalid' THEN 0 ELSE 1 END,
              users.id
     LIMIT 1`,
  );
  if (!owner) {
    throw runtimeError(
      "M5_RUNTIME_OWNER_REQUIRED",
      "The Milestone 5 runtime journey requires an active local owner.",
      409,
    );
  }
  return owner;
}

function countValue(row: D1Row, key: CountKey): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw runtimeError(
      "M5_RUNTIME_STATE_INVALID",
      "The Milestone 5 runtime state contains an invalid table count.",
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
       (SELECT COUNT(*) FROM tracks) AS tracks,
       (SELECT COUNT(*) FROM track_revisions) AS trackRevisions,
       (SELECT COUNT(*) FROM access_plans) AS accessPlans,
       (SELECT COUNT(*) FROM access_plan_items) AS accessPlanItems,
       (SELECT COUNT(*) FROM access_grant_sets) AS accessGrantSets,
       (SELECT COUNT(*) FROM access_grants) AS accessGrants,
       (SELECT COUNT(*) FROM entitlements) AS entitlements,
       (SELECT COUNT(*) FROM audit_events) AS auditEvents,
       (SELECT COUNT(*) FROM runtime_proofs) AS runtimeProofs`,
  );
  if (!row) {
    throw runtimeError(
      "M5_RUNTIME_STATE_INVALID",
      "The Milestone 5 runtime table counts are unavailable.",
      500,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      COUNT_KEYS.map((key) => [key, countValue(row, key)]),
    ) as Record<CountKey, number>,
  );
}

function parseSnapshot(value: string): M5Snapshot {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw runtimeError(
      "M5_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 5 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  if (!isPlainRecord(candidate) || candidate.version !== 1) {
    throw runtimeError(
      "M5_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 5 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const run = candidate.run;
  const counts = candidate.baselineCounts;
  if (
    !isPlainRecord(run) ||
    !isPlainRecord(run.operationKeys) ||
    !isPlainRecord(counts) ||
    typeof run.ownerId !== "string" ||
    typeof run.ownerEmail !== "string" ||
    typeof run.ownerDisplayName !== "string" ||
    typeof run.customerId !== "string" ||
    typeof run.customerEmail !== "string" ||
    typeof run.customerDisplayName !== "string" ||
    typeof run.customerRoleId !== "string" ||
    typeof run.trackId !== "string" ||
    typeof run.trackRevisionId !== "string" ||
    typeof run.trackSlug !== "string" ||
    typeof run.trackTitle !== "string" ||
    typeof run.planSlug !== "string" ||
    typeof run.shortId !== "string" ||
    typeof run.operationKeys.createPlan !== "string" ||
    typeof run.operationKeys.issuePlan !== "string" ||
    typeof run.operationKeys.revokeGrant !== "string"
  ) {
    throw runtimeError(
      "M5_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 5 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const runId = requireRunId(run.runId);
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
      throw runtimeError(
        "M5_RUNTIME_SNAPSHOT_INVALID",
        "The Milestone 5 runtime cleanup snapshot is invalid.",
        500,
      );
    }
  }
  return Object.freeze({
    version: 1,
    run: Object.freeze({
      ...(run as unknown as RunFacts),
      runId,
      operationKeys: Object.freeze({
        createPlan: run.operationKeys.createPlan,
        issuePlan: run.operationKeys.issuePlan,
        revokeGrant: run.operationKeys.revokeGrant,
      }),
    }),
    baselineCounts: Object.freeze(
      Object.fromEntries(COUNT_KEYS.map((key) => [key, counts[key]])) as Record<
        CountKey,
        number
      >,
    ),
  });
}

async function readSnapshot(runId: string): Promise<M5Snapshot> {
  const row = await firstRow<{ value: string }>(
    "SELECT value FROM runtime_proofs WHERE key = ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}${runId}`],
  );
  if (!row) unavailable();
  const snapshot = parseSnapshot(row.value);
  if (snapshot.run.runId !== runId) {
    throw runtimeError(
      "M5_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 5 runtime cleanup snapshot is invalid.",
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
      "M5_RUNTIME_RUN_ACTIVE",
      "A Milestone 5 runtime journey is already active.",
      409,
    );
  }

  const owner = await currentOwner();
  const run = factsForRun(crypto.randomUUID(), owner);
  const snapshot: M5Snapshot = Object.freeze({
    version: 1,
    run,
    baselineCounts: await readTableCounts(),
  });

  await runAtomicBatch(env.DB, [
    env.DB.prepare(
      `INSERT INTO runtime_proofs (key, value, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(`${SNAPSHOT_PREFIX}${run.runId}`, JSON.stringify(snapshot)),
    env.DB.prepare(
      `INSERT INTO users
        (id, email, normalized_email, status)
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
      `INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id,
         publication_state, version, published_at)
       VALUES (?1, ?2, ?3, ?3, 'published', 1, CURRENT_TIMESTAMP)`,
    ).bind(run.trackId, run.trackSlug, run.trackRevisionId),
    env.DB.prepare(
      `INSERT INTO track_revisions
        (id, track_id, revision, title, description, view_mode, stream_mode,
         download_mode, tags_json, created_by_user_id)
       VALUES (?1, ?2, 1, ?3, ?4, 'protected', 'unavailable',
               'unavailable', '[]', ?5)`,
    ).bind(
      run.trackRevisionId,
      run.trackId,
      run.trackTitle,
      `Metadata-only protected track for Milestone 5 runtime verification ${run.shortId}.`,
      run.ownerId,
    ),
  ]);

  return apiJson({ run }, requestId, 201);
}

async function readArtifactCounts(run: RunFacts): Promise<D1Row> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM runtime_proofs WHERE key = ?1) AS proofs,
       (SELECT COUNT(*) FROM users WHERE id = ?2) AS users,
       (SELECT COUNT(*) FROM profiles WHERE user_id = ?2) AS profiles,
       (SELECT COUNT(*) FROM role_assignments WHERE user_id = ?2) AS roles,
       (SELECT COUNT(*) FROM tracks WHERE id = ?3) AS tracks,
       (SELECT COUNT(*) FROM track_revisions WHERE track_id = ?3) AS trackRevisions,
       (SELECT COUNT(*) FROM access_plans WHERE slug = ?4) AS accessPlans,
       (SELECT COUNT(*) FROM access_plan_items
        WHERE access_plan_id IN (SELECT id FROM access_plans WHERE slug = ?4)) AS accessPlanItems,
       (SELECT COUNT(*) FROM access_grant_sets WHERE grantee_user_id = ?2) AS accessGrantSets,
       (SELECT COUNT(*) FROM access_grants WHERE grantee_user_id = ?2) AS accessGrants,
       (SELECT COUNT(*) FROM entitlements WHERE user_id = ?2) AS entitlements,
       (SELECT COUNT(*) FROM audit_events
        WHERE idempotency_key IN (?5, ?6, ?7)) AS auditEvents`,
    [
      `${SNAPSHOT_PREFIX}${run.runId}`,
      run.customerId,
      run.trackId,
      run.planSlug,
      `access.plan.create:${run.ownerId}:${run.operationKeys.createPlan}`,
      `access.plan.issue:${run.ownerId}:${run.operationKeys.issuePlan}`,
      `access.grant-set.revoke:${run.ownerId}:${run.operationKeys.revokeGrant}`,
    ],
  );
  if (!row) {
    throw runtimeError(
      "M5_RUNTIME_STATE_INVALID",
      "The Milestone 5 runtime artifact state is unavailable.",
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
  const grantSet = await firstRow<D1Row>(
    `SELECT access_grant_sets.id, access_grant_sets.state,
            access_grant_sets.revision
     FROM access_grant_sets
     JOIN access_plans
       ON access_plans.id = access_grant_sets.access_plan_id
     WHERE access_plans.slug = ?1
       AND access_grant_sets.grantee_user_id = ?2
     ORDER BY access_grant_sets.created_at DESC
     LIMIT 1`,
    [snapshot.run.planSlug, snapshot.run.customerId],
  );
  return apiJson(
    {
      run: snapshot.run,
      state: {
        artifacts: await readArtifactCounts(snapshot.run),
        grantSet,
      },
    },
    requestId,
  );
}

function countsEqual(left: TableCounts, right: TableCounts): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

async function cleanupRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const runId = requireCleanupInput(await readJsonMutation(request));
  const snapshot = await readSnapshot(runId);
  const { run } = snapshot;
  const auditKeys = [
    `access.plan.create:${run.ownerId}:${run.operationKeys.createPlan}`,
    `access.plan.issue:${run.ownerId}:${run.operationKeys.issuePlan}`,
    `access.grant-set.revoke:${run.ownerId}:${run.operationKeys.revokeGrant}`,
  ] as const;

  await runAtomicBatch(env.DB, [
    env.DB.prepare("DELETE FROM entitlements WHERE user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare("DELETE FROM access_grants WHERE grantee_user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare(
      "DELETE FROM access_grant_sets WHERE grantee_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare("DELETE FROM access_plans WHERE slug = ?1").bind(
      run.planSlug,
    ),
    env.DB.prepare(
      `DELETE FROM audit_events
       WHERE idempotency_key IN (?1, ?2, ?3)`,
    ).bind(...auditKeys),
    env.DB.prepare("DELETE FROM tracks WHERE id = ?1").bind(run.trackId),
    env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(run.customerId),
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
  if (
    retainedVerificationRows !== 0 ||
    !countsEqual(restoredCounts, snapshot.baselineCounts)
  ) {
    throw runtimeError(
      "M5_RUNTIME_CLEANUP_FAILED",
      "The Milestone 5 runtime state was not restored exactly.",
      500,
    );
  }

  return apiJson(
    {
      cleanup: {
        restored: true,
        retainedVerificationRows,
        baselineCountsRestored: true,
        r2ObjectsTouched: 0,
        temporaryFilesCreated: 0,
      },
    },
    requestId,
  );
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("runtime.m5_begin_failed", async (requestId) => {
    requireLab();
    return beginRun(request, requestId);
  });
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute("runtime.m5_read_failed", async (requestId) => {
    requireLab();
    const runId = new URL(request.url).searchParams.get("run");
    if (!runId) {
      throw runtimeError("INVALID_INPUT", "Provide a runtime run ID.", 400);
    }
    return readRunState(requireRunId(runId), requestId);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return runApiRoute("runtime.m5_cleanup_failed", async (requestId) => {
    requireLab();
    return cleanupRun(request, requestId);
  });
}
