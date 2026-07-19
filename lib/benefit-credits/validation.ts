import type {
  CreditGrantInput,
  CreditGrantOrigin,
  CreditKind,
  CreditPurposeType,
  CreditReservationInput,
} from "./types.ts";

export const CREDIT_INPUT_LIMITS = Object.freeze({
  quantity: 1_000_000,
  id: 160,
} as const);

export interface CreditValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type CreditValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly CreditValidationIssue[] };

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CREDIT_KINDS = new Set<CreditKind>(["download", "license"]);
const PURPOSE_TYPES = new Set<CreditPurposeType>([
  "download",
  "license_request",
]);
const GRANT_ORIGINS = new Set<CreditGrantOrigin>([
  "owner",
  "membership",
  "subscription",
  "order",
  "reversal",
]);

function issue(
  issues: CreditValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  issues: CreditValidationIssue[],
): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) issue(issues, key, `${key} is not supported.`);
  }
}

function safeId(
  value: unknown,
  field: string,
  issues: CreditValidationIssue[],
): string | null {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issue(issues, field, `${field} must be a safe application identifier.`);
    return null;
  }
  return value;
}

function quantity(
  value: unknown,
  field: string,
  issues: CreditValidationIssue[],
): number | null {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > CREDIT_INPUT_LIMITS.quantity
  ) {
    issue(
      issues,
      field,
      `${field} must be an integer from 1-${CREDIT_INPUT_LIMITS.quantity}.`,
    );
    return null;
  }
  return value as number;
}

function timestamp(
  value: unknown,
  field: string,
  issues: CreditValidationIssue[],
  nullable: boolean,
): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    issue(issues, field, `${field} must be an ISO-compatible timestamp.`);
    return null;
  }
  return new Date(Date.parse(value)).toISOString();
}

function invalid<T>(
  issues: readonly CreditValidationIssue[],
): CreditValidationResult<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function valid<T>(value: T): CreditValidationResult<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) });
}

export function validateCreditGrantInput(
  value: unknown,
): CreditValidationResult<CreditGrantInput> {
  const issues: CreditValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "grant", "Credit grant must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "customerUserId",
      "creditKind",
      "originType",
      "originId",
      "quantity",
      "expiresAt",
      "fulfillmentEventId",
    ],
    issues,
  );

  const customerUserId = safeId(value.customerUserId, "customerUserId", issues);
  const originId = safeId(value.originId, "originId", issues);
  const parsedQuantity = quantity(value.quantity, "quantity", issues);
  const expiresAt = timestamp(value.expiresAt, "expiresAt", issues, true);
  const fulfillmentEventId =
    value.fulfillmentEventId === null
      ? null
      : safeId(value.fulfillmentEventId, "fulfillmentEventId", issues);
  if (
    typeof value.creditKind !== "string" ||
    !CREDIT_KINDS.has(value.creditKind as CreditKind)
  ) {
    issue(issues, "creditKind", "Choose download or license credits.");
  }
  if (
    typeof value.originType !== "string" ||
    !GRANT_ORIGINS.has(value.originType as CreditGrantOrigin)
  ) {
    issue(issues, "originType", "Choose a supported credit origin.");
  }

  if (
    issues.length > 0 ||
    customerUserId === null ||
    originId === null ||
    parsedQuantity === null
  ) {
    return invalid(issues);
  }
  return valid({
    customerUserId,
    creditKind: value.creditKind as CreditKind,
    originType: value.originType as CreditGrantOrigin,
    originId,
    quantity: parsedQuantity,
    expiresAt,
    fulfillmentEventId,
  });
}

export function validateCreditReservationInput(
  value: unknown,
): CreditValidationResult<CreditReservationInput> {
  const issues: CreditValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "reservation", "Credit reservation must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "creditKind",
      "purposeType",
      "purposeId",
      "requestId",
      "quantity",
      "expiresAt",
    ],
    issues,
  );

  if (
    typeof value.creditKind !== "string" ||
    !CREDIT_KINDS.has(value.creditKind as CreditKind)
  ) {
    issue(issues, "creditKind", "Choose download or license credits.");
  }
  if (
    typeof value.purposeType !== "string" ||
    !PURPOSE_TYPES.has(value.purposeType as CreditPurposeType)
  ) {
    issue(issues, "purposeType", "Choose a supported credit purpose.");
  }
  if (
    (value.creditKind === "download" && value.purposeType !== "download") ||
    (value.creditKind === "license" && value.purposeType !== "license_request")
  ) {
    issue(
      issues,
      "purposeType",
      "The credit kind and reservation purpose must match.",
    );
  }
  const purposeId = safeId(value.purposeId, "purposeId", issues);
  const requestId = safeId(value.requestId, "requestId", issues);
  const parsedQuantity = quantity(value.quantity, "quantity", issues);
  const expiresAt = timestamp(value.expiresAt, "expiresAt", issues, false);

  if (
    issues.length > 0 ||
    purposeId === null ||
    requestId === null ||
    parsedQuantity === null ||
    expiresAt === null
  ) {
    return invalid(issues);
  }
  return valid({
    creditKind: value.creditKind as CreditKind,
    purposeType: value.purposeType as CreditPurposeType,
    purposeId,
    requestId,
    quantity: parsedQuantity,
    expiresAt,
  });
}

export function isSafeCreditId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function isPositiveCreditRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
