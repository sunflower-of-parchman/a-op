import type {
  AccessSource,
  EntitlementAccessSource,
} from "@/lib/access/decide-access.ts";
import { RuntimeError, isRequestId } from "@/lib/runtime/index.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { runAtomicBatch } from "./d1.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";

export interface SuccessfulDownloadEvent {
  readonly userId: string | null;
  readonly resourceType: "track" | "release" | "collection";
  readonly resourceId: string;
  readonly mediaDerivativeId: string;
  readonly entitlementId: string | null;
  readonly accessSource: Exclude<AccessSource, "none">;
  readonly byteLength: number;
  readonly requestId: string;
  readonly deliveredAt: string;
  readonly protectedDelivery: boolean;
  readonly telemetry?: TelemetryMutationRequestContext;
}

interface DownloadEventRow {
  user_id: string | null;
  resource_type: string;
  resource_id: string;
  media_derivative_id: string | null;
  entitlement_id: string | null;
  access_source: string;
  entitlement_source_type: string | null;
  entitlement_source_id: string | null;
  credit_reservation_id: string | null;
  stripe_environment: string | null;
  livemode: number | null;
  byte_length: number;
  delivered_at: string;
}

interface EntitlementSnapshotRow {
  source_type: string;
  source_id: string;
  credit_reservation_id: string | null;
  stripe_environment: string | null;
  livemode: number | null;
}

interface EntitlementSnapshot {
  readonly sourceType: EntitlementAccessSource;
  readonly sourceId: string;
  readonly creditReservationId: string | null;
  readonly stripeEnvironment: "test" | null;
  readonly livemode: 0 | null;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const ACCESS_SOURCES = new Set<SuccessfulDownloadEvent["accessSource"]>([
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
const ENTITLEMENT_SOURCES = new Set<EntitlementAccessSource>([
  "grant",
  "order",
  "membership",
  "subscription",
  "license",
  "credit",
]);

function invalidSnapshot(): RuntimeError {
  return new RuntimeError(
    "DOWNLOAD_ENTITLEMENT_CHANGED",
    "The download entitlement changed before delivery could be recorded.",
    {
      status: 409,
      publicMessage: "Access changed. Reload the download and try again.",
    },
  );
}

async function readEntitlementSnapshot(
  binding: D1Database,
  input: SuccessfulDownloadEvent,
): Promise<EntitlementSnapshot | null> {
  if (input.entitlementId === null) {
    if (
      ENTITLEMENT_SOURCES.has(input.accessSource as EntitlementAccessSource) &&
      input.accessSource !== "grant"
    ) {
      throw invalidSnapshot();
    }
    return null;
  }
  if (!ENTITLEMENT_SOURCES.has(input.accessSource as EntitlementAccessSource)) {
    throw invalidSnapshot();
  }

  const row = await binding
    .prepare(
      `SELECT source_type, source_id, credit_reservation_id,
              stripe_environment, livemode
       FROM entitlements
       WHERE id = ?1
         AND user_id = ?2
         AND resource_type = ?3
         AND resource_id = ?4
         AND state = 'active'
       LIMIT 1`,
    )
    .bind(
      input.entitlementId,
      input.userId,
      input.resourceType,
      input.resourceId,
    )
    .first<EntitlementSnapshotRow>();
  if (
    !row ||
    row.source_type !== input.accessSource ||
    !SAFE_ID.test(row.source_id)
  ) {
    throw invalidSnapshot();
  }

  const commerceSource = row.source_type !== "grant";
  if (
    (commerceSource &&
      (row.stripe_environment !== "test" || row.livemode !== 0)) ||
    (!commerceSource &&
      (row.stripe_environment !== null || row.livemode !== null)) ||
    (row.source_type === "credit" &&
      (row.credit_reservation_id === null ||
        !SAFE_ID.test(row.credit_reservation_id))) ||
    (row.source_type !== "credit" && row.credit_reservation_id !== null)
  ) {
    throw invalidSnapshot();
  }

  return Object.freeze({
    sourceType: row.source_type as EntitlementAccessSource,
    sourceId: row.source_id,
    creditReservationId: row.credit_reservation_id,
    stripeEnvironment: commerceSource ? "test" : null,
    livemode: commerceSource ? 0 : null,
  });
}

function validate(input: SuccessfulDownloadEvent): void {
  if (
    (input.userId !== null && !SAFE_ID.test(input.userId)) ||
    (input.userId === null && input.accessSource !== "public") ||
    !SAFE_ID.test(input.resourceId) ||
    !SAFE_ID.test(input.mediaDerivativeId) ||
    (input.entitlementId !== null && !SAFE_ID.test(input.entitlementId)) ||
    !isRequestId(input.requestId) ||
    !ACCESS_SOURCES.has(input.accessSource) ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 0 ||
    typeof input.protectedDelivery !== "boolean" ||
    !Number.isFinite(Date.parse(input.deliveredAt))
  ) {
    throw new TypeError("A valid successful download event is required.");
  }
}

function isSameEvent(
  row: DownloadEventRow,
  input: SuccessfulDownloadEvent,
  snapshot: EntitlementSnapshot | null,
): boolean {
  return (
    row.user_id === input.userId &&
    row.resource_type === input.resourceType &&
    row.resource_id === input.resourceId &&
    row.media_derivative_id === input.mediaDerivativeId &&
    row.entitlement_id === input.entitlementId &&
    row.access_source === input.accessSource &&
    row.entitlement_source_type === (snapshot?.sourceType ?? null) &&
    row.entitlement_source_id === (snapshot?.sourceId ?? null) &&
    row.credit_reservation_id === (snapshot?.creditReservationId ?? null) &&
    row.stripe_environment === (snapshot?.stripeEnvironment ?? null) &&
    row.livemode === (snapshot?.livemode ?? null) &&
    row.byte_length === input.byteLength &&
    Number.isFinite(Date.parse(row.delivered_at))
  );
}

/** Records one successful delivery, or verifies an exact idempotent replay. */
export async function recordSuccessfulDownload(
  binding: D1Database,
  input: SuccessfulDownloadEvent,
): Promise<void> {
  validate(input);
  const snapshot = await readEntitlementSnapshot(binding, input);

  const delivery = binding
    .prepare(
      `INSERT INTO download_events
         (id, user_id, resource_type, resource_id, media_derivative_id,
          entitlement_id, access_source, entitlement_source_type,
          entitlement_source_id, credit_reservation_id, stripe_environment,
          livemode, byte_length, request_id, delivered_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    )
    .bind(
      input.requestId,
      input.userId,
      input.resourceType,
      input.resourceId,
      input.mediaDerivativeId,
      input.entitlementId,
      input.accessSource,
      snapshot?.sourceType ?? null,
      snapshot?.sourceId ?? null,
      snapshot?.creditReservationId ?? null,
      snapshot?.stripeEnvironment ?? null,
      snapshot?.livemode ?? null,
      input.byteLength,
      input.requestId,
      input.deliveredAt,
    );
  const durableCondition = {
    sql: `EXISTS (
      SELECT 1 FROM download_events
      WHERE request_id = ? AND resource_type = ? AND resource_id = ?
        AND media_derivative_id = ? AND byte_length = ?
    )`,
    bindings: [
      input.requestId,
      input.resourceType,
      input.resourceId,
      input.mediaDerivativeId,
      input.byteLength,
    ],
  } as const;
  const telemetry = [
    await prepareServerTelemetryEvent(binding, {
      eventName: "download-delivered",
      resourceType: "download",
      resourceId: input.resourceId,
      sourceOperationKey: `download.deliver:${input.requestId}`,
      userId: input.userId,
      requestContext: input.telemetry,
      occurredAt: new Date(input.deliveredAt),
      durableCondition,
    }),
  ];
  if (input.protectedDelivery) {
    telemetry.push(
      await prepareServerTelemetryEvent(binding, {
        eventName: "protected-resource-delivered",
        resourceType: "protected-resource",
        resourceId: input.resourceId,
        sourceOperationKey: `download.deliver:${input.requestId}`,
        userId: input.userId,
        requestContext: input.telemetry,
        occurredAt: new Date(input.deliveredAt),
        durableCondition,
      }),
    );
  }
  let batchFailure: unknown = null;
  try {
    await runAtomicBatch(binding, [delivery, ...telemetry]);
  } catch (error) {
    batchFailure = error;
  }

  const row = await binding
    .prepare(
      `SELECT user_id, resource_type, resource_id, media_derivative_id,
              entitlement_id, access_source, entitlement_source_type,
              entitlement_source_id, credit_reservation_id,
              stripe_environment, livemode, byte_length, delivered_at
       FROM download_events
       WHERE request_id = ?1
       LIMIT 1`,
    )
    .bind(input.requestId)
    .first<DownloadEventRow>();

  if (row && isSameEvent(row, input, snapshot)) return;
  if (!row && batchFailure !== null) throw batchFailure;
  throw new RuntimeError(
    "IDEMPOTENCY_CONFLICT",
    "The download request ID already identifies a different delivery.",
    {
      status: 409,
      publicMessage:
        "That download request was already used for another delivery.",
    },
  );
}
