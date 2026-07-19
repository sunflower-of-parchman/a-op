import {
  TELEMETRY_EVENT_POLICY,
  isTelemetryEventName,
  makeTelemetryPublicConfiguration,
  readTelemetryConsent,
  readTelemetryPrivacySignal,
  type TelemetryAdminWorkspaceDTO,
  type TelemetryAggregateReceipt,
  type TelemetryAggregateRowDTO,
  type TelemetryCollectionMode,
  type TelemetryPublicConfiguration,
  type TelemetryResourceType,
  type TelemetrySettingsDTO,
} from "@/lib/telemetry/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { activeOwnerCondition } from "./authority-guards.ts";

interface TelemetryRuntimeRow {
  collection_mode: unknown;
  retention_days: unknown;
  meaningful_listen_seconds: unknown;
  revision: unknown;
  updated_at: unknown;
  telemetry_active: unknown;
}

interface AggregateRow {
  day_utc: unknown;
  event_name: unknown;
  resource_type: unknown;
  resource_id: unknown;
  event_count: unknown;
  session_count: unknown;
  linked_user_count: unknown;
  state: unknown;
}

interface AggregateDayRow {
  day_utc: unknown;
  source_event_count: unknown;
  group_count: unknown;
  session_count: unknown;
  linked_user_count: unknown;
  finalized_at: unknown;
}

interface LiveTotalsRow {
  event_count: unknown;
  session_count: unknown;
  linked_user_count: unknown;
}

function integrity(message: string): never {
  throw new RuntimeError("TELEMETRY_INTEGRITY_INVALID", message, {
    status: 500,
    publicMessage: "The saved telemetry state could not be read safely.",
  });
}

function mode(value: unknown): TelemetryCollectionMode {
  if (
    value !== "disabled" &&
    value !== "consent_required" &&
    value !== "anonymous"
  ) {
    integrity("D1 returned an invalid telemetry collection mode.");
  }
  return value as TelemetryCollectionMode;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    /[\u0000\u007f]/.test(value)
  ) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as string;
}

function timestamp(value: unknown, label: string): string {
  const output = text(value, label);
  if (!Number.isFinite(Date.parse(output))) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return output;
}

function day(value: unknown): string {
  const output = text(value, "telemetry UTC day");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(output)) {
    integrity("D1 returned an invalid telemetry UTC day.");
  }
  return output;
}

function mapSettings(row: TelemetryRuntimeRow): TelemetrySettingsDTO {
  return Object.freeze({
    collectionMode: mode(row.collection_mode),
    retentionDays: integer(row.retention_days, "retention period", 1),
    meaningfulListenSeconds: integer(
      row.meaningful_listen_seconds,
      "meaningful-listen threshold",
      1,
    ),
    revision: integer(row.revision, "telemetry settings revision", 1),
    updatedAt: timestamp(row.updated_at, "telemetry settings update time"),
  });
}

async function readRuntimeRow(
  binding: D1Database,
): Promise<TelemetryRuntimeRow> {
  const row = await binding
    .prepare(
      `SELECT settings.collection_mode, settings.retention_days,
              settings.meaningful_listen_seconds, settings.revision,
              settings.updated_at,
              CASE WHEN EXISTS (
                SELECT 1 FROM artist_modules
                WHERE module_key = 'telemetry' AND active = 1
              ) THEN 1 ELSE 0 END AS telemetry_active
       FROM telemetry_settings AS settings
       WHERE settings.id = 'telemetry'
       LIMIT 1`,
    )
    .first<TelemetryRuntimeRow>();
  if (!row) integrity("D1 is missing the telemetry settings singleton.");
  return row as TelemetryRuntimeRow;
}

export async function readTelemetryPublicConfiguration(
  binding: D1Database,
  requestHeaders: Headers,
  consentOverride?: "granted" | "denied",
): Promise<TelemetryPublicConfiguration> {
  const row = await readRuntimeRow(binding);
  const settings = mapSettings(row);
  return makeTelemetryPublicConfiguration({
    active: row.telemetry_active === 1,
    collectionMode: settings.collectionMode,
    consent: consentOverride ?? readTelemetryConsent(requestHeaders),
    privacySignal: readTelemetryPrivacySignal(requestHeaders),
    meaningfulListenSeconds: settings.meaningfulListenSeconds,
    settingsRevision: settings.revision,
  });
}

export async function readTelemetrySettings(
  binding: D1Database,
): Promise<TelemetrySettingsDTO> {
  return mapSettings(await readRuntimeRow(binding));
}

function mapAggregate(row: AggregateRow): TelemetryAggregateRowDTO {
  if (!isTelemetryEventName(row.event_name)) {
    integrity("D1 returned an unsupported aggregate event.");
  }
  const eventName = row.event_name;
  const policy = TELEMETRY_EVENT_POLICY[eventName];
  if (
    typeof row.resource_type !== "string" ||
    !(policy.resourceTypes as readonly string[]).includes(row.resource_type)
  ) {
    integrity("D1 returned an unsupported aggregate resource type.");
  }
  if (row.state !== "finalized" && row.state !== "live") {
    integrity("D1 returned an invalid aggregate state.");
  }
  return Object.freeze({
    dayUtc: day(row.day_utc),
    eventName,
    resourceType: row.resource_type as TelemetryResourceType,
    resourceId: text(row.resource_id, "aggregate resource ID"),
    eventCount: integer(row.event_count, "aggregate event count", 1),
    sessionCount: integer(row.session_count, "aggregate session count", 1),
    linkedUserCount: integer(
      row.linked_user_count,
      "aggregate linked-user count",
    ),
    state: row.state,
  });
}

function mapAggregateDay(row: AggregateDayRow): TelemetryAggregateReceipt {
  return Object.freeze({
    dayUtc: day(row.day_utc),
    sourceEventCount: integer(
      row.source_event_count,
      "aggregate source-event count",
      1,
    ),
    groupCount: integer(row.group_count, "aggregate group count", 1),
    sessionCount: integer(row.session_count, "aggregate session count", 1),
    linkedUserCount: integer(
      row.linked_user_count,
      "aggregate linked-user count",
    ),
    finalizedAt: timestamp(row.finalized_at, "aggregate finalization time"),
  });
}

export async function readTelemetryAdminWorkspace(
  binding: D1Database,
  ownerUserId: string,
  fromDayUtc: string,
  toDayUtc: string,
  at = new Date(),
): Promise<TelemetryAdminWorkspaceDTO> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDayUtc) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDayUtc) ||
    fromDayUtc > toDayUtc
  ) {
    throw new RuntimeError(
      "TELEMETRY_RANGE_INVALID",
      "Telemetry range is invalid.",
      {
        status: 400,
        publicMessage: "Choose a valid telemetry date range.",
      },
    );
  }
  const owner = activeOwnerCondition(ownerUserId);
  const authoritySql = `${owner.sql} AND EXISTS (
    SELECT 1 FROM artist_modules
    WHERE module_key = 'telemetry' AND active = 1
  )`;
  const settingsRow = await binding
    .prepare(
      `SELECT settings.collection_mode, settings.retention_days,
              settings.meaningful_listen_seconds, settings.revision,
              settings.updated_at, 1 AS telemetry_active
       FROM telemetry_settings AS settings
       WHERE settings.id = 'telemetry'
         AND ${authoritySql}
       LIMIT 1`,
    )
    .bind(...owner.bindings)
    .first<TelemetryRuntimeRow>();
  if (!settingsRow) {
    throw new RuntimeError(
      "TELEMETRY_OWNER_REQUIRED",
      "Telemetry administration requires live owner authority and an active module.",
      { status: 403, publicMessage: "Owner access is required." },
    );
  }

  if (!(at instanceof Date) || Number.isNaN(at.valueOf())) {
    throw new TypeError("Telemetry administration time must be valid.");
  }
  const currentDay = at.toISOString().slice(0, 10);
  const [finalized, live, aggregateDays, liveTotals] = await Promise.all([
    binding
      .prepare(
        `SELECT aggregate.day_utc, aggregate.event_name,
                aggregate.resource_type, aggregate.resource_id,
                aggregate.event_count, aggregate.session_count,
                aggregate.linked_user_count, 'finalized' AS state
         FROM telemetry_daily_aggregates AS aggregate
         WHERE aggregate.day_utc BETWEEN ? AND ?
           AND ${authoritySql}
         ORDER BY aggregate.day_utc DESC, aggregate.event_count DESC,
                  aggregate.event_name, aggregate.resource_id`,
      )
      .bind(fromDayUtc, toDayUtc, ...owner.bindings)
      .all<AggregateRow>(),
    currentDay >= fromDayUtc && currentDay <= toDayUtc
      ? binding
          .prepare(
            `SELECT event.day_utc, event.event_name, event.resource_type,
                    event.resource_id, COUNT(*) AS event_count,
                    COUNT(DISTINCT event.session_id) AS session_count,
                    COUNT(DISTINCT event.user_id) AS linked_user_count,
                    'live' AS state
             FROM telemetry_events AS event
             WHERE event.day_utc = ?
               AND ${authoritySql}
             GROUP BY event.day_utc, event.event_name,
                      event.resource_type, event.resource_id
             ORDER BY event_count DESC, event.event_name, event.resource_id`,
          )
          .bind(currentDay, ...owner.bindings)
          .all<AggregateRow>()
      : Promise.resolve({ results: [] as AggregateRow[] }),
    binding
      .prepare(
        `SELECT aggregate_day.day_utc, aggregate_day.source_event_count,
                aggregate_day.group_count, aggregate_day.session_count,
                aggregate_day.linked_user_count, aggregate_day.finalized_at
         FROM telemetry_aggregate_days AS aggregate_day
         WHERE aggregate_day.day_utc BETWEEN ? AND ?
           AND ${authoritySql}
         ORDER BY aggregate_day.day_utc DESC`,
      )
      .bind(fromDayUtc, toDayUtc, ...owner.bindings)
      .all<AggregateDayRow>(),
    currentDay >= fromDayUtc && currentDay <= toDayUtc
      ? binding
          .prepare(
            `SELECT COUNT(*) AS event_count,
                    COUNT(DISTINCT event.session_id) AS session_count,
                    COUNT(DISTINCT event.user_id) AS linked_user_count
             FROM telemetry_events AS event
             WHERE event.day_utc = ?
               AND ${authoritySql}`,
          )
          .bind(currentDay, ...owner.bindings)
          .first<LiveTotalsRow>()
      : Promise.resolve(null),
  ]);
  const rows = Object.freeze(
    [...finalized.results, ...live.results].map(mapAggregate),
  );

  return Object.freeze({
    settings: mapSettings(settingsRow),
    range: Object.freeze({ fromDayUtc, toDayUtc }),
    totals: Object.freeze(
      aggregateDays.results.reduce(
        (total, row) => ({
          eventCount:
            total.eventCount +
            integer(row.source_event_count, "aggregate source-event count", 1),
          sessionCount:
            total.sessionCount +
            integer(row.session_count, "aggregate session count", 1),
          linkedUserCount:
            total.linkedUserCount +
            integer(row.linked_user_count, "aggregate linked-user count"),
        }),
        {
          eventCount: liveTotals
            ? integer(liveTotals.event_count, "live event count")
            : 0,
          sessionCount: liveTotals
            ? integer(liveTotals.session_count, "live session count")
            : 0,
          linkedUserCount: liveTotals
            ? integer(liveTotals.linked_user_count, "live linked-user count")
            : 0,
        },
      ),
    ),
    rows,
    finalizedDays: Object.freeze(aggregateDays.results.map(mapAggregateDay)),
  });
}
