import { activeOwnerCondition } from "./authority-guards.ts";
import type {
  AccessDownloadDisposition,
  AccessGrantSetState,
  AccessPlanState,
  AdminAccessCustomerDTO,
  AdminAccessDeliveryDTO,
  AdminAccessGrantSetDTO,
  AdminAccessOverviewDTO,
  AdminAccessPlanDTO,
  AdminAccessPlanItemDTO,
  AdminAccessResourceOptionDTO,
} from "@/lib/access-management/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export class AccessAdminReadIntegrityError extends Error {
  override readonly name = "AccessAdminReadIntegrityError";
}

interface CountRow {
  count: unknown;
}

interface PlanRow {
  id: unknown;
  slug: unknown;
  name: unknown;
  description: unknown;
  state: unknown;
  revision: unknown;
  grant_set_count: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface PlanItemRow {
  id: unknown;
  access_plan_id: unknown;
  position: unknown;
  resource_type: unknown;
  resource_id: unknown;
  actions_json: unknown;
  remaining_uses: unknown;
  download_disposition: unknown;
}

interface ResourceRow {
  resource_type: unknown;
  resource_id: unknown;
  slug: unknown;
  title: unknown;
  view_mode: unknown;
  stream_mode: unknown;
  download_mode: unknown;
}

interface CustomerRow {
  user_id: unknown;
  email: unknown;
  display_name: unknown;
  active_grant_set_count: unknown;
  total_grant_set_count: unknown;
}

interface GrantSetRow {
  id: unknown;
  access_plan_id: unknown;
  access_plan_revision: unknown;
  access_plan_name: unknown;
  grantee_user_id: unknown;
  customer_display_name: unknown;
  state: unknown;
  starts_at: unknown;
  expires_at: unknown;
  reason: unknown;
  activated_at: unknown;
  revoked_at: unknown;
  expired_at: unknown;
  revision: unknown;
  entitlement_count: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface DeliveryRow {
  id: unknown;
  user_id: unknown;
  customer_display_name: unknown;
  resource_type: unknown;
  resource_id: unknown;
  resource_title: unknown;
  access_source: unknown;
  byte_length: unknown;
  delivered_at: unknown;
}

type CurrentResourceType = AdminAccessResourceOptionDTO["resourceType"];
type CurrentAction = AdminAccessResourceOptionDTO["allowedActions"][number];

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENT_RESOURCE_TYPES = new Set<CurrentResourceType>([
  "track",
  "release",
  "collection",
  "course",
]);
const ACTIONS = new Set<CurrentAction>(["view", "stream", "download"]);
const ACTION_ORDER: Readonly<Record<CurrentAction, number>> = Object.freeze({
  view: 0,
  stream: 1,
  download: 2,
});
const CATALOG_MODES = new Set([
  "public",
  "account",
  "protected",
  "unavailable",
]);
const PLAN_STATES = new Set<AccessPlanState>(["active", "archived"]);
const GRANT_SET_STATES = new Set<AccessGrantSetState>([
  "pending",
  "active",
  "revoked",
  "expired",
]);
const ACCESS_SOURCES = new Set<AdminAccessDeliveryDTO["accessSource"]>([
  "public",
  "account",
  "role",
  "ownership",
  "grant",
  "order",
  "membership",
  "subscription",
  "license",
  "credit",
]);
const UNAVAILABLE_RESOURCE_TITLE = "Unavailable resource";
const RECENT_DELIVERY_LIMIT = 50;

function integrity(message: string): never {
  throw new AccessAdminReadIntegrityError(message);
}

function requireSafeActorUserId(value: string): string {
  if (!SAFE_ID.test(value)) {
    throw new TypeError("A safe owner user ID is required.");
  }
  return value;
}

function text(
  value: unknown,
  label: string,
  options: { readonly allowEmpty?: boolean; readonly maximum?: number } = {},
): string {
  if (typeof value !== "string") integrity(`D1 returned an invalid ${label}.`);
  const result = value as string;
  if (
    result.trim() !== result ||
    (!options.allowEmpty && result.length === 0) ||
    (options.maximum !== undefined && result.length > options.maximum)
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return result;
}

function id(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SAFE_ID.test(result)) integrity(`D1 returned an unsafe ${label}.`);
  return result;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function slug(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SAFE_SLUG.test(result)) integrity(`D1 returned an unsafe ${label}.`);
  return result;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  const time = Date.parse(result);
  if (!Number.isFinite(time)) integrity(`D1 returned an invalid ${label}.`);
  return new Date(time).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function resourceType(value: unknown): CurrentResourceType {
  if (!CURRENT_RESOURCE_TYPES.has(value as CurrentResourceType)) {
    integrity("D1 returned an unsupported access-plan resource type.");
  }
  return value as CurrentResourceType;
}

function deliveryResourceType(
  value: unknown,
): AdminAccessDeliveryDTO["resourceType"] {
  if (value !== "track" && value !== "release" && value !== "collection") {
    integrity("D1 returned an unsupported delivery resource type.");
  }
  return value;
}

function planState(value: unknown): AccessPlanState {
  if (!PLAN_STATES.has(value as AccessPlanState)) {
    integrity("D1 returned an invalid access-plan state.");
  }
  return value as AccessPlanState;
}

function grantSetState(value: unknown): AccessGrantSetState {
  if (!GRANT_SET_STATES.has(value as AccessGrantSetState)) {
    integrity("D1 returned an invalid access-grant-set state.");
  }
  return value as AccessGrantSetState;
}

function disposition(value: unknown): AccessDownloadDisposition | null {
  if (value === null) return null;
  if (value !== "inline" && value !== "attachment") {
    integrity("D1 returned an invalid access-plan download disposition.");
  }
  return value;
}

function actions(
  value: unknown,
  currentResourceType: CurrentResourceType,
): readonly CurrentAction[] {
  if (typeof value !== "string") {
    integrity("D1 returned invalid access-plan actions.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid access-plan action JSON.");
  }
  const allowed =
    currentResourceType === "track" || currentResourceType === "course"
      ? ACTIONS
      : new Set<CurrentAction>(["view"]);
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > allowed.size ||
    !parsed.every(
      (candidate) =>
        typeof candidate === "string" &&
        allowed.has(candidate as CurrentAction),
    ) ||
    new Set(parsed).size !== parsed.length
  ) {
    integrity("D1 returned unsupported access-plan actions.");
  }
  return Object.freeze(
    [...(parsed as CurrentAction[])].sort(
      (left, right) => ACTION_ORDER[left] - ACTION_ORDER[right],
    ),
  );
}

function catalogMode(value: unknown, label: string): string {
  if (typeof value !== "string" || !CATALOG_MODES.has(value)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function accessSource(value: unknown): AdminAccessDeliveryDTO["accessSource"] {
  if (!ACCESS_SOURCES.has(value as AdminAccessDeliveryDTO["accessSource"])) {
    integrity("D1 returned an invalid delivery access source.");
  }
  return value as AdminAccessDeliveryDTO["accessSource"];
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
  if (row && integer(row.count, "owner authority count") === 1) return;
  throw new RuntimeError(
    "ACCESS_OWNER_REQUIRED",
    "Access administration requires a live owner authority record.",
    {
      status: 403,
      publicMessage: "Owner access is required for this operation.",
    },
  );
}

async function readPlanRows(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly PlanRow[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `SELECT access_plans.id, access_plans.slug, access_plans.name,
              access_plans.description, access_plans.state,
              access_plans.revision,
              (SELECT COUNT(*) FROM access_grant_sets
               WHERE access_plan_id = access_plans.id) AS grant_set_count,
              access_plans.created_at, access_plans.updated_at
       FROM access_plans
       WHERE ${authority.sql}
       ORDER BY CASE access_plans.state WHEN 'active' THEN 0 ELSE 1 END,
                lower(access_plans.name), access_plans.id`,
    )
    .bind(...authority.bindings)
    .all<PlanRow>();
  return result.results;
}

async function readPlanItemRows(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly PlanItemRow[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `SELECT access_plan_items.id, access_plan_items.access_plan_id,
              access_plan_items.position, access_plan_items.resource_type,
              access_plan_items.resource_id, access_plan_items.actions_json,
              access_plan_items.remaining_uses,
              access_plan_items.download_disposition
       FROM access_plan_items
       WHERE ${authority.sql}
       ORDER BY access_plan_items.access_plan_id,
                access_plan_items.position, access_plan_items.id`,
    )
    .bind(...authority.bindings)
    .all<PlanItemRow>();
  return result.results;
}

async function readResourceRows(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly ResourceRow[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `WITH current_resources AS (
         SELECT 'track' AS resource_type, tracks.id AS resource_id,
                tracks.slug AS slug, current_track.title AS title,
                current_track.view_mode AS view_mode,
                current_track.stream_mode AS stream_mode,
                current_track.download_mode AS download_mode
         FROM tracks
         LEFT JOIN track_revisions AS current_track
           ON current_track.id = tracks.published_revision_id
          AND current_track.track_id = tracks.id
         WHERE tracks.publication_state = 'published'
         UNION ALL
         SELECT 'release', releases.id, releases.slug,
                current_release.title, current_release.view_mode, NULL, NULL
         FROM releases
         LEFT JOIN release_revisions AS current_release
           ON current_release.id = releases.published_revision_id
          AND current_release.release_id = releases.id
         WHERE releases.publication_state = 'published'
         UNION ALL
         SELECT 'collection', collections.id, collections.slug,
                current_collection.title, current_collection.view_mode,
                NULL, NULL
         FROM collections
         LEFT JOIN collection_revisions AS current_collection
           ON current_collection.id = collections.published_revision_id
          AND current_collection.collection_id = collections.id
         WHERE collections.publication_state = 'published'
         UNION ALL
         SELECT 'course', courses.id, courses.slug,
                current_course.title, current_course.access_mode,
                CASE
                  WHEN EXISTS (
                    SELECT 1 FROM lessons AS course_lesson
                    JOIN lesson_items AS course_item
                      ON course_item.lesson_id = course_lesson.id
                    WHERE course_lesson.course_revision_id = current_course.id
                      AND course_lesson.access_mode IN ('inherit', 'protected')
                      AND course_item.item_type IN ('audio', 'video')
                  ) THEN 'protected' ELSE 'unavailable'
                END,
                CASE
                  WHEN EXISTS (
                    SELECT 1 FROM lessons AS course_lesson
                    JOIN lesson_items AS course_item
                      ON course_item.lesson_id = course_lesson.id
                    WHERE course_lesson.course_revision_id = current_course.id
                      AND course_lesson.access_mode IN ('inherit', 'protected')
                      AND course_item.item_type = 'download'
                  ) THEN 'protected' ELSE 'unavailable'
                END
         FROM courses
         LEFT JOIN course_revisions AS current_course
           ON current_course.id = courses.draft_revision_id
          AND current_course.course_id = courses.id
         WHERE courses.publication_state != 'archived'
       )
       SELECT resource_type, resource_id, slug, title, view_mode,
              stream_mode, download_mode
       FROM current_resources
       WHERE ${authority.sql}
       ORDER BY resource_type, lower(title), resource_id`,
    )
    .bind(...authority.bindings)
    .all<ResourceRow>();
  return result.results;
}

async function readCustomerRows(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly CustomerRow[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `SELECT users.id AS user_id, users.email,
              profiles.display_name AS display_name,
              (SELECT COUNT(*) FROM access_grant_sets
               WHERE grantee_user_id = users.id
                 AND state = 'active') AS active_grant_set_count,
              (SELECT COUNT(*) FROM access_grant_sets
               WHERE grantee_user_id = users.id) AS total_grant_set_count
       FROM users
       LEFT JOIN profiles ON profiles.user_id = users.id
       JOIN role_assignments AS customer_role
         ON customer_role.user_id = users.id
        AND customer_role.role_key = 'customer'
        AND customer_role.revoked_at IS NULL
       WHERE users.status = 'active'
         AND ${authority.sql}
       ORDER BY lower(profiles.display_name), users.id`,
    )
    .bind(...authority.bindings)
    .all<CustomerRow>();
  return result.results;
}

async function readGrantSetRows(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly GrantSetRow[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `SELECT access_grant_sets.id,
              access_grant_sets.access_plan_id,
              access_grant_sets.access_plan_revision,
              access_plans.name AS access_plan_name,
              access_grant_sets.grantee_user_id,
              profiles.display_name AS customer_display_name,
              access_grant_sets.state, access_grant_sets.starts_at,
              access_grant_sets.expires_at, access_grant_sets.reason,
              access_grant_sets.activated_at,
              access_grant_sets.revoked_at,
              access_grant_sets.expired_at,
              access_grant_sets.revision,
              (SELECT COUNT(*)
               FROM entitlements
               JOIN access_grants
                 ON access_grants.id = entitlements.grant_id
                AND entitlements.source_type = 'grant'
                AND entitlements.source_id = access_grants.id
               WHERE access_grants.grant_set_id = access_grant_sets.id
                 AND access_grants.access_plan_id =
                     access_grant_sets.access_plan_id
                 AND access_grants.grantee_user_id =
                     access_grant_sets.grantee_user_id
                 AND entitlements.user_id =
                     access_grant_sets.grantee_user_id
              ) AS entitlement_count,
              access_grant_sets.created_at,
              access_grant_sets.updated_at
       FROM access_grant_sets
       JOIN access_plans
         ON access_plans.id = access_grant_sets.access_plan_id
       LEFT JOIN profiles
         ON profiles.user_id = access_grant_sets.grantee_user_id
       WHERE ${authority.sql}
       ORDER BY access_grant_sets.created_at DESC,
                access_grant_sets.id`,
    )
    .bind(...authority.bindings)
    .all<GrantSetRow>();
  return result.results;
}

async function readDeliveryRows(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly DeliveryRow[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `SELECT download_events.id, download_events.user_id,
              profiles.display_name AS customer_display_name,
              download_events.resource_type, download_events.resource_id,
              CASE download_events.resource_type
                WHEN 'track' THEN current_track.title
                WHEN 'release' THEN current_release.title
                WHEN 'collection' THEN current_collection.title
                ELSE NULL
              END AS resource_title,
              download_events.access_source, download_events.byte_length,
              download_events.delivered_at
       FROM download_events
       LEFT JOIN profiles ON profiles.user_id = download_events.user_id
       LEFT JOIN tracks
         ON download_events.resource_type = 'track'
        AND tracks.id = download_events.resource_id
        AND tracks.publication_state = 'published'
       LEFT JOIN track_revisions AS current_track
         ON current_track.id = tracks.published_revision_id
        AND current_track.track_id = tracks.id
       LEFT JOIN releases
         ON download_events.resource_type = 'release'
        AND releases.id = download_events.resource_id
        AND releases.publication_state = 'published'
       LEFT JOIN release_revisions AS current_release
         ON current_release.id = releases.published_revision_id
        AND current_release.release_id = releases.id
       LEFT JOIN collections
         ON download_events.resource_type = 'collection'
        AND collections.id = download_events.resource_id
        AND collections.publication_state = 'published'
       LEFT JOIN collection_revisions AS current_collection
         ON current_collection.id = collections.published_revision_id
        AND current_collection.collection_id = collections.id
       WHERE ${authority.sql}
       ORDER BY download_events.delivered_at DESC, download_events.id
       LIMIT ${RECENT_DELIVERY_LIMIT}`,
    )
    .bind(...authority.bindings)
    .all<DeliveryRow>();
  return result.results;
}

function projectResources(
  rows: readonly ResourceRow[],
): readonly AdminAccessResourceOptionDTO[] {
  return Object.freeze(
    rows.map((row) => {
      const currentResourceType = resourceType(row.resource_type);
      const resourceId = id(row.resource_id, "access resource ID");
      const resourceSlug = slug(row.slug, "access resource slug");
      const title = text(row.title, "access resource title", { maximum: 300 });
      const viewMode = catalogMode(row.view_mode, "resource view mode");
      const allowedActions: CurrentAction[] = [];
      if (viewMode !== "unavailable") allowedActions.push("view");
      if (currentResourceType === "track" || currentResourceType === "course") {
        if (
          catalogMode(row.stream_mode, "resource stream mode") !== "unavailable"
        ) {
          allowedActions.push("stream");
        }
        if (
          catalogMode(row.download_mode, "resource download mode") !==
          "unavailable"
        ) {
          allowedActions.push("download");
        }
      } else if (row.stream_mode !== null || row.download_mode !== null) {
        integrity("D1 returned media access modes for a parent resource.");
      }
      const plural = `${currentResourceType}s`;
      return Object.freeze({
        resourceType: currentResourceType,
        resourceId,
        title,
        href:
          currentResourceType === "course"
            ? `/admin/courses/${resourceSlug}`
            : `/admin/music/${plural}/${resourceSlug}`,
        allowedActions: Object.freeze(allowedActions),
      });
    }),
  );
}

function resourceKey(
  currentResourceType: CurrentResourceType,
  resourceId: string,
): string {
  return `${currentResourceType}:${resourceId}`;
}

function projectPlans(
  planRows: readonly PlanRow[],
  itemRows: readonly PlanItemRow[],
  resources: readonly AdminAccessResourceOptionDTO[],
): readonly AdminAccessPlanDTO[] {
  const resourceMap = new Map(
    resources.map((resource) => [
      resourceKey(resource.resourceType, resource.resourceId),
      resource,
    ]),
  );
  const itemsByPlan = new Map<string, AdminAccessPlanItemDTO[]>();
  for (const row of itemRows) {
    const accessPlanId = id(row.access_plan_id, "access-plan owner ID");
    const currentResourceType = resourceType(row.resource_type);
    const resourceId = id(row.resource_id, "access-plan resource ID");
    const parsedActions = actions(row.actions_json, currentResourceType);
    if (row.remaining_uses !== null) {
      integrity("D1 returned an access-plan use limit before credit support.");
    }
    const downloadDisposition = disposition(row.download_disposition);
    if (downloadDisposition !== null && !parsedActions.includes("download")) {
      integrity("D1 returned a download disposition without download access.");
    }
    const currentResource = resourceMap.get(
      resourceKey(currentResourceType, resourceId),
    );
    const projected: AdminAccessPlanItemDTO = Object.freeze({
      id: id(row.id, "access-plan item ID"),
      position: integer(row.position, "access-plan item position", 1),
      resourceType: currentResourceType,
      resourceId,
      actions: parsedActions,
      remainingUses: null,
      downloadDisposition,
      title: currentResource?.title ?? UNAVAILABLE_RESOURCE_TITLE,
      href: currentResource?.href ?? null,
    });
    const current = itemsByPlan.get(accessPlanId) ?? [];
    current.push(projected);
    itemsByPlan.set(accessPlanId, current);
  }

  const knownPlans = new Set(
    planRows.map((row) => id(row.id, "access-plan ID")),
  );
  for (const accessPlanId of itemsByPlan.keys()) {
    if (!knownPlans.has(accessPlanId)) {
      integrity("D1 returned an access-plan item without its plan.");
    }
  }

  return Object.freeze(
    planRows.map((row) => {
      const accessPlanId = id(row.id, "access-plan ID");
      const planItems = itemsByPlan.get(accessPlanId) ?? [];
      if (planItems.length === 0) {
        integrity("D1 returned an access plan without any items.");
      }
      planItems.forEach((item, index) => {
        if (item.position !== index + 1) {
          integrity("D1 returned a non-contiguous access-plan sequence.");
        }
      });
      const state = planState(row.state);
      const grantSetCount = integer(
        row.grant_set_count,
        "access-plan grant-set count",
      );
      return Object.freeze({
        id: accessPlanId,
        slug: slug(row.slug, "access-plan slug"),
        name: text(row.name, "access-plan name", { maximum: 120 }),
        description: text(row.description, "access-plan description", {
          allowEmpty: true,
          maximum: 2_000,
        }),
        state,
        revision: integer(row.revision, "access-plan revision", 1),
        definitionLocked: state === "archived" || grantSetCount > 0,
        grantSetCount,
        items: Object.freeze(planItems),
        createdAt: timestamp(row.created_at, "access-plan creation timestamp"),
        updatedAt: timestamp(row.updated_at, "access-plan update timestamp"),
      });
    }),
  );
}

function projectCustomers(
  rows: readonly CustomerRow[],
): readonly AdminAccessCustomerDTO[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        userId: id(row.user_id, "customer user ID"),
        email: text(row.email, "customer email", { maximum: 254 }),
        displayName: text(row.display_name, "customer display name", {
          maximum: 120,
        }),
        activeGrantSetCount: integer(
          row.active_grant_set_count,
          "active customer grant-set count",
        ),
        totalGrantSetCount: integer(
          row.total_grant_set_count,
          "customer grant-set count",
        ),
      }),
    ),
  );
}

function projectGrantSets(
  rows: readonly GrantSetRow[],
): readonly AdminAccessGrantSetDTO[] {
  return Object.freeze(
    rows.map((row) => {
      const startsAt = nullableTimestamp(
        row.starts_at,
        "grant-set start timestamp",
      );
      const expiresAt = nullableTimestamp(
        row.expires_at,
        "grant-set expiry timestamp",
      );
      if (
        startsAt !== null &&
        expiresAt !== null &&
        Date.parse(startsAt) >= Date.parse(expiresAt)
      ) {
        integrity("D1 returned an invalid access-grant window.");
      }
      const state = grantSetState(row.state);
      const activatedAt = nullableTimestamp(
        row.activated_at,
        "grant-set activation timestamp",
      );
      const revokedAt = nullableTimestamp(
        row.revoked_at,
        "grant-set revocation timestamp",
      );
      const expiredAt = nullableTimestamp(
        row.expired_at,
        "grant-set expiration timestamp",
      );
      const terminalStateValid =
        (state === "pending" &&
          activatedAt === null &&
          revokedAt === null &&
          expiredAt === null) ||
        (state === "active" &&
          activatedAt !== null &&
          revokedAt === null &&
          expiredAt === null) ||
        (state === "revoked" &&
          activatedAt !== null &&
          revokedAt !== null &&
          expiredAt === null) ||
        (state === "expired" &&
          activatedAt !== null &&
          revokedAt === null &&
          expiredAt !== null);
      if (!terminalStateValid) {
        integrity("D1 returned inconsistent access-grant-set state.");
      }
      return Object.freeze({
        id: id(row.id, "access-grant-set ID"),
        accessPlanId: id(row.access_plan_id, "grant-set plan ID"),
        accessPlanRevision: integer(
          row.access_plan_revision,
          "grant-set plan revision",
          1,
        ),
        accessPlanName: text(row.access_plan_name, "grant-set plan name", {
          maximum: 120,
        }),
        customerUserId: id(row.grantee_user_id, "grant-set customer ID"),
        customerDisplayName: text(
          row.customer_display_name,
          "grant-set customer name",
          { maximum: 120 },
        ),
        state,
        startsAt,
        expiresAt,
        reason: text(row.reason, "grant-set reason", {
          allowEmpty: true,
          maximum: 1_000,
        }),
        activatedAt,
        revokedAt,
        expiredAt,
        revision: integer(row.revision, "grant-set revision", 1),
        entitlementCount: integer(
          row.entitlement_count,
          "grant-set entitlement count",
        ),
        createdAt: timestamp(row.created_at, "grant-set creation timestamp"),
        updatedAt: timestamp(row.updated_at, "grant-set update timestamp"),
      });
    }),
  );
}

function projectDeliveries(
  rows: readonly DeliveryRow[],
): readonly AdminAccessDeliveryDTO[] {
  return Object.freeze(
    rows.map((row) => {
      const customerUserId = nullableId(row.user_id, "delivery customer ID");
      const customerDisplayName =
        row.customer_display_name === null
          ? null
          : text(row.customer_display_name, "delivery customer name", {
              maximum: 120,
            });
      if (customerUserId === null && customerDisplayName !== null) {
        integrity("D1 returned a named anonymous delivery.");
      }
      return Object.freeze({
        id: id(row.id, "delivery ID"),
        customerUserId,
        customerDisplayName,
        resourceType: deliveryResourceType(row.resource_type),
        resourceId: id(row.resource_id, "delivery resource ID"),
        resourceTitle:
          row.resource_title === null
            ? UNAVAILABLE_RESOURCE_TITLE
            : text(row.resource_title, "delivery resource title", {
                maximum: 300,
              }),
        accessSource: accessSource(row.access_source),
        byteLength: integer(row.byte_length, "delivery byte length"),
        deliveredAt: timestamp(row.delivered_at, "delivery timestamp"),
      });
    }),
  );
}

/**
 * Projects the complete owner access workspace from current D1 authority.
 * Every query repeats the live owner predicate. Returned delivery records omit
 * request IDs, derivative IDs, object keys, and raw audit material.
 */
export async function readAdminAccessOverview(
  binding: D1Database,
  rawActorUserId: string,
): Promise<AdminAccessOverviewDTO> {
  const actorUserId = requireSafeActorUserId(rawActorUserId);
  await requireActiveOwner(binding, actorUserId);
  const [
    planRows,
    itemRows,
    resourceRows,
    customerRows,
    grantSetRows,
    deliveryRows,
  ] = await Promise.all([
    readPlanRows(binding, actorUserId),
    readPlanItemRows(binding, actorUserId),
    readResourceRows(binding, actorUserId),
    readCustomerRows(binding, actorUserId),
    readGrantSetRows(binding, actorUserId),
    readDeliveryRows(binding, actorUserId),
  ]);
  await requireActiveOwner(binding, actorUserId);

  const resources = projectResources(resourceRows);
  return Object.freeze({
    plans: projectPlans(planRows, itemRows, resources),
    resources,
    customers: projectCustomers(customerRows),
    grantSets: projectGrantSets(grantSetRows),
    recentDeliveries: projectDeliveries(deliveryRows),
  });
}
