import { activeApplicationIdentityCondition } from "./authority-guards.ts";
import { CORE_CAPABILITY_KEYS, isModuleKey } from "@/lib/modules/registry.ts";
import {
  TELEMETRY_EVENT_POLICY,
  validateTelemetryEvent,
  type TelemetryEventName,
  type TelemetryResourceType,
} from "@/lib/telemetry/index.ts";
import type { TelemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

const SERVER_TELEMETRY_EVENT_NAMES = Object.freeze([
  "contact-submitted",
  "download-delivered",
  "favorite-saved",
  "lesson-completed",
  "license-issued",
  "membership-activated",
  "playlist-updated",
  "protected-resource-delivered",
  "subscription-activated",
  "subscription-canceled",
  "update-read",
] as const satisfies readonly TelemetryEventName[]);

export type ServerTelemetryEventName =
  (typeof SERVER_TELEMETRY_EVENT_NAMES)[number];

export interface ServerTelemetryDurableCondition {
  readonly sql: string;
  readonly bindings: readonly unknown[];
}

export interface ServerTelemetryEventInput {
  readonly eventName: ServerTelemetryEventName;
  readonly resourceType: TelemetryResourceType;
  readonly resourceId: string;
  /** The exact namespaced mutation or durable-delivery operation key. */
  readonly sourceOperationKey: string;
  /** The subject identity, linked only with explicit consent and live authority. */
  readonly userId: string | null;
  readonly requestContext?: TelemetryMutationRequestContext;
  readonly durableCondition: ServerTelemetryDurableCondition;
  readonly occurredAt?: Date;
}

const TELEMETRY_ACTIVE_SQL = `EXISTS (
  SELECT 1 FROM artist_modules
  WHERE module_key = 'telemetry' AND active = 1
)`;
const SESSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function noWrite(binding: D1Database): D1PreparedStatement {
  return binding.prepare("SELECT 1 WHERE 0 = 1");
}

function sourceCapabilityCondition(capabilityKey: string): {
  readonly sql: string;
  readonly bindings: readonly string[];
} {
  if (CORE_CAPABILITY_KEYS.includes(capabilityKey as never)) {
    return { sql: "1 = 1", bindings: [] };
  }
  if (!isModuleKey(capabilityKey)) {
    throw new TypeError("Telemetry policy contains an unknown capability.");
  }
  return {
    sql: `EXISTS (
      SELECT 1 FROM artist_modules AS telemetry_source_module
      WHERE telemetry_source_module.module_key = ?
        AND telemetry_source_module.active = 1
    )`,
    bindings: [capabilityKey],
  };
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function eventId(input: ServerTelemetryEventInput): Promise<string> {
  const bytes = await digest(
    `event:${input.sourceOperationKey}:${input.eventName}:${input.resourceType}:${input.resourceId}`,
  );
  return `telemetry_server_${hex(bytes)}`;
}

async function operationSessionId(sourceOperationKey: string): Promise<string> {
  const bytes = await digest(`session:${sourceOperationKey}`);
  const uuid = bytes.slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const value = hex(uuid);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

/**
 * Prepares one replay-safe server-owned telemetry insert for the same D1 batch
 * as its durable source mutation. The statement becomes a no-op whenever the
 * current module, collection mode, explicit consent, or browser privacy signal
 * does not permit collection.
 */
export async function prepareServerTelemetryEvent(
  binding: D1Database,
  input: ServerTelemetryEventInput,
): Promise<D1PreparedStatement> {
  const event = validateTelemetryEvent({
    eventName: input.eventName,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
  if (!SERVER_TELEMETRY_EVENT_NAMES.includes(event.eventName as never)) {
    throw new TypeError("A server-owned telemetry event is required.");
  }
  if (
    input.sourceOperationKey.length < 1 ||
    input.sourceOperationKey.length > 512 ||
    !input.durableCondition.sql.trim() ||
    input.durableCondition.sql.includes(";") ||
    (input.userId !== null && !SAFE_ID.test(input.userId))
  ) {
    throw new TypeError("A valid durable telemetry source is required.");
  }
  const occurredAt = input.occurredAt ?? new Date();
  if (Number.isNaN(occurredAt.valueOf())) {
    throw new TypeError("A valid telemetry occurrence time is required.");
  }
  const requestContext = input.requestContext;
  if (
    requestContext?.privacySignal !== null &&
    requestContext?.privacySignal !== undefined
  ) {
    return noWrite(binding);
  }
  if (requestContext?.consent === "denied") return noWrite(binding);

  const sessionId =
    requestContext?.sessionId ??
    (await operationSessionId(input.sourceOperationKey));
  if (!SESSION_PATTERN.test(sessionId)) {
    throw new TypeError("A valid server-issued telemetry session is required.");
  }
  const timestamp = occurredAt.toISOString();
  const collectionModeSql =
    requestContext?.consent === "granted"
      ? "settings.collection_mode IN ('consent_required', 'anonymous')"
      : "settings.collection_mode = 'anonymous'";
  const source = sourceCapabilityCondition(
    TELEMETRY_EVENT_POLICY[event.eventName].moduleKey,
  );
  const activeUser =
    input.userId === null
      ? null
      : activeApplicationIdentityCondition(input.userId);
  const stableEventId = await eventId(input);

  return binding
    .prepare(
      `INSERT INTO telemetry_events
        (id, session_id, user_id, event_name, resource_type, resource_id,
         consent_basis, day_utc, occurred_at, created_at)
       SELECT ?, ?,
              ${
                activeUser
                  ? `CASE
                       WHEN settings.collection_mode = 'anonymous' THEN NULL
                       WHEN ${activeUser.sql} THEN ?
                       ELSE NULL
                     END`
                  : "NULL"
              },
              ?, ?, ?,
              CASE WHEN settings.collection_mode = 'anonymous'
                   THEN 'not_required' ELSE 'explicit' END,
              ?, ?, ?
       FROM telemetry_settings AS settings
       WHERE settings.id = 'telemetry'
         AND ${collectionModeSql}
         AND ${TELEMETRY_ACTIVE_SQL}
         AND ${source.sql}
         AND (${input.durableCondition.sql})
         AND NOT EXISTS (
           SELECT 1
           FROM telemetry_aggregate_days AS finalized_day
           WHERE finalized_day.day_utc = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM telemetry_events WHERE id = ?
         )
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      stableEventId,
      sessionId,
      ...(activeUser ? [...activeUser.bindings, input.userId] : []),
      event.eventName,
      event.resourceType,
      event.resourceId,
      timestamp.slice(0, 10),
      timestamp,
      timestamp,
      ...source.bindings,
      ...input.durableCondition.bindings,
      timestamp.slice(0, 10),
      stableEventId,
    );
}
