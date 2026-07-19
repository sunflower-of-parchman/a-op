import {
  ACCESS_RESOURCE_TYPES,
  readAccessFacts,
  type AccessResourceType,
  type AccessSourceExplanation,
  type EntitlementSourceType,
  type ProtectedAccessAction,
} from "@/db/access-read.ts";
import { readTrackDownloadDelivery } from "@/db/catalog-media.ts";
import { decideAccess, type AccessSource } from "@/lib/access/decide-access.ts";
import type { ApplicationIdentity } from "@/lib/auth/application-identity.ts";
import type {
  CustomerAccessEffectiveState,
  CustomerAccessLibraryDTO,
  CustomerAccessResourceDTO,
  CustomerAccessSourceDTO,
  CustomerAccessibleResourceDTO,
  CustomerDownloadHistoryDTO,
  CustomerEntitlementHistoryDTO,
  CustomerGrantHistoryDTO,
} from "@/lib/customer-access/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export class CustomerAccessReadIntegrityError extends Error {
  override readonly name = "CustomerAccessReadIntegrityError";
}

interface ActiveCustomerRow {
  active_customer: unknown;
}

interface ActiveDownloadsModuleRow {
  active: unknown;
}

interface GrantRow {
  id: unknown;
  resource_type: unknown;
  resource_id: unknown;
  actions_json: unknown;
  state: unknown;
  starts_at: unknown;
  expires_at: unknown;
  remaining_uses: unknown;
  revoked_at: unknown;
  expired_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface EntitlementRow {
  id: unknown;
  source_type: unknown;
  resource_type: unknown;
  resource_id: unknown;
  actions_json: unknown;
  state: unknown;
  starts_at: unknown;
  expires_at: unknown;
  remaining_uses: unknown;
  stripe_environment: unknown;
  livemode: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface DownloadRow {
  id: unknown;
  resource_type: unknown;
  resource_id: unknown;
  entitlement_id: unknown;
  entitlement_owned: unknown;
  access_source: unknown;
  byte_length: unknown;
  delivered_at: unknown;
}

interface PublishedResourceRow {
  slug: unknown;
  title: unknown;
  revision_id: unknown;
}

interface ParsedGrant {
  readonly id: string;
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
  readonly actions: readonly ProtectedAccessAction[];
  readonly storedState: "active" | "revoked" | "expired";
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly remainingUses: number | null;
  readonly revokedAt: string | null;
  readonly expiredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ParsedEntitlement {
  readonly id: string;
  readonly sourceType: EntitlementSourceType;
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
  readonly actions: readonly ProtectedAccessAction[];
  readonly storedState: "active" | "revoked" | "expired" | "exhausted";
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly remainingUses: number | null;
  readonly commerceTestMode: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ParsedDownload {
  readonly id: string;
  readonly resourceType: Extract<
    AccessResourceType,
    "track" | "release" | "collection"
  >;
  readonly resourceId: string;
  readonly entitlementId: string | null;
  readonly accessSource:
    "public" | "account" | "role" | "ownership" | EntitlementSourceType;
  readonly byteLength: number;
  readonly deliveredAt: string;
}

interface ResourceKey {
  readonly resourceType: AccessResourceType;
  readonly resourceId: string;
}

interface MutableLiveResource {
  readonly resolution: ResolvedCustomerAccessResource;
  readonly actions: Set<ProtectedAccessAction>;
  readonly sources: CustomerAccessSourceDTO[];
  readonly sourceKeys: Set<string>;
}

interface ResolvedCustomerAccessResource {
  readonly resource: CustomerAccessResourceDTO;
  readonly publishedRevisionId: string | null;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESOURCE_TYPES = new Set<string>(ACCESS_RESOURCE_TYPES);
const ACTIONS = new Set<ProtectedAccessAction>(["view", "stream", "download"]);
const ACTION_ORDER: Readonly<Record<ProtectedAccessAction, number>> =
  Object.freeze({ view: 0, stream: 1, download: 2 });
const RESOURCE_ORDER: Readonly<Record<AccessResourceType, number>> =
  Object.freeze({
    track: 0,
    release: 1,
    collection: 2,
    course: 3,
    lesson: 4,
    "license-document": 5,
  });
const SOURCE_EXPLANATIONS = Object.freeze({
  grant: "Artist access grant",
  order: "Test order entitlement",
  membership: "Membership entitlement",
  subscription: "Subscription entitlement",
  license: "License entitlement",
  credit: "Credit entitlement",
} as const satisfies Readonly<Record<EntitlementSourceType, string>>);
const UNAVAILABLE_TITLE = "Unavailable resource";

function integrity(message: string): never {
  throw new CustomerAccessReadIntegrityError(message);
}

function readId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return integrity(`D1 returned an unsafe ${label}.`);
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
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function readNullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : readTimestamp(value, label);
}

function readDecisionTime(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError("A valid server decision time is required.");
  }
  return new Date(Date.parse(value)).toISOString();
}

function readRemainingUses(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function readCommerceTestMode(
  sourceType: EntitlementSourceType,
  environment: unknown,
  livemode: unknown,
): boolean {
  if (environment === null && livemode === null) return false;
  if (sourceType !== "grant" && environment === "test" && livemode === 0) {
    return true;
  }
  return integrity("D1 returned invalid entitlement commerce provenance.");
}

function readActions(
  value: unknown,
  label: string,
): readonly ProtectedAccessAction[] {
  if (typeof value !== "string") {
    return integrity(`D1 returned invalid ${label}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return integrity(`D1 returned invalid ${label} JSON.`);
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length > ACTIONS.size ||
    !parsed.every(
      (action) =>
        typeof action === "string" &&
        ACTIONS.has(action as ProtectedAccessAction),
    )
  ) {
    return integrity(`D1 returned invalid ${label}.`);
  }

  return Object.freeze(
    [...new Set(parsed as readonly ProtectedAccessAction[])].sort(
      (left, right) => ACTION_ORDER[left] - ACTION_ORDER[right],
    ),
  );
}

function readResourceType(value: unknown): AccessResourceType {
  if (typeof value !== "string" || !RESOURCE_TYPES.has(value)) {
    return integrity("D1 returned an invalid access resource type.");
  }
  return value as AccessResourceType;
}

function readGrantState(value: unknown): "active" | "revoked" | "expired" {
  if (value !== "active" && value !== "revoked" && value !== "expired") {
    return integrity("D1 returned an invalid access-grant state.");
  }
  return value;
}

function readEntitlementState(
  value: unknown,
): "active" | "revoked" | "expired" | "exhausted" {
  if (
    value !== "active" &&
    value !== "revoked" &&
    value !== "expired" &&
    value !== "exhausted"
  ) {
    return integrity("D1 returned an invalid entitlement state.");
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
    return integrity("D1 returned an invalid entitlement source type.");
  }
  return value;
}

function readDownloadResourceType(
  value: unknown,
): ParsedDownload["resourceType"] {
  if (value !== "track" && value !== "release" && value !== "collection") {
    return integrity("D1 returned an invalid download resource type.");
  }
  return value;
}

function readAccessSource(value: unknown): ParsedDownload["accessSource"] {
  if (
    value !== "public" &&
    value !== "account" &&
    value !== "role" &&
    value !== "ownership" &&
    value !== "grant" &&
    value !== "order" &&
    value !== "membership" &&
    value !== "subscription" &&
    value !== "license" &&
    value !== "credit"
  ) {
    return integrity("D1 returned an invalid download access source.");
  }
  return value;
}

function readByteLength(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return integrity("D1 returned an invalid download byte length.");
  }
  return value as number;
}

function validateWindow(startsAt: string | null, expiresAt: string | null) {
  if (
    startsAt !== null &&
    expiresAt !== null &&
    Date.parse(startsAt) >= Date.parse(expiresAt)
  ) {
    integrity("D1 returned an invalid access window.");
  }
}

function parseGrant(row: GrantRow): ParsedGrant {
  const startsAt = readNullableTimestamp(
    row.starts_at,
    "access-grant start timestamp",
  );
  const expiresAt = readNullableTimestamp(
    row.expires_at,
    "access-grant expiry timestamp",
  );
  validateWindow(startsAt, expiresAt);
  const storedState = readGrantState(row.state);
  const revokedAt = readNullableTimestamp(
    row.revoked_at,
    "access-grant revocation timestamp",
  );
  const expiredAt = readNullableTimestamp(
    row.expired_at,
    "access-grant expiration timestamp",
  );
  if (
    (storedState === "active" && (revokedAt !== null || expiredAt !== null)) ||
    (storedState === "revoked" && (revokedAt === null || expiredAt !== null)) ||
    (storedState === "expired" && (expiredAt === null || revokedAt !== null))
  ) {
    return integrity("D1 returned inconsistent access-grant lifecycle facts.");
  }
  return {
    id: readId(row.id, "access-grant ID"),
    resourceType: readResourceType(row.resource_type),
    resourceId: readId(row.resource_id, "access-grant resource ID"),
    actions: readActions(row.actions_json, "access-grant actions"),
    storedState,
    startsAt,
    expiresAt,
    remainingUses: readRemainingUses(
      row.remaining_uses,
      "access-grant remaining uses",
    ),
    revokedAt,
    expiredAt,
    createdAt: readTimestamp(row.created_at, "access-grant creation timestamp"),
    updatedAt: readTimestamp(row.updated_at, "access-grant update timestamp"),
  };
}

function parseEntitlement(row: EntitlementRow): ParsedEntitlement {
  const startsAt = readNullableTimestamp(
    row.starts_at,
    "entitlement start timestamp",
  );
  const expiresAt = readNullableTimestamp(
    row.expires_at,
    "entitlement expiry timestamp",
  );
  validateWindow(startsAt, expiresAt);
  const sourceType = readSourceType(row.source_type);
  return {
    id: readId(row.id, "entitlement ID"),
    sourceType,
    resourceType: readResourceType(row.resource_type),
    resourceId: readId(row.resource_id, "entitlement resource ID"),
    actions: readActions(row.actions_json, "entitlement actions"),
    storedState: readEntitlementState(row.state),
    startsAt,
    expiresAt,
    remainingUses: readRemainingUses(
      row.remaining_uses,
      "entitlement remaining uses",
    ),
    commerceTestMode: readCommerceTestMode(
      sourceType,
      row.stripe_environment,
      row.livemode,
    ),
    createdAt: readTimestamp(row.created_at, "entitlement creation timestamp"),
    updatedAt: readTimestamp(row.updated_at, "entitlement update timestamp"),
  };
}

function parseDownload(row: DownloadRow): ParsedDownload {
  if (row.entitlement_owned !== 1) {
    return integrity(
      "D1 returned a download entitlement owned by another customer.",
    );
  }
  return {
    id: readId(row.id, "download event ID"),
    resourceType: readDownloadResourceType(row.resource_type),
    resourceId: readId(row.resource_id, "download resource ID"),
    entitlementId: readNullableId(
      row.entitlement_id,
      "download entitlement ID",
    ),
    accessSource: readAccessSource(row.access_source),
    byteLength: readByteLength(row.byte_length),
    deliveredAt: readTimestamp(row.delivered_at, "download delivery timestamp"),
  };
}

function effectiveState(
  storedState: "active" | "revoked" | "expired" | "exhausted",
  startsAt: string | null,
  expiresAt: string | null,
  remainingUses: number | null,
  nowTime: number,
): CustomerAccessEffectiveState {
  if (storedState === "revoked") return "revoked";
  if (storedState === "expired") return "expired";
  if (storedState === "exhausted") return "exhausted";
  if (expiresAt !== null && nowTime >= Date.parse(expiresAt)) return "expired";
  if (startsAt !== null && nowTime < Date.parse(startsAt)) return "scheduled";
  if (remainingUses === 0) return "exhausted";
  return "active";
}

function key(input: ResourceKey): string {
  return `${input.resourceType}:${input.resourceId}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unavailableResource(input: ResourceKey): CustomerAccessResourceDTO {
  return Object.freeze({
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    available: false,
    title: UNAVAILABLE_TITLE,
    href: null,
  });
}

function unavailableResourceResolution(
  input: ResourceKey,
): ResolvedCustomerAccessResource {
  return Object.freeze({
    resource: unavailableResource(input),
    publishedRevisionId: null,
  });
}

async function readPublishedResource(
  binding: D1Database,
  input: ResourceKey,
): Promise<ResolvedCustomerAccessResource> {
  if (
    input.resourceType !== "track" &&
    input.resourceType !== "release" &&
    input.resourceType !== "collection"
  ) {
    return unavailableResourceResolution(input);
  }

  const configuration = {
    track: {
      table: "tracks",
      revisions: "track_revisions",
      owner: "track_id",
      href: "/music/tracks/",
    },
    release: {
      table: "releases",
      revisions: "release_revisions",
      owner: "release_id",
      href: "/music/releases/",
    },
    collection: {
      table: "collections",
      revisions: "collection_revisions",
      owner: "collection_id",
      href: "/music/collections/",
    },
  } as const;
  const current = configuration[input.resourceType];
  const row = await binding
    .prepare(
      `SELECT resource.slug AS slug,
              current_revision.title AS title,
              current_revision.id AS revision_id
       FROM ${current.table} AS resource
       JOIN ${current.revisions} AS current_revision
         ON current_revision.id = resource.published_revision_id
        AND current_revision.${current.owner} = resource.id
       WHERE resource.id = ?1
         AND resource.publication_state = 'published'
       LIMIT 1`,
    )
    .bind(input.resourceId)
    .first<PublishedResourceRow>();

  if (!row) return unavailableResourceResolution(input);
  if (typeof row.slug !== "string" || !SAFE_SLUG.test(row.slug)) {
    return integrity("D1 returned an unsafe published resource slug.");
  }
  if (
    typeof row.title !== "string" ||
    row.title.trim() !== row.title ||
    row.title.length === 0
  ) {
    return integrity("D1 returned an invalid published resource title.");
  }

  return Object.freeze({
    resource: Object.freeze({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      available: true,
      title: row.title,
      href: `${current.href}${row.slug}`,
    }),
    publishedRevisionId: readId(
      row.revision_id,
      "published resource revision ID",
    ),
  });
}

function requireCustomerIdentity(identity: ApplicationIdentity): string {
  if (
    !identity ||
    !SAFE_ID.test(identity.userId) ||
    !Array.isArray(identity.roles) ||
    !identity.roles.every(
      (role) => role === "owner" || role === "editor" || role === "customer",
    )
  ) {
    throw new TypeError(
      "A valid server-resolved application identity is required.",
    );
  }
  if (!identity.roles.includes("customer")) {
    throw new RuntimeError(
      "ROLE_REQUIRED",
      "The application identity does not have the customer role.",
      {
        status: 403,
        publicMessage: "This account cannot access the customer library.",
      },
    );
  }
  return identity.userId;
}

async function requireActiveCustomer(
  binding: D1Database,
  userId: string,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT EXISTS (
         SELECT 1
         FROM users
         JOIN role_assignments
           ON role_assignments.user_id = users.id
          AND role_assignments.role_key = 'customer'
          AND role_assignments.revoked_at IS NULL
         WHERE users.id = ?1
           AND users.status = 'active'
       ) AS active_customer`,
    )
    .bind(userId)
    .first<ActiveCustomerRow>();

  if (row?.active_customer === 1) return;
  throw new RuntimeError(
    "ROLE_REQUIRED",
    "The application identity is not an active D1 customer.",
    {
      status: 403,
      publicMessage: "This account cannot access the customer library.",
    },
  );
}

async function readDownloadsModuleActive(
  binding: D1Database,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT active
       FROM artist_modules
       WHERE module_key = 'downloads'
       LIMIT 1`,
    )
    .first<ActiveDownloadsModuleRow>();
  if (!row) return false;
  if (row.active !== 0 && row.active !== 1) {
    return integrity("D1 returned an invalid downloads module state.");
  }
  return row.active === 1;
}

async function readDownloadUrl(input: {
  readonly binding: D1Database;
  readonly downloadsModuleActive: boolean;
  readonly resolution: ResolvedCustomerAccessResource;
  readonly actions: ReadonlySet<ProtectedAccessAction>;
}): Promise<string | null> {
  if (
    !input.downloadsModuleActive ||
    !input.actions.has("download") ||
    !input.resolution.resource.available ||
    input.resolution.resource.resourceType !== "track" ||
    input.resolution.publishedRevisionId === null
  ) {
    return null;
  }

  const delivery = await readTrackDownloadDelivery(
    input.binding,
    input.resolution.resource.resourceId,
    input.resolution.publishedRevisionId,
  );
  if (!delivery) return null;
  if (delivery.revisionId !== input.resolution.publishedRevisionId) {
    return integrity(
      "The download delivery did not match the current published revision.",
    );
  }

  return `/api/media/tracks/${encodeURIComponent(delivery.trackId)}/download?revision=${encodeURIComponent(delivery.revisionId)}`;
}

function sourceForDecision(
  sources: readonly AccessSourceExplanation[],
  commerceTestEntitlementIds: ReadonlySet<string>,
  decision: {
    readonly source: Exclude<AccessSource, "none">;
    readonly entitlementId?: string;
    readonly expiresAt?: string;
    readonly remainingUses?: number;
    readonly sourceExplanation?: string;
  },
): CustomerAccessSourceDTO {
  const entitlementId = decision.entitlementId ?? null;
  const expiresAt = decision.expiresAt ?? null;
  const remainingUses = decision.remainingUses ?? null;
  const source = sources.find(
    (candidate) =>
      candidate.sourceType === decision.source &&
      candidate.entitlementId === entitlementId &&
      candidate.explanation === decision.sourceExplanation &&
      candidate.expiresAt === expiresAt &&
      candidate.remainingUses === remainingUses,
  );
  if (!source) {
    return integrity("The access decision did not match its D1 source.");
  }
  return Object.freeze({
    sourceType: source.sourceType,
    explanation: source.explanation,
    entitlementId,
    commerceTestMode:
      entitlementId !== null && commerceTestEntitlementIds.has(entitlementId),
    expiresAt,
    remainingUses,
  });
}

function sourceKey(source: CustomerAccessSourceDTO): string {
  return [
    source.sourceType,
    source.entitlementId ?? "",
    source.expiresAt ?? "",
    source.remainingUses === null ? "" : String(source.remainingUses),
  ].join(":");
}

async function liveResources(
  binding: D1Database,
  userId: string,
  now: string,
  resourceMap: ReadonlyMap<string, ResolvedCustomerAccessResource>,
  grants: readonly ParsedGrant[],
  entitlements: readonly ParsedEntitlement[],
  downloadsModuleActive: boolean,
): Promise<readonly CustomerAccessibleResourceDTO[]> {
  const commerceTestEntitlementIds = new Set(
    entitlements
      .filter(({ commerceTestMode }) => commerceTestMode)
      .map(({ id: entitlementId }) => entitlementId),
  );
  const candidates = new Map<
    string,
    ResourceKey & {
      actions: Set<ProtectedAccessAction>;
    }
  >();
  for (const item of [...grants, ...entitlements]) {
    const itemKey = key(item);
    const candidate = candidates.get(itemKey) ?? {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      actions: new Set<ProtectedAccessAction>(),
    };
    item.actions.forEach((action) => candidate.actions.add(action));
    candidates.set(itemKey, candidate);
  }

  const live = new Map<string, MutableLiveResource>();
  for (const candidate of candidates.values()) {
    for (const action of [...candidate.actions].sort(
      (left, right) => ACTION_ORDER[left] - ACTION_ORDER[right],
    )) {
      const request = {
        identity: { userId, roles: ["customer"] as const },
        resourceType: candidate.resourceType,
        resourceId: candidate.resourceId,
        action,
        now,
      };
      const projection = await readAccessFacts(binding, request);
      const decision = await decideAccess({
        ...request,
        facts: projection.facts,
      });
      if (!decision.allowed) continue;
      if (
        decision.source === "public" ||
        decision.source === "account" ||
        decision.source === "role" ||
        decision.source === "ownership" ||
        (decision.source === "grant"
          ? decision.reason !== "explicit-grant"
          : decision.reason !== "entitlement") ||
        decision.sourceExplanation === undefined
      ) {
        integrity(
          "The customer access library received an unsafe decision source.",
        );
      }

      const itemKey = key(candidate);
      const resolution = resourceMap.get(itemKey);
      if (!resolution) {
        integrity("A customer access resource was not resolved.");
      }
      const mutable = live.get(itemKey) ?? {
        resolution,
        actions: new Set<ProtectedAccessAction>(),
        sources: [],
        sourceKeys: new Set<string>(),
      };
      mutable.actions.add(action);
      const source = sourceForDecision(
        projection.sources,
        commerceTestEntitlementIds,
        decision,
      );
      const dedupeKey = sourceKey(source);
      if (!mutable.sourceKeys.has(dedupeKey)) {
        mutable.sources.push(source);
        mutable.sourceKeys.add(dedupeKey);
      }
      live.set(itemKey, mutable);
    }
  }

  const projected = await Promise.all(
    [...live.values()].map(async ({ resolution, actions, sources }) =>
      Object.freeze({
        resource: resolution.resource,
        actions: Object.freeze(
          [...actions].sort(
            (left, right) => ACTION_ORDER[left] - ACTION_ORDER[right],
          ),
        ),
        sources: Object.freeze(
          [...sources].sort(
            (left, right) =>
              compareText(left.sourceType, right.sourceType) ||
              compareText(left.entitlementId ?? "", right.entitlementId ?? ""),
          ),
        ),
        downloadUrl: await readDownloadUrl({
          binding,
          downloadsModuleActive,
          resolution,
          actions,
        }),
      }),
    ),
  );
  return Object.freeze(
    projected.sort(
      (left, right) =>
        RESOURCE_ORDER[left.resource.resourceType] -
          RESOURCE_ORDER[right.resource.resourceType] ||
        compareText(left.resource.title, right.resource.title) ||
        compareText(left.resource.resourceId, right.resource.resourceId),
    ),
  );
}

/**
 * Reads one active customer's current D1 access library and durable history.
 * Access is re-decided for every exact resource/action at the supplied server
 * time; stored grants and entitlements are never treated as authority directly.
 */
export async function readCustomerAccessLibrary(
  binding: D1Database,
  identity: ApplicationIdentity,
  now: string,
): Promise<CustomerAccessLibraryDTO> {
  const userId = requireCustomerIdentity(identity);
  const decisionNow = readDecisionTime(now);
  const nowTime = Date.parse(decisionNow);
  await requireActiveCustomer(binding, userId);

  const [
    grantResult,
    entitlementResult,
    downloadResult,
    downloadsModuleActive,
  ] = await Promise.all([
    binding
      .prepare(
        `SELECT id, resource_type, resource_id, actions_json, state,
                starts_at, expires_at, remaining_uses, revoked_at, expired_at,
                created_at, updated_at
         FROM access_grants
         WHERE grantee_user_id = ?1
         ORDER BY created_at DESC, id ASC`,
      )
      .bind(userId)
      .all<GrantRow>(),
    binding
      .prepare(
        `SELECT id, source_type, resource_type, resource_id, actions_json,
                state, starts_at, expires_at, remaining_uses,
                stripe_environment, livemode,
                created_at, updated_at
         FROM entitlements
         WHERE user_id = ?1
         ORDER BY created_at DESC, id ASC`,
      )
      .bind(userId)
      .all<EntitlementRow>(),
    binding
      .prepare(
        `SELECT id, resource_type, resource_id, entitlement_id,
                CASE
                  WHEN entitlement_id IS NULL OR EXISTS (
                    SELECT 1 FROM entitlements AS download_entitlement
                    WHERE download_entitlement.id = download_events.entitlement_id
                      AND download_entitlement.user_id = ?1
                  ) THEN 1 ELSE 0
                END AS entitlement_owned,
                access_source, byte_length, delivered_at
         FROM download_events
         WHERE user_id = ?1
         ORDER BY delivered_at DESC, id ASC`,
      )
      .bind(userId)
      .all<DownloadRow>(),
    readDownloadsModuleActive(binding),
  ]);

  const grants = Object.freeze(grantResult.results.map(parseGrant));
  const entitlements = Object.freeze(
    entitlementResult.results.map(parseEntitlement),
  );
  const downloads = Object.freeze(downloadResult.results.map(parseDownload));

  const resourceKeys = new Map<string, ResourceKey>();
  for (const item of [...grants, ...entitlements, ...downloads]) {
    resourceKeys.set(key(item), {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
    });
  }
  const resolvedResources = await Promise.all(
    [...resourceKeys.values()].map(
      async (resourceKey) =>
        [
          key(resourceKey),
          await readPublishedResource(binding, resourceKey),
        ] as const,
    ),
  );
  const resourceMap = new Map(resolvedResources);
  const resource = (input: ResourceKey): CustomerAccessResourceDTO => {
    const result = resourceMap.get(key(input));
    return (
      result?.resource ??
      integrity("A customer access resource was not resolved.")
    );
  };

  const grantHistory: readonly CustomerGrantHistoryDTO[] = Object.freeze(
    grants.map((grant) =>
      Object.freeze({
        id: grant.id,
        resource: resource(grant),
        actions: grant.actions,
        storedState: grant.storedState,
        effectiveState: effectiveState(
          grant.storedState,
          grant.startsAt,
          grant.expiresAt,
          grant.remainingUses,
          nowTime,
        ),
        explanation: SOURCE_EXPLANATIONS.grant,
        startsAt: grant.startsAt,
        expiresAt: grant.expiresAt,
        remainingUses: grant.remainingUses,
        revokedAt: grant.revokedAt,
        expiredAt: grant.expiredAt,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
      }),
    ),
  );
  const entitlementHistory: readonly CustomerEntitlementHistoryDTO[] =
    Object.freeze(
      entitlements.map((entitlement) =>
        Object.freeze({
          id: entitlement.id,
          resource: resource(entitlement),
          actions: entitlement.actions,
          storedState: entitlement.storedState,
          effectiveState: effectiveState(
            entitlement.storedState,
            entitlement.startsAt,
            entitlement.expiresAt,
            entitlement.remainingUses,
            nowTime,
          ),
          sourceType: entitlement.sourceType,
          commerceTestMode: entitlement.commerceTestMode,
          explanation: SOURCE_EXPLANATIONS[entitlement.sourceType],
          startsAt: entitlement.startsAt,
          expiresAt: entitlement.expiresAt,
          remainingUses: entitlement.remainingUses,
          createdAt: entitlement.createdAt,
          updatedAt: entitlement.updatedAt,
        }),
      ),
    );
  const downloadHistory: readonly CustomerDownloadHistoryDTO[] = Object.freeze(
    downloads.map((download) => {
      const entitlement =
        download.entitlementId === null
          ? null
          : entitlements.find(
              ({ id: entitlementId }) =>
                entitlementId === download.entitlementId,
            );
      if (download.entitlementId !== null && entitlement === undefined) {
        return integrity(
          "A customer delivery did not match its D1 entitlement.",
        );
      }
      return Object.freeze({
        id: download.id,
        resource: resource(download),
        entitlementId: download.entitlementId,
        accessSource: download.accessSource,
        commerceTestMode: entitlement?.commerceTestMode ?? false,
        byteLength: download.byteLength,
        deliveredAt: download.deliveredAt,
      });
    }),
  );

  return Object.freeze({
    resources: await liveResources(
      binding,
      userId,
      decisionNow,
      resourceMap,
      grants,
      entitlements,
      downloadsModuleActive,
    ),
    grantHistory,
    entitlementHistory,
    downloadHistory,
  });
}
