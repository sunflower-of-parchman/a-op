export const ACCESS_ACTIONS = Object.freeze([
  "view",
  "stream",
  "download",
  "edit",
  "manage",
] as const);

export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const ACCESS_ROLES = Object.freeze([
  "owner",
  "editor",
  "customer",
] as const);
export type AccessRole = (typeof ACCESS_ROLES)[number];

export const ACCESS_ALLOW_REASONS = Object.freeze([
  "public-resource",
  "authenticated-account",
  "owner-role",
  "editor-scope",
  "resource-ownership",
  "explicit-grant",
  "entitlement",
] as const);

export type AccessAllowReason = (typeof ACCESS_ALLOW_REASONS)[number];

export const ACCESS_DENIAL_REASONS = Object.freeze([
  "invalid-request",
  "invalid-authority-facts",
  "authentication-required",
  "grant-revoked",
  "grant-not-yet-active",
  "grant-expired",
  "grant-exhausted",
  "action-not-granted",
  "not-authorized",
] as const);

export type AccessDenialReason = (typeof ACCESS_DENIAL_REASONS)[number];

export type EntitlementAccessSource =
  "grant" | "order" | "membership" | "subscription" | "license" | "credit";
export type AccessSource =
  | "none"
  | "public"
  | "account"
  | "role"
  | "ownership"
  | EntitlementAccessSource;
export type DownloadDisposition = "inline" | "attachment";

/**
 * The access boundary needs only the application's opaque user identifier and
 * server-resolved roles. Email addresses, display names, provider claims, and
 * other identity details do not belong in an access request.
 */
export interface AccessIdentity {
  readonly userId: string;
  readonly roles: readonly AccessRole[];
}

/**
 * An explicit, server-owned grant. Grant actions are deliberately limited to
 * protected reads; owner/editor scope remains the authority for administration.
 */
export interface ExplicitAccessGrant {
  readonly granteeUserId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actions: readonly AccessAction[];
  readonly state: "active" | "revoked" | "expired" | "exhausted";
  readonly entitlementId?: string;
  readonly startsAt?: string;
  readonly expiresAt?: string;
  /** A server-reserved/use-safe snapshot; this pure decision does not consume it. */
  readonly remainingUses?: number;
  readonly downloadDisposition?: DownloadDisposition;
  /** The exact durable D1 source for this entitlement candidate. */
  readonly accessSource?: EntitlementAccessSource;
  /** A safe product explanation such as "Membership entitlement". */
  readonly sourceExplanation?: string;
}

/**
 * A route or repository builds these facts from server-owned product state.
 * Client claims, browser state, R2 object keys, signed URLs, and PII are not
 * inputs to this contract.
 */
export interface ServerAccessFacts {
  /** Intentionally public read actions for this resource. */
  readonly publicActions?: readonly AccessAction[];
  /** Read actions available to any authenticated application identity. */
  readonly accountActions?: readonly AccessAction[];
  /** Actions assigned to an editor for this specific resource. */
  readonly editorActions?: readonly AccessAction[];
  /** Stable application user identifier for a customer-owned resource. */
  readonly resourceOwnerUserId?: string;
  /** Actions the resource owner may perform on this specific resource. */
  readonly ownershipActions?: readonly AccessAction[];
  /** Candidate grants loaded from server-owned access state. */
  readonly grants?: readonly ExplicitAccessGrant[];
}

export interface AccessRequest {
  readonly identity: AccessIdentity | null;
  /** A stable application resource kind, never an R2 object key. */
  readonly resourceType: string;
  /** A stable application record identifier, never an R2 object key. */
  readonly resourceId: string;
  readonly action: AccessAction;
  /** The server-selected decision time as an ISO-compatible timestamp. */
  readonly now: string;
  readonly facts: ServerAccessFacts;
}

export interface AllowedAccessDecision {
  readonly allowed: true;
  readonly reason: AccessAllowReason;
  readonly source: Exclude<AccessSource, "none">;
  readonly entitlementId?: string;
  readonly expiresAt?: string;
  readonly remainingUses?: number;
  readonly downloadDisposition?: DownloadDisposition;
  readonly sourceExplanation?: string;
}

export interface DeniedAccessDecision {
  readonly allowed: false;
  readonly reason: AccessDenialReason;
  readonly source: "none";
}

export type AccessDecision = AllowedAccessDecision | DeniedAccessDecision;

const SAFE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const PUBLIC_ACTIONS = new Set<AccessAction>(["view", "stream", "download"]);
const GRANT_ACTIONS = PUBLIC_ACTIONS;
const ACCESS_ACTION_SET = new Set<AccessAction>(ACCESS_ACTIONS);
const ACCESS_ROLE_SET = new Set<AccessRole>(ACCESS_ROLES);

interface ValidatedGrant extends ExplicitAccessGrant {
  readonly startsAtTime: number | null;
  readonly expiresAtTime: number | null;
}

interface ValidatedRequest {
  readonly identity: AccessIdentity | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: AccessAction;
  readonly nowTime: number;
  readonly publicActions: readonly AccessAction[];
  readonly accountActions: readonly AccessAction[];
  readonly editorActions: readonly AccessAction[];
  readonly resourceOwnerUserId: string | null;
  readonly ownershipActions: readonly AccessAction[];
  readonly grants: readonly ValidatedGrant[];
}

function deny(reason: AccessDenialReason): DeniedAccessDecision {
  return { allowed: false, reason, source: "none" };
}

function allow(
  reason: AccessAllowReason,
  source: Exclude<AccessSource, "none">,
  details: Pick<
    AllowedAccessDecision,
    | "entitlementId"
    | "expiresAt"
    | "remainingUses"
    | "downloadDisposition"
    | "sourceExplanation"
  > = {},
): AllowedAccessDecision {
  return { allowed: true, reason, source, ...details };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value);
}

function isAccessAction(value: unknown): value is AccessAction {
  return (
    typeof value === "string" && ACCESS_ACTION_SET.has(value as AccessAction)
  );
}

function isAccessRole(value: unknown): value is AccessRole {
  return typeof value === "string" && ACCESS_ROLE_SET.has(value as AccessRole);
}

function readTimestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0
  ) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readActionList(
  value: unknown,
  allowedActions: ReadonlySet<AccessAction> = ACCESS_ACTION_SET,
): readonly AccessAction[] | null {
  if (!Array.isArray(value)) return null;

  const actions: AccessAction[] = [];

  for (const action of value) {
    if (!isAccessAction(action) || !allowedActions.has(action)) return null;
    if (!actions.includes(action)) actions.push(action);
  }

  return actions;
}

function readIdentity(value: unknown): AccessIdentity | null | undefined {
  if (value === null) return null;
  if (!isPlainRecord(value) || !isSafeIdentifier(value.userId))
    return undefined;
  if (!Array.isArray(value.roles) || !value.roles.every(isAccessRole)) {
    return undefined;
  }

  return {
    userId: value.userId,
    roles: [...new Set(value.roles)],
  };
}

function readGrant(value: unknown): ValidatedGrant | null {
  if (!isPlainRecord(value)) return null;

  if (
    !isSafeIdentifier(value.granteeUserId) ||
    !isSafeIdentifier(value.resourceType) ||
    !isSafeIdentifier(value.resourceId) ||
    (value.state !== "active" &&
      value.state !== "revoked" &&
      value.state !== "expired" &&
      value.state !== "exhausted")
  ) {
    return null;
  }

  const actions = readActionList(value.actions, GRANT_ACTIONS);
  if (!actions) return null;

  const startsAt = value.startsAt;
  const expiresAt = value.expiresAt;
  const remainingUses = value.remainingUses;
  const entitlementId = value.entitlementId;
  const downloadDisposition = value.downloadDisposition;
  const accessSource = value.accessSource;
  const sourceExplanation = value.sourceExplanation;
  const startsAtTime = startsAt === undefined ? null : readTimestamp(startsAt);
  const expiresAtTime =
    expiresAt === undefined ? null : readTimestamp(expiresAt);

  if (
    (startsAt !== undefined &&
      (typeof startsAt !== "string" || startsAtTime === null)) ||
    (expiresAt !== undefined &&
      (typeof expiresAt !== "string" || expiresAtTime === null)) ||
    (startsAtTime !== null &&
      expiresAtTime !== null &&
      startsAtTime >= expiresAtTime) ||
    (remainingUses !== undefined &&
      (typeof remainingUses !== "number" ||
        !Number.isSafeInteger(remainingUses) ||
        remainingUses < 0)) ||
    (entitlementId !== undefined && !isSafeIdentifier(entitlementId)) ||
    (downloadDisposition !== undefined &&
      downloadDisposition !== "inline" &&
      downloadDisposition !== "attachment") ||
    (accessSource !== undefined &&
      accessSource !== "grant" &&
      accessSource !== "order" &&
      accessSource !== "membership" &&
      accessSource !== "subscription" &&
      accessSource !== "license" &&
      accessSource !== "credit") ||
    (sourceExplanation !== undefined &&
      (typeof sourceExplanation !== "string" ||
        sourceExplanation.trim() !== sourceExplanation ||
        sourceExplanation.length === 0 ||
        sourceExplanation.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(sourceExplanation)))
  ) {
    return null;
  }

  return {
    granteeUserId: value.granteeUserId,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
    actions,
    state: value.state,
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(remainingUses === undefined ? {} : { remainingUses }),
    ...(entitlementId === undefined ? {} : { entitlementId }),
    ...(downloadDisposition === undefined ? {} : { downloadDisposition }),
    ...(accessSource === undefined ? {} : { accessSource }),
    ...(sourceExplanation === undefined ? {} : { sourceExplanation }),
    startsAtTime,
    expiresAtTime,
  };
}

function validateRequest(
  value: unknown,
): ValidatedRequest | AccessDenialReason {
  if (!isPlainRecord(value)) return "invalid-request";

  const identity = readIdentity(value.identity);
  const nowTime = readTimestamp(value.now);

  if (
    identity === undefined ||
    !isSafeIdentifier(value.resourceType) ||
    !isSafeIdentifier(value.resourceId) ||
    !isAccessAction(value.action) ||
    nowTime === null
  ) {
    return "invalid-request";
  }

  if (!isPlainRecord(value.facts)) return "invalid-authority-facts";

  const publicActions = readActionList(
    value.facts.publicActions === undefined ? [] : value.facts.publicActions,
    PUBLIC_ACTIONS,
  );
  const editorActions = readActionList(
    value.facts.editorActions === undefined ? [] : value.facts.editorActions,
  );
  const accountActions = readActionList(
    value.facts.accountActions === undefined ? [] : value.facts.accountActions,
    PUBLIC_ACTIONS,
  );
  const ownershipActions = readActionList(
    value.facts.ownershipActions === undefined
      ? []
      : value.facts.ownershipActions,
  );
  const resourceOwnerUserId = value.facts.resourceOwnerUserId;

  if (
    publicActions === null ||
    accountActions === null ||
    editorActions === null ||
    ownershipActions === null ||
    (resourceOwnerUserId !== undefined &&
      !isSafeIdentifier(resourceOwnerUserId)) ||
    (value.facts.grants !== undefined && !Array.isArray(value.facts.grants))
  ) {
    return "invalid-authority-facts";
  }

  const grants: ValidatedGrant[] = [];

  for (const candidate of value.facts.grants ?? []) {
    const grant = readGrant(candidate);
    if (!grant) return "invalid-authority-facts";
    grants.push(grant);
  }

  return {
    identity,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
    action: value.action,
    nowTime,
    publicActions,
    accountActions,
    editorActions,
    resourceOwnerUserId: resourceOwnerUserId ?? null,
    ownershipActions,
    grants,
  };
}

function compareUsableGrants(
  left: ValidatedGrant,
  right: ValidatedGrant,
): number {
  if (left.expiresAtTime === null && right.expiresAtTime !== null) return -1;
  if (left.expiresAtTime !== null && right.expiresAtTime === null) return 1;

  if (
    left.expiresAtTime !== null &&
    right.expiresAtTime !== null &&
    left.expiresAtTime !== right.expiresAtTime
  ) {
    return right.expiresAtTime - left.expiresAtTime;
  }

  if (left.remainingUses === undefined && right.remainingUses !== undefined) {
    return -1;
  }
  if (left.remainingUses !== undefined && right.remainingUses === undefined) {
    return 1;
  }

  return (right.remainingUses ?? 0) - (left.remainingUses ?? 0);
}

function grantDenialReason(
  grants: readonly ValidatedGrant[],
  action: AccessAction,
  nowTime: number,
): AccessDenialReason {
  if (grants.length === 0) return "not-authorized";

  const actionGrants = grants.filter((grant) => grant.actions.includes(action));
  if (actionGrants.length === 0) return "action-not-granted";

  const reasons = new Set<AccessDenialReason>();

  for (const grant of actionGrants) {
    if (grant.state === "revoked") {
      reasons.add("grant-revoked");
    } else if (grant.state === "expired") {
      reasons.add("grant-expired");
    } else if (grant.state === "exhausted") {
      reasons.add("grant-exhausted");
    } else if (grant.startsAtTime !== null && nowTime < grant.startsAtTime) {
      reasons.add("grant-not-yet-active");
    } else if (grant.expiresAtTime !== null && nowTime >= grant.expiresAtTime) {
      reasons.add("grant-expired");
    } else if (grant.remainingUses === 0) {
      reasons.add("grant-exhausted");
    }
  }

  const priority: readonly AccessDenialReason[] = [
    "grant-revoked",
    "grant-expired",
    "grant-not-yet-active",
    "grant-exhausted",
  ];

  return priority.find((reason) => reasons.has(reason)) ?? "not-authorized";
}

function evaluateAccess(request: ValidatedRequest): AccessDecision {
  if (request.publicActions.includes(request.action)) {
    return allow("public-resource", "public");
  }

  const { identity } = request;
  if (!identity) return deny("authentication-required");

  if (identity.roles.includes("owner")) {
    return allow("owner-role", "role");
  }

  if (request.accountActions.includes(request.action)) {
    return allow("authenticated-account", "account");
  }

  if (
    identity.roles.includes("editor") &&
    request.editorActions.includes(request.action)
  ) {
    return allow("editor-scope", "role");
  }

  if (
    request.resourceOwnerUserId === identity.userId &&
    request.ownershipActions.includes(request.action)
  ) {
    return allow("resource-ownership", "ownership");
  }

  const matchingGrants = request.grants.filter(
    (grant) =>
      grant.granteeUserId === identity.userId &&
      grant.resourceType === request.resourceType &&
      grant.resourceId === request.resourceId,
  );

  const usableGrants = matchingGrants
    .filter(
      (grant) =>
        grant.state === "active" &&
        grant.actions.includes(request.action) &&
        (grant.startsAtTime === null ||
          request.nowTime >= grant.startsAtTime) &&
        (grant.expiresAtTime === null ||
          request.nowTime < grant.expiresAtTime) &&
        grant.remainingUses !== 0,
    )
    .sort(compareUsableGrants);

  const grant = usableGrants[0];

  if (grant) {
    const source = grant.accessSource ?? "grant";
    return allow(
      source === "grant" ? "explicit-grant" : "entitlement",
      source,
      {
        ...(grant.expiresAtTime === null
          ? {}
          : { expiresAt: new Date(grant.expiresAtTime).toISOString() }),
        ...(grant.remainingUses === undefined
          ? {}
          : { remainingUses: grant.remainingUses }),
        ...(grant.entitlementId === undefined
          ? {}
          : { entitlementId: grant.entitlementId }),
        ...(grant.downloadDisposition === undefined
          ? {}
          : { downloadDisposition: grant.downloadDisposition }),
        ...(grant.sourceExplanation === undefined
          ? {}
          : { sourceExplanation: grant.sourceExplanation }),
      },
    );
  }

  return deny(
    grantDenialReason(matchingGrants, request.action, request.nowTime),
  );
}

/**
 * Makes one allowlisted access decision from server-resolved authority facts.
 * The function is total: malformed input and unreadable values fail closed.
 */
export async function decideAccess(
  request: AccessRequest,
): Promise<AccessDecision> {
  try {
    const validated = validateRequest(request);
    return typeof validated === "string"
      ? deny(validated)
      : evaluateAccess(validated);
  } catch {
    return deny("invalid-request");
  }
}
