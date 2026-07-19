import type {
  AccessAction,
  AccessIdentity,
  ExplicitAccessGrant,
  ServerAccessFacts,
} from "@/lib/access/decide-access.ts";

export const ACCESS_RESOURCE_TYPES = Object.freeze([
  "track",
  "release",
  "collection",
  "course",
  "lesson",
  "license-document",
] as const);

export type AccessResourceType = (typeof ACCESS_RESOURCE_TYPES)[number];
export type ProtectedAccessAction = Extract<
  AccessAction,
  "view" | "stream" | "download"
>;
export type EntitlementSourceType =
  "grant" | "order" | "membership" | "subscription" | "license" | "credit";

export interface AccessFactReadRequest {
  readonly identity: AccessIdentity | null;
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
  readonly action: ProtectedAccessAction;
  readonly now: string;
}

export interface AccessSourceExplanation {
  readonly sourceType: EntitlementSourceType;
  readonly explanation: string;
  readonly state: ExplicitAccessGrant["state"];
  readonly entitlementId: string | null;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly remainingUses: number | null;
}

export interface AccessFactProjection {
  readonly facts: Pick<ServerAccessFacts, "grants">;
  readonly sources: readonly AccessSourceExplanation[];
}

export class AccessReadIntegrityError extends Error {
  override readonly name = "AccessReadIntegrityError";
}

interface GrantRow {
  grant_id: unknown;
  grant_set_id: unknown;
  access_plan_id: unknown;
  access_plan_item_id: unknown;
  actions_json: unknown;
  state: unknown;
  starts_at: unknown;
  expires_at: unknown;
  remaining_uses: unknown;
  download_disposition: unknown;
  joined_grant_set_id: unknown;
  grant_set_access_plan_revision: unknown;
  grant_set_state: unknown;
  grant_set_starts_at: unknown;
  grant_set_expires_at: unknown;
  joined_access_plan_item_id: unknown;
  plan_item_actions_json: unknown;
  plan_item_remaining_uses: unknown;
  plan_item_download_disposition: unknown;
  entitlement_id: unknown;
  entitlement_actions_json: unknown;
  entitlement_state: unknown;
  entitlement_starts_at: unknown;
  entitlement_expires_at: unknown;
  entitlement_remaining_uses: unknown;
  entitlement_download_disposition: unknown;
}

interface EntitlementRow {
  entitlement_id: unknown;
  source_type: unknown;
  actions_json: unknown;
  state: unknown;
  starts_at: unknown;
  expires_at: unknown;
  remaining_uses: unknown;
  download_disposition: unknown;
}

interface ProjectionCandidate {
  readonly grant: ExplicitAccessGrant;
  readonly source: AccessSourceExplanation;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const RESOURCE_TYPE_SET = new Set<string>(ACCESS_RESOURCE_TYPES);
const PROTECTED_ACTIONS = new Set<ProtectedAccessAction>([
  "view",
  "stream",
  "download",
]);
const ENTITLEMENT_SOURCE_EXPLANATIONS: Readonly<
  Record<EntitlementSourceType, string>
> = Object.freeze({
  grant: "Artist access grant",
  order: "Test order entitlement",
  membership: "Membership entitlement",
  subscription: "Subscription entitlement",
  license: "License entitlement",
  credit: "Credit entitlement",
});

const EMPTY_PROJECTION: AccessFactProjection = Object.freeze({
  facts: Object.freeze({ grants: Object.freeze([]) }),
  sources: Object.freeze([]),
});

function integrity(message: string): never {
  throw new AccessReadIntegrityError(message);
}

function inputError(message: string): never {
  throw new TypeError(message);
}

function readId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function readNullableId(value: unknown, label: string): string | null {
  return value === null ? null : readId(value, label);
}

function readTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function readNullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : readTimestamp(value, label);
}

function readRemainingUses(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function readPositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function readDisposition(
  value: unknown,
  label: string,
): "inline" | "attachment" | null {
  if (value === null) return null;
  if (value !== "inline" && value !== "attachment") {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function readActions(
  value: unknown,
  label: string,
): readonly ProtectedAccessAction[] {
  if (typeof value !== "string") {
    integrity(`D1 returned invalid ${label}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity(`D1 returned invalid ${label} JSON.`);
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length > PROTECTED_ACTIONS.size ||
    !parsed.every(
      (action) =>
        typeof action === "string" &&
        PROTECTED_ACTIONS.has(action as ProtectedAccessAction),
    )
  ) {
    integrity(`D1 returned invalid ${label}.`);
  }

  return Object.freeze([
    ...new Set(parsed as readonly ProtectedAccessAction[]),
  ]);
}

function readGrantState(value: unknown): "active" | "revoked" | "expired" {
  if (value !== "active" && value !== "revoked" && value !== "expired") {
    integrity("D1 returned an invalid access-grant state.");
  }
  return value;
}

function readGrantSetState(
  value: unknown,
): "pending" | "active" | "revoked" | "expired" {
  if (
    value !== "pending" &&
    value !== "active" &&
    value !== "revoked" &&
    value !== "expired"
  ) {
    integrity("D1 returned an invalid access-grant-set state.");
  }
  return value;
}

function readEntitlementState(value: unknown): ExplicitAccessGrant["state"] {
  if (
    value !== "active" &&
    value !== "revoked" &&
    value !== "expired" &&
    value !== "exhausted"
  ) {
    integrity("D1 returned an invalid entitlement state.");
  }
  return value;
}

function readSourceType(value: unknown): EntitlementSourceType {
  if (
    value !== "grant" &&
    value !== "order" &&
    value !== "membership" &&
    value !== "subscription" &&
    value !== "license" &&
    value !== "credit"
  ) {
    integrity("D1 returned an invalid entitlement source type.");
  }
  return value;
}

function laterTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function earlierTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function minimumRemainingUses(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function intersectActions(
  left: readonly ProtectedAccessAction[],
  right: readonly ProtectedAccessAction[],
): readonly ProtectedAccessAction[] {
  const rightSet = new Set(right);
  return Object.freeze(left.filter((action) => rightSet.has(action)));
}

function effectiveState(
  ...states: readonly ExplicitAccessGrant["state"][]
): ExplicitAccessGrant["state"] {
  if (states.includes("revoked")) return "revoked";
  if (states.includes("expired")) return "expired";
  if (states.includes("exhausted")) return "exhausted";
  return "active";
}

function effectiveDisposition(
  ...dispositions: readonly ("inline" | "attachment" | null)[]
): "inline" | "attachment" | null {
  const explicit = new Set(dispositions.filter((value) => value !== null));
  if (explicit.size > 1) {
    integrity("D1 returned conflicting grant download dispositions.");
  }
  return explicit.values().next().value ?? null;
}

function validateWindow(
  startsAt: string | null,
  expiresAt: string | null,
): void {
  if (
    startsAt !== null &&
    expiresAt !== null &&
    Date.parse(startsAt) >= Date.parse(expiresAt)
  ) {
    integrity("D1 returned an invalid access window.");
  }
}

function candidate(
  request: AccessFactReadRequest,
  input: {
    readonly actions: readonly ProtectedAccessAction[];
    readonly state: ExplicitAccessGrant["state"];
    readonly entitlementId: string | null;
    readonly sourceType: EntitlementSourceType;
    readonly startsAt: string | null;
    readonly expiresAt: string | null;
    readonly remainingUses: number | null;
    readonly downloadDisposition: "inline" | "attachment" | null;
  },
): ProjectionCandidate | null {
  if (!input.actions.includes(request.action)) return null;
  validateWindow(input.startsAt, input.expiresAt);

  const explanation = ENTITLEMENT_SOURCE_EXPLANATIONS[input.sourceType];
  const grant: ExplicitAccessGrant = Object.freeze({
    granteeUserId: request.identity!.userId,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    actions: Object.freeze([request.action]),
    state: input.state,
    ...(input.entitlementId === null
      ? {}
      : { entitlementId: input.entitlementId }),
    ...(input.startsAt === null ? {} : { startsAt: input.startsAt }),
    ...(input.expiresAt === null ? {} : { expiresAt: input.expiresAt }),
    ...(input.remainingUses === null
      ? {}
      : { remainingUses: input.remainingUses }),
    ...(input.downloadDisposition === null
      ? {}
      : { downloadDisposition: input.downloadDisposition }),
    accessSource: input.sourceType,
    sourceExplanation: explanation,
  });

  return {
    grant,
    source: Object.freeze({
      sourceType: input.sourceType,
      explanation,
      state: input.state,
      entitlementId: input.entitlementId,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      remainingUses: input.remainingUses,
    }),
  };
}

function projectGrantRow(
  request: AccessFactReadRequest,
  row: GrantRow,
): ProjectionCandidate | null {
  readId(row.grant_id, "access-grant ID");
  const grantSetId = readNullableId(row.grant_set_id, "grant-set ID");
  const accessPlanId = readNullableId(row.access_plan_id, "access-plan ID");
  const accessPlanItemId = readNullableId(
    row.access_plan_item_id,
    "access-plan item ID",
  );
  const isLegacyGrant =
    grantSetId === null && accessPlanId === null && accessPlanItemId === null;
  const isPlanLinkedGrant =
    grantSetId !== null && accessPlanId !== null && accessPlanItemId !== null;

  if (!isLegacyGrant && !isPlanLinkedGrant) {
    return null;
  }

  const grantActions = readActions(row.actions_json, "access-grant actions");
  const grantState = readGrantState(row.state);
  const grantStartsAt = readNullableTimestamp(
    row.starts_at,
    "access-grant start timestamp",
  );
  const grantExpiresAt = readNullableTimestamp(
    row.expires_at,
    "access-grant expiry timestamp",
  );
  const grantRemainingUses = readRemainingUses(
    row.remaining_uses,
    "access-grant remaining uses",
  );
  const grantDisposition = readDisposition(
    row.download_disposition,
    "access-grant download disposition",
  );
  const entitlementId = readNullableId(
    row.entitlement_id,
    "grant entitlement ID",
  );

  if (isLegacyGrant && entitlementId === null) {
    return candidate(request, {
      actions: grantActions,
      state: grantState,
      entitlementId: null,
      sourceType: "grant",
      startsAt: grantStartsAt,
      expiresAt: grantExpiresAt,
      remainingUses: grantRemainingUses,
      downloadDisposition: grantDisposition,
    });
  }

  if (isPlanLinkedGrant && entitlementId === null) return null;

  if (entitlementId === null) return null;

  const entitlementActions = readActions(
    row.entitlement_actions_json,
    "grant entitlement actions",
  );
  const entitlementState = readEntitlementState(row.entitlement_state);
  const entitlementStartsAt = readNullableTimestamp(
    row.entitlement_starts_at,
    "grant entitlement start timestamp",
  );
  const entitlementExpiresAt = readNullableTimestamp(
    row.entitlement_expires_at,
    "grant entitlement expiry timestamp",
  );
  const entitlementRemainingUses = readRemainingUses(
    row.entitlement_remaining_uses,
    "grant entitlement remaining uses",
  );
  const entitlementDisposition = readDisposition(
    row.entitlement_download_disposition,
    "grant entitlement download disposition",
  );

  if (isLegacyGrant) {
    return candidate(request, {
      actions: intersectActions(grantActions, entitlementActions),
      state: effectiveState(grantState, entitlementState),
      entitlementId,
      sourceType: "grant",
      startsAt: laterTimestamp(grantStartsAt, entitlementStartsAt),
      expiresAt: earlierTimestamp(grantExpiresAt, entitlementExpiresAt),
      remainingUses: minimumRemainingUses(
        grantRemainingUses,
        entitlementRemainingUses,
      ),
      downloadDisposition: effectiveDisposition(
        grantDisposition,
        entitlementDisposition,
      ),
    });
  }

  const joinedGrantSetId = readNullableId(
    row.joined_grant_set_id,
    "joined grant-set ID",
  );
  const joinedAccessPlanItemId = readNullableId(
    row.joined_access_plan_item_id,
    "joined access-plan item ID",
  );
  if (
    joinedGrantSetId !== grantSetId ||
    joinedAccessPlanItemId !== accessPlanItemId
  ) {
    return null;
  }

  readPositiveInteger(
    row.grant_set_access_plan_revision,
    "grant-set access-plan revision",
  );
  const grantSetState = readGrantSetState(row.grant_set_state);
  if (grantSetState === "pending") return null;

  const grantSetStartsAt = readNullableTimestamp(
    row.grant_set_starts_at,
    "grant-set start timestamp",
  );
  const grantSetExpiresAt = readNullableTimestamp(
    row.grant_set_expires_at,
    "grant-set expiry timestamp",
  );
  const planItemActions = readActions(
    row.plan_item_actions_json,
    "access-plan item actions",
  );
  const planItemRemainingUses = readRemainingUses(
    row.plan_item_remaining_uses,
    "access-plan item remaining uses",
  );
  const planItemDisposition = readDisposition(
    row.plan_item_download_disposition,
    "access-plan item download disposition",
  );

  return candidate(request, {
    actions: intersectActions(
      intersectActions(planItemActions, grantActions),
      entitlementActions,
    ),
    state: effectiveState(grantSetState, grantState, entitlementState),
    entitlementId,
    sourceType: "grant",
    startsAt: laterTimestamp(
      laterTimestamp(grantSetStartsAt, grantStartsAt),
      entitlementStartsAt,
    ),
    expiresAt: earlierTimestamp(
      earlierTimestamp(grantSetExpiresAt, grantExpiresAt),
      entitlementExpiresAt,
    ),
    remainingUses: minimumRemainingUses(
      minimumRemainingUses(planItemRemainingUses, grantRemainingUses),
      entitlementRemainingUses,
    ),
    downloadDisposition: effectiveDisposition(
      planItemDisposition,
      grantDisposition,
      entitlementDisposition,
    ),
  });
}

function projectEntitlementRow(
  request: AccessFactReadRequest,
  row: EntitlementRow,
): ProjectionCandidate | null {
  const entitlementId = readId(row.entitlement_id, "entitlement ID");
  const sourceType = readSourceType(row.source_type);
  if (sourceType === "grant") {
    integrity("D1 returned an unjoined grant entitlement.");
  }

  return candidate(request, {
    actions: readActions(row.actions_json, "entitlement actions"),
    state: readEntitlementState(row.state),
    entitlementId,
    sourceType,
    startsAt: readNullableTimestamp(
      row.starts_at,
      "entitlement start timestamp",
    ),
    expiresAt: readNullableTimestamp(
      row.expires_at,
      "entitlement expiry timestamp",
    ),
    remainingUses: readRemainingUses(
      row.remaining_uses,
      "entitlement remaining uses",
    ),
    downloadDisposition: readDisposition(
      row.download_disposition,
      "entitlement download disposition",
    ),
  });
}

function validateRequest(input: AccessFactReadRequest): void {
  if (!RESOURCE_TYPE_SET.has(input.resourceType)) {
    inputError("A supported access resource type is required.");
  }
  if (!SAFE_ID.test(input.resourceId)) {
    inputError("A safe access resource ID is required.");
  }
  if (!PROTECTED_ACTIONS.has(input.action)) {
    inputError("A protected read action is required.");
  }
  if (
    typeof input.now !== "string" ||
    input.now.trim() !== input.now ||
    !Number.isFinite(Date.parse(input.now))
  ) {
    inputError("A valid server decision time is required.");
  }
  if (input.identity === null) return;
  if (
    !SAFE_ID.test(input.identity.userId) ||
    !Array.isArray(input.identity.roles) ||
    !input.identity.roles.every(
      (role) => role === "owner" || role === "editor" || role === "customer",
    )
  ) {
    inputError("A valid server-resolved access identity is required.");
  }
}

/**
 * Projects current, exact-user D1 grants and entitlements into the pure access
 * decision contract. Revoked and time/use-inactive candidates remain present
 * so `decideAccess` can deny them immediately and explain the stable reason.
 */
export async function readAccessFacts(
  binding: D1Database,
  request: AccessFactReadRequest,
): Promise<AccessFactProjection> {
  validateRequest(request);
  if (request.identity === null) return EMPTY_PROJECTION;

  const [grantResult, entitlementResult] = await Promise.all([
    binding
      .prepare(
        `SELECT
           access_grants.id AS grant_id,
           access_grants.grant_set_id AS grant_set_id,
           access_grants.access_plan_id AS access_plan_id,
           access_grants.access_plan_item_id AS access_plan_item_id,
           access_grants.actions_json AS actions_json,
           access_grants.state AS state,
           access_grants.starts_at AS starts_at,
           access_grants.expires_at AS expires_at,
           access_grants.remaining_uses AS remaining_uses,
           access_grants.download_disposition AS download_disposition,
           access_grant_sets.id AS joined_grant_set_id,
           access_grant_sets.access_plan_revision AS grant_set_access_plan_revision,
           access_grant_sets.state AS grant_set_state,
           access_grant_sets.starts_at AS grant_set_starts_at,
           access_grant_sets.expires_at AS grant_set_expires_at,
           access_plan_items.id AS joined_access_plan_item_id,
           access_plan_items.actions_json AS plan_item_actions_json,
           access_plan_items.remaining_uses AS plan_item_remaining_uses,
           access_plan_items.download_disposition AS plan_item_download_disposition,
           entitlements.id AS entitlement_id,
           entitlements.actions_json AS entitlement_actions_json,
           entitlements.state AS entitlement_state,
           entitlements.starts_at AS entitlement_starts_at,
           entitlements.expires_at AS entitlement_expires_at,
           entitlements.remaining_uses AS entitlement_remaining_uses,
           entitlements.download_disposition AS entitlement_download_disposition
         FROM access_grants
         LEFT JOIN access_grant_sets
           ON access_grant_sets.id = access_grants.grant_set_id
          AND access_grant_sets.access_plan_id = access_grants.access_plan_id
          AND access_grant_sets.grantee_user_id = access_grants.grantee_user_id
         LEFT JOIN access_plan_items
           ON access_plan_items.id = access_grants.access_plan_item_id
          AND access_plan_items.access_plan_id = access_grants.access_plan_id
          AND access_plan_items.resource_type = access_grants.resource_type
          AND access_plan_items.resource_id = access_grants.resource_id
         LEFT JOIN entitlements
           ON entitlements.grant_id = access_grants.id
          AND entitlements.source_type = 'grant'
          AND entitlements.source_id = access_grants.id
          AND entitlements.user_id = access_grants.grantee_user_id
          AND entitlements.resource_type = access_grants.resource_type
          AND entitlements.resource_id = access_grants.resource_id
         WHERE access_grants.grantee_user_id = ?1
           AND access_grants.resource_type = ?2
           AND access_grants.resource_id = ?3
         ORDER BY access_grants.id ASC, entitlements.id ASC`,
      )
      .bind(request.identity.userId, request.resourceType, request.resourceId)
      .all<GrantRow>(),
    binding
      .prepare(
        `SELECT
           id AS entitlement_id,
           source_type AS source_type,
           actions_json AS actions_json,
           state AS state,
           starts_at AS starts_at,
           expires_at AS expires_at,
           remaining_uses AS remaining_uses,
           download_disposition AS download_disposition
         FROM entitlements
         WHERE user_id = ?1
           AND resource_type = ?2
           AND resource_id = ?3
           AND source_type <> 'grant'
         ORDER BY id ASC`,
      )
      .bind(request.identity.userId, request.resourceType, request.resourceId)
      .all<EntitlementRow>(),
  ]);

  const candidates = [
    ...grantResult.results.map((row) => projectGrantRow(request, row)),
    ...entitlementResult.results.map((row) =>
      projectEntitlementRow(request, row),
    ),
  ].filter((value): value is ProjectionCandidate => value !== null);

  return Object.freeze({
    facts: Object.freeze({
      grants: Object.freeze(candidates.map(({ grant }) => grant)),
    }),
    sources: Object.freeze(candidates.map(({ source }) => source)),
  });
}
