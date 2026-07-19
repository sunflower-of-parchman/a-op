import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export type MembershipRouteKind = "membership" | "subscription";
export type MembershipRelationshipAction =
  | "pause"
  | "resume"
  | "schedule-cancellation"
  | "clear-cancellation"
  | "apply-cancellation"
  | "expire"
  | "renew";

function invalidInput(message: string): never {
  throw new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid membership information.",
  });
}

export function requireMembershipRouteKind(
  value: unknown,
): MembershipRouteKind {
  if (value !== "membership" && value !== "subscription") {
    return invalidInput("Membership route kind is invalid.");
  }
  return value;
}

export function requireMembershipRouteId(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return invalidInput(`${label} must be a safe application identifier.`);
  }
  return value;
}

export function requireMembershipRelationshipAction(
  value: unknown,
  kind: MembershipRouteKind,
): MembershipRelationshipAction {
  if (
    value !== "pause" &&
    value !== "resume" &&
    value !== "schedule-cancellation" &&
    value !== "clear-cancellation" &&
    value !== "apply-cancellation" &&
    value !== "expire" &&
    value !== "renew"
  ) {
    return invalidInput("Membership relationship action is invalid.");
  }
  if (kind === "membership" && value === "renew") {
    return invalidInput("Direct memberships do not use subscription renewal.");
  }
  return value;
}

export function requireMembershipEffectiveAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    return invalidInput("Effective time must be an ISO-compatible timestamp.");
  }
  return new Date(Date.parse(value)).toISOString();
}

export async function requireMembershipRouteModules(
  binding: D1Database,
  kind: MembershipRouteKind,
): Promise<void> {
  await requireActiveModule(binding, "memberships");
  if (kind === "subscription") {
    await requireActiveModule(binding, "subscriptions");
  }
}
