import { CORE_CAPABILITY_KEYS, isModuleKey } from "@/lib/modules/registry.ts";
import {
  TELEMETRY_EVENT_POLICY,
  validateTelemetryEvent,
  validateTelemetrySettings,
  validateUtcDay,
  type TelemetryAggregateReceipt,
  type TelemetryConsentState,
  type TelemetryPrivacySignal,
  type TelemetryPruneReceipt,
  type TelemetryRecordReceipt,
  type TelemetrySettingsReceipt,
} from "@/lib/telemetry/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeApplicationIdentityCondition,
  activeOwnerCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";

interface RuntimeSettingsRow {
  collection_mode: "disabled" | "consent_required" | "anonymous";
  retention_days: number;
  meaningful_listen_seconds: number;
  revision: number;
  updated_at: string;
  telemetry_active: number;
  source_active: number;
}

interface AggregateCountRow {
  source_event_count: number;
  group_count: number;
  session_count: number;
  linked_user_count: number;
}

interface AggregateDayRow {
  day_utc: string;
  source_event_count: number;
  group_count: number;
  session_count: number;
  linked_user_count: number;
  finalized_at: string;
}

interface MissingAggregateRow {
  day_utc: string;
}

export interface TelemetryRecordContext {
  readonly sessionId: string;
  readonly userId: string | null;
  readonly consent: TelemetryConsentState;
  readonly privacySignal: TelemetryPrivacySignal | null;
  /** Public route handlers set this to require a published browser-visible resource. */
  readonly browserObserved?: boolean;
}

const SESSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TELEMETRY_ACTIVE_SQL = `EXISTS (
  SELECT 1 FROM artist_modules
  WHERE module_key = 'telemetry' AND active = 1
)`;

function operationTime(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new RuntimeError(
      "TELEMETRY_TIME_INVALID",
      "Telemetry operation time is invalid.",
      {
        status: 400,
        publicMessage: "The telemetry operation time is invalid.",
      },
    );
  }
  return value.toISOString();
}

function ownerModuleCondition(ownerUserId: string): {
  readonly sql: string;
  readonly bindings: readonly string[];
} {
  const owner = activeOwnerCondition(ownerUserId);
  return {
    sql: `${owner.sql} AND ${TELEMETRY_ACTIVE_SQL}`,
    bindings: owner.bindings,
  };
}

function capabilityCondition(capabilityKey: string): {
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
      SELECT 1 FROM artist_modules AS source_module
      WHERE source_module.module_key = ? AND source_module.active = 1
    )`,
    bindings: [capabilityKey],
  };
}

async function readRuntimeSettings(
  binding: D1Database,
  capabilityKey: string,
): Promise<RuntimeSettingsRow> {
  const source = capabilityCondition(capabilityKey);
  const row = await binding
    .prepare(
      `SELECT settings.collection_mode, settings.retention_days,
              settings.meaningful_listen_seconds, settings.revision,
              settings.updated_at,
              CASE WHEN ${TELEMETRY_ACTIVE_SQL} THEN 1 ELSE 0 END
                AS telemetry_active,
              CASE WHEN ${source.sql} THEN 1 ELSE 0 END AS source_active
       FROM telemetry_settings AS settings
       WHERE settings.id = 'telemetry'
       LIMIT 1`,
    )
    .bind(...source.bindings)
    .first<RuntimeSettingsRow>();
  if (!row) {
    throw new RuntimeError(
      "TELEMETRY_SETTINGS_MISSING",
      "The telemetry settings singleton is missing.",
      { status: 503, publicMessage: "Audience measurement is unavailable." },
    );
  }
  return row;
}

function declinedReason(
  settings: RuntimeSettingsRow,
  context: TelemetryRecordContext,
): TelemetryRecordReceipt["reason"] | null {
  if (settings.telemetry_active !== 1 || settings.source_active !== 1) {
    return "module-inactive";
  }
  if (settings.collection_mode === "disabled") return "collection-disabled";
  if (context.privacySignal !== null) return "privacy-signal";
  if (context.consent === "denied") return "consent-denied";
  if (
    settings.collection_mode === "consent_required" &&
    context.consent !== "granted"
  ) {
    return "consent-required";
  }
  return null;
}

function publicResourceCondition(input: {
  readonly eventName: string;
  readonly resourceType: string;
  readonly resourceId: string;
}): { readonly sql: string; readonly bindings: readonly string[] } {
  switch (input.resourceType) {
    case "site":
      return {
        sql: "? = 'site'",
        bindings: [input.resourceId],
      };
    case "track":
      return {
        sql: `EXISTS (
          SELECT 1
          FROM tracks AS public_track
          JOIN track_revisions AS public_track_revision
            ON public_track_revision.id = public_track.published_revision_id
           AND public_track_revision.track_id = public_track.id
          WHERE public_track.id = ?
            AND public_track.publication_state = 'published'
            AND public_track_revision.view_mode <> 'unavailable'
            ${
              input.eventName === "playback-start" ||
              input.eventName === "meaningful-listen"
                ? "AND public_track_revision.stream_mode <> 'unavailable'"
                : ""
            }
        )`,
        bindings: [input.resourceId],
      };
    case "release":
      return {
        sql: `EXISTS (
          SELECT 1
          FROM releases AS public_release
          JOIN release_revisions AS public_release_revision
            ON public_release_revision.id = public_release.published_revision_id
           AND public_release_revision.release_id = public_release.id
          WHERE public_release.id = ?
            AND public_release.publication_state = 'published'
            AND public_release_revision.view_mode <> 'unavailable'
        )`,
        bindings: [input.resourceId],
      };
    case "course":
      return {
        sql: `EXISTS (
          SELECT 1 FROM courses AS public_course
          WHERE public_course.id = ?
            AND public_course.publication_state = 'published'
            AND public_course.published_revision_id IS NOT NULL
        )`,
        bindings: [input.resourceId],
      };
    case "video":
      return {
        sql: `EXISTS (
          SELECT 1 FROM videos AS public_video
          WHERE public_video.id = ?
            AND public_video.publication_state = 'published'
            AND public_video.published_revision_id IS NOT NULL
        )`,
        bindings: [input.resourceId],
      };
    case "update":
      return {
        sql: `EXISTS (
          SELECT 1 FROM updates AS public_update
          WHERE public_update.id = ?
            AND public_update.state = 'published'
            AND public_update.audience = 'public'
        )`,
        bindings: [input.resourceId],
      };
    case "contact":
      return {
        sql: `EXISTS (
          SELECT 1 FROM contact_forms AS public_contact
          WHERE public_contact.id = ? AND public_contact.state = 'active'
        )`,
        bindings: [input.resourceId],
      };
    case "membership":
      return {
        sql: `EXISTS (
          SELECT 1
          FROM commerce_products AS public_membership_product
          JOIN membership_plans AS public_product_membership
            ON public_product_membership.id =
               public_membership_product.membership_plan_id
          JOIN membership_plan_revisions AS public_membership_revision
            ON public_membership_revision.id =
               public_membership_product.membership_plan_revision_id
           AND public_membership_revision.membership_plan_id =
               public_product_membership.id
           AND public_membership_revision.revision =
               public_membership_product.membership_plan_revision
          WHERE public_membership_product.id = ?
            AND public_membership_product.product_type = 'membership'
            AND public_membership_product.state = 'active'
            AND public_product_membership.state = 'active'
            AND public_product_membership.current_revision =
                public_membership_product.membership_plan_revision
            AND (
              SELECT COUNT(*) FROM commerce_prices AS public_membership_price
              WHERE public_membership_price.commerce_product_id =
                    public_membership_product.id
                AND public_membership_price.active = 1
                AND public_membership_price.stripe_environment = 'test'
                AND public_membership_price.livemode = 0
            ) = 1
        )`,
        bindings: [input.resourceId],
      };
    case "license":
      return {
        sql: `EXISTS (
          SELECT 1
          FROM license_offers AS public_license_offer
          JOIN license_terms AS public_offer_terms
            ON public_offer_terms.id = public_license_offer.license_terms_id
           AND public_offer_terms.current_version =
               public_license_offer.license_terms_version
          JOIN tracks AS public_offer_track
            ON public_offer_track.id = public_license_offer.track_id
           AND public_offer_track.published_revision_id =
               public_license_offer.track_revision_id
          JOIN commerce_products AS public_license_product
            ON public_license_product.id =
               public_license_offer.commerce_product_id
           AND public_license_product.product_type = 'license'
           AND public_license_product.resource_type = 'track'
           AND public_license_product.resource_id = public_offer_track.id
          JOIN commerce_prices AS public_license_price
            ON public_license_price.id = public_license_offer.commerce_price_id
           AND public_license_price.commerce_product_id =
               public_license_product.id
          WHERE public_license_offer.id = ?
            AND public_license_offer.state = 'active'
            AND public_offer_terms.state = 'active'
            AND public_offer_track.publication_state = 'published'
            AND public_license_product.state = 'active'
            AND public_license_price.active = 1
            AND public_license_price.billing_interval = 'one_time'
            AND public_license_price.stripe_environment = 'test'
            AND public_license_price.livemode = 0
        )`,
        bindings: [input.resourceId],
      };
    default:
      return { sql: "0 = 1", bindings: [] };
  }
}

export async function recordTelemetryEvent(
  binding: D1Database,
  unsafeInput: unknown,
  context: TelemetryRecordContext,
  at = new Date(),
): Promise<TelemetryRecordReceipt> {
  const input = validateTelemetryEvent(unsafeInput);
  if (!SESSION_PATTERN.test(context.sessionId)) {
    throw new RuntimeError(
      "TELEMETRY_SESSION_INVALID",
      "Telemetry requires a server-issued random session identifier.",
      { status: 400, publicMessage: "Audience measurement could not start." },
    );
  }
  if (context.userId !== null && !USER_ID_PATTERN.test(context.userId)) {
    throw new RuntimeError(
      "TELEMETRY_USER_INVALID",
      "Telemetry received an invalid internal user identifier.",
      { status: 400, publicMessage: "Audience measurement could not start." },
    );
  }
  const timestamp = operationTime(at);
  const dayUtc = timestamp.slice(0, 10);
  const policy = TELEMETRY_EVENT_POLICY[input.eventName];
  const settings = await readRuntimeSettings(binding, policy.moduleKey);
  const reason = declinedReason(settings, context);
  if (reason) return Object.freeze({ recorded: false, reason });
  if (
    input.eventName === "meaningful-listen" &&
    input.playedTimeMs! < settings.meaningful_listen_seconds * 1000
  ) {
    return Object.freeze({ recorded: false, reason: "below-threshold" });
  }

  const source = capabilityCondition(policy.moduleKey);
  const publicResource = context.browserObserved
    ? publicResourceCondition(input)
    : { sql: "1 = 1", bindings: [] as readonly string[] };
  const consentBasis =
    settings.collection_mode === "anonymous" ? "not_required" : "explicit";
  const linkedUserId =
    settings.collection_mode === "anonymous" ? null : context.userId;
  const activeUser = linkedUserId
    ? activeApplicationIdentityCondition(linkedUserId)
    : null;
  const result = await binding
    .prepare(
      `INSERT INTO telemetry_events
        (id, session_id, user_id, event_name, resource_type, resource_id,
         consent_basis, day_utc, occurred_at, created_at)
       SELECT ?, ?,
              ${
                activeUser
                  ? `CASE WHEN ${activeUser.sql} THEN ? ELSE NULL END`
                  : "NULL"
              },
              ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM telemetry_settings AS current_settings
         WHERE current_settings.id = 'telemetry'
           AND current_settings.revision = ?
           AND current_settings.collection_mode = ?
       )
         AND ${TELEMETRY_ACTIVE_SQL}
         AND ${source.sql}
         AND ${publicResource.sql}`,
    )
    .bind(
      `telemetry_event_${crypto.randomUUID()}`,
      context.sessionId,
      ...(activeUser ? [...activeUser.bindings, linkedUserId] : []),
      input.eventName,
      input.resourceType,
      input.resourceId,
      consentBasis,
      dayUtc,
      timestamp,
      timestamp,
      settings.revision,
      settings.collection_mode,
      ...source.bindings,
      ...publicResource.bindings,
    )
    .run();

  return Object.freeze(
    changedRows(result) === 1
      ? { recorded: true, reason: "recorded" as const }
      : { recorded: false, reason: "settings-changed" as const },
  );
}

async function readOwnerSettings(
  binding: D1Database,
  ownerUserId: string,
): Promise<RuntimeSettingsRow | null> {
  const authority = ownerModuleCondition(ownerUserId);
  return binding
    .prepare(
      `SELECT settings.collection_mode, settings.retention_days,
              settings.meaningful_listen_seconds, settings.revision,
              settings.updated_at, 1 AS telemetry_active, 1 AS source_active
       FROM telemetry_settings AS settings
       WHERE settings.id = 'telemetry'
         AND ${authority.sql}
       LIMIT 1`,
    )
    .bind(...authority.bindings)
    .first<RuntimeSettingsRow>();
}

export async function updateTelemetrySettings(
  binding: D1Database,
  unsafeInput: unknown,
  context: MutationContext,
  at = new Date(),
): Promise<MutationResult<TelemetrySettingsReceipt>> {
  const input = validateTelemetrySettings(unsafeInput);
  const timestamp = operationTime(at);
  const operation = "telemetry.settings.update";
  const mutation = await prepareMutation<TelemetrySettingsReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const current = await readOwnerSettings(binding, context.actorUserId);
  if (!current) {
    throw new RuntimeError(
      "TELEMETRY_OWNER_REQUIRED",
      "Telemetry settings require live owner authority and an active module.",
      { status: 403, publicMessage: "Owner access is required." },
    );
  }
  if (current.revision !== input.expectedRevision) {
    throw staleMutation("telemetry settings");
  }
  const result: TelemetrySettingsReceipt = Object.freeze({
    collectionMode: input.collectionMode,
    retentionDays: input.retentionDays,
    meaningfulListenSeconds: input.meaningfulListenSeconds,
    revision: current.revision + 1,
    updatedAt: timestamp,
  });
  const authority = ownerModuleCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE telemetry_settings
         SET collection_mode = ?, retention_days = ?,
             meaningful_listen_seconds = ?, revision = revision + 1,
             updated_by_user_id = ?, last_operation_key = ?, updated_at = ?
         WHERE id = 'telemetry' AND revision = ?
           AND ${authority.sql}`,
      )
      .bind(
        input.collectionMode,
        input.retentionDays,
        input.meaningfulListenSeconds,
        context.actorUserId,
        mutation.namespacedKey,
        timestamp,
        input.expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "telemetry-settings",
        subjectId: "telemetry",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          collectionMode: input.collectionMode,
          retentionDays: input.retentionDays,
          meaningfulListenSeconds: input.meaningfulListenSeconds,
        },
        result: { ...result },
      },
      `EXISTS (
         SELECT 1 FROM telemetry_settings
         WHERE id = 'telemetry' AND revision = ? AND last_operation_key = ?
       ) AND ${authority.sql}`,
      [result.revision, mutation.namespacedKey, ...authority.bindings],
    ),
  ];
  try {
    const batch = await runAtomicBatch(binding, statements);
    if (changedRows(batch[0]) !== 1 || changedRows(batch[1]) !== 1) {
      throw staleMutation("telemetry settings");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function aggregateReceipt(row: AggregateDayRow): TelemetryAggregateReceipt {
  return Object.freeze({
    dayUtc: row.day_utc,
    sourceEventCount: row.source_event_count,
    groupCount: row.group_count,
    sessionCount: row.session_count,
    linkedUserCount: row.linked_user_count,
    finalizedAt: row.finalized_at,
  });
}

async function readAggregateDay(
  binding: D1Database,
  dayUtc: string,
  ownerUserId: string,
): Promise<AggregateDayRow | null> {
  const authority = ownerModuleCondition(ownerUserId);
  return binding
    .prepare(
      `SELECT day_utc, source_event_count, group_count,
              session_count, linked_user_count, finalized_at
       FROM telemetry_aggregate_days
       WHERE day_utc = ? AND ${authority.sql}
       LIMIT 1`,
    )
    .bind(dayUtc, ...authority.bindings)
    .first<AggregateDayRow>();
}

export async function aggregateTelemetryDay(
  binding: D1Database,
  unsafeDayUtc: unknown,
  context: MutationContext,
  at = new Date(),
): Promise<MutationResult<TelemetryAggregateReceipt>> {
  const dayUtc = validateUtcDay(unsafeDayUtc);
  const timestamp = operationTime(at);
  if (dayUtc >= timestamp.slice(0, 10)) {
    throw new RuntimeError(
      "TELEMETRY_DAY_OPEN",
      "Telemetry aggregation only finalizes a completed UTC day.",
      { status: 409, publicMessage: "Choose a completed UTC day." },
    );
  }
  const operation = "telemetry.day.aggregate";
  const mutation = await prepareMutation<TelemetryAggregateReceipt>(
    binding,
    operation,
    context,
    { dayUtc },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const existing = await readAggregateDay(binding, dayUtc, context.actorUserId);
  if (existing) return { value: aggregateReceipt(existing), replayed: true };

  const authority = ownerModuleCondition(context.actorUserId);
  const count = await binding
    .prepare(
      `SELECT COUNT(*) AS source_event_count,
              COUNT(DISTINCT json_array(event_name, resource_type, resource_id))
                AS group_count,
              COUNT(DISTINCT session_id) AS session_count,
              COUNT(DISTINCT user_id) AS linked_user_count
       FROM telemetry_events
       WHERE day_utc = ? AND ${authority.sql}`,
    )
    .bind(dayUtc, ...authority.bindings)
    .first<AggregateCountRow>();
  if (!count || count.source_event_count < 1 || count.group_count < 1) {
    throw new RuntimeError(
      "TELEMETRY_DAY_EMPTY",
      "The selected telemetry day has no events to aggregate.",
      { status: 409, publicMessage: "That UTC day has no telemetry events." },
    );
  }
  const result = Object.freeze({
    dayUtc,
    sourceEventCount: count.source_event_count,
    groupCount: count.group_count,
    sessionCount: count.session_count,
    linkedUserCount: count.linked_user_count,
    finalizedAt: timestamp,
  });
  const statements = [
    binding
      .prepare(
        `INSERT INTO telemetry_daily_aggregates
          (id, day_utc, event_name, resource_type, resource_id,
           event_count, session_count, linked_user_count,
           aggregated_at, updated_at)
         SELECT 'telemetry_daily:' || event.day_utc || ':' || event.event_name ||
                  ':' || event.resource_type || ':' || event.resource_id,
                event.day_utc, event.event_name, event.resource_type,
                event.resource_id, COUNT(*), COUNT(DISTINCT event.session_id),
                COUNT(DISTINCT event.user_id), ?, ?
         FROM telemetry_events AS event
         WHERE event.day_utc = ? AND ${authority.sql}
         GROUP BY event.day_utc, event.event_name,
                  event.resource_type, event.resource_id
         ON CONFLICT(day_utc, event_name, resource_type, resource_id)
         DO NOTHING`,
      )
      .bind(timestamp, timestamp, dayUtc, ...authority.bindings),
    binding
      .prepare(
        `INSERT INTO telemetry_aggregate_days
          (day_utc, source_event_count, group_count,
           session_count, linked_user_count, finalized_at,
           last_operation_key, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${authority.sql}
           AND NOT EXISTS (
             SELECT 1 FROM telemetry_aggregate_days WHERE day_utc = ?
           )`,
      )
      .bind(
        dayUtc,
        result.sourceEventCount,
        result.groupCount,
        result.sessionCount,
        result.linkedUserCount,
        timestamp,
        mutation.namespacedKey,
        timestamp,
        timestamp,
        ...authority.bindings,
        dayUtc,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "telemetry-day",
        subjectId: dayUtc,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { dayUtc },
        result: { ...result },
      },
      `EXISTS (
         SELECT 1 FROM telemetry_aggregate_days
         WHERE day_utc = ? AND last_operation_key = ?
           AND source_event_count = ? AND group_count = ?
           AND session_count = ? AND linked_user_count = ?
       ) AND ${authority.sql}`,
      [
        dayUtc,
        mutation.namespacedKey,
        result.sourceEventCount,
        result.groupCount,
        result.sessionCount,
        result.linkedUserCount,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const batch = await runAtomicBatch(binding, statements);
    if (changedRows(batch[1]) === 1 && changedRows(batch[2]) === 1) {
      return { value: result, replayed: false };
    }
    const winner = await readAggregateDay(binding, dayUtc, context.actorUserId);
    if (winner) return { value: aggregateReceipt(winner), replayed: true };
    throw staleMutation("telemetry day");
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function cutoffDay(at: Date, retentionDays: number): string {
  const cutoff = new Date(at.valueOf());
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString().slice(0, 10);
}

export async function pruneTelemetryEvents(
  binding: D1Database,
  context: MutationContext,
  at = new Date(),
): Promise<MutationResult<TelemetryPruneReceipt>> {
  const timestamp = operationTime(at);
  const operation = "telemetry.events.prune";
  const mutation = await prepareMutation<TelemetryPruneReceipt>(
    binding,
    operation,
    context,
    {},
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const settings = await readOwnerSettings(binding, context.actorUserId);
  if (!settings) {
    throw new RuntimeError(
      "TELEMETRY_OWNER_REQUIRED",
      "Telemetry pruning requires live owner authority and an active module.",
      { status: 403, publicMessage: "Owner access is required." },
    );
  }
  const cutoffDayUtc = cutoffDay(at, settings.retention_days);
  const authority = ownerModuleCondition(context.actorUserId);
  const missing = await binding
    .prepare(
      `WITH eligible AS (
         SELECT event.day_utc, COUNT(*) AS source_event_count
         FROM telemetry_events AS event
         WHERE event.day_utc < ? AND ${authority.sql}
         GROUP BY event.day_utc
       )
       SELECT eligible.day_utc
       FROM eligible
       LEFT JOIN telemetry_aggregate_days AS aggregate_day
         ON aggregate_day.day_utc = eligible.day_utc
       WHERE aggregate_day.day_utc IS NULL
          OR aggregate_day.source_event_count <> eligible.source_event_count
          OR aggregate_day.group_count <> (
            SELECT COUNT(*)
            FROM telemetry_daily_aggregates AS daily
            WHERE daily.day_utc = eligible.day_utc
          )
       LIMIT 1`,
    )
    .bind(cutoffDayUtc, ...authority.bindings)
    .first<MissingAggregateRow>();
  if (missing) {
    throw new RuntimeError(
      "TELEMETRY_AGGREGATION_REQUIRED",
      `Telemetry day ${missing.day_utc} must be aggregated before pruning.`,
      {
        status: 409,
        publicMessage: `Aggregate ${missing.day_utc} before pruning retained events.`,
      },
    );
  }
  const count = await binding
    .prepare(
      `SELECT COUNT(*) AS source_event_count, 0 AS group_count
       FROM telemetry_events
       WHERE day_utc < ? AND ${authority.sql}`,
    )
    .bind(cutoffDayUtc, ...authority.bindings)
    .first<AggregateCountRow>();
  const result: TelemetryPruneReceipt = Object.freeze({
    cutoffDayUtc,
    deletedEventCount: count?.source_event_count ?? 0,
    retentionDays: settings.retention_days,
    prunedAt: timestamp,
  });
  const settingsCondition = `EXISTS (
    SELECT 1 FROM telemetry_settings
    WHERE id = 'telemetry' AND revision = ? AND retention_days = ?
  )`;
  const statements = [
    binding
      .prepare(
        `DELETE FROM telemetry_events
         WHERE day_utc < ?
           AND ${settingsCondition}
           AND ${authority.sql}
           AND NOT EXISTS (
             SELECT 1
             FROM (
               SELECT event.day_utc, COUNT(*) AS event_count
               FROM telemetry_events AS event
               WHERE event.day_utc < ?
               GROUP BY event.day_utc
             ) AS eligible
             LEFT JOIN telemetry_aggregate_days AS aggregate_day
               ON aggregate_day.day_utc = eligible.day_utc
             WHERE aggregate_day.day_utc IS NULL
                OR aggregate_day.source_event_count <> eligible.event_count
                OR aggregate_day.group_count <> (
                  SELECT COUNT(*) FROM telemetry_daily_aggregates AS daily
                  WHERE daily.day_utc = eligible.day_utc
                )
           )`,
      )
      .bind(
        cutoffDayUtc,
        settings.revision,
        settings.retention_days,
        ...authority.bindings,
        cutoffDayUtc,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "telemetry-retention",
        subjectId: cutoffDayUtc,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          cutoffDayUtc,
          retentionDays: settings.retention_days,
        },
        result: { ...result },
      },
      `${settingsCondition} AND ${authority.sql}
       AND NOT EXISTS (
         SELECT 1 FROM telemetry_events WHERE day_utc < ?
       )`,
      [
        settings.revision,
        settings.retention_days,
        ...authority.bindings,
        cutoffDayUtc,
      ],
    ),
  ];

  try {
    const batch = await runAtomicBatch(binding, statements);
    if (
      changedRows(batch[0]) !== result.deletedEventCount ||
      changedRows(batch[1]) !== 1
    ) {
      throw staleMutation("telemetry retention state");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
