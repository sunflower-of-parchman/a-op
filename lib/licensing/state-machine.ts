import type { IssuedLicenseState, LicenseRequestState } from "./types.ts";

export type LicenseRequestEvent = "approve" | "reject" | "cancel" | "issue";
export type IssuedLicenseEvent = "revoke" | "expire";
export type LicenseDefinitionState = "draft" | "active" | "archived";

export class LicenseStateTransitionError extends Error {
  override readonly name = "LicenseStateTransitionError";

  constructor(subject: string, state: string, event: string) {
    super(`Cannot ${event} ${subject} while its state is ${state}.`);
  }
}

export function transitionLicenseRequestState(
  state: LicenseRequestState,
  event: LicenseRequestEvent,
  requiresApproval: boolean,
): LicenseRequestState {
  if (event === "approve" && state === "pending_approval") return "approved";
  if (event === "reject" && state === "pending_approval") return "rejected";
  if (
    event === "cancel" &&
    (state === "submitted" || state === "pending_approval")
  ) {
    return "canceled";
  }
  if (
    event === "issue" &&
    ((!requiresApproval && state === "submitted") || state === "approved")
  ) {
    return "issued";
  }
  throw new LicenseStateTransitionError("license request", state, event);
}

export function transitionIssuedLicenseState(
  state: IssuedLicenseState,
  event: IssuedLicenseEvent,
): IssuedLicenseState {
  if (state === "active" && event === "revoke") return "revoked";
  if (state === "active" && event === "expire") return "expired";
  throw new LicenseStateTransitionError("issued license", state, event);
}

export function transitionLicenseDefinitionState(
  state: LicenseDefinitionState,
  nextState: Extract<LicenseDefinitionState, "active" | "archived">,
): LicenseDefinitionState {
  if (
    state === "draft" &&
    (nextState === "active" || nextState === "archived")
  ) {
    return nextState;
  }
  if (state === "active" && nextState === "archived") return "archived";
  throw new LicenseStateTransitionError("license definition", state, nextState);
}

function normalizedTimestamp(value: string, label: string): Date {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${label} must be an ISO-compatible timestamp.`);
  }
  return new Date(Date.parse(value));
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addLicenseTermMonths(
  issuedAt: string,
  termMonths: number | null,
): string | null {
  if (termMonths === null) return null;
  if (!Number.isSafeInteger(termMonths) || termMonths < 1) {
    throw new RangeError("License term months must be a positive integer.");
  }
  const start = normalizedTimestamp(issuedAt, "issuedAt");
  const targetMonthIndex = start.getUTCMonth() + termMonths;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(
    start.getUTCDate(),
    daysInUtcMonth(targetYear, targetMonth),
  );
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  ).toISOString();
}

export function licenseExpiryReached(
  effectiveAt: string,
  expiresAt: string,
): boolean {
  return (
    normalizedTimestamp(effectiveAt, "effectiveAt").valueOf() >=
    normalizedTimestamp(expiresAt, "expiresAt").valueOf()
  );
}
