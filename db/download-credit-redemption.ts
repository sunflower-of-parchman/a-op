import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeCustomerCondition } from "./authority-guards.ts";
import { readTrackDownloadDelivery } from "./catalog-media.ts";
import { readCustomerCreditAccountDetail } from "./credit-ledger-read.ts";
import {
  consumeCreditReservation,
  reserveCustomerCredits,
} from "./credit-ledger-write.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  CreditAccountDetailDTO,
  CreditLedgerEntryDTO,
  CreditReservationDTO,
} from "@/lib/benefit-credits/index.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { createMutationFingerprint } from "@/lib/runtime/idempotency.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface DownloadTargetRow {
  readonly track_id: unknown;
  readonly track_slug: unknown;
  readonly track_revision_id: unknown;
  readonly title: unknown;
}

interface CreditEntitlementRow {
  readonly id: unknown;
  readonly source_id: unknown;
  readonly resource_id: unknown;
  readonly actions_json: unknown;
  readonly state: unknown;
  readonly starts_at: unknown;
  readonly credit_reservation_id: unknown;
  readonly revision: unknown;
  readonly last_operation_key: unknown;
}

interface PreparedEntitlementAuditRow {
  readonly subject_id: unknown;
  readonly result_json: unknown;
}

interface SqlDownloadCondition {
  readonly sql: string;
  readonly bindings: readonly string[];
}

interface DownloadCreditIdentity {
  readonly reservationRequestId: string;
  readonly reserveOperationId: string;
  readonly consumeOperationId: string;
  readonly prepareEntitlementOperationId: string;
  readonly activateEntitlementOperationId: string;
  readonly entitlementSourceId: string;
}

interface ExactDownloadTarget {
  readonly trackId: string;
  readonly trackSlug: string;
  readonly trackRevisionId: string;
  readonly title: string;
}

export type DownloadCreditTargetState =
  | "available"
  | "prepared"
  | "reserved"
  | "consumed"
  | "redeemed"
  | "unavailable";

export interface DownloadCreditTargetDTO extends ExactDownloadTarget {
  readonly state: DownloadCreditTargetState;
  readonly creditReservationId: string | null;
  readonly creditLedgerEntryId: string | null;
  readonly entitlementId: string | null;
  readonly downloadUrl: string | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface DownloadCreditRedemptionReceipt extends ExactDownloadTarget {
  readonly creditReservationId: string;
  readonly creditLedgerEntryId: string;
  readonly entitlementId: string;
  readonly downloadUrl: string;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

interface PendingDownloadCreditEntitlementReceipt extends ExactDownloadTarget {
  readonly entitlementId: string;
  readonly entitlementSourceId: string;
  readonly preparedOperationKey: string;
  readonly startsAt: string;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVATION_EXPIRES_AT = "9999-12-31T23:59:59.999Z";
const PENDING_ENTITLEMENT_STARTS_AT = "9999-12-31T23:59:59.999Z";

function redemptionError(
  code: string,
  message: string,
  publicMessage: string,
  status = 409,
): RuntimeError {
  return new RuntimeError(code, message, { status, publicMessage });
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_INTEGRITY_INVALID",
      `D1 returned an unsafe ${label}.`,
      "The download-credit history needs reconciliation.",
      500,
    );
  }
  return value;
}

function requestedTrackId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_INPUT_INVALID",
      "Download-credit redemption requires a safe track ID.",
      "Choose a valid protected track.",
      400,
    );
  }
  return value;
}

function operationTime(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_INPUT_INVALID",
      "Download-credit redemption requires a valid operation time.",
      "The download-credit redemption time is invalid.",
      400,
    );
  }
  return value.toISOString();
}

function title(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_INTEGRITY_INVALID",
      "D1 returned an invalid protected-track title.",
      "The protected track needs review.",
      500,
    );
  }
  return value;
}

function slug(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SLUG.test(value)) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_INTEGRITY_INVALID",
      "D1 returned an unsafe protected-track slug.",
      "The protected track needs review.",
      500,
    );
  }
  return value;
}

function mapTargetRow(row: DownloadTargetRow): ExactDownloadTarget {
  return Object.freeze({
    trackId: safeId(row.track_id, "track ID"),
    trackSlug: slug(row.track_slug),
    trackRevisionId: safeId(row.track_revision_id, "track revision ID"),
    title: title(row.title),
  });
}

function exactProtectedDownloadDeliveryCondition(
  target: Pick<ExactDownloadTarget, "trackId" | "trackRevisionId">,
): SqlDownloadCondition {
  return Object.freeze({
    sql: `EXISTS (
      SELECT 1 FROM artist_modules
      WHERE module_key = 'downloads' AND active = 1
    )
    AND EXISTS (
      SELECT 1
      FROM tracks AS guarded_track
      JOIN track_revisions AS guarded_revision
        ON guarded_revision.id = guarded_track.published_revision_id
       AND guarded_revision.track_id = guarded_track.id
      JOIN media_derivatives AS guarded_derivative
        ON guarded_derivative.id = guarded_revision.download_derivative_id
       AND guarded_derivative.source_media_id = guarded_revision.original_media_id
      JOIN media_objects AS guarded_source
        ON guarded_source.id = guarded_derivative.source_media_id
      WHERE guarded_track.id = ?
        AND guarded_track.publication_state = 'published'
        AND guarded_revision.id = ?
        AND guarded_revision.download_mode = 'protected'
        AND guarded_derivative.kind = 'download'
        AND guarded_derivative.status = 'ready'
        AND guarded_derivative.approval_state = 'approved'
        AND guarded_derivative.object_key GLOB 'derivatives/*'
        AND guarded_derivative.content_type LIKE 'audio/%'
        AND guarded_derivative.format IS NOT NULL
        AND guarded_derivative.byte_length IS NOT NULL
        AND guarded_derivative.content_sha256 IS NOT NULL
        AND guarded_source.kind = 'audio'
        AND guarded_source.status = 'ready'
        AND guarded_source.approval_state = 'approved'
        AND guarded_source.content_type LIKE 'audio/%'
        AND guarded_source.content_sha256 IS NOT NULL
    )`,
    bindings: Object.freeze([target.trackId, target.trackRevisionId]),
  });
}

async function readTargetRows(
  binding: D1Database,
  trackId: string | null,
): Promise<readonly ExactDownloadTarget[]> {
  const result = await binding
    .prepare(
      `SELECT track.id AS track_id, track.slug AS track_slug,
              revision.id AS track_revision_id, revision.title AS title
       FROM tracks AS track
       JOIN track_revisions AS revision
         ON revision.id = track.published_revision_id
        AND revision.track_id = track.id
       WHERE (? IS NULL OR track.id = ?)
         AND track.publication_state = 'published'
         AND revision.download_mode = 'protected'
       ORDER BY revision.title, track.id`,
    )
    .bind(trackId, trackId)
    .all<DownloadTargetRow>();

  const targets: ExactDownloadTarget[] = [];
  for (const row of result.results ?? []) {
    const target = mapTargetRow(row);
    const delivery = await readTrackDownloadDelivery(
      binding,
      target.trackId,
      target.trackRevisionId,
    );
    if (
      delivery?.downloadMode === "protected" &&
      delivery.revisionId === target.trackRevisionId
    ) {
      targets.push(target);
    }
  }
  return Object.freeze(targets);
}

function preparedTargetFromAudit(
  row: PreparedEntitlementAuditRow,
): ExactDownloadTarget {
  if (typeof row.result_json !== "string") {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
      "The prepared entitlement audit result is missing.",
      "The prepared download entitlement needs reconciliation.",
      500,
    );
  }
  let result: unknown;
  try {
    result = JSON.parse(row.result_json);
  } catch {
    result = null;
  }
  if (
    typeof result !== "object" ||
    result === null ||
    (result as { entitlementId?: unknown }).entitlementId !== row.subject_id ||
    (result as { stripeEnvironment?: unknown }).stripeEnvironment !== "test" ||
    (result as { livemode?: unknown }).livemode !== false
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
      "The prepared entitlement audit result does not match its Test-mode subject.",
      "The prepared download entitlement needs reconciliation.",
      500,
    );
  }
  return mapTargetRow({
    track_id: (result as { trackId?: unknown }).trackId,
    track_slug: (result as { trackSlug?: unknown }).trackSlug,
    track_revision_id: (result as { trackRevisionId?: unknown })
      .trackRevisionId,
    title: (result as { title?: unknown }).title,
  });
}

async function readPreparedTargetHistory(
  binding: D1Database,
  customerUserId: string,
): Promise<readonly ExactDownloadTarget[]> {
  const result = await binding
    .prepare(
      `SELECT subject_id, result_json
       FROM audit_events
       WHERE actor_user_id = ?
         AND action = 'download-credit.prepare-entitlement'
         AND subject_type = 'entitlement'
       ORDER BY created_at, rowid`,
    )
    .bind(customerUserId)
    .all<PreparedEntitlementAuditRow>();
  const targets = new Map<string, ExactDownloadTarget>();
  for (const row of result.results ?? []) {
    const target = preparedTargetFromAudit(row);
    const existing = targets.get(target.trackId);
    if (
      existing &&
      (existing.trackRevisionId !== target.trackRevisionId ||
        existing.trackSlug !== target.trackSlug ||
        existing.title !== target.title)
    ) {
      throw redemptionError(
        "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
        "Prepared entitlement history contains conflicting target snapshots.",
        "The prepared download entitlement needs reconciliation.",
        500,
      );
    }
    targets.set(target.trackId, target);
  }
  return Object.freeze([...targets.values()]);
}

async function requireExactTarget(
  binding: D1Database,
  trackId: string,
): Promise<ExactDownloadTarget> {
  const targets = await readTargetRows(binding, trackId);
  if (targets.length !== 1) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_TRACK_UNAVAILABLE",
      "The exact track is not a published, protected, delivery-ready download.",
      "That protected track is not available for download-credit redemption.",
      404,
    );
  }
  return targets[0];
}

async function requireCurrentPreparedTarget(
  binding: D1Database,
  pending: PendingDownloadCreditEntitlementReceipt,
): Promise<ExactDownloadTarget> {
  const current = await requireExactTarget(binding, pending.trackId);
  if (current.trackRevisionId !== pending.trackRevisionId) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_TRACK_CHANGED",
      "The published protected download revision changed after entitlement preparation.",
      "That protected track changed. Its prepared download credit was not consumed.",
    );
  }
  return current;
}

async function downloadCreditIdentity(
  customerUserId: string,
  trackId: string,
): Promise<DownloadCreditIdentity> {
  const digest = await createMutationFingerprint({
    operation: "download.credit-redemption",
    customerUserId,
    trackId,
  });
  const prefix = `download-credit:${digest}`;
  return Object.freeze({
    reservationRequestId: `download_credit_${digest}`,
    reserveOperationId: `${prefix}:reserve`,
    consumeOperationId: `${prefix}:consume`,
    prepareEntitlementOperationId: `${prefix}:prepare-entitlement`,
    activateEntitlementOperationId: `${prefix}:activate-entitlement`,
    entitlementSourceId: `download_credit_${digest}`,
  });
}

function internalContext(
  outer: MutationContext,
  idempotencyKey: string,
): MutationContext {
  return Object.freeze({
    actorUserId: outer.actorUserId,
    idempotencyKey,
    requestId: outer.requestId,
  });
}

async function requireCreditDetail(
  binding: D1Database,
  customerUserId: string,
): Promise<CreditAccountDetailDTO> {
  const detail = await readCustomerCreditAccountDetail(
    binding,
    "download",
    customerUserId,
  );
  if (!detail) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ACCOUNT_REQUIRED",
      "The customer does not have a Test-mode download-credit account.",
      "There are not enough available download credits.",
    );
  }
  if (
    detail.account.stripeEnvironment !== "test" ||
    detail.account.livemode !== false ||
    !detail.balancesReconciled
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ACCOUNT_INVALID",
      "The download-credit account is not reconciled Test-mode state.",
      "The download-credit balance needs reconciliation.",
      500,
    );
  }
  return detail;
}

function findPurposeReservation(
  detail: CreditAccountDetailDTO,
  trackId: string,
): CreditReservationDTO | null {
  const matches = detail.reservations.filter(
    (reservation) =>
      reservation.creditKind === "download" &&
      reservation.purposeType === "download" &&
      reservation.purposeId === trackId,
  );
  if (matches.length > 1) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_RESERVATION_INVALID",
      "More than one credit reservation exists for the exact track.",
      "The download-credit history needs reconciliation.",
      500,
    );
  }
  return matches[0] ?? null;
}

function requireExactReservationFacts(
  reservation: CreditReservationDTO,
  customerUserId: string,
  trackId: string,
): void {
  if (
    reservation.customerUserId !== customerUserId ||
    reservation.creditKind !== "download" ||
    reservation.purposeType !== "download" ||
    reservation.purposeId !== trackId ||
    reservation.quantity !== 1 ||
    reservation.stripeEnvironment !== "test" ||
    reservation.livemode !== false
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_RESERVATION_CONFLICT",
      "The existing credit reservation does not match the exact customer, track, quantity, and Test environment.",
      "The existing download-credit reservation does not match this track.",
    );
  }
}

function requireRecoverableReservation(
  reservation: CreditReservationDTO,
  customerUserId: string,
  trackId: string,
): void {
  requireExactReservationFacts(reservation, customerUserId, trackId);
  if (reservation.state !== "reserved" && reservation.state !== "consumed") {
    throw redemptionError(
      "DOWNLOAD_CREDIT_RESERVATION_TERMINAL",
      `The exact download-credit reservation is already ${reservation.state}.`,
      "This download-credit reservation can no longer be redeemed.",
    );
  }
}

function findConsumption(
  detail: CreditAccountDetailDTO,
  reservation: CreditReservationDTO,
  trackId: string,
): CreditLedgerEntryDTO {
  const matches = detail.ledger.filter(
    (entry) =>
      entry.creditReservationId === reservation.id &&
      entry.creditKind === "download" &&
      entry.entryType === "consumption" &&
      entry.originType === "download" &&
      entry.originId === trackId &&
      entry.delta.available === 0 &&
      entry.delta.reserved === -1 &&
      entry.delta.consumed === 1 &&
      entry.stripeEnvironment === "test" &&
      entry.livemode === false,
  );
  if (matches.length !== 1) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_CONSUMPTION_INVALID",
      "The consumed reservation does not have exactly one matching immutable ledger entry.",
      "The download-credit history needs reconciliation.",
      500,
    );
  }
  return matches[0];
}

function readActions(value: unknown): readonly string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

async function readCreditEntitlements(
  binding: D1Database,
  customerUserId: string,
): Promise<readonly CreditEntitlementRow[]> {
  const result = await binding
    .prepare(
      `SELECT id, source_id, resource_id, actions_json, state, starts_at,
              credit_reservation_id, revision, last_operation_key
       FROM entitlements
       WHERE user_id = ? AND source_type = 'credit'
         AND resource_type = 'track'
         AND stripe_environment = 'test' AND livemode = 0
       ORDER BY created_at, rowid`,
    )
    .bind(customerUserId)
    .all<CreditEntitlementRow>();
  return Object.freeze(result.results ?? []);
}

function exactCreditEntitlement(
  rows: readonly CreditEntitlementRow[],
  trackId: string,
): CreditEntitlementRow | null {
  const matches = rows.filter((row) => row.resource_id === trackId);
  if (matches.length > 1) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
      "More than one credit entitlement exists for the exact customer and track.",
      "The download-credit entitlement history needs reconciliation.",
      500,
    );
  }
  return matches[0] ?? null;
}

function requirePendingEntitlement(
  row: CreditEntitlementRow | null,
  pending: PendingDownloadCreditEntitlementReceipt,
): { readonly id: string } {
  if (
    row === null ||
    row.id !== pending.entitlementId ||
    row.source_id !== pending.entitlementSourceId ||
    row.resource_id !== pending.trackId ||
    row.state !== "active" ||
    row.starts_at !== PENDING_ENTITLEMENT_STARTS_AT ||
    row.credit_reservation_id !== null ||
    row.revision !== 1 ||
    row.last_operation_key !== pending.preparedOperationKey ||
    JSON.stringify(readActions(row.actions_json)) !==
      JSON.stringify(["download"])
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
      "The prepared entitlement is not the exact future-dated download-only entitlement.",
      "The prepared download entitlement needs reconciliation.",
      500,
    );
  }
  return Object.freeze({
    id: safeId(row.id, "prepared credit entitlement ID"),
  });
}

function requireStoredPendingEntitlement(row: CreditEntitlementRow): {
  readonly id: string;
} {
  if (
    row.state !== "active" ||
    row.starts_at !== PENDING_ENTITLEMENT_STARTS_AT ||
    row.credit_reservation_id !== null ||
    row.revision !== 1 ||
    typeof row.last_operation_key !== "string" ||
    row.last_operation_key.length === 0 ||
    JSON.stringify(readActions(row.actions_json)) !==
      JSON.stringify(["download"])
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
      "The stored prepared entitlement is not a future-dated download-only entitlement.",
      "The prepared download entitlement needs reconciliation.",
      500,
    );
  }
  return Object.freeze({
    id: safeId(row.id, "prepared credit entitlement ID"),
  });
}

function requireCompleteEntitlement(
  row: CreditEntitlementRow,
  reservation: CreditReservationDTO,
): {
  readonly id: string;
} {
  if (
    row.state !== "active" ||
    row.starts_at !== reservation.consumedAt ||
    row.credit_reservation_id !== reservation.id ||
    row.revision !== 2 ||
    row.last_operation_key === null ||
    JSON.stringify(readActions(row.actions_json)) !==
      JSON.stringify(["download"])
  ) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
      "The exact credit entitlement is not an active download-only entitlement.",
      "The download-credit entitlement history needs reconciliation.",
      500,
    );
  }
  return Object.freeze({ id: safeId(row.id, "credit entitlement ID") });
}

function downloadUrl(target: ExactDownloadTarget): string {
  return `/api/media/tracks/${encodeURIComponent(target.trackId)}/download?revision=${encodeURIComponent(target.trackRevisionId)}`;
}

async function preparePendingDownloadCreditEntitlement(
  binding: D1Database,
  trackId: string,
  entitlementSourceId: string,
  context: MutationContext,
  nowIso: string,
): Promise<MutationResult<PendingDownloadCreditEntitlementReceipt>> {
  const operation = "download-credit.prepare-entitlement";
  const mutation =
    await prepareMutation<PendingDownloadCreditEntitlementReceipt>(
      binding,
      operation,
      context,
      {
        customerUserId: context.actorUserId,
        trackId,
        entitlementSourceId,
        startsAt: PENDING_ENTITLEMENT_STARTS_AT,
        stripeEnvironment: "test",
        livemode: false,
      },
    );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const target = await requireExactTarget(binding, trackId);
  const entitlementId = `entitlement_credit_${crypto.randomUUID()}`;
  const value: PendingDownloadCreditEntitlementReceipt = Object.freeze({
    ...target,
    entitlementId,
    entitlementSourceId,
    preparedOperationKey: mutation.namespacedKey,
    startsAt: PENDING_ENTITLEMENT_STARTS_AT,
    stripeEnvironment: "test",
    livemode: false,
  });
  const customer = activeCustomerCondition(context.actorUserId);
  const exactCondition = `${customer.sql}
    AND EXISTS (
      SELECT 1 FROM artist_modules
      WHERE module_key = 'downloads' AND active = 1
    )
    AND EXISTS (
      SELECT 1
      FROM tracks AS guarded_track
      JOIN track_revisions AS guarded_revision
        ON guarded_revision.id = guarded_track.published_revision_id
       AND guarded_revision.track_id = guarded_track.id
      JOIN media_derivatives AS guarded_derivative
        ON guarded_derivative.id = guarded_revision.download_derivative_id
       AND guarded_derivative.source_media_id = guarded_revision.original_media_id
      JOIN media_objects AS guarded_source
        ON guarded_source.id = guarded_derivative.source_media_id
      WHERE guarded_track.id = ?
        AND guarded_track.publication_state = 'published'
        AND guarded_revision.id = ?
        AND guarded_revision.download_mode = 'protected'
        AND guarded_derivative.kind = 'download'
        AND guarded_derivative.status = 'ready'
        AND guarded_derivative.approval_state = 'approved'
        AND guarded_derivative.object_key GLOB 'derivatives/*'
        AND guarded_derivative.content_type LIKE 'audio/%'
        AND guarded_derivative.format IS NOT NULL
        AND guarded_derivative.byte_length IS NOT NULL
        AND guarded_derivative.content_sha256 IS NOT NULL
        AND guarded_source.kind = 'audio'
        AND guarded_source.status = 'ready'
        AND guarded_source.approval_state = 'approved'
        AND guarded_source.content_type LIKE 'audio/%'
        AND guarded_source.content_sha256 IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM entitlements
      WHERE source_type = 'credit' AND user_id = ?
        AND resource_type = 'track' AND resource_id = ?
    )`;
  const insert = binding
    .prepare(
      `INSERT INTO entitlements
        (id, user_id, source_type, source_id, grant_id, resource_type,
         resource_id, actions_json, state, starts_at, expires_at,
         remaining_uses, download_disposition, stripe_environment, livemode,
         fulfillment_event_id, credit_reservation_id, revision,
         last_operation_key, created_at, updated_at)
       SELECT ?, ?, 'credit', ?, NULL, 'track', ?, '["download"]', 'active',
              ?, NULL, NULL, 'attachment', 'test', 0, NULL, NULL, 1, ?, ?, ?
       WHERE ${exactCondition}`,
    )
    .bind(
      entitlementId,
      context.actorUserId,
      entitlementSourceId,
      target.trackId,
      PENDING_ENTITLEMENT_STARTS_AT,
      mutation.namespacedKey,
      nowIso,
      nowIso,
      ...customer.bindings,
      target.trackId,
      target.trackRevisionId,
      context.actorUserId,
      target.trackId,
    );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "entitlement",
      subjectId: entitlementId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        source: "download_credit_redemption",
        phase: "prepared",
        trackId: target.trackId,
        trackRevisionId: target.trackRevisionId,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...value },
    },
    `EXISTS (
      SELECT 1 FROM entitlements
      WHERE id = ? AND user_id = ? AND source_type = 'credit'
        AND source_id = ? AND resource_type = 'track' AND resource_id = ?
        AND actions_json = '["download"]' AND state = 'active'
        AND starts_at = ? AND stripe_environment = 'test' AND livemode = 0
        AND fulfillment_event_id IS NULL AND credit_reservation_id IS NULL
        AND revision = 1 AND last_operation_key = ?
    ) AND ${customer.sql}`,
    [
      entitlementId,
      context.actorUserId,
      entitlementSourceId,
      target.trackId,
      PENDING_ENTITLEMENT_STARTS_AT,
      mutation.namespacedKey,
      ...customer.bindings,
    ],
  );

  try {
    const results = await runAtomicBatch(binding, [insert, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("protected download target");
    }
    return { value, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function activateDownloadCreditEntitlement(
  binding: D1Database,
  pending: PendingDownloadCreditEntitlementReceipt,
  reservation: CreditReservationDTO,
  consumption: CreditLedgerEntryDTO,
  context: MutationContext,
  nowIso: string,
): Promise<MutationResult<DownloadCreditRedemptionReceipt>> {
  const operation = "download-credit.activate-entitlement";
  const mutation = await prepareMutation<DownloadCreditRedemptionReceipt>(
    binding,
    operation,
    context,
    {
      customerUserId: context.actorUserId,
      trackId: pending.trackId,
      trackRevisionId: pending.trackRevisionId,
      entitlementId: pending.entitlementId,
      entitlementSourceId: pending.entitlementSourceId,
      creditReservationId: reservation.id,
      creditLedgerEntryId: consumption.id,
      consumedAt: reservation.consumedAt,
      stripeEnvironment: "test",
      livemode: false,
    },
  );
  if (mutation.replayValue) {
    await requireCurrentPreparedTarget(binding, pending);
    return { value: mutation.replayValue, replayed: true };
  }
  if (reservation.consumedAt === null) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_CONSUMPTION_INVALID",
      "A pending entitlement cannot activate without the exact consumption time.",
      "The download-credit consumption could not be confirmed.",
      500,
    );
  }

  const value: DownloadCreditRedemptionReceipt = Object.freeze({
    trackId: pending.trackId,
    trackSlug: pending.trackSlug,
    trackRevisionId: pending.trackRevisionId,
    title: pending.title,
    creditReservationId: reservation.id,
    creditLedgerEntryId: consumption.id,
    entitlementId: pending.entitlementId,
    downloadUrl: downloadUrl(pending),
    stripeEnvironment: "test",
    livemode: false,
  });
  const customer = activeCustomerCondition(context.actorUserId);
  const exactDelivery = exactProtectedDownloadDeliveryCondition(pending);
  const exactConsumption = `EXISTS (
    SELECT 1
    FROM credit_reservations AS guarded_reservation
    JOIN credit_accounts AS guarded_account
      ON guarded_account.id = guarded_reservation.credit_account_id
     AND guarded_account.customer_user_id = guarded_reservation.customer_user_id
     AND guarded_account.credit_kind = guarded_reservation.credit_kind
    JOIN credit_ledger_entries AS guarded_consumption
      ON guarded_consumption.id = ?
     AND guarded_consumption.credit_reservation_id = guarded_reservation.id
     AND guarded_consumption.customer_user_id = guarded_reservation.customer_user_id
    WHERE guarded_reservation.id = ?
      AND guarded_reservation.customer_user_id = ?
      AND guarded_reservation.credit_kind = 'download'
      AND guarded_reservation.purpose_type = 'download'
      AND guarded_reservation.purpose_id = ?
      AND guarded_reservation.quantity = 1
      AND guarded_reservation.state = 'consumed'
      AND guarded_reservation.consumed_at = ?
      AND guarded_reservation.stripe_environment = 'test'
      AND guarded_reservation.livemode = 0
      AND guarded_account.stripe_environment = 'test'
      AND guarded_account.livemode = 0
      AND guarded_consumption.credit_kind = 'download'
      AND guarded_consumption.entry_type = 'consumption'
      AND guarded_consumption.available_delta = 0
      AND guarded_consumption.reserved_delta = -1
      AND guarded_consumption.consumed_delta = 1
      AND guarded_consumption.origin_type = 'download'
      AND guarded_consumption.origin_id = ?
      AND guarded_consumption.stripe_environment = 'test'
      AND guarded_consumption.livemode = 0
  )`;
  const exactBindings = [
    consumption.id,
    reservation.id,
    context.actorUserId,
    pending.trackId,
    reservation.consumedAt,
    pending.trackId,
  ];
  const update = binding
    .prepare(
      `UPDATE entitlements
       SET starts_at = ?, credit_reservation_id = ?, revision = revision + 1,
           last_operation_key = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND source_type = 'credit'
         AND source_id = ? AND resource_type = 'track' AND resource_id = ?
         AND actions_json = '["download"]' AND state = 'active'
         AND starts_at = ? AND credit_reservation_id IS NULL AND revision = 1
         AND last_operation_key = ?
         AND stripe_environment = 'test' AND livemode = 0
         AND fulfillment_event_id IS NULL
         AND ${exactConsumption} AND ${customer.sql}
         AND ${exactDelivery.sql}`,
    )
    .bind(
      reservation.consumedAt,
      reservation.id,
      mutation.namespacedKey,
      nowIso,
      pending.entitlementId,
      context.actorUserId,
      pending.entitlementSourceId,
      pending.trackId,
      PENDING_ENTITLEMENT_STARTS_AT,
      pending.preparedOperationKey,
      ...exactBindings,
      ...customer.bindings,
      ...exactDelivery.bindings,
    );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "entitlement",
      subjectId: pending.entitlementId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        source: "download_credit_redemption",
        phase: "activated",
        trackId: pending.trackId,
        trackRevisionId: pending.trackRevisionId,
        creditReservationId: reservation.id,
        creditLedgerEntryId: consumption.id,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...value },
    },
    `EXISTS (
      SELECT 1 FROM entitlements
      WHERE id = ? AND user_id = ? AND source_type = 'credit'
        AND source_id = ? AND resource_type = 'track' AND resource_id = ?
        AND actions_json = '["download"]' AND state = 'active'
        AND starts_at = ? AND credit_reservation_id = ? AND revision = 2
        AND stripe_environment = 'test' AND livemode = 0
        AND fulfillment_event_id IS NULL AND last_operation_key = ?
    ) AND ${customer.sql}
      AND ${exactDelivery.sql}`,
    [
      pending.entitlementId,
      context.actorUserId,
      pending.entitlementSourceId,
      pending.trackId,
      reservation.consumedAt,
      reservation.id,
      mutation.namespacedKey,
      ...customer.bindings,
      ...exactDelivery.bindings,
    ],
  );

  try {
    const results = await runAtomicBatch(binding, [update, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("prepared download entitlement");
    }
    return { value, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

/**
 * Reads current protected download targets plus any durable interrupted
 * redemption target. Withdrawn prepared, reserved, or consumed work remains
 * visible as unavailable until the exact pinned revision becomes deliverable
 * again. No R2 key or media byte leaves this server-owned projection.
 */
export async function readCustomerDownloadCreditTargets(
  binding: D1Database,
  customerUserId: string,
): Promise<readonly DownloadCreditTargetDTO[]> {
  const detail = await readCustomerCreditAccountDetail(
    binding,
    "download",
    customerUserId,
  );

  const downloadsModule = await binding
    .prepare(
      `SELECT active FROM artist_modules
       WHERE module_key = 'downloads' LIMIT 1`,
    )
    .first<{ active: unknown }>();
  if (downloadsModule?.active !== 1) return Object.freeze([]);

  const [eligibleTargets, preparedTargets, entitlements] = await Promise.all([
    readTargetRows(binding, null),
    readPreparedTargetHistory(binding, customerUserId),
    readCreditEntitlements(binding, customerUserId),
  ]);
  const eligibleKeys = new Set(
    eligibleTargets.map(
      (target) => `${target.trackId}\u0000${target.trackRevisionId}`,
    ),
  );
  const targetsByTrackId = new Map<string, ExactDownloadTarget>();
  for (const target of preparedTargets) {
    targetsByTrackId.set(target.trackId, target);
  }
  for (const target of eligibleTargets) {
    const prepared = targetsByTrackId.get(target.trackId);
    if (prepared && prepared.trackRevisionId !== target.trackRevisionId) {
      continue;
    }
    targetsByTrackId.set(target.trackId, target);
  }
  const targets = [...targetsByTrackId.values()].sort(
    (left, right) =>
      left.title.localeCompare(right.title) ||
      left.trackId.localeCompare(right.trackId),
  );
  return Object.freeze(
    targets.map((target) => {
      const eligible = eligibleKeys.has(
        `${target.trackId}\u0000${target.trackRevisionId}`,
      );
      const reservation = detail
        ? findPurposeReservation(detail, target.trackId)
        : null;
      const entitlement = exactCreditEntitlement(entitlements, target.trackId);
      if (!eligible) {
        if (reservation) {
          requireExactReservationFacts(
            reservation,
            customerUserId,
            target.trackId,
          );
        }
        let consumption: CreditLedgerEntryDTO | null = null;
        if (reservation?.state === "consumed") {
          consumption = detail
            ? findConsumption(detail, reservation, target.trackId)
            : null;
        }
        if (
          entitlement &&
          entitlement.starts_at === PENDING_ENTITLEMENT_STARTS_AT
        ) {
          requireStoredPendingEntitlement(entitlement);
        } else if (
          entitlement &&
          reservation?.state === "consumed" &&
          reservation.consumedAt !== null
        ) {
          requireCompleteEntitlement(entitlement, reservation);
        }
        return Object.freeze({
          ...target,
          state: "unavailable" as const,
          creditReservationId: reservation?.id ?? null,
          creditLedgerEntryId: consumption?.id ?? null,
          entitlementId:
            typeof entitlement?.id === "string" ? entitlement.id : null,
          downloadUrl: null,
          stripeEnvironment: "test" as const,
          livemode: false as const,
        });
      }
      if (!reservation) {
        const prepared = entitlement
          ? requireStoredPendingEntitlement(entitlement)
          : null;
        return Object.freeze({
          ...target,
          state: prepared ? ("prepared" as const) : ("available" as const),
          creditReservationId: null,
          creditLedgerEntryId: null,
          entitlementId: prepared?.id ?? null,
          downloadUrl: null,
          stripeEnvironment: "test" as const,
          livemode: false as const,
        });
      }
      requireExactReservationFacts(reservation, customerUserId, target.trackId);
      if (
        reservation.state !== "reserved" &&
        reservation.state !== "consumed"
      ) {
        return Object.freeze({
          ...target,
          state: "unavailable" as const,
          creditReservationId: reservation.id,
          creditLedgerEntryId: null,
          entitlementId:
            typeof entitlement?.id === "string" ? entitlement.id : null,
          downloadUrl: null,
          stripeEnvironment: "test" as const,
          livemode: false as const,
        });
      }
      if (reservation.state === "reserved") {
        const prepared = entitlement
          ? requireStoredPendingEntitlement(entitlement)
          : null;
        if (!prepared) {
          throw redemptionError(
            "DOWNLOAD_CREDIT_ENTITLEMENT_INVALID",
            "A reserved download credit is missing its prepared entitlement.",
            "The prepared download entitlement needs reconciliation.",
            500,
          );
        }
        return Object.freeze({
          ...target,
          state: "reserved" as const,
          creditReservationId: reservation.id,
          creditLedgerEntryId: null,
          entitlementId: prepared.id,
          downloadUrl: null,
          stripeEnvironment: "test" as const,
          livemode: false as const,
        });
      }
      const consumption = detail
        ? findConsumption(detail, reservation, target.trackId)
        : null;
      if (!consumption) {
        throw redemptionError(
          "DOWNLOAD_CREDIT_CONSUMPTION_INVALID",
          "The consumed reservation is missing its immutable ledger entry.",
          "The download-credit history needs reconciliation.",
          500,
        );
      }
      if (!entitlement) {
        return Object.freeze({
          ...target,
          state: "consumed" as const,
          creditReservationId: reservation.id,
          creditLedgerEntryId: consumption.id,
          entitlementId: null,
          downloadUrl: null,
          stripeEnvironment: "test" as const,
          livemode: false as const,
        });
      }
      if (entitlement.starts_at === PENDING_ENTITLEMENT_STARTS_AT) {
        const prepared = requireStoredPendingEntitlement(entitlement);
        return Object.freeze({
          ...target,
          state: "consumed" as const,
          creditReservationId: reservation.id,
          creditLedgerEntryId: consumption.id,
          entitlementId: prepared.id,
          downloadUrl: null,
          stripeEnvironment: "test" as const,
          livemode: false as const,
        });
      }
      const complete = requireCompleteEntitlement(entitlement, reservation);
      return Object.freeze({
        ...target,
        state: "redeemed" as const,
        creditReservationId: reservation.id,
        creditLedgerEntryId: consumption.id,
        entitlementId: complete.id,
        downloadUrl: downloadUrl(target),
        stripeEnvironment: "test" as const,
        livemode: false as const,
      });
    }),
  );
}

/**
 * Prepares one inert entitlement, then reserves and consumes one exact
 * Test-mode download credit only while its pinned delivery target remains
 * eligible. Each atomic phase uses a target-derived operation identity, so an
 * interruption remains visible and resumes without consuming a second credit.
 */
export async function redeemTrackDownloadWithCredit(
  binding: D1Database,
  rawTrackId: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<DownloadCreditRedemptionReceipt>> {
  const trackId = requestedTrackId(rawTrackId);
  const nowIso = operationTime(now);
  await requireActiveModule(binding, "downloads");
  let detail = await requireCreditDetail(binding, context.actorUserId);
  const identity = await downloadCreditIdentity(context.actorUserId, trackId);
  let reservation = findPurposeReservation(detail, trackId);
  if (detail.account.available < 1 && reservation === null) {
    throw redemptionError(
      "BENEFIT_CREDIT_INSUFFICIENT",
      "The download-credit account has insufficient available balance.",
      "There are not enough available download credits.",
    );
  }
  const pending = await preparePendingDownloadCreditEntitlement(
    binding,
    trackId,
    identity.entitlementSourceId,
    internalContext(context, identity.prepareEntitlementOperationId),
    nowIso,
  );
  await requireCurrentPreparedTarget(binding, pending.value);
  let entitlementRows = await readCreditEntitlements(
    binding,
    context.actorUserId,
  );
  if (reservation === null || reservation.state === "reserved") {
    requirePendingEntitlement(
      exactCreditEntitlement(entitlementRows, trackId),
      pending.value,
    );
  }

  if (!reservation) {
    await reserveCustomerCredits(
      binding,
      {
        creditKind: "download",
        purposeType: "download",
        purposeId: trackId,
        requestId: identity.reservationRequestId,
        quantity: 1,
        expiresAt: RESERVATION_EXPIRES_AT,
      },
      detail.account.revision,
      internalContext(context, identity.reserveOperationId),
      now,
    );
    detail = await requireCreditDetail(binding, context.actorUserId);
    reservation = findPurposeReservation(detail, trackId);
    if (!reservation) {
      throw redemptionError(
        "DOWNLOAD_CREDIT_RESERVATION_INVALID",
        "The completed reservation could not be read back.",
        "The download-credit reservation could not be confirmed.",
        500,
      );
    }
  }
  requireRecoverableReservation(reservation, context.actorUserId, trackId);

  if (reservation.state === "reserved") {
    await requireActiveModule(binding, "downloads");
    await requireCurrentPreparedTarget(binding, pending.value);
    entitlementRows = await readCreditEntitlements(
      binding,
      context.actorUserId,
    );
    requirePendingEntitlement(
      exactCreditEntitlement(entitlementRows, trackId),
      pending.value,
    );
    await consumeCreditReservation(
      binding,
      reservation.id,
      reservation.revision,
      detail.account.revision,
      internalContext(context, identity.consumeOperationId),
      now,
      {
        trackId: pending.value.trackId,
        trackRevisionId: pending.value.trackRevisionId,
        entitlementId: pending.value.entitlementId,
        entitlementSourceId: pending.value.entitlementSourceId,
        entitlementPreparedOperationKey: pending.value.preparedOperationKey,
        pendingEntitlementStartsAt: PENDING_ENTITLEMENT_STARTS_AT,
      },
    );
    detail = await requireCreditDetail(binding, context.actorUserId);
    reservation = findPurposeReservation(detail, trackId);
    if (!reservation) {
      throw redemptionError(
        "DOWNLOAD_CREDIT_CONSUMPTION_INVALID",
        "The consumed reservation could not be read back.",
        "The download-credit consumption could not be confirmed.",
        500,
      );
    }
    requireRecoverableReservation(reservation, context.actorUserId, trackId);
  }
  if (reservation.state !== "consumed" || reservation.consumedAt === null) {
    throw redemptionError(
      "DOWNLOAD_CREDIT_CONSUMPTION_INVALID",
      "The exact download-credit reservation is not consumed.",
      "The download credit could not be confirmed as consumed.",
      500,
    );
  }
  const consumption = findConsumption(detail, reservation, trackId);

  return activateDownloadCreditEntitlement(
    binding,
    pending.value,
    reservation,
    consumption,
    internalContext(context, identity.activateEntitlementOperationId),
    nowIso,
  );
}
