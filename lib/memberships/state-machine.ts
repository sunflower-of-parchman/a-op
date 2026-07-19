import type {
  BillingInterval,
  MembershipEventType,
  MembershipState,
} from "./types.ts";

export class MembershipStateTransitionError extends Error {
  override readonly name = "MembershipStateTransitionError";
  readonly fromState: MembershipState;
  readonly eventType: MembershipEventType;

  constructor(fromState: MembershipState, eventType: MembershipEventType) {
    super(`Cannot apply ${eventType} while membership state is ${fromState}.`);
    this.fromState = fromState;
    this.eventType = eventType;
  }
}

const TRANSITIONS: Readonly<
  Record<
    MembershipEventType,
    Readonly<Partial<Record<MembershipState, MembershipState>>>
  >
> = Object.freeze({
  activated: Object.freeze({ pending: "active" }),
  renewed: Object.freeze({ active: "active" }),
  paused: Object.freeze({ active: "paused" }),
  resumed: Object.freeze({ paused: "active" }),
  cancellation_scheduled: Object.freeze({ active: "cancellation_scheduled" }),
  cancellation_cleared: Object.freeze({
    cancellation_scheduled: "active",
  }),
  canceled: Object.freeze({
    pending: "canceled",
    active: "canceled",
    paused: "canceled",
    cancellation_scheduled: "canceled",
  }),
  expired: Object.freeze({
    pending: "expired",
    active: "expired",
    paused: "expired",
    cancellation_scheduled: "expired",
  }),
});

export function transitionMembershipState(
  state: MembershipState,
  eventType: MembershipEventType,
): MembershipState {
  const next = TRANSITIONS[eventType][state];
  if (!next) throw new MembershipStateTransitionError(state, eventType);
  return next;
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

export function addCalendarInterval(
  startsAt: string,
  interval: BillingInterval,
  intervalCount: number,
): string {
  if (!Number.isSafeInteger(intervalCount) || intervalCount < 1) {
    throw new TypeError("intervalCount must be a positive integer.");
  }
  const start = normalizedTimestamp(startsAt, "startsAt");
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  const targetMonthIndex =
    interval === "month"
      ? startMonth + intervalCount
      : startMonth + intervalCount * 12;
  const targetYear = startYear + Math.floor(targetMonthIndex / 12);
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

export function addDurationDays(
  startsAt: string,
  durationDays: number,
): string {
  if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
    throw new TypeError("durationDays must be a positive integer.");
  }
  const start = normalizedTimestamp(startsAt, "startsAt");
  start.setUTCDate(start.getUTCDate() + durationDays);
  return start.toISOString();
}

export function boundaryReached(now: string, boundary: string): boolean {
  return (
    normalizedTimestamp(now, "now").valueOf() >=
    normalizedTimestamp(boundary, "boundary").valueOf()
  );
}
