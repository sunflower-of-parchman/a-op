import { activeCustomerCondition } from "./authority-guards.ts";
import type {
  BillingInterval,
  CustomerMembershipOverviewDTO,
  MembershipDTO,
  MembershipEventType,
  MembershipPlanDTO,
  MembershipPlanState,
  MembershipState,
  SubscriptionDTO,
  SubscriptionEventDTO,
  SubscriptionPlanDTO,
} from "@/lib/memberships/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const MEMBERSHIP_STATES = new Set<MembershipState>([
  "pending",
  "active",
  "paused",
  "cancellation_scheduled",
  "canceled",
  "expired",
]);
const PLAN_STATES = new Set<MembershipPlanState>([
  "draft",
  "active",
  "archived",
]);
const EVENT_TYPES = new Set<MembershipEventType>([
  "activated",
  "renewed",
  "paused",
  "resumed",
  "cancellation_scheduled",
  "cancellation_cleared",
  "canceled",
  "expired",
]);

export class MembershipReadIntegrityError extends Error {
  override readonly name = "MembershipReadIntegrityError";
}

function integrity(message: string): never {
  throw new MembershipReadIntegrityError(message);
}

function safeInputId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new TypeError(`${field} must be a safe application identifier.`);
  }
  return value;
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function nonBlank(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function state(value: unknown, label: string): MembershipState {
  if (
    typeof value !== "string" ||
    !MEMBERSHIP_STATES.has(value as MembershipState)
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as MembershipState;
}

function planState(value: unknown, label: string): MembershipPlanState {
  if (
    typeof value !== "string" ||
    !PLAN_STATES.has(value as MembershipPlanState)
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as MembershipPlanState;
}

function source(value: unknown): "owner" | "stripe_test" {
  if (value !== "owner" && value !== "stripe_test") {
    integrity("D1 returned an invalid membership source.");
  }
  return value;
}

function testOnly(environment: unknown, livemode: unknown): void {
  if (environment !== "test" || (livemode !== 0 && livemode !== false)) {
    integrity("D1 returned a non-test membership record.");
  }
}

function benefits(value: unknown): readonly string[] {
  if (typeof value !== "string")
    integrity("D1 returned invalid benefits JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid benefits JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (item) =>
        typeof item === "string" &&
        item.trim() === item &&
        item.length > 0 &&
        item.length <= 160,
    ) ||
    new Set(parsed).size !== parsed.length
  ) {
    integrity("D1 returned invalid membership benefits.");
  }
  return Object.freeze([...(parsed as string[])]);
}

interface MembershipPlanRow {
  [key: string]: unknown;
  id: unknown;
  slug: unknown;
  state: unknown;
  current_revision: unknown;
  updated_at: unknown;
  revision_id: unknown;
  revision: unknown;
  name: unknown;
  description: unknown;
  benefits_json: unknown;
  access_plan_id: unknown;
  access_plan_revision: unknown;
  download_credits: unknown;
  license_credits: unknown;
  duration_days: unknown;
  created_at: unknown;
}

function parseMembershipPlan(row: MembershipPlanRow): MembershipPlanDTO {
  const currentRevision = integer(
    row.current_revision,
    "current plan revision",
    1,
  );
  const revision = integer(row.revision, "plan revision", 1);
  if (currentRevision < revision) {
    integrity("D1 returned a future membership-plan revision.");
  }
  const accessPlanId =
    row.access_plan_id === null
      ? null
      : id(row.access_plan_id, "access-plan ID");
  const accessPlanRevision =
    row.access_plan_revision === null
      ? null
      : integer(row.access_plan_revision, "access-plan revision", 1);
  if ((accessPlanId === null) !== (accessPlanRevision === null)) {
    integrity("D1 returned an incomplete access-plan reference.");
  }
  return Object.freeze({
    id: id(row.id, "membership-plan ID"),
    slug: nonBlank(row.slug, "membership-plan slug"),
    state: planState(row.state, "membership-plan state"),
    revisionId: id(row.revision_id, "membership-plan revision ID"),
    revision,
    name: nonBlank(row.name, "membership-plan name"),
    description: string(row.description, "membership-plan description"),
    benefits: benefits(row.benefits_json),
    accessPlanId,
    accessPlanRevision,
    downloadCredits: integer(row.download_credits, "download-credit benefit"),
    licenseCredits: integer(row.license_credits, "license-credit benefit"),
    durationDays:
      row.duration_days === null
        ? null
        : integer(row.duration_days, "membership duration", 1),
    createdAt: timestamp(row.created_at, "membership-plan creation time"),
    updatedAt: timestamp(row.updated_at, "membership-plan update time"),
  });
}

const MEMBERSHIP_PLAN_SELECT = `SELECT
  membership_plans.id, membership_plans.slug, membership_plans.state,
  membership_plans.current_revision, membership_plans.updated_at,
  membership_plan_revisions.id AS revision_id,
  membership_plan_revisions.revision,
  membership_plan_revisions.name,
  membership_plan_revisions.description,
  membership_plan_revisions.benefits_json,
  membership_plan_revisions.access_plan_id,
  membership_plan_revisions.access_plan_revision,
  membership_plan_revisions.download_credits,
  membership_plan_revisions.license_credits,
  membership_plan_revisions.duration_days,
  membership_plan_revisions.created_at
 FROM membership_plans
 JOIN membership_plan_revisions
   ON membership_plan_revisions.membership_plan_id = membership_plans.id`;

export async function readMembershipPlan(
  binding: D1Database,
  rawMembershipPlanId: string,
  rawRevision?: number,
): Promise<MembershipPlanDTO | null> {
  const membershipPlanId = safeInputId(rawMembershipPlanId, "membershipPlanId");
  if (
    rawRevision !== undefined &&
    (!Number.isSafeInteger(rawRevision) || rawRevision < 1)
  ) {
    throw new TypeError("revision must be a positive integer.");
  }
  const revision = rawRevision ?? null;
  const row = await binding
    .prepare(
      `${MEMBERSHIP_PLAN_SELECT}
       WHERE membership_plans.id = ?1
         AND membership_plan_revisions.revision =
           COALESCE(?2, membership_plans.current_revision)
       LIMIT 1`,
    )
    .bind(membershipPlanId, revision)
    .first<MembershipPlanRow>();
  return row ? parseMembershipPlan(row) : null;
}

interface SubscriptionPlanRow {
  [key: string]: unknown;
  id: unknown;
  slug: unknown;
  name: unknown;
  description: unknown;
  membership_plan_id: unknown;
  membership_plan_revision_id: unknown;
  membership_plan_revision: unknown;
  billing_interval: unknown;
  interval_count: unknown;
  state: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function parseSubscriptionPlan(row: SubscriptionPlanRow): SubscriptionPlanDTO {
  if (row.billing_interval !== "month" && row.billing_interval !== "year") {
    integrity("D1 returned an invalid billing interval.");
  }
  return Object.freeze({
    id: id(row.id, "subscription-plan ID"),
    slug: nonBlank(row.slug, "subscription-plan slug"),
    name: nonBlank(row.name, "subscription-plan name"),
    description: string(row.description, "subscription-plan description"),
    membershipPlanId: id(row.membership_plan_id, "membership-plan ID"),
    membershipPlanRevisionId: id(
      row.membership_plan_revision_id,
      "membership-plan revision ID",
    ),
    membershipPlanRevision: integer(
      row.membership_plan_revision,
      "membership-plan revision",
      1,
    ),
    billingInterval: row.billing_interval as BillingInterval,
    intervalCount: integer(row.interval_count, "billing interval count", 1),
    state: planState(row.state, "subscription-plan state"),
    revision: integer(row.revision, "subscription-plan revision", 1),
    createdAt: timestamp(row.created_at, "subscription-plan creation time"),
    updatedAt: timestamp(row.updated_at, "subscription-plan update time"),
  });
}

export async function readSubscriptionPlan(
  binding: D1Database,
  rawSubscriptionPlanId: string,
): Promise<SubscriptionPlanDTO | null> {
  const subscriptionPlanId = safeInputId(
    rawSubscriptionPlanId,
    "subscriptionPlanId",
  );
  const row = await binding
    .prepare(
      `SELECT id, slug, name, description, membership_plan_id,
              membership_plan_revision_id, membership_plan_revision,
              billing_interval, interval_count, state, revision,
              created_at, updated_at
       FROM subscription_plans
       WHERE id = ?1
       LIMIT 1`,
    )
    .bind(subscriptionPlanId)
    .first<SubscriptionPlanRow>();
  return row ? parseSubscriptionPlan(row) : null;
}

interface MembershipRow {
  [key: string]: unknown;
  id: unknown;
  customer_user_id: unknown;
  membership_plan_id: unknown;
  membership_plan_revision_id: unknown;
  membership_plan_revision: unknown;
  source: unknown;
  state: unknown;
  starts_at: unknown;
  current_period_start: unknown;
  current_period_end: unknown;
  cancel_at: unknown;
  canceled_at: unknown;
  expired_at: unknown;
  stripe_environment: unknown;
  livemode: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function parseMembership(row: MembershipRow): MembershipDTO {
  testOnly(row.stripe_environment, row.livemode);
  const currentPeriodStart = timestamp(
    row.current_period_start,
    "membership period start",
  );
  const currentPeriodEnd = timestamp(
    row.current_period_end,
    "membership period end",
  );
  if (Date.parse(currentPeriodStart) >= Date.parse(currentPeriodEnd)) {
    integrity("D1 returned an invalid membership period.");
  }
  return Object.freeze({
    id: id(row.id, "membership ID"),
    customerUserId: id(row.customer_user_id, "customer user ID"),
    membershipPlanId: id(row.membership_plan_id, "membership-plan ID"),
    membershipPlanRevisionId: id(
      row.membership_plan_revision_id,
      "membership-plan revision ID",
    ),
    membershipPlanRevision: integer(
      row.membership_plan_revision,
      "membership-plan revision",
      1,
    ),
    source: source(row.source),
    state: state(row.state, "membership state"),
    startsAt: timestamp(row.starts_at, "membership start"),
    currentPeriodStart,
    currentPeriodEnd,
    cancelAt: nullableTimestamp(
      row.cancel_at,
      "membership cancellation boundary",
    ),
    canceledAt: nullableTimestamp(
      row.canceled_at,
      "membership cancellation time",
    ),
    expiredAt: nullableTimestamp(row.expired_at, "membership expiration time"),
    revision: integer(row.revision, "membership revision", 1),
    createdAt: timestamp(row.created_at, "membership creation time"),
    updatedAt: timestamp(row.updated_at, "membership update time"),
  });
}

const MEMBERSHIP_SELECT = `SELECT id, customer_user_id, membership_plan_id,
  membership_plan_revision_id, membership_plan_revision, source, state,
  starts_at, current_period_start, current_period_end, cancel_at, canceled_at,
  expired_at, stripe_environment, livemode, revision, created_at, updated_at
 FROM memberships`;

export async function readMembership(
  binding: D1Database,
  rawMembershipId: string,
): Promise<MembershipDTO | null> {
  const membershipId = safeInputId(rawMembershipId, "membershipId");
  const row = await binding
    .prepare(`${MEMBERSHIP_SELECT} WHERE id = ?1 LIMIT 1`)
    .bind(membershipId)
    .first<MembershipRow>();
  return row ? parseMembership(row) : null;
}

interface SubscriptionRow {
  [key: string]: unknown;
  id: unknown;
  customer_user_id: unknown;
  membership_id: unknown;
  subscription_plan_id: unknown;
  source: unknown;
  state: unknown;
  current_period_start: unknown;
  current_period_end: unknown;
  cancel_at: unknown;
  canceled_at: unknown;
  expired_at: unknown;
  stripe_environment: unknown;
  livemode: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function parseSubscription(row: SubscriptionRow): SubscriptionDTO {
  testOnly(row.stripe_environment, row.livemode);
  const currentPeriodStart = timestamp(
    row.current_period_start,
    "subscription period start",
  );
  const currentPeriodEnd = timestamp(
    row.current_period_end,
    "subscription period end",
  );
  if (Date.parse(currentPeriodStart) >= Date.parse(currentPeriodEnd)) {
    integrity("D1 returned an invalid subscription period.");
  }
  return Object.freeze({
    id: id(row.id, "subscription ID"),
    customerUserId: id(row.customer_user_id, "customer user ID"),
    membershipId: id(row.membership_id, "membership ID"),
    subscriptionPlanId: id(row.subscription_plan_id, "subscription-plan ID"),
    source: source(row.source),
    state: state(row.state, "subscription state"),
    currentPeriodStart,
    currentPeriodEnd,
    cancelAt: nullableTimestamp(
      row.cancel_at,
      "subscription cancellation boundary",
    ),
    canceledAt: nullableTimestamp(
      row.canceled_at,
      "subscription cancellation time",
    ),
    expiredAt: nullableTimestamp(
      row.expired_at,
      "subscription expiration time",
    ),
    revision: integer(row.revision, "subscription revision", 1),
    createdAt: timestamp(row.created_at, "subscription creation time"),
    updatedAt: timestamp(row.updated_at, "subscription update time"),
  });
}

const SUBSCRIPTION_SELECT = `SELECT id, customer_user_id, membership_id,
  subscription_plan_id, source, state, current_period_start,
  current_period_end, cancel_at, canceled_at, expired_at, stripe_environment,
  livemode, revision, created_at, updated_at
 FROM subscriptions`;

export async function readSubscription(
  binding: D1Database,
  rawSubscriptionId: string,
): Promise<SubscriptionDTO | null> {
  const subscriptionId = safeInputId(rawSubscriptionId, "subscriptionId");
  const row = await binding
    .prepare(`${SUBSCRIPTION_SELECT} WHERE id = ?1 LIMIT 1`)
    .bind(subscriptionId)
    .first<SubscriptionRow>();
  return row ? parseSubscription(row) : null;
}

interface SubscriptionEventRow {
  [key: string]: unknown;
  id: unknown;
  subscription_id: unknown;
  customer_user_id: unknown;
  event_type: unknown;
  source: unknown;
  from_state: unknown;
  to_state: unknown;
  period_start: unknown;
  period_end: unknown;
  idempotency_key: unknown;
  stripe_environment: unknown;
  livemode: unknown;
  created_at: unknown;
}

function parseSubscriptionEvent(
  row: SubscriptionEventRow,
): SubscriptionEventDTO {
  testOnly(row.stripe_environment, row.livemode);
  if (
    typeof row.event_type !== "string" ||
    !EVENT_TYPES.has(row.event_type as MembershipEventType)
  ) {
    integrity("D1 returned an invalid subscription event type.");
  }
  return Object.freeze({
    id: id(row.id, "subscription-event ID"),
    subscriptionId: id(row.subscription_id, "subscription ID"),
    customerUserId: id(row.customer_user_id, "customer user ID"),
    eventType: row.event_type as MembershipEventType,
    source: source(row.source),
    fromState:
      row.from_state === null
        ? null
        : state(row.from_state, "subscription event source state"),
    toState: state(row.to_state, "subscription event target state"),
    periodStart: timestamp(row.period_start, "subscription event period start"),
    periodEnd: timestamp(row.period_end, "subscription event period end"),
    idempotencyKey: nonBlank(
      row.idempotency_key,
      "subscription event operation key",
    ),
    createdAt: timestamp(row.created_at, "subscription event creation time"),
  });
}

const SUBSCRIPTION_EVENT_SELECT = `SELECT id, subscription_id,
  customer_user_id, event_type, source, from_state, to_state, period_start,
  period_end, idempotency_key, stripe_environment, livemode, created_at
 FROM subscription_events`;

export async function readSubscriptionHistory(
  binding: D1Database,
  rawSubscriptionId: string,
): Promise<readonly SubscriptionEventDTO[]> {
  const subscriptionId = safeInputId(rawSubscriptionId, "subscriptionId");
  const rows = await binding
    .prepare(
      `${SUBSCRIPTION_EVENT_SELECT}
       WHERE subscription_id = ?1
       ORDER BY created_at, rowid`,
    )
    .bind(subscriptionId)
    .all<SubscriptionEventRow>();
  return Object.freeze(rows.results.map(parseSubscriptionEvent));
}

export async function readCustomerMembershipOverview(
  binding: D1Database,
  rawCustomerUserId: string,
): Promise<CustomerMembershipOverviewDTO> {
  const customerUserId = safeInputId(rawCustomerUserId, "customerUserId");
  const authority = activeCustomerCondition(customerUserId);
  const [membershipRows, subscriptionRows, eventRows] = await Promise.all([
    binding
      .prepare(
        `${MEMBERSHIP_SELECT}
         WHERE customer_user_id = ?
           AND ${authority.sql}
         ORDER BY created_at DESC, id`,
      )
      .bind(customerUserId, ...authority.bindings)
      .all<MembershipRow>(),
    binding
      .prepare(
        `${SUBSCRIPTION_SELECT}
         WHERE customer_user_id = ?
           AND ${authority.sql}
         ORDER BY created_at DESC, id`,
      )
      .bind(customerUserId, ...authority.bindings)
      .all<SubscriptionRow>(),
    binding
      .prepare(
        `${SUBSCRIPTION_EVENT_SELECT}
         WHERE customer_user_id = ?
           AND ${authority.sql}
         ORDER BY created_at, rowid`,
      )
      .bind(customerUserId, ...authority.bindings)
      .all<SubscriptionEventRow>(),
  ]);
  if (
    membershipRows.results.length === 0 &&
    subscriptionRows.results.length === 0 &&
    eventRows.results.length === 0
  ) {
    const authorized = await binding
      .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
      .bind(...authority.bindings)
      .first<{ count: number }>();
    if (authorized?.count !== 1) {
      throw new RuntimeError(
        "MEMBERSHIP_CUSTOMER_REQUIRED",
        "Membership history requires a live customer authority record.",
        { status: 403, publicMessage: "Customer access is required." },
      );
    }
  }
  return Object.freeze({
    memberships: Object.freeze(membershipRows.results.map(parseMembership)),
    subscriptions: Object.freeze(
      subscriptionRows.results.map(parseSubscription),
    ),
    subscriptionEvents: Object.freeze(
      eventRows.results.map(parseSubscriptionEvent),
    ),
  });
}
