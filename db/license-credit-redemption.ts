import {
  consumeCreditReservation,
  reserveCustomerCredits,
} from "./credit-ledger-write.ts";
import { readCustomerCreditAccountDetail } from "./credit-ledger-read.ts";
import { issueLicense } from "./licensing-write.ts";
import type { MutationContext, MutationResult } from "./mutation.ts";
import type {
  CreditAccountDetailDTO,
  CreditLedgerEntryDTO,
  CreditReservationDTO,
} from "@/lib/benefit-credits/index.ts";
import {
  parseLicenseTermsSnapshotJson,
  type LicenseCreditRedemptionReceipt,
  type LicenseIssuanceReceipt,
  type LicenseRequestState,
  type LicenseTermsSnapshot,
  isSafeLicenseId,
} from "@/lib/licensing/index.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { createMutationFingerprint } from "@/lib/runtime/idempotency.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface LicenseRequestRedemptionRow {
  readonly id: string;
  readonly customer_user_id: string;
  readonly state: LicenseRequestState;
  readonly revision: number;
  readonly terms_snapshot_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ExistingIssuedLicenseRow {
  readonly source: "owner_approval" | "credit_redemption" | "stripe_test_order";
  readonly credit_ledger_entry_id: string | null;
  readonly stripe_environment: string;
  readonly livemode: number;
}

interface RedemptionIdentity {
  readonly reservationRequestId: string;
  readonly reserveOperationId: string;
  readonly consumeOperationId: string;
  readonly issueOperationId: string;
}

// Purpose identity is unique across every reservation state in the current
// schema. This coordinator-owned reservation therefore remains recoverable
// until its immediate consumption phase or a later retry completes it.
const REDEMPTION_RESERVATION_EXPIRES_AT = "9999-12-31T23:59:59.999Z";

function redemptionError(
  code: string,
  message: string,
  publicMessage: string,
  status = 409,
): RuntimeError {
  return new RuntimeError(code, message, { status, publicMessage });
}

function operationTime(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw redemptionError(
      "LICENSE_CREDIT_INPUT_INVALID",
      "License-credit redemption requires a valid operation time.",
      "The license-credit redemption time is invalid.",
      400,
    );
  }
  return value.toISOString();
}

function safeLicenseRequestId(value: unknown): string {
  if (!isSafeLicenseId(value)) {
    throw redemptionError(
      "LICENSE_CREDIT_INPUT_INVALID",
      "License-credit redemption requires a safe license request ID.",
      "Choose a valid license request.",
      400,
    );
  }
  return value;
}

async function redemptionIdentity(
  customerUserId: string,
  licenseRequestId: string,
): Promise<RedemptionIdentity> {
  const digest = await createMutationFingerprint({
    operation: "license.credit-redemption",
    customerUserId,
    licenseRequestId,
  });
  const prefix = `license-credit:${digest}`;
  return Object.freeze({
    reservationRequestId: `license_credit_${digest}`,
    reserveOperationId: `${prefix}:reserve`,
    consumeOperationId: `${prefix}:consume`,
    issueOperationId: `${prefix}:issue`,
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
    telemetry: outer.telemetry,
  });
}

async function readExactRequest(
  binding: D1Database,
  licenseRequestId: string,
  customerUserId: string,
): Promise<LicenseRequestRedemptionRow> {
  const row = await binding
    .prepare(
      `SELECT id, customer_user_id, state, revision, terms_snapshot_json,
              created_at, updated_at
       FROM license_requests
       WHERE id = ? AND customer_user_id = ?
         AND stripe_environment = 'test' AND livemode = 0
       LIMIT 1`,
    )
    .bind(licenseRequestId, customerUserId)
    .first<LicenseRequestRedemptionRow>();
  if (!row) {
    throw redemptionError(
      "LICENSE_CREDIT_REQUEST_NOT_FOUND",
      "The customer's exact Test-mode license request was not found.",
      "That license request is not available.",
      404,
    );
  }
  return row;
}

function requestSnapshot(
  row: LicenseRequestRedemptionRow,
): LicenseTermsSnapshot {
  let snapshot: LicenseTermsSnapshot;
  try {
    snapshot = parseLicenseTermsSnapshotJson(row.terms_snapshot_json);
  } catch {
    throw redemptionError(
      "LICENSE_CREDIT_REQUEST_INVALID",
      "The frozen license request terms are invalid.",
      "This license request needs review before credits can be used.",
    );
  }
  if (
    !Number.isSafeInteger(snapshot.option.licenseCreditCost) ||
    snapshot.option.licenseCreditCost < 1 ||
    snapshot.offer.id.length < 1 ||
    snapshot.option.id.length < 1
  ) {
    throw redemptionError(
      "LICENSE_CREDIT_REQUEST_INVALID",
      "The frozen license request does not contain an exact positive credit cost.",
      "This license request needs review before credits can be used.",
    );
  }
  return snapshot;
}

function requestCanIssue(
  state: LicenseRequestState,
  requiresApproval: boolean,
): boolean {
  if (state === "issued") return true;
  return requiresApproval ? state === "approved" : state === "submitted";
}

function requireReadyRequest(
  row: LicenseRequestRedemptionRow,
  snapshot: LicenseTermsSnapshot,
): void {
  if (requestCanIssue(row.state, snapshot.option.requiresApproval)) return;
  throw redemptionError(
    "LICENSE_CREDIT_REQUEST_NOT_READY",
    `License request ${row.id} is not ready for credit issuance while its state is ${row.state}.`,
    snapshot.option.requiresApproval
      ? "This license request needs artist approval before credits can be used."
      : "This license request is not ready for credit redemption.",
  );
}

function findPurposeReservation(
  detail: CreditAccountDetailDTO,
  licenseRequestId: string,
): CreditReservationDTO | null {
  const matches = detail.reservations.filter(
    (reservation) =>
      reservation.creditKind === "license" &&
      reservation.purposeType === "license_request" &&
      reservation.purposeId === licenseRequestId,
  );
  if (matches.length > 1) {
    throw redemptionError(
      "LICENSE_CREDIT_RESERVATION_INVALID",
      "More than one credit reservation exists for the exact license request.",
      "The license-credit history needs reconciliation.",
      500,
    );
  }
  return matches[0] ?? null;
}

function requireExactReservation(
  reservation: CreditReservationDTO,
  customerUserId: string,
  licenseRequestId: string,
  licenseCreditCost: number,
): void {
  if (
    reservation.customerUserId !== customerUserId ||
    reservation.creditKind !== "license" ||
    reservation.purposeType !== "license_request" ||
    reservation.purposeId !== licenseRequestId ||
    reservation.quantity !== licenseCreditCost ||
    reservation.stripeEnvironment !== "test" ||
    reservation.livemode !== false
  ) {
    throw redemptionError(
      "LICENSE_CREDIT_RESERVATION_CONFLICT",
      "The existing credit reservation does not match the exact frozen license request and cost.",
      "The existing license-credit reservation does not match this request.",
    );
  }
  if (reservation.state !== "reserved" && reservation.state !== "consumed") {
    throw redemptionError(
      "LICENSE_CREDIT_RESERVATION_TERMINAL",
      `The exact credit reservation is already ${reservation.state}.`,
      "This license-credit reservation can no longer be redeemed.",
    );
  }
}

function findConsumption(
  detail: CreditAccountDetailDTO,
  reservation: CreditReservationDTO,
  licenseRequestId: string,
  licenseCreditCost: number,
): CreditLedgerEntryDTO {
  const matches = detail.ledger.filter(
    (entry) =>
      entry.creditReservationId === reservation.id &&
      entry.creditKind === "license" &&
      entry.entryType === "consumption" &&
      entry.originType === "license" &&
      entry.originId === licenseRequestId &&
      entry.delta.available === 0 &&
      entry.delta.reserved === -licenseCreditCost &&
      entry.delta.consumed === licenseCreditCost &&
      entry.stripeEnvironment === "test" &&
      entry.livemode === false,
  );
  if (matches.length !== 1) {
    throw redemptionError(
      "LICENSE_CREDIT_CONSUMPTION_INVALID",
      "The consumed reservation does not have exactly one matching immutable ledger entry.",
      "The license-credit history needs reconciliation.",
      500,
    );
  }
  return matches[0];
}

async function readExistingIssuedLicense(
  binding: D1Database,
  licenseRequestId: string,
  customerUserId: string,
): Promise<ExistingIssuedLicenseRow | null> {
  return binding
    .prepare(
      `SELECT source, credit_ledger_entry_id, stripe_environment, livemode
       FROM issued_licenses
       WHERE license_request_id = ? AND customer_user_id = ?
       LIMIT 1`,
    )
    .bind(licenseRequestId, customerUserId)
    .first<ExistingIssuedLicenseRow>();
}

function requireCompatibleIssuedLicense(
  issued: ExistingIssuedLicenseRow | null,
  creditLedgerEntryId: string,
): void {
  if (!issued) return;
  if (
    issued.source !== "credit_redemption" ||
    issued.credit_ledger_entry_id !== creditLedgerEntryId ||
    issued.stripe_environment !== "test" ||
    issued.livemode !== 0
  ) {
    throw redemptionError(
      "LICENSE_CREDIT_ISSUANCE_CONFLICT",
      "The request was issued from a different source or credit consumption.",
      "This license request was already issued through another path.",
    );
  }
}

function requireCreditRedemptionIssuedSource(
  issued: ExistingIssuedLicenseRow | null,
): asserts issued is ExistingIssuedLicenseRow {
  if (
    issued === null ||
    issued.source !== "credit_redemption" ||
    issued.credit_ledger_entry_id === null ||
    issued.stripe_environment !== "test" ||
    issued.livemode !== 0
  ) {
    throw redemptionError(
      "LICENSE_CREDIT_ISSUANCE_CONFLICT",
      "The issued request does not belong to a Test-mode credit redemption.",
      "This license request was already issued through another path.",
    );
  }
}

async function requireCreditDetail(
  binding: D1Database,
  customerUserId: string,
): Promise<CreditAccountDetailDTO> {
  const detail = await readCustomerCreditAccountDetail(
    binding,
    "license",
    customerUserId,
  );
  if (!detail) {
    throw redemptionError(
      "LICENSE_CREDIT_ACCOUNT_REQUIRED",
      "The customer does not have a Test-mode license-credit account.",
      "There are not enough available license credits.",
    );
  }
  if (
    detail.account.stripeEnvironment !== "test" ||
    detail.account.livemode !== false ||
    !detail.balancesReconciled
  ) {
    throw redemptionError(
      "LICENSE_CREDIT_ACCOUNT_INVALID",
      "The license-credit account is not reconciled Test-mode state.",
      "The license-credit balance needs reconciliation.",
      500,
    );
  }
  return detail;
}

/**
 * Reserves, consumes, and issues against one frozen request. Each phase uses
 * its own request-derived idempotency identity, allowing a later call to
 * resume after any completed atomic phase without consuming credits twice.
 */
export async function redeemLicenseRequestWithCredits(
  binding: D1Database,
  rawLicenseRequestId: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<LicenseCreditRedemptionReceipt>> {
  const licenseRequestId = safeLicenseRequestId(rawLicenseRequestId);
  operationTime(now);
  await requireActiveModule(binding, "licensing");

  let detail = await requireCreditDetail(binding, context.actorUserId);
  let request = await readExactRequest(
    binding,
    licenseRequestId,
    context.actorUserId,
  );
  let snapshot = requestSnapshot(request);
  requireReadyRequest(request, snapshot);
  const licenseCreditCost = snapshot.option.licenseCreditCost;
  const identity = await redemptionIdentity(
    context.actorUserId,
    licenseRequestId,
  );

  let reservation = findPurposeReservation(detail, licenseRequestId);
  if (request.state === "issued") {
    const alreadyIssued = await readExistingIssuedLicense(
      binding,
      licenseRequestId,
      context.actorUserId,
    );
    requireCreditRedemptionIssuedSource(alreadyIssued);
    if (reservation === null) {
      throw redemptionError(
        "LICENSE_CREDIT_RESERVATION_INVALID",
        "A credit-issued request is missing its exact credit reservation.",
        "The license-credit history needs reconciliation.",
        500,
      );
    }
    requireExactReservation(
      reservation,
      context.actorUserId,
      licenseRequestId,
      licenseCreditCost,
    );
    if (reservation.state !== "consumed") {
      throw redemptionError(
        "LICENSE_CREDIT_CONSUMPTION_INVALID",
        "A credit-issued request does not have a consumed reservation.",
        "The license-credit history needs reconciliation.",
        500,
      );
    }
    const existingConsumption = findConsumption(
      detail,
      reservation,
      licenseRequestId,
      licenseCreditCost,
    );
    requireCompatibleIssuedLicense(alreadyIssued, existingConsumption.id);
  }
  if (reservation === null) {
    if (detail.account.available < licenseCreditCost) {
      throw redemptionError(
        "BENEFIT_CREDIT_INSUFFICIENT",
        "The license-credit account has insufficient available balance for the frozen cost.",
        "There are not enough available license credits.",
      );
    }
    await reserveCustomerCredits(
      binding,
      {
        creditKind: "license",
        purposeType: "license_request",
        purposeId: licenseRequestId,
        requestId: identity.reservationRequestId,
        quantity: licenseCreditCost,
        expiresAt: REDEMPTION_RESERVATION_EXPIRES_AT,
      },
      detail.account.revision,
      internalContext(context, identity.reserveOperationId),
      now,
      { licenseRequestId },
    );
    detail = await requireCreditDetail(binding, context.actorUserId);
    reservation = findPurposeReservation(detail, licenseRequestId);
    if (reservation === null) {
      throw redemptionError(
        "LICENSE_CREDIT_RESERVATION_INVALID",
        "The completed reservation could not be read back.",
        "The license-credit reservation could not be confirmed.",
        500,
      );
    }
  }
  requireExactReservation(
    reservation,
    context.actorUserId,
    licenseRequestId,
    licenseCreditCost,
  );

  if (reservation.state === "reserved") {
    await consumeCreditReservation(
      binding,
      reservation.id,
      reservation.revision,
      detail.account.revision,
      internalContext(context, identity.consumeOperationId),
      now,
    );
    detail = await requireCreditDetail(binding, context.actorUserId);
    reservation = findPurposeReservation(detail, licenseRequestId);
    if (reservation === null) {
      throw redemptionError(
        "LICENSE_CREDIT_CONSUMPTION_INVALID",
        "The consumed reservation could not be read back.",
        "The license-credit consumption could not be confirmed.",
        500,
      );
    }
    requireExactReservation(
      reservation,
      context.actorUserId,
      licenseRequestId,
      licenseCreditCost,
    );
  }
  if (reservation.state !== "consumed" || reservation.consumedAt === null) {
    throw redemptionError(
      "LICENSE_CREDIT_CONSUMPTION_INVALID",
      "The exact license-credit reservation is not consumed.",
      "The license credit could not be confirmed as consumed.",
      500,
    );
  }
  const consumption = findConsumption(
    detail,
    reservation,
    licenseRequestId,
    licenseCreditCost,
  );

  request = await readExactRequest(
    binding,
    licenseRequestId,
    context.actorUserId,
  );
  snapshot = requestSnapshot(request);
  requireReadyRequest(request, snapshot);
  if (snapshot.option.licenseCreditCost !== licenseCreditCost) {
    throw redemptionError(
      "LICENSE_CREDIT_REQUEST_CHANGED",
      "The frozen license-credit cost changed while the redemption was running.",
      "The frozen license request changed before redemption finished.",
    );
  }
  const existingIssued = await readExistingIssuedLicense(
    binding,
    licenseRequestId,
    context.actorUserId,
  );
  requireCompatibleIssuedLicense(existingIssued, consumption.id);

  const expectedRevision =
    request.state === "issued" ? request.revision - 1 : request.revision;
  const issuance: MutationResult<LicenseIssuanceReceipt> = await issueLicense(
    binding,
    {
      source: "credit_redemption",
      licenseRequestId,
      expectedRevision,
      issuedAt: reservation.consumedAt,
      creditLedgerEntryId: consumption.id,
    },
    internalContext(context, identity.issueOperationId),
  );

  return Object.freeze({
    replayed: issuance.replayed,
    value: Object.freeze({
      licenseRequestId,
      customerUserId: context.actorUserId,
      licenseCreditCost,
      creditReservationId: reservation.id,
      creditLedgerEntryId: consumption.id,
      issuedLicense: issuance.value,
      stripeEnvironment: "test",
      livemode: false,
    }),
  });
}
