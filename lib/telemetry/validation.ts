import { RuntimeError } from "@/lib/runtime/index.ts";
import {
  TELEMETRY_COLLECTION_MODES,
  TELEMETRY_EVENT_POLICY,
  PUBLIC_TELEMETRY_EVENT_NAMES,
  type TelemetryCollectionMode,
  type TelemetryConsentInput,
  type TelemetryEventInput,
  type TelemetryEventName,
  type TelemetryResourceType,
  type PublicTelemetryEventInput,
  type TelemetrySettingsInput,
} from "./types.ts";

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function invalid(message: string): never {
  throw new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid telemetry information.",
  });
}

function object(input: unknown): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    invalid("Telemetry input must be a plain object.");
  }
  return input as Record<string, unknown>;
}

function exactKeys(
  input: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(input);
  if (
    required.some((key) => !Object.hasOwn(input, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    invalid("Telemetry input contains missing or unsupported fields.");
  }
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    invalid(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

export function isTelemetryEventName(
  value: unknown,
): value is TelemetryEventName {
  return (
    typeof value === "string" && Object.hasOwn(TELEMETRY_EVENT_POLICY, value)
  );
}

export function validateTelemetryEvent(input: unknown): TelemetryEventInput {
  const candidate = object(input);
  if (!isTelemetryEventName(candidate.eventName)) {
    invalid("The telemetry event is not allowlisted.");
  }
  const eventName = candidate.eventName as TelemetryEventName;
  const meaningful = eventName === "meaningful-listen";
  exactKeys(
    candidate,
    meaningful
      ? ["eventName", "resourceType", "resourceId", "playedTimeMs"]
      : ["eventName", "resourceType", "resourceId"],
  );

  const policy = TELEMETRY_EVENT_POLICY[eventName];
  if (
    typeof candidate.resourceType !== "string" ||
    !(policy.resourceTypes as readonly string[]).includes(
      candidate.resourceType,
    )
  ) {
    invalid("The telemetry resource is not allowed for this event.");
  }
  if (
    typeof candidate.resourceId !== "string" ||
    !RESOURCE_ID_PATTERN.test(candidate.resourceId)
  ) {
    invalid("The telemetry resource identifier is invalid.");
  }

  return Object.freeze({
    eventName,
    resourceType: candidate.resourceType as TelemetryResourceType,
    resourceId: candidate.resourceId,
    ...(meaningful
      ? {
          playedTimeMs: integer(
            candidate.playedTimeMs,
            "Played time",
            0,
            86_400_000,
          ),
        }
      : {}),
  });
}

export function validatePublicTelemetryEvent(
  input: unknown,
): PublicTelemetryEventInput {
  const event = validateTelemetryEvent(input);
  if (!PUBLIC_TELEMETRY_EVENT_NAMES.includes(event.eventName as never)) {
    invalid("A browser cannot report this server-owned telemetry fact.");
  }
  if (event.resourceType === "site" && event.resourceId !== "site") {
    invalid("Site telemetry must use the exact site resource identifier.");
  }
  return event as PublicTelemetryEventInput;
}

export function validateTelemetrySettings(
  input: unknown,
): TelemetrySettingsInput {
  const candidate = object(input);
  exactKeys(candidate, [
    "collectionMode",
    "retentionDays",
    "meaningfulListenSeconds",
    "expectedRevision",
  ]);
  if (
    typeof candidate.collectionMode !== "string" ||
    !TELEMETRY_COLLECTION_MODES.includes(
      candidate.collectionMode as TelemetryCollectionMode,
    )
  ) {
    invalid("The telemetry collection mode is invalid.");
  }
  return Object.freeze({
    collectionMode: candidate.collectionMode as TelemetryCollectionMode,
    retentionDays: integer(candidate.retentionDays, "Retention days", 1, 365),
    meaningfulListenSeconds: integer(
      candidate.meaningfulListenSeconds,
      "Meaningful-listen seconds",
      5,
      300,
    ),
    expectedRevision: integer(
      candidate.expectedRevision,
      "Expected revision",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  });
}

export function validateTelemetryConsent(
  input: unknown,
): TelemetryConsentInput {
  const candidate = object(input);
  exactKeys(candidate, ["decision"]);
  if (candidate.decision !== "granted" && candidate.decision !== "denied") {
    invalid("The telemetry consent decision is invalid.");
  }
  return Object.freeze({ decision: candidate.decision });
}

export function validateUtcDay(value: unknown, label = "UTC day"): string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) {
    invalid(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    invalid(`${label} is not a calendar day.`);
  }
  return value;
}

export function validateAggregateInput(input: unknown): {
  readonly dayUtc: string;
} {
  const candidate = object(input);
  exactKeys(candidate, ["dayUtc"]);
  return Object.freeze({ dayUtc: validateUtcDay(candidate.dayUtc) });
}

export function validateEmptyTelemetryInput(input: unknown): void {
  const candidate = object(input);
  exactKeys(candidate, []);
}
