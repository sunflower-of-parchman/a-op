import { changedRows } from "./audit-events.ts";
import {
  activeCustomerCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
  type PreparedMutation,
} from "./mutation.ts";
import type {
  AccessGrantMutationReceipt,
  AccessPlanItemInput,
  AccessPlanMutationReceipt,
} from "@/lib/access-management/types.ts";
import {
  validateAccessPlanCreateInput,
  validateAccessPlanGrantInput,
  validateAccessPlanUpdateInput,
  type AccessPlanValidationIssue,
} from "@/lib/access-management/validation.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CountRow {
  count: number;
}

interface AccessPlanRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  state: "active" | "archived";
  revision: number;
  item_count: number;
  grant_set_count: number;
}

interface StoredAccessPlanItemRow {
  id: string;
  position: number;
  resource_type: unknown;
  resource_id: unknown;
  actions_json: unknown;
  remaining_uses: unknown;
  download_disposition: unknown;
}

interface StoredAccessPlanItem extends AccessPlanItemInput {
  readonly id: string;
  readonly position: number;
}

interface AccessGrantSetRow {
  id: string;
  access_plan_id: string;
  access_plan_revision: number;
  grantee_user_id: string;
  state: "pending" | "active" | "revoked" | "expired";
  revision: number;
  grant_count: number;
  active_grant_count: number;
  entitlement_count: number;
  active_entitlement_count: number;
}

type TerminalGrantSetState = "revoked" | "expired";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function invalidInput(
  issues: readonly AccessPlanValidationIssue[],
): RuntimeError {
  return new RuntimeError(
    "ACCESS_PLAN_INPUT_INVALID",
    "The access-plan input did not satisfy its server contract.",
    {
      status: 400,
      publicMessage: "Review the access-plan fields and try again.",
      details: { issues },
    },
  );
}

function invalidIdentifier(field: string): RuntimeError {
  return invalidInput([
    Object.freeze({
      field,
      message: `${field} must be a safe application identifier.`,
    }),
  ]);
}

function positiveRevision(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalidInput([
      Object.freeze({
        field,
        message: `${field} must be a positive revision.`,
      }),
    ]);
  }
  return value;
}

function safeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw invalidIdentifier(field);
  }
  return value;
}

async function requireActiveOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;

  throw new RuntimeError(
    "ACCESS_OWNER_REQUIRED",
    "Access administration requires a live owner authority record.",
    {
      status: 403,
      publicMessage: "Owner access is required for this operation.",
    },
  );
}

async function requireActiveCustomer(
  binding: D1Database,
  customerUserId: string,
): Promise<void> {
  const authority = activeCustomerCondition(customerUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;

  throw new RuntimeError(
    "ACCESS_CUSTOMER_UNAVAILABLE",
    "An access plan can only be issued to an active customer authority record.",
    {
      status: 409,
      publicMessage: "Choose an active customer before issuing access.",
    },
  );
}

function planNotFound(): RuntimeError {
  return new RuntimeError("ACCESS_PLAN_NOT_FOUND", "Access plan not found.", {
    status: 404,
    publicMessage: "That access plan was not found.",
  });
}

function planArchived(): RuntimeError {
  return new RuntimeError(
    "ACCESS_PLAN_ARCHIVED",
    "An archived access plan cannot be changed or issued.",
    {
      status: 409,
      publicMessage: "This access plan is archived.",
    },
  );
}

function planLocked(): RuntimeError {
  return new RuntimeError(
    "ACCESS_PLAN_LOCKED",
    "An access-plan definition is immutable after its first grant set.",
    {
      status: 409,
      publicMessage:
        "This plan has access history. Create a new plan for a different definition.",
    },
  );
}

function grantSetNotFound(): RuntimeError {
  return new RuntimeError(
    "ACCESS_GRANT_SET_NOT_FOUND",
    "Access grant set not found.",
    {
      status: 404,
      publicMessage: "That access grant was not found.",
    },
  );
}

function grantSetNotActive(): RuntimeError {
  return new RuntimeError(
    "ACCESS_GRANT_SET_NOT_ACTIVE",
    "Only an active access grant set can enter a terminal state.",
    {
      status: 409,
      publicMessage: "This access grant is no longer active.",
    },
  );
}

function accessIntegrity(message: string): RuntimeError {
  return new RuntimeError("ACCESS_PLAN_INTEGRITY", message, {
    status: 409,
    publicMessage:
      "The stored access definition is incomplete. Review it before continuing.",
  });
}

async function readAccessPlan(
  binding: D1Database,
  accessPlanId: string,
): Promise<AccessPlanRow | null> {
  return binding
    .prepare(
      `SELECT access_plans.id, access_plans.slug, access_plans.name,
              access_plans.description, access_plans.state,
              access_plans.revision,
              (SELECT COUNT(*) FROM access_plan_items
               WHERE access_plan_id = access_plans.id) AS item_count,
              (SELECT COUNT(*) FROM access_grant_sets
               WHERE access_plan_id = access_plans.id) AS grant_set_count
       FROM access_plans
       WHERE access_plans.id = ?1
       LIMIT 1`,
    )
    .bind(accessPlanId)
    .first<AccessPlanRow>();
}

async function readPlanBySlug(
  binding: D1Database,
  slug: string,
): Promise<{ id: string } | null> {
  return binding
    .prepare("SELECT id FROM access_plans WHERE slug = ?1 LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();
}

function parseStoredActions(value: unknown): unknown {
  if (typeof value !== "string") {
    throw accessIntegrity("An access-plan item has invalid action data.");
  }
  try {
    return JSON.parse(value);
  } catch {
    throw accessIntegrity("An access-plan item has invalid action JSON.");
  }
}

async function readStoredPlanItems(
  binding: D1Database,
  accessPlanId: string,
): Promise<readonly StoredAccessPlanItem[]> {
  const rows = await binding
    .prepare(
      `SELECT id, position, resource_type, resource_id, actions_json,
              remaining_uses, download_disposition
       FROM access_plan_items
       WHERE access_plan_id = ?1
       ORDER BY position`,
    )
    .bind(accessPlanId)
    .all<StoredAccessPlanItemRow>();

  const candidates = rows.results.map((row) => ({
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actions: parseStoredActions(row.actions_json),
    remainingUses: row.remaining_uses,
    downloadDisposition: row.download_disposition,
  }));
  const validated = validateAccessPlanUpdateInput({
    name: "Stored access plan",
    description: "",
    items: candidates,
  });
  if (!validated.ok) {
    throw accessIntegrity("An access-plan item failed current validation.");
  }
  if (
    rows.results.some((row, index) => row.position !== index + 1) ||
    validated.value.items.some(({ remainingUses }) => remainingUses !== null)
  ) {
    throw accessIntegrity(
      "Access-plan item ordering or use limits are invalid.",
    );
  }

  return Object.freeze(
    rows.results.map((row, index) =>
      Object.freeze({
        id: row.id,
        position: row.position,
        ...validated.value.items[index],
      }),
    ),
  );
}

function resourceAvailabilityCondition(item: AccessPlanItemInput): {
  readonly sql: string;
  readonly bindings: readonly string[];
} {
  if (item.resourceType === "track") {
    const modeColumns = Object.freeze({
      view: "view_mode",
      stream: "stream_mode",
      download: "download_mode",
    } as const);
    const actionConditions = item.actions.map(
      (action) => `current_track.${modeColumns[action]} != 'unavailable'`,
    );
    return {
      sql: `EXISTS (
        SELECT 1
        FROM tracks AS available_track
        JOIN track_revisions AS current_track
          ON current_track.id = available_track.published_revision_id
         AND current_track.track_id = available_track.id
        WHERE available_track.id = ?
          AND available_track.publication_state = 'published'
          AND ${actionConditions.join(" AND ")}
      )`,
      bindings: [item.resourceId],
    };
  }

  if (item.resourceType === "course") {
    return {
      sql: `EXISTS (
        SELECT 1
        FROM courses AS available_course
        JOIN course_revisions AS current_course
          ON current_course.id = available_course.draft_revision_id
         AND current_course.course_id = available_course.id
        WHERE available_course.id = ?
          AND available_course.publication_state != 'archived'
      )`,
      bindings: [item.resourceId],
    };
  }

  const root = item.resourceType === "release" ? "releases" : "collections";
  const revisions =
    item.resourceType === "release"
      ? "release_revisions"
      : "collection_revisions";
  const ownerColumn =
    item.resourceType === "release" ? "release_id" : "collection_id";
  return {
    sql: `EXISTS (
      SELECT 1
      FROM ${root} AS available_parent
      JOIN ${revisions} AS current_parent
        ON current_parent.id = available_parent.published_revision_id
       AND current_parent.${ownerColumn} = available_parent.id
      WHERE available_parent.id = ?
        AND available_parent.publication_state = 'published'
        AND current_parent.view_mode != 'unavailable'
    )`,
    bindings: [item.resourceId],
  };
}

async function requireAvailableResources(
  binding: D1Database,
  items: readonly AccessPlanItemInput[],
): Promise<void> {
  for (const item of items) {
    const available = resourceAvailabilityCondition(item);
    const row = await binding
      .prepare(`SELECT COUNT(*) AS count WHERE ${available.sql}`)
      .bind(...available.bindings)
      .first<CountRow>();
    if (row?.count === 1) continue;

    throw new RuntimeError(
      "ACCESS_RESOURCE_UNAVAILABLE",
      "An access-plan item does not reference a compatible current published resource.",
      {
        status: 409,
        publicMessage:
          "Choose a current published resource with the selected access actions.",
        details: {
          resourceType: item.resourceType,
          resourceId: item.resourceId,
        },
      },
    );
  }
}

function prepareRequiredAuditEvent(
  binding: D1Database,
  input: {
    readonly actorUserId: string;
    readonly action: string;
    readonly subjectType: string;
    readonly subjectId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly requestId: string;
    readonly details?: Record<string, unknown>;
    readonly result: Record<string, unknown>;
  },
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, ?, CASE WHEN (${conditionSql}) THEN ? ELSE NULL END,
               ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      ...conditionBindings,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
    );
}

function isRequiredAuditGuardFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:NOT NULL|not-null).*audit_events\.action|audit_events\.action.*(?:NOT NULL|not-null)/i.test(
      error.message,
    )
  );
}

async function replayOrStale<T>(
  binding: D1Database,
  mutation: PreparedMutation<T>,
  error: unknown,
  subject: string,
): Promise<MutationResult<T>> {
  try {
    return await replayAfterMutationFailure(binding, mutation, error);
  } catch (replayError) {
    if (isRequiredAuditGuardFailure(replayError)) throw staleMutation(subject);
    throw replayError;
  }
}

function planItemInsert(
  binding: D1Database,
  input: {
    readonly accessPlanId: string;
    readonly item: AccessPlanItemInput;
    readonly itemId: string;
    readonly position: number;
    readonly revision: number;
    readonly marker: string;
    readonly authority: SqlAuthorityCondition;
  },
): D1PreparedStatement {
  const available = resourceAvailabilityCondition(input.item);
  return binding
    .prepare(
      `INSERT INTO access_plan_items
        (id, access_plan_id, position, resource_type, resource_id,
         actions_json, remaining_uses, download_disposition)
       SELECT ?, ?, ?, ?, ?, ?, NULL, ?
       WHERE EXISTS (
         SELECT 1 FROM access_plans
         WHERE id = ? AND revision = ? AND state = 'active'
           AND last_operation_key = ?
       )
         AND ${available.sql}
         AND ${input.authority.sql}`,
    )
    .bind(
      input.itemId,
      input.accessPlanId,
      input.position,
      input.item.resourceType,
      input.item.resourceId,
      JSON.stringify(input.item.actions),
      input.item.downloadDisposition,
      input.accessPlanId,
      input.revision,
      input.marker,
      ...available.bindings,
      ...input.authority.bindings,
    );
}

function exactPlanCondition(input: {
  readonly accessPlanId: string;
  readonly revision: number;
  readonly state: "active" | "archived";
  readonly itemCount: number;
  readonly marker: string;
  readonly authority: SqlAuthorityCondition;
}): { readonly sql: string; readonly bindings: readonly (number | string)[] } {
  return {
    sql: `EXISTS (
      SELECT 1 FROM access_plans
      WHERE id = ? AND revision = ? AND state = ?
        AND last_operation_key = ?
    ) AND (
      SELECT COUNT(*) FROM access_plan_items WHERE access_plan_id = ?
    ) = ? AND ${input.authority.sql}`,
    bindings: [
      input.accessPlanId,
      input.revision,
      input.state,
      input.marker,
      input.accessPlanId,
      input.itemCount,
      ...input.authority.bindings,
    ],
  };
}

export async function createAccessPlan(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<AccessPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateAccessPlanCreateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "access.plan.create";
  const mutation = await prepareMutation<AccessPlanMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  if (await readPlanBySlug(binding, input.slug)) {
    throw new RuntimeError(
      "ACCESS_PLAN_SLUG_TAKEN",
      "An access plan already uses this slug.",
      {
        status: 409,
        publicMessage: "Choose a different access-plan slug.",
      },
    );
  }
  await requireAvailableResources(binding, input.items);

  const accessPlanId = `access_plan_${crypto.randomUUID()}`;
  const result: AccessPlanMutationReceipt = Object.freeze({
    accessPlanId,
    slug: input.slug,
    state: "active",
    revision: 1,
    itemCount: input.items.length,
    created: true,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO access_plans
          (id, slug, name, description, state, revision, last_operation_key,
           created_by_user_id)
         SELECT ?, ?, ?, ?, 'active', 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM access_plans WHERE slug = ?)
           AND ${authority.sql}`,
      )
      .bind(
        accessPlanId,
        input.slug,
        input.name,
        input.description,
        mutation.namespacedKey,
        context.actorUserId,
        input.slug,
        ...authority.bindings,
      ),
  ];
  input.items.forEach((item, index) => {
    statements.push(
      planItemInsert(binding, {
        accessPlanId,
        item,
        itemId: `access_plan_item_${crypto.randomUUID()}`,
        position: index + 1,
        revision: 1,
        marker: mutation.namespacedKey,
        authority,
      }),
    );
  });
  const exact = exactPlanCondition({
    accessPlanId,
    revision: 1,
    state: "active",
    itemCount: input.items.length,
    marker: mutation.namespacedKey,
    authority,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "access-plan",
        subjectId: accessPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { itemCount: input.items.length },
        result: { ...result },
      },
      exact.sql,
      exact.bindings,
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("access plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "access plan");
  }
}

export async function updateAccessPlan(
  binding: D1Database,
  rawAccessPlanId: string,
  rawInput: unknown,
  rawExpectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<AccessPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const accessPlanId = safeId(rawAccessPlanId, "accessPlanId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const validated = validateAccessPlanUpdateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "access.plan.update";
  const mutation = await prepareMutation<AccessPlanMutationReceipt>(
    binding,
    operation,
    context,
    { accessPlanId, expectedRevision, plan: input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAccessPlan(binding, accessPlanId);
  if (!aggregate) throw planNotFound();
  if (aggregate.state === "archived") throw planArchived();
  if (aggregate.revision !== expectedRevision)
    throw staleMutation("access plan");
  if (aggregate.grant_set_count > 0) throw planLocked();
  await requireAvailableResources(binding, input.items);

  const result: AccessPlanMutationReceipt = Object.freeze({
    accessPlanId,
    slug: aggregate.slug,
    state: "active",
    revision: expectedRevision + 1,
    itemCount: input.items.length,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE access_plans
         SET name = ?, description = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revision = ? AND state = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM access_grant_sets
             WHERE access_plan_id = access_plans.id
           )
           AND ${authority.sql}`,
      )
      .bind(
        input.name,
        input.description,
        mutation.namespacedKey,
        accessPlanId,
        expectedRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `DELETE FROM access_plan_items
         WHERE access_plan_id = ?
           AND EXISTS (
             SELECT 1 FROM access_plans
             WHERE id = ? AND revision = ? AND state = 'active'
               AND last_operation_key = ?
               AND NOT EXISTS (
                 SELECT 1 FROM access_grant_sets
                 WHERE access_plan_id = access_plans.id
               )
           )
           AND ${authority.sql}`,
      )
      .bind(
        accessPlanId,
        accessPlanId,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  ];
  input.items.forEach((item, index) => {
    statements.push(
      planItemInsert(binding, {
        accessPlanId,
        item,
        itemId: `access_plan_item_${crypto.randomUUID()}`,
        position: index + 1,
        revision: result.revision,
        marker: mutation.namespacedKey,
        authority,
      }),
    );
  });
  const exact = exactPlanCondition({
    accessPlanId,
    revision: result.revision,
    state: "active",
    itemCount: input.items.length,
    marker: mutation.namespacedKey,
    authority,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "access-plan",
        subjectId: accessPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          previousRevision: expectedRevision,
          itemCount: input.items.length,
        },
        result: { ...result },
      },
      exact.sql,
      exact.bindings,
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("access plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "access plan");
  }
}

export async function archiveAccessPlan(
  binding: D1Database,
  rawAccessPlanId: string,
  rawExpectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<AccessPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const accessPlanId = safeId(rawAccessPlanId, "accessPlanId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const operation = "access.plan.archive";
  const mutation = await prepareMutation<AccessPlanMutationReceipt>(
    binding,
    operation,
    context,
    { accessPlanId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAccessPlan(binding, accessPlanId);
  if (!aggregate) throw planNotFound();
  if (aggregate.state === "archived") throw planArchived();
  if (aggregate.revision !== expectedRevision)
    throw staleMutation("access plan");
  const result: AccessPlanMutationReceipt = Object.freeze({
    accessPlanId,
    slug: aggregate.slug,
    state: "archived",
    revision: expectedRevision + 1,
    itemCount: aggregate.item_count,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const exact = exactPlanCondition({
    accessPlanId,
    revision: result.revision,
    state: "archived",
    itemCount: aggregate.item_count,
    marker: mutation.namespacedKey,
    authority,
  });
  const statements = [
    binding
      .prepare(
        `UPDATE access_plans
         SET state = 'archived', revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revision = ? AND state = 'active'
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        accessPlanId,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "access-plan",
        subjectId: accessPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { previousRevision: expectedRevision },
        result: { ...result },
      },
      exact.sql,
      exact.bindings,
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("access plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "access plan");
  }
}

async function readGrantSet(
  binding: D1Database,
  grantSetId: string,
): Promise<AccessGrantSetRow | null> {
  return binding
    .prepare(
      `SELECT access_grant_sets.id, access_grant_sets.access_plan_id,
              access_grant_sets.access_plan_revision,
              access_grant_sets.grantee_user_id, access_grant_sets.state,
              access_grant_sets.revision,
              (SELECT COUNT(*) FROM access_grants
               WHERE grant_set_id = access_grant_sets.id) AS grant_count,
              (SELECT COUNT(*) FROM access_grants
               WHERE grant_set_id = access_grant_sets.id
                 AND state = 'active') AS active_grant_count,
              (SELECT COUNT(*)
               FROM entitlements
               JOIN access_grants
                 ON access_grants.id = entitlements.grant_id
                AND entitlements.source_type = 'grant'
                AND entitlements.source_id = access_grants.id
               WHERE access_grants.grant_set_id = access_grant_sets.id
              ) AS entitlement_count,
              (SELECT COUNT(*)
               FROM entitlements
               JOIN access_grants
                 ON access_grants.id = entitlements.grant_id
                AND entitlements.source_type = 'grant'
                AND entitlements.source_id = access_grants.id
               WHERE access_grants.grant_set_id = access_grant_sets.id
                 AND entitlements.state = 'active'
              ) AS active_entitlement_count
       FROM access_grant_sets
       WHERE access_grant_sets.id = ?1
       LIMIT 1`,
    )
    .bind(grantSetId)
    .first<AccessGrantSetRow>();
}

function grantInsert(
  binding: D1Database,
  input: {
    readonly grantId: string;
    readonly grantSetId: string;
    readonly accessPlanId: string;
    readonly accessPlanRevision: number;
    readonly customerUserId: string;
    readonly item: StoredAccessPlanItem;
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
    readonly reason: string;
    readonly actorUserId: string;
    readonly marker: string;
    readonly ownerAuthority: SqlAuthorityCondition;
    readonly customerAuthority: SqlAuthorityCondition;
  },
): D1PreparedStatement {
  const available = resourceAvailabilityCondition(input.item);
  return binding
    .prepare(
      `INSERT INTO access_grants
        (id, grantee_user_id, grant_set_id, access_plan_id,
         access_plan_item_id, resource_type, resource_id, actions_json,
         state, starts_at, expires_at, remaining_uses, download_disposition,
         reason, granted_by_user_id, revision, last_operation_key)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?, ?, ?, 1, ?
       WHERE EXISTS (
         SELECT 1 FROM access_grant_sets
         WHERE id = ? AND access_plan_id = ? AND access_plan_revision = ?
           AND grantee_user_id = ? AND state = 'pending'
           AND last_operation_key = ?
       )
         AND EXISTS (
           SELECT 1 FROM access_plan_items
           WHERE id = ? AND access_plan_id = ? AND position = ?
             AND resource_type = ? AND resource_id = ?
             AND actions_json = ? AND remaining_uses IS NULL
             AND download_disposition IS ?
         )
         AND ${available.sql}
         AND ${input.ownerAuthority.sql}
         AND ${input.customerAuthority.sql}`,
    )
    .bind(
      input.grantId,
      input.customerUserId,
      input.grantSetId,
      input.accessPlanId,
      input.item.id,
      input.item.resourceType,
      input.item.resourceId,
      JSON.stringify(input.item.actions),
      input.startsAt,
      input.expiresAt,
      input.item.downloadDisposition,
      input.reason,
      input.actorUserId,
      input.marker,
      input.grantSetId,
      input.accessPlanId,
      input.accessPlanRevision,
      input.customerUserId,
      input.marker,
      input.item.id,
      input.accessPlanId,
      input.item.position,
      input.item.resourceType,
      input.item.resourceId,
      JSON.stringify(input.item.actions),
      input.item.downloadDisposition,
      ...available.bindings,
      ...input.ownerAuthority.bindings,
      ...input.customerAuthority.bindings,
    );
}

function entitlementInsert(
  binding: D1Database,
  input: {
    readonly entitlementId: string;
    readonly grantId: string;
    readonly grantSetId: string;
    readonly customerUserId: string;
    readonly item: StoredAccessPlanItem;
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
    readonly marker: string;
    readonly ownerAuthority: SqlAuthorityCondition;
    readonly customerAuthority: SqlAuthorityCondition;
  },
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO entitlements
        (id, user_id, source_type, source_id, grant_id, resource_type,
         resource_id, actions_json, state, starts_at, expires_at,
         remaining_uses, download_disposition, revision, last_operation_key)
       SELECT ?, ?, 'grant', ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?, 1, ?
       WHERE EXISTS (
         SELECT 1 FROM access_grants
         WHERE id = ? AND grantee_user_id = ? AND grant_set_id = ?
           AND access_plan_item_id = ? AND state = 'active'
           AND remaining_uses IS NULL AND last_operation_key = ?
       )
         AND EXISTS (
           SELECT 1 FROM access_grant_sets
           WHERE id = ? AND grantee_user_id = ? AND state = 'pending'
             AND last_operation_key = ?
         )
         AND ${input.ownerAuthority.sql}
         AND ${input.customerAuthority.sql}`,
    )
    .bind(
      input.entitlementId,
      input.customerUserId,
      input.grantId,
      input.grantId,
      input.item.resourceType,
      input.item.resourceId,
      JSON.stringify(input.item.actions),
      input.startsAt,
      input.expiresAt,
      input.item.downloadDisposition,
      input.marker,
      input.grantId,
      input.customerUserId,
      input.grantSetId,
      input.item.id,
      input.marker,
      input.grantSetId,
      input.customerUserId,
      input.marker,
      ...input.ownerAuthority.bindings,
      ...input.customerAuthority.bindings,
    );
}

function exactIssuedGrantCondition(input: {
  readonly grantSetId: string;
  readonly accessPlanId: string;
  readonly accessPlanRevision: number;
  readonly customerUserId: string;
  readonly marker: string;
  readonly itemCount: number;
  readonly ownerAuthority: SqlAuthorityCondition;
  readonly customerAuthority: SqlAuthorityCondition;
}): { readonly sql: string; readonly bindings: readonly (number | string)[] } {
  return {
    sql: `EXISTS (
      SELECT 1 FROM access_grant_sets
      WHERE id = ? AND access_plan_id = ? AND access_plan_revision = ?
        AND grantee_user_id = ? AND state = 'active' AND revision = 1
        AND activated_at IS NOT NULL AND last_operation_key = ?
    ) AND (
      SELECT COUNT(*) FROM access_grants
      WHERE grant_set_id = ? AND access_plan_id = ?
        AND grantee_user_id = ? AND state = 'active'
        AND remaining_uses IS NULL AND last_operation_key = ?
    ) = ? AND (
      SELECT COUNT(*)
      FROM entitlements
      JOIN access_grants ON access_grants.id = entitlements.grant_id
       AND entitlements.source_type = 'grant'
       AND entitlements.source_id = access_grants.id
      WHERE access_grants.grant_set_id = ?
        AND entitlements.user_id = ? AND entitlements.state = 'active'
        AND entitlements.remaining_uses IS NULL
        AND entitlements.last_operation_key = ?
    ) = ? AND ${input.ownerAuthority.sql}
      AND ${input.customerAuthority.sql}`,
    bindings: [
      input.grantSetId,
      input.accessPlanId,
      input.accessPlanRevision,
      input.customerUserId,
      input.marker,
      input.grantSetId,
      input.accessPlanId,
      input.customerUserId,
      input.marker,
      input.itemCount,
      input.grantSetId,
      input.customerUserId,
      input.marker,
      input.itemCount,
      ...input.ownerAuthority.bindings,
      ...input.customerAuthority.bindings,
    ],
  };
}

export async function issueAccessPlan(
  binding: D1Database,
  rawInput: unknown,
  rawExpectedPlanRevision: number,
  context: MutationContext,
): Promise<MutationResult<AccessGrantMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateAccessPlanGrantInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const expectedPlanRevision = positiveRevision(
    rawExpectedPlanRevision,
    "expectedPlanRevision",
  );
  const operation = "access.plan.issue";
  const mutation = await prepareMutation<AccessGrantMutationReceipt>(
    binding,
    operation,
    context,
    { expectedPlanRevision, grant: input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAccessPlan(binding, input.accessPlanId);
  if (!aggregate) throw planNotFound();
  if (aggregate.state === "archived") throw planArchived();
  if (aggregate.revision !== expectedPlanRevision) {
    throw staleMutation("access plan");
  }
  await requireActiveCustomer(binding, input.customerUserId);
  const items = await readStoredPlanItems(binding, input.accessPlanId);
  if (items.length === 0 || items.length !== aggregate.item_count) {
    throw accessIntegrity("An access plan must contain a complete item set.");
  }
  await requireAvailableResources(binding, items);

  const grantSetId = `access_grant_set_${crypto.randomUUID()}`;
  const result: AccessGrantMutationReceipt = Object.freeze({
    grantSetId,
    accessPlanId: input.accessPlanId,
    accessPlanRevision: expectedPlanRevision,
    customerUserId: input.customerUserId,
    state: "active",
    revision: 1,
    grantCount: items.length,
    entitlementCount: items.length,
  });
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO access_grant_sets
          (id, access_plan_id, access_plan_revision, grantee_user_id, state,
           starts_at, expires_at, reason, granted_by_user_id, revision,
           last_operation_key)
         SELECT ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM access_plans
           WHERE id = ? AND revision = ? AND state = 'active'
             AND (SELECT COUNT(*) FROM access_plan_items
                  WHERE access_plan_id = access_plans.id) = ?
             AND NOT EXISTS (
               SELECT 1 FROM access_plan_items
               WHERE access_plan_id = access_plans.id
                 AND remaining_uses IS NOT NULL
             )
         )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        grantSetId,
        input.accessPlanId,
        expectedPlanRevision,
        input.customerUserId,
        input.startsAt,
        input.expiresAt,
        input.reason,
        context.actorUserId,
        mutation.namespacedKey,
        input.accessPlanId,
        expectedPlanRevision,
        items.length,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  ];

  items.forEach((item) => {
    const grantId = `access_grant_${crypto.randomUUID()}`;
    statements.push(
      grantInsert(binding, {
        grantId,
        grantSetId,
        accessPlanId: input.accessPlanId,
        accessPlanRevision: expectedPlanRevision,
        customerUserId: input.customerUserId,
        item,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        reason: input.reason,
        actorUserId: context.actorUserId,
        marker: mutation.namespacedKey,
        ownerAuthority,
        customerAuthority,
      }),
      entitlementInsert(binding, {
        entitlementId: `entitlement_grant_${crypto.randomUUID()}`,
        grantId,
        grantSetId,
        customerUserId: input.customerUserId,
        item,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        marker: mutation.namespacedKey,
        ownerAuthority,
        customerAuthority,
      }),
    );
  });

  const activationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE access_grant_sets
         SET state = 'active', activated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND access_plan_id = ? AND access_plan_revision = ?
           AND grantee_user_id = ? AND state = 'pending' AND revision = 1
           AND last_operation_key = ?
           AND (SELECT COUNT(*) FROM access_grants
                WHERE grant_set_id = access_grant_sets.id
                  AND access_plan_id = access_grant_sets.access_plan_id
                  AND grantee_user_id = access_grant_sets.grantee_user_id
                  AND state = 'active' AND remaining_uses IS NULL
                  AND last_operation_key = ?) = ?
           AND (SELECT COUNT(*)
                FROM entitlements
                JOIN access_grants
                  ON access_grants.id = entitlements.grant_id
                 AND entitlements.source_type = 'grant'
                 AND entitlements.source_id = access_grants.id
                WHERE access_grants.grant_set_id = access_grant_sets.id
                  AND entitlements.user_id = access_grant_sets.grantee_user_id
                  AND entitlements.state = 'active'
                  AND entitlements.remaining_uses IS NULL
                  AND entitlements.last_operation_key = ?) = ?
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        grantSetId,
        input.accessPlanId,
        expectedPlanRevision,
        input.customerUserId,
        mutation.namespacedKey,
        mutation.namespacedKey,
        items.length,
        mutation.namespacedKey,
        items.length,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exact = exactIssuedGrantCondition({
    grantSetId,
    accessPlanId: input.accessPlanId,
    accessPlanRevision: expectedPlanRevision,
    customerUserId: input.customerUserId,
    marker: mutation.namespacedKey,
    itemCount: items.length,
    ownerAuthority,
    customerAuthority,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "access-grant-set",
        subjectId: grantSetId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          accessPlanId: input.accessPlanId,
          accessPlanRevision: expectedPlanRevision,
          customerUserId: input.customerUserId,
          grantCount: items.length,
        },
        result: { ...result },
      },
      exact.sql,
      exact.bindings,
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[activationIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("access issuance");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "access issuance");
  }
}

function exactTerminalGrantCondition(input: {
  readonly grantSetId: string;
  readonly expectedRevision: number;
  readonly state: TerminalGrantSetState;
  readonly marker: string;
  readonly grantCount: number;
  readonly entitlementCount: number;
  readonly authority: SqlAuthorityCondition;
}): { readonly sql: string; readonly bindings: readonly (number | string)[] } {
  const timestampColumn =
    input.state === "revoked" ? "revoked_at" : "expired_at";
  return {
    sql: `EXISTS (
      SELECT 1 FROM access_grant_sets
      WHERE id = ? AND state = ? AND revision = ?
        AND ${timestampColumn} IS NOT NULL AND last_operation_key = ?
    ) AND (
      SELECT COUNT(*) FROM access_grants WHERE grant_set_id = ?
    ) = ? AND (
      SELECT COUNT(*) FROM access_grants
      WHERE grant_set_id = ? AND state = ?
        AND ${timestampColumn} IS NOT NULL AND last_operation_key = ?
    ) = ? AND (
      SELECT COUNT(*)
      FROM entitlements
      JOIN access_grants ON access_grants.id = entitlements.grant_id
       AND entitlements.source_type = 'grant'
       AND entitlements.source_id = access_grants.id
      WHERE access_grants.grant_set_id = ?
    ) = ? AND (
      SELECT COUNT(*)
      FROM entitlements
      JOIN access_grants ON access_grants.id = entitlements.grant_id
       AND entitlements.source_type = 'grant'
       AND entitlements.source_id = access_grants.id
      WHERE access_grants.grant_set_id = ?
        AND entitlements.state = ? AND entitlements.last_operation_key = ?
    ) = ? AND ${input.authority.sql}`,
    bindings: [
      input.grantSetId,
      input.state,
      input.expectedRevision + 1,
      input.marker,
      input.grantSetId,
      input.grantCount,
      input.grantSetId,
      input.state,
      input.marker,
      input.grantCount,
      input.grantSetId,
      input.entitlementCount,
      input.grantSetId,
      input.state,
      input.marker,
      input.entitlementCount,
      ...input.authority.bindings,
    ],
  };
}

async function transitionAccessGrantSet(
  binding: D1Database,
  rawGrantSetId: string,
  rawExpectedRevision: number,
  state: TerminalGrantSetState,
  context: MutationContext,
): Promise<MutationResult<AccessGrantMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const grantSetId = safeId(rawGrantSetId, "grantSetId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const operation = `access.grant-set.${state === "revoked" ? "revoke" : "expire"}`;
  const mutation = await prepareMutation<AccessGrantMutationReceipt>(
    binding,
    operation,
    context,
    { grantSetId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readGrantSet(binding, grantSetId);
  if (!aggregate) throw grantSetNotFound();
  if (aggregate.state !== "active") throw grantSetNotActive();
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("access grant");
  }
  if (
    aggregate.grant_count < 1 ||
    aggregate.grant_count !== aggregate.active_grant_count ||
    aggregate.entitlement_count !== aggregate.grant_count ||
    aggregate.entitlement_count !== aggregate.active_entitlement_count
  ) {
    throw accessIntegrity(
      "An active grant set does not have matching active grants and entitlements.",
    );
  }

  const result: AccessGrantMutationReceipt = Object.freeze({
    grantSetId,
    accessPlanId: aggregate.access_plan_id,
    accessPlanRevision: aggregate.access_plan_revision,
    customerUserId: aggregate.grantee_user_id,
    state,
    revision: expectedRevision + 1,
    grantCount: aggregate.grant_count,
    entitlementCount: aggregate.entitlement_count,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const principalColumn =
    state === "revoked" ? "revoked_by_user_id" : "expired_by_user_id";
  const timestampColumn = state === "revoked" ? "revoked_at" : "expired_at";
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE access_grant_sets
         SET state = ?, ${timestampColumn} = CURRENT_TIMESTAMP,
             ${principalColumn} = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = 'active' AND revision = ?
           AND ${authority.sql}`,
      )
      .bind(
        state,
        context.actorUserId,
        mutation.namespacedKey,
        grantSetId,
        expectedRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE access_grants
         SET state = ?, ${timestampColumn} = CURRENT_TIMESTAMP,
             ${principalColumn} = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE grant_set_id = ? AND state = 'active'
           AND EXISTS (
             SELECT 1 FROM access_grant_sets
             WHERE id = ? AND state = ? AND revision = ?
               AND last_operation_key = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        state,
        context.actorUserId,
        mutation.namespacedKey,
        grantSetId,
        grantSetId,
        state,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE entitlements
         SET state = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE state = 'active'
           AND grant_id IN (
             SELECT id FROM access_grants
             WHERE grant_set_id = ? AND state = ?
               AND last_operation_key = ?
           )
           AND EXISTS (
             SELECT 1 FROM access_grant_sets
             WHERE id = ? AND state = ? AND revision = ?
               AND last_operation_key = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        state,
        mutation.namespacedKey,
        grantSetId,
        state,
        mutation.namespacedKey,
        grantSetId,
        state,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  ];
  const exact = exactTerminalGrantCondition({
    grantSetId,
    expectedRevision,
    state,
    marker: mutation.namespacedKey,
    grantCount: aggregate.grant_count,
    entitlementCount: aggregate.entitlement_count,
    authority,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "access-grant-set",
        subjectId: grantSetId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { previousRevision: expectedRevision },
        result: { ...result },
      },
      exact.sql,
      exact.bindings,
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== aggregate.grant_count ||
      changedRows(results[2]) !== aggregate.entitlement_count ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("access grant");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "access grant");
  }
}

export async function revokeAccessGrantSet(
  binding: D1Database,
  grantSetId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<AccessGrantMutationReceipt>> {
  return transitionAccessGrantSet(
    binding,
    grantSetId,
    expectedRevision,
    "revoked",
    context,
  );
}

export async function expireAccessGrantSet(
  binding: D1Database,
  grantSetId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<AccessGrantMutationReceipt>> {
  return transitionAccessGrantSet(
    binding,
    grantSetId,
    expectedRevision,
    "expired",
    context,
  );
}
