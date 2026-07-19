import { changedRows } from "./audit-events.ts";
import {
  activeCustomerCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareServerTelemetryEvent,
  type ServerTelemetryEventName,
} from "./telemetry-server.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
  type PreparedMutation,
} from "./mutation.ts";
import {
  addCalendarInterval,
  addDurationDays,
  boundaryReached,
  MembershipStateTransitionError,
  transitionMembershipState,
} from "@/lib/memberships/state-machine.ts";
import type {
  BillingInterval,
  MembershipEventType,
  MembershipMutationReceipt,
  MembershipPlanMutationReceipt,
  MembershipState,
  StripeTestFulfillmentReferenceInput,
  StripeTestMembershipActivationInput,
  StripeTestSubscriptionActivationInput,
  StripeTestSubscriptionReconciliationInput,
  StripeTestSubscriptionRenewalInput,
  SubscriptionMutationReceipt,
  SubscriptionPlanMutationReceipt,
} from "@/lib/memberships/types.ts";
import {
  validateMembershipActivationInput,
  validateMembershipPlanCreateInput,
  validateMembershipPlanRevisionInput,
  validateStripeTestMembershipActivationInput,
  validateStripeTestSubscriptionActivationInput,
  validateStripeTestSubscriptionReconciliationInput,
  validateStripeTestSubscriptionRenewalInput,
  validateSubscriptionActivationInput,
  validateSubscriptionPlanCreateInput,
  validateSubscriptionPlanRevisionInput,
  type MembershipValidationIssue,
} from "@/lib/memberships/validation.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

async function appendRelationshipTelemetry(
  binding: D1Database,
  statements: D1PreparedStatement[],
  input: {
    readonly eventName: Extract<
      ServerTelemetryEventName,
      | "membership-activated"
      | "subscription-activated"
      | "subscription-canceled"
    >;
    readonly resourceType: "membership" | "subscription";
    readonly resourceId: string;
    readonly customerUserId: string;
    readonly operationKey: string;
    readonly context: MutationContext;
    readonly durableConditionSql: string;
    readonly durableConditionBindings: readonly unknown[];
    readonly occurredAt?: string;
  },
): Promise<void> {
  statements.push(
    await prepareServerTelemetryEvent(binding, {
      eventName: input.eventName,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      sourceOperationKey: input.operationKey,
      userId: input.customerUserId,
      requestContext:
        input.context.actorUserId === input.customerUserId
          ? input.context.telemetry
          : undefined,
      ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
      durableCondition: {
        sql: input.durableConditionSql,
        bindings: input.durableConditionBindings,
      },
    }),
  );
}

interface CountRow {
  count: number;
}

interface MembershipPlanAggregateRow {
  id: string;
  slug: string;
  state: "draft" | "active" | "archived";
  current_revision: number;
}

interface MembershipPlanRevisionRow {
  id: string;
  membership_plan_id: string;
  revision: number;
  access_plan_id: string | null;
  access_plan_revision: number | null;
  download_credits: number;
  license_credits: number;
  duration_days: number | null;
}

interface SubscriptionPlanRow {
  id: string;
  slug: string;
  membership_plan_id: string;
  membership_plan_revision_id: string;
  membership_plan_revision: number;
  billing_interval: BillingInterval;
  interval_count: number;
  state: "draft" | "active" | "archived";
  revision: number;
}

interface MembershipAggregateRow {
  id: string;
  customer_user_id: string;
  membership_plan_id: string;
  membership_plan_revision_id: string;
  membership_plan_revision: number;
  source: "owner" | "stripe_test";
  state: MembershipState;
  starts_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at: string | null;
  revision: number;
  entitlement_count: number;
}

interface SubscriptionAggregateRow {
  id: string;
  customer_user_id: string;
  membership_id: string;
  subscription_plan_id: string;
  source: "owner" | "stripe_test";
  state: MembershipState;
  current_period_start: string;
  current_period_end: string;
  cancel_at: string | null;
  revision: number;
  membership_state: MembershipState;
  membership_revision: number;
  entitlement_count: number;
}

interface StripeTestFulfillmentRow {
  commerce_event_id: string;
  stripe_event_id: string;
  event_type: string;
  stripe_object_id: string;
  provider_event_created_at: string;
  event_status: "processing" | "completed";
  fulfillment_event_id: string;
  fulfillment_kind:
    "one_time" | "initial_subscription" | "renewal" | "subscription_state";
  fulfillment_provider_object_id: string;
  fulfillment_status: "processing" | "fulfilled";
  order_id: string;
  order_status: "pending" | "fulfilled";
  customer_user_id: string;
  commerce_product_id: string;
  commerce_product_revision: number;
  commerce_price_id: string;
  product_type: "membership" | "subscription";
  product_state: "draft" | "active" | "archived";
  membership_plan_id: string | null;
  membership_plan_revision_id: string | null;
  membership_plan_revision: number | null;
  subscription_plan_id: string | null;
  price_active: number;
  price_billing_interval: "one_time" | "month" | "year";
  price_interval_count: number;
  checkout_mode: "payment" | "subscription";
  stripe_customer_id: string | null;
  checkout_stripe_subscription_id: string | null;
  order_stripe_subscription_id: string | null;
}

interface StripeTestSubscriptionAggregateRow extends SubscriptionAggregateRow {
  commerce_product_id: string;
  commerce_price_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  last_provider_event_created_at: string;
}

interface AccessPlanItemRow {
  id: string;
  position: number;
  resource_type: string;
  resource_id: string;
  actions_json: string;
  remaining_uses: number | null;
  download_disposition: "inline" | "attachment" | null;
}

interface CreditAccountRow {
  id: string;
  customer_user_id: string;
  credit_kind: "download" | "license";
  available_balance: number;
  reserved_balance: number;
  consumed_balance: number;
  revision: number;
}

interface FrozenMembershipPlan {
  readonly aggregate: MembershipPlanAggregateRow;
  readonly revision: MembershipPlanRevisionRow;
  readonly accessItems: readonly AccessPlanItemRow[];
}

interface CreditGrantPlan {
  readonly kind: "download" | "license";
  readonly quantity: number;
  readonly accountId: string;
  readonly expectedAccountRevision: number;
  readonly availableBefore: number;
  readonly reservedBefore: number;
  readonly consumedBefore: number;
  readonly accountCreated: boolean;
  readonly lotId: string;
  readonly ledgerEntryId: string;
  readonly marker: string;
}

function invalidInput(
  issues: readonly MembershipValidationIssue[],
): RuntimeError {
  return new RuntimeError(
    "MEMBERSHIP_INPUT_INVALID",
    "The membership input did not satisfy its server contract.",
    {
      status: 400,
      publicMessage: "Review the membership fields and try again.",
      details: { issues },
    },
  );
}

function invalidIdentifier(field: string): RuntimeError {
  return invalidInput([
    Object.freeze({
      field,
      message: `${field} must be a safe application identifier.`,
    }),
  ]);
}

function safeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw invalidIdentifier(field);
  }
  return value;
}

function positiveRevision(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalidInput([
      Object.freeze({
        field,
        message: `${field} must be a positive revision.`,
      }),
    ]);
  }
  return value as number;
}

function normalizedTimestamp(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalidInput([
      Object.freeze({
        field,
        message: `${field} must be an ISO-compatible timestamp.`,
      }),
    ]);
  }
  return new Date(Date.parse(value)).toISOString();
}

function membershipNotFound(): RuntimeError {
  return new RuntimeError("MEMBERSHIP_NOT_FOUND", "Membership not found.", {
    status: 404,
    publicMessage: "That membership was not found.",
  });
}

function subscriptionNotFound(): RuntimeError {
  return new RuntimeError("SUBSCRIPTION_NOT_FOUND", "Subscription not found.", {
    status: 404,
    publicMessage: "That subscription was not found.",
  });
}

function planNotFound(kind: "membership" | "subscription"): RuntimeError {
  return new RuntimeError(
    `${kind.toUpperCase()}_PLAN_NOT_FOUND`,
    `${kind} plan not found.`,
    { status: 404, publicMessage: `That ${kind} plan was not found.` },
  );
}

function planUnavailable(kind: "membership" | "subscription"): RuntimeError {
  return new RuntimeError(
    `${kind.toUpperCase()}_PLAN_UNAVAILABLE`,
    `${kind} plan is not active at the requested revision.`,
    { status: 409, publicMessage: `Choose a current active ${kind} plan.` },
  );
}

function integrity(message: string): RuntimeError {
  return new RuntimeError("MEMBERSHIP_INTEGRITY", message, {
    status: 409,
    publicMessage:
      "The stored membership definition is incomplete. Review it before continuing.",
  });
}

function transitionUnavailable(
  subject: "membership" | "subscription",
  state: MembershipState,
  eventType: MembershipEventType,
): RuntimeError {
  return new RuntimeError(
    "MEMBERSHIP_TRANSITION_INVALID",
    `Cannot apply ${eventType} to ${subject} in ${state}.`,
    {
      status: 409,
      publicMessage: `This ${subject} cannot make that transition.`,
    },
  );
}

async function requireActiveOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "MEMBERSHIP_OWNER_REQUIRED",
    "Membership administration requires a live owner authority record.",
    { status: 403, publicMessage: "Owner access is required." },
  );
}

async function requireActiveCustomer(
  binding: D1Database,
  customerUserId: string,
): Promise<void> {
  const authority = activeCustomerCondition(customerUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "MEMBERSHIP_CUSTOMER_UNAVAILABLE",
    "Membership operations require a live customer authority record.",
    { status: 409, publicMessage: "Choose an active customer." },
  );
}

function prepareRequiredAuditEvent(
  binding: D1Database,
  input: {
    readonly actorUserId: string;
    readonly action: string;
    readonly subjectType: string;
    readonly subjectId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly requestId: string;
    readonly details?: Record<string, unknown>;
    readonly result: Record<string, unknown>;
  },
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, ?, CASE WHEN (${conditionSql}) THEN ? ELSE NULL END,
               ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      ...conditionBindings,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
    );
}

function isRequiredAuditGuardFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:NOT NULL|not-null).*audit_events\.action|audit_events\.action.*(?:NOT NULL|not-null)/i.test(
      error.message,
    )
  );
}

async function replayOrStale<T>(
  binding: D1Database,
  mutation: PreparedMutation<T>,
  error: unknown,
  subject: string,
): Promise<MutationResult<T>> {
  try {
    return await replayAfterMutationFailure(binding, mutation, error);
  } catch (replayError) {
    if (isRequiredAuditGuardFailure(replayError)) throw staleMutation(subject);
    throw replayError;
  }
}

async function readMembershipPlanAggregate(
  binding: D1Database,
  membershipPlanId: string,
): Promise<MembershipPlanAggregateRow | null> {
  return binding
    .prepare(
      `SELECT id, slug, state, current_revision
       FROM membership_plans WHERE id = ?1 LIMIT 1`,
    )
    .bind(membershipPlanId)
    .first<MembershipPlanAggregateRow>();
}

async function readMembershipPlanRevision(
  binding: D1Database,
  membershipPlanId: string,
  revision: number,
): Promise<MembershipPlanRevisionRow | null> {
  return binding
    .prepare(
      `SELECT id, membership_plan_id, revision, access_plan_id,
              access_plan_revision, download_credits, license_credits,
              duration_days
       FROM membership_plan_revisions
       WHERE membership_plan_id = ?1 AND revision = ?2
       LIMIT 1`,
    )
    .bind(membershipPlanId, revision)
    .first<MembershipPlanRevisionRow>();
}

async function readSubscriptionPlanRow(
  binding: D1Database,
  subscriptionPlanId: string,
): Promise<SubscriptionPlanRow | null> {
  return binding
    .prepare(
      `SELECT id, slug, membership_plan_id, membership_plan_revision_id,
              membership_plan_revision, billing_interval, interval_count,
              state, revision
       FROM subscription_plans WHERE id = ?1 LIMIT 1`,
    )
    .bind(subscriptionPlanId)
    .first<SubscriptionPlanRow>();
}

async function validateAccessPlanReference(
  binding: D1Database,
  accessPlanId: string | null,
  accessPlanRevision: number | null,
): Promise<void> {
  if (accessPlanId === null && accessPlanRevision === null) return;
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM access_plans
       WHERE id = ?1 AND revision = ?2 AND state = 'active'`,
    )
    .bind(accessPlanId, accessPlanRevision)
    .first<CountRow>();
  if (row?.count !== 1) {
    throw new RuntimeError(
      "MEMBERSHIP_ACCESS_PLAN_UNAVAILABLE",
      "Membership benefits require an exact active access-plan revision.",
      {
        status: 409,
        publicMessage: "Choose a current active access plan.",
      },
    );
  }
}

export async function createMembershipPlan(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<MembershipPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateMembershipPlanCreateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "membership.plan.create";
  const mutation = await prepareMutation<MembershipPlanMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const slugRow = await binding
    .prepare("SELECT id FROM membership_plans WHERE slug = ?1 LIMIT 1")
    .bind(input.slug)
    .first<{ id: string }>();
  if (slugRow) {
    throw new RuntimeError(
      "MEMBERSHIP_PLAN_SLUG_TAKEN",
      "A membership plan already uses this slug.",
      {
        status: 409,
        publicMessage: "Choose a different membership-plan slug.",
      },
    );
  }
  await validateAccessPlanReference(
    binding,
    input.accessPlanId,
    input.accessPlanRevision,
  );

  const membershipPlanId = `membership_plan_${crypto.randomUUID()}`;
  const revisionId = `membership_plan_revision_${crypto.randomUUID()}`;
  const result: MembershipPlanMutationReceipt = Object.freeze({
    membershipPlanId,
    slug: input.slug,
    state: input.state,
    revisionId,
    revision: 1,
    created: true,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO membership_plans
          (id, slug, state, current_revision, created_by_user_id,
           last_operation_key)
         SELECT ?, ?, ?, 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM membership_plans WHERE slug = ?)
           AND ${authority.sql}`,
      )
      .bind(
        membershipPlanId,
        input.slug,
        input.state,
        context.actorUserId,
        mutation.namespacedKey,
        input.slug,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO membership_plan_revisions
          (id, membership_plan_id, revision, name, description, benefits_json,
           access_plan_id, access_plan_revision, download_credits,
           license_credits, duration_days, created_by_user_id)
         SELECT ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM membership_plans
           WHERE id = ? AND current_revision = 1 AND state = ?
             AND last_operation_key = ?
         )
           AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        membershipPlanId,
        input.name,
        input.description,
        JSON.stringify(input.benefits),
        input.accessPlanId,
        input.accessPlanRevision,
        input.downloadCredits,
        input.licenseCredits,
        input.durationDays,
        context.actorUserId,
        membershipPlanId,
        input.state,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM membership_plans
    WHERE id = ? AND slug = ? AND state = ? AND current_revision = 1
      AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM membership_plan_revisions
    WHERE id = ? AND membership_plan_id = ? AND revision = 1
  ) AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    membershipPlanId,
    input.slug,
    input.state,
    mutation.namespacedKey,
    revisionId,
    membershipPlanId,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "membership-plan",
        subjectId: membershipPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          accessPlanId: input.accessPlanId,
          accessPlanRevision: input.accessPlanRevision,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("membership plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "membership plan");
  }
}

export async function reviseMembershipPlan(
  binding: D1Database,
  rawMembershipPlanId: string,
  rawInput: unknown,
  rawExpectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<MembershipPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const membershipPlanId = safeId(rawMembershipPlanId, "membershipPlanId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const validated = validateMembershipPlanRevisionInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "membership.plan.revise";
  const mutation = await prepareMutation<MembershipPlanMutationReceipt>(
    binding,
    operation,
    context,
    { membershipPlanId, expectedRevision, definition: input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readMembershipPlanAggregate(
    binding,
    membershipPlanId,
  );
  if (!aggregate) throw planNotFound("membership");
  if (aggregate.state === "archived") throw planUnavailable("membership");
  if (aggregate.current_revision !== expectedRevision) {
    throw staleMutation("membership plan");
  }
  await validateAccessPlanReference(
    binding,
    input.accessPlanId,
    input.accessPlanRevision,
  );

  const nextRevision = expectedRevision + 1;
  const revisionId = `membership_plan_revision_${crypto.randomUUID()}`;
  const result: MembershipPlanMutationReceipt = Object.freeze({
    membershipPlanId,
    slug: aggregate.slug,
    state: aggregate.state,
    revisionId,
    revision: nextRevision,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO membership_plan_revisions
          (id, membership_plan_id, revision, name, description, benefits_json,
           access_plan_id, access_plan_revision, download_credits,
           license_credits, duration_days, created_by_user_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM membership_plans
           WHERE id = ? AND current_revision = ? AND state <> 'archived'
         )
           AND ${authority.sql}`,
      )
      .bind(
        revisionId,
        membershipPlanId,
        nextRevision,
        input.name,
        input.description,
        JSON.stringify(input.benefits),
        input.accessPlanId,
        input.accessPlanRevision,
        input.downloadCredits,
        input.licenseCredits,
        input.durationDays,
        context.actorUserId,
        membershipPlanId,
        expectedRevision,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE membership_plans
         SET current_revision = ?, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND current_revision = ? AND state <> 'archived'
           AND EXISTS (
             SELECT 1 FROM membership_plan_revisions
             WHERE id = ? AND membership_plan_id = ? AND revision = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        nextRevision,
        mutation.namespacedKey,
        membershipPlanId,
        expectedRevision,
        revisionId,
        membershipPlanId,
        nextRevision,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM membership_plans
    WHERE id = ? AND current_revision = ? AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM membership_plan_revisions
    WHERE id = ? AND membership_plan_id = ? AND revision = ?
  ) AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    membershipPlanId,
    nextRevision,
    mutation.namespacedKey,
    revisionId,
    membershipPlanId,
    nextRevision,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "membership-plan",
        subjectId: membershipPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { previousRevision: expectedRevision },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("membership plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "membership plan");
  }
}

export async function createSubscriptionPlan(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<SubscriptionPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateSubscriptionPlanCreateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "subscription.plan.create";
  const mutation = await prepareMutation<SubscriptionPlanMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const slugRow = await binding
    .prepare("SELECT id FROM subscription_plans WHERE slug = ?1 LIMIT 1")
    .bind(input.slug)
    .first<{ id: string }>();
  if (slugRow) {
    throw new RuntimeError(
      "SUBSCRIPTION_PLAN_SLUG_TAKEN",
      "A subscription plan already uses this slug.",
      {
        status: 409,
        publicMessage: "Choose a different subscription-plan slug.",
      },
    );
  }
  const membershipPlan = await readMembershipPlanAggregate(
    binding,
    input.membershipPlanId,
  );
  const membershipRevision = await readMembershipPlanRevision(
    binding,
    input.membershipPlanId,
    input.membershipPlanRevision,
  );
  if (!membershipPlan || !membershipRevision) throw planNotFound("membership");
  if (input.state === "active" && membershipPlan.state !== "active") {
    throw planUnavailable("membership");
  }

  const subscriptionPlanId = `subscription_plan_${crypto.randomUUID()}`;
  const result: SubscriptionPlanMutationReceipt = Object.freeze({
    subscriptionPlanId,
    slug: input.slug,
    state: input.state,
    revision: 1,
    created: true,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const exactMembershipState =
    input.state === "active" ? "active" : membershipPlan.state;
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO subscription_plans
          (id, slug, name, description, membership_plan_id,
           membership_plan_revision_id, membership_plan_revision,
           billing_interval, interval_count, state, revision,
           created_by_user_id, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = ?)
           AND EXISTS (
             SELECT 1 FROM membership_plans
             WHERE id = ? AND state = ?
           )
           AND EXISTS (
             SELECT 1 FROM membership_plan_revisions
             WHERE id = ? AND membership_plan_id = ? AND revision = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        subscriptionPlanId,
        input.slug,
        input.name,
        input.description,
        input.membershipPlanId,
        membershipRevision.id,
        input.membershipPlanRevision,
        input.billingInterval,
        input.intervalCount,
        input.state,
        context.actorUserId,
        mutation.namespacedKey,
        input.slug,
        input.membershipPlanId,
        exactMembershipState,
        membershipRevision.id,
        input.membershipPlanId,
        input.membershipPlanRevision,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM subscription_plans
    WHERE id = ? AND slug = ? AND state = ? AND revision = 1
      AND last_operation_key = ? AND membership_plan_revision_id = ?
  ) AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    subscriptionPlanId,
    input.slug,
    input.state,
    mutation.namespacedKey,
    membershipRevision.id,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription-plan",
        subjectId: subscriptionPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          membershipPlanId: input.membershipPlanId,
          membershipPlanRevision: input.membershipPlanRevision,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("subscription plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "subscription plan");
  }
}

export async function reviseSubscriptionPlan(
  binding: D1Database,
  rawSubscriptionPlanId: string,
  rawInput: unknown,
  rawExpectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<SubscriptionPlanMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const subscriptionPlanId = safeId(
    rawSubscriptionPlanId,
    "subscriptionPlanId",
  );
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const validated = validateSubscriptionPlanRevisionInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "subscription.plan.revise";
  const mutation = await prepareMutation<SubscriptionPlanMutationReceipt>(
    binding,
    operation,
    context,
    { subscriptionPlanId, expectedRevision, definition: input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readSubscriptionPlanRow(binding, subscriptionPlanId);
  if (!aggregate) throw planNotFound("subscription");
  if (aggregate.state === "archived") throw planUnavailable("subscription");
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("subscription plan");
  }
  const referenceCount = await binding
    .prepare(
      "SELECT COUNT(*) AS count FROM subscriptions WHERE subscription_plan_id = ?1",
    )
    .bind(subscriptionPlanId)
    .first<CountRow>();
  if ((referenceCount?.count ?? 0) > 0) {
    throw new RuntimeError(
      "SUBSCRIPTION_PLAN_LOCKED",
      "A referenced subscription-plan definition is immutable.",
      {
        status: 409,
        publicMessage:
          "This subscription plan has history. Create a new plan for a different cadence or benefit revision.",
      },
    );
  }
  const membershipPlan = await readMembershipPlanAggregate(
    binding,
    input.membershipPlanId,
  );
  const membershipRevision = await readMembershipPlanRevision(
    binding,
    input.membershipPlanId,
    input.membershipPlanRevision,
  );
  if (!membershipPlan || !membershipRevision) throw planNotFound("membership");
  if (aggregate.state === "active" && membershipPlan.state !== "active") {
    throw planUnavailable("membership");
  }

  const result: SubscriptionPlanMutationReceipt = Object.freeze({
    subscriptionPlanId,
    slug: aggregate.slug,
    state: aggregate.state,
    revision: expectedRevision + 1,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE subscription_plans
         SET name = ?, description = ?, membership_plan_id = ?,
             membership_plan_revision_id = ?, membership_plan_revision = ?,
             billing_interval = ?, interval_count = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revision = ? AND state <> 'archived'
           AND NOT EXISTS (
             SELECT 1 FROM subscriptions
             WHERE subscription_plan_id = subscription_plans.id
           )
           AND EXISTS (
             SELECT 1 FROM membership_plans
             WHERE id = ? AND state = ?
           )
           AND EXISTS (
             SELECT 1 FROM membership_plan_revisions
             WHERE id = ? AND membership_plan_id = ? AND revision = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        input.name,
        input.description,
        input.membershipPlanId,
        membershipRevision.id,
        input.membershipPlanRevision,
        input.billingInterval,
        input.intervalCount,
        mutation.namespacedKey,
        subscriptionPlanId,
        expectedRevision,
        input.membershipPlanId,
        aggregate.state === "active" ? "active" : membershipPlan.state,
        membershipRevision.id,
        input.membershipPlanId,
        input.membershipPlanRevision,
        ...authority.bindings,
      ),
  ];
  const exactSql = `EXISTS (
    SELECT 1 FROM subscription_plans
    WHERE id = ? AND revision = ? AND last_operation_key = ?
      AND membership_plan_id = ? AND membership_plan_revision_id = ?
      AND membership_plan_revision = ?
  ) AND NOT EXISTS (
    SELECT 1 FROM subscriptions WHERE subscription_plan_id = ?
  ) AND ${authority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    subscriptionPlanId,
    result.revision,
    mutation.namespacedKey,
    input.membershipPlanId,
    membershipRevision.id,
    input.membershipPlanRevision,
    subscriptionPlanId,
    ...authority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription-plan",
        subjectId: subscriptionPlanId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { previousRevision: expectedRevision },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("subscription plan");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "subscription plan");
  }
}

function parseActions(value: unknown): readonly string[] {
  if (typeof value !== "string") {
    throw integrity("An access-plan item has invalid action data.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw integrity("An access-plan item has invalid action JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > 3 ||
    !parsed.every(
      (action) =>
        action === "view" || action === "stream" || action === "download",
    ) ||
    new Set(parsed).size !== parsed.length
  ) {
    throw integrity("An access-plan item has unsupported actions.");
  }
  return Object.freeze([...(parsed as string[])]);
}

async function readFrozenMembershipPlan(
  binding: D1Database,
  membershipPlanId: string,
  membershipPlanRevision: number,
  requireCurrentRevision: boolean,
): Promise<FrozenMembershipPlan> {
  const aggregate = await readMembershipPlanAggregate(
    binding,
    membershipPlanId,
  );
  const revision = await readMembershipPlanRevision(
    binding,
    membershipPlanId,
    membershipPlanRevision,
  );
  if (!aggregate || !revision) throw planNotFound("membership");
  if (
    aggregate.state !== "active" ||
    (requireCurrentRevision &&
      aggregate.current_revision !== membershipPlanRevision)
  ) {
    throw planUnavailable("membership");
  }
  if (
    !Number.isSafeInteger(revision.download_credits) ||
    revision.download_credits < 0 ||
    !Number.isSafeInteger(revision.license_credits) ||
    revision.license_credits < 0 ||
    (revision.duration_days !== null &&
      (!Number.isSafeInteger(revision.duration_days) ||
        revision.duration_days < 1))
  ) {
    throw integrity("A membership-plan revision has invalid benefit values.");
  }
  if (
    (revision.access_plan_id === null) !==
    (revision.access_plan_revision === null)
  ) {
    throw integrity(
      "A membership-plan revision has an incomplete access plan.",
    );
  }

  let accessItems: readonly AccessPlanItemRow[] = Object.freeze([]);
  if (
    revision.access_plan_id !== null &&
    revision.access_plan_revision !== null
  ) {
    const accessPlan = await binding
      .prepare(
        `SELECT COUNT(*) AS count
         FROM access_plans
         WHERE id = ?1 AND revision = ?2 AND state = 'active'`,
      )
      .bind(revision.access_plan_id, revision.access_plan_revision)
      .first<CountRow>();
    if (accessPlan?.count !== 1) {
      throw new RuntimeError(
        "MEMBERSHIP_ACCESS_REVISION_CHANGED",
        "The frozen membership access-plan revision is no longer materializable.",
        {
          status: 409,
          publicMessage:
            "This membership definition needs a new access-plan revision.",
        },
      );
    }
    const rows = await binding
      .prepare(
        `SELECT id, position, resource_type, resource_id, actions_json,
                remaining_uses, download_disposition
         FROM access_plan_items
         WHERE access_plan_id = ?1
         ORDER BY position`,
      )
      .bind(revision.access_plan_id)
      .all<AccessPlanItemRow>();
    rows.results.forEach((item, index) => {
      if (
        item.position !== index + 1 ||
        item.remaining_uses !== null ||
        !SAFE_ID.test(item.id) ||
        !SAFE_ID.test(item.resource_type) ||
        !SAFE_ID.test(item.resource_id) ||
        (item.download_disposition !== null &&
          item.download_disposition !== "inline" &&
          item.download_disposition !== "attachment")
      ) {
        throw integrity("A frozen access-plan item is invalid.");
      }
      parseActions(item.actions_json);
    });
    accessItems = Object.freeze([...rows.results]);
  }
  return Object.freeze({ aggregate, revision, accessItems });
}

async function readCreditAccount(
  binding: D1Database,
  customerUserId: string,
  kind: "download" | "license",
): Promise<CreditAccountRow | null> {
  const row = await binding
    .prepare(
      `SELECT id, customer_user_id, credit_kind, available_balance,
              reserved_balance, consumed_balance, revision
       FROM credit_accounts
       WHERE customer_user_id = ?1 AND credit_kind = ?2
         AND stripe_environment = 'test' AND livemode = 0
       LIMIT 1`,
    )
    .bind(customerUserId, kind)
    .first<CreditAccountRow>();
  if (
    row &&
    (!Number.isSafeInteger(row.available_balance) ||
      row.available_balance < 0 ||
      !Number.isSafeInteger(row.reserved_balance) ||
      row.reserved_balance < 0 ||
      !Number.isSafeInteger(row.consumed_balance) ||
      row.consumed_balance < 0 ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1)
  ) {
    throw integrity("A credit account has invalid balances.");
  }
  return row;
}

async function planCreditGrants(
  binding: D1Database,
  customerUserId: string,
  downloadCredits: number,
  licenseCredits: number,
  mutationMarker: string,
): Promise<readonly CreditGrantPlan[]> {
  const plans: CreditGrantPlan[] = [];
  for (const [kind, quantity] of [
    ["download", downloadCredits],
    ["license", licenseCredits],
  ] as const) {
    if (quantity === 0) continue;
    const account = await readCreditAccount(binding, customerUserId, kind);
    plans.push(
      Object.freeze({
        kind,
        quantity,
        accountId: account?.id ?? `credit_account_${crypto.randomUUID()}`,
        expectedAccountRevision: account?.revision ?? 1,
        availableBefore: account?.available_balance ?? 0,
        reservedBefore: account?.reserved_balance ?? 0,
        consumedBefore: account?.consumed_balance ?? 0,
        accountCreated: account === null,
        lotId: `credit_grant_lot_${crypto.randomUUID()}`,
        ledgerEntryId: `credit_ledger_${crypto.randomUUID()}`,
        marker: `${mutationMarker}:${kind}`,
      }),
    );
  }
  return Object.freeze(plans);
}

function combineAuthorities(
  ...conditions: readonly SqlAuthorityCondition[]
): SqlAuthorityCondition {
  return Object.freeze({
    sql: conditions.map(({ sql }) => `(${sql})`).join(" AND "),
    bindings: Object.freeze(
      conditions.flatMap(({ bindings }) => [...bindings]),
    ),
  });
}

function appendCreditGrantStatements(
  binding: D1Database,
  statements: D1PreparedStatement[],
  input: {
    readonly grants: readonly CreditGrantPlan[];
    readonly customerUserId: string;
    readonly originType: "membership" | "subscription";
    readonly originId: string;
    readonly expiresAt: string;
    readonly originConditionSql: string;
    readonly originConditionBindings: readonly (number | string)[];
    readonly authority: SqlAuthorityCondition;
    readonly fulfillmentEventId: string | null;
  },
): readonly number[] {
  const requiredChangeIndexes: number[] = [];
  for (const grant of input.grants) {
    if (grant.accountCreated) {
      requiredChangeIndexes.push(statements.length);
      statements.push(
        binding
          .prepare(
            `INSERT INTO credit_accounts
              (id, customer_user_id, credit_kind, available_balance,
               reserved_balance, consumed_balance, stripe_environment,
               livemode, revision)
             SELECT ?, ?, ?, 0, 0, 0, 'test', 0, 1
             WHERE NOT EXISTS (
               SELECT 1 FROM credit_accounts
               WHERE customer_user_id = ? AND credit_kind = ?
             )
               AND (${input.originConditionSql})
               AND ${input.authority.sql}`,
          )
          .bind(
            grant.accountId,
            input.customerUserId,
            grant.kind,
            input.customerUserId,
            grant.kind,
            ...input.originConditionBindings,
            ...input.authority.bindings,
          ),
      );
    }
    const accountRevisionAfter = grant.expectedAccountRevision + 1;
    const availableAfter = grant.availableBefore + grant.quantity;
    requiredChangeIndexes.push(statements.length);
    statements.push(
      binding
        .prepare(
          `UPDATE credit_accounts
           SET available_balance = available_balance + ?,
               revision = revision + 1, last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
             AND available_balance = ? AND reserved_balance = ?
             AND consumed_balance = ? AND revision = ?
             AND stripe_environment = 'test' AND livemode = 0
             AND (${input.originConditionSql})
             AND ${input.authority.sql}`,
        )
        .bind(
          grant.quantity,
          grant.marker,
          grant.accountId,
          input.customerUserId,
          grant.kind,
          grant.availableBefore,
          grant.reservedBefore,
          grant.consumedBefore,
          grant.expectedAccountRevision,
          ...input.originConditionBindings,
          ...input.authority.bindings,
        ),
    );
    requiredChangeIndexes.push(statements.length);
    statements.push(
      binding
        .prepare(
          `INSERT INTO credit_grant_lots
            (id, credit_account_id, customer_user_id, credit_kind,
             origin_type, origin_id, quantity_granted, quantity_available,
             quantity_reserved, quantity_consumed, quantity_expired,
             quantity_reversed, state, expires_at, stripe_environment,
             fulfillment_event_id, livemode, revision, last_operation_key)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'active', ?,
                  'test', ?, 0, 1, ?
           WHERE EXISTS (
             SELECT 1 FROM credit_accounts
             WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
               AND available_balance = ? AND reserved_balance = ?
               AND consumed_balance = ? AND revision = ?
               AND last_operation_key = ?
           )
             AND NOT EXISTS (
               SELECT 1 FROM credit_grant_lots
               WHERE credit_account_id = ? AND origin_type = ? AND origin_id = ?
             )
             AND (${input.originConditionSql})
             AND ${input.authority.sql}`,
        )
        .bind(
          grant.lotId,
          grant.accountId,
          input.customerUserId,
          grant.kind,
          input.originType,
          input.originId,
          grant.quantity,
          grant.quantity,
          input.expiresAt,
          input.fulfillmentEventId,
          grant.marker,
          grant.accountId,
          input.customerUserId,
          grant.kind,
          availableAfter,
          grant.reservedBefore,
          grant.consumedBefore,
          accountRevisionAfter,
          grant.marker,
          grant.accountId,
          input.originType,
          input.originId,
          ...input.originConditionBindings,
          ...input.authority.bindings,
        ),
    );
    requiredChangeIndexes.push(statements.length);
    statements.push(
      binding
        .prepare(
          `INSERT INTO credit_ledger_entries
            (id, credit_account_id, customer_user_id, credit_kind,
             credit_grant_lot_id, credit_reservation_id, entry_type,
             available_delta, reserved_delta, consumed_delta,
             available_after, reserved_after, consumed_after, origin_type,
             origin_id, fulfillment_event_id, stripe_environment, livemode,
             idempotency_key)
           SELECT ?, ?, ?, ?, ?, NULL, 'grant', ?, 0, 0, ?, ?, ?, ?, ?,
                  ?, 'test', 0, ?
           WHERE EXISTS (
             SELECT 1 FROM credit_grant_lots
             WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
               AND credit_kind = ? AND origin_type = ? AND origin_id = ?
               AND quantity_granted = ? AND quantity_available = ?
               AND state = 'active' AND last_operation_key = ?
           )
             AND (${input.originConditionSql})
             AND ${input.authority.sql}`,
        )
        .bind(
          grant.ledgerEntryId,
          grant.accountId,
          input.customerUserId,
          grant.kind,
          grant.lotId,
          grant.quantity,
          availableAfter,
          grant.reservedBefore,
          grant.consumedBefore,
          input.originType,
          input.originId,
          input.fulfillmentEventId,
          grant.marker,
          grant.lotId,
          grant.accountId,
          input.customerUserId,
          grant.kind,
          input.originType,
          input.originId,
          grant.quantity,
          grant.quantity,
          grant.marker,
          ...input.originConditionBindings,
          ...input.authority.bindings,
        ),
    );
  }
  return Object.freeze(requiredChangeIndexes);
}

function appendEntitlementStatements(
  binding: D1Database,
  statements: D1PreparedStatement[],
  input: {
    readonly items: readonly AccessPlanItemRow[];
    readonly customerUserId: string;
    readonly sourceType: "membership" | "subscription";
    readonly sourceId: string;
    readonly startsAt: string;
    readonly expiresAt: string;
    readonly marker: string;
    readonly originConditionSql: string;
    readonly originConditionBindings: readonly (number | string)[];
    readonly authority: SqlAuthorityCondition;
    readonly fulfillmentEventId: string | null;
  },
): readonly number[] {
  const indexes: number[] = [];
  for (const item of input.items) {
    indexes.push(statements.length);
    statements.push(
      binding
        .prepare(
          `INSERT INTO entitlements
            (id, user_id, source_type, source_id, grant_id, resource_type,
             resource_id, actions_json, state, starts_at, expires_at,
             remaining_uses, download_disposition, stripe_environment,
             livemode, fulfillment_event_id, credit_reservation_id,
             revision, last_operation_key)
           SELECT ?, ?, ?, ?, NULL, ?, ?, ?, 'active', ?, ?, NULL, ?,
                  'test', 0, ?, NULL, 1, ?
           WHERE (${input.originConditionSql})
             AND NOT EXISTS (
               SELECT 1 FROM entitlements
               WHERE source_type = ? AND source_id = ?
                 AND resource_type = ? AND resource_id = ?
             )
             AND ${input.authority.sql}`,
        )
        .bind(
          `entitlement_${input.sourceType}_${crypto.randomUUID()}`,
          input.customerUserId,
          input.sourceType,
          input.sourceId,
          item.resource_type,
          item.resource_id,
          JSON.stringify(parseActions(item.actions_json)),
          input.startsAt,
          input.expiresAt,
          item.download_disposition,
          input.fulfillmentEventId,
          input.marker,
          ...input.originConditionBindings,
          input.sourceType,
          input.sourceId,
          item.resource_type,
          item.resource_id,
          ...input.authority.bindings,
        ),
    );
  }
  return Object.freeze(indexes);
}

export async function activateMembership(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateMembershipActivationInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "membership.activate";
  const mutation = await prepareMutation<MembershipMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  await requireActiveCustomer(binding, input.customerUserId);
  const frozen = await readFrozenMembershipPlan(
    binding,
    input.membershipPlanId,
    input.membershipPlanRevision,
    true,
  );
  if (frozen.revision.duration_days === null) {
    throw new RuntimeError(
      "MEMBERSHIP_DURATION_REQUIRED",
      "A direct membership activation requires a duration in its frozen plan.",
      {
        status: 409,
        publicMessage:
          "Set a membership duration before activating this plan directly.",
      },
    );
  }
  const existing = await binding
    .prepare(
      `SELECT id FROM memberships
       WHERE customer_user_id = ?1 AND membership_plan_id = ?2
         AND state IN ('pending', 'active', 'paused', 'cancellation_scheduled')
       LIMIT 1`,
    )
    .bind(input.customerUserId, input.membershipPlanId)
    .first<{ id: string }>();
  if (existing) {
    throw new RuntimeError(
      "MEMBERSHIP_ALREADY_ACTIVE",
      "The customer already has a live relationship for this membership plan.",
      {
        status: 409,
        publicMessage: "This customer already has that membership.",
      },
    );
  }

  const membershipId = `membership_${crypto.randomUUID()}`;
  const periodEnd = addDurationDays(
    input.startsAt,
    frozen.revision.duration_days,
  );
  const creditGrants = await planCreditGrants(
    binding,
    input.customerUserId,
    frozen.revision.download_credits,
    frozen.revision.license_credits,
    mutation.namespacedKey,
  );
  const result: MembershipMutationReceipt = Object.freeze({
    membershipId,
    customerUserId: input.customerUserId,
    membershipPlanId: input.membershipPlanId,
    membershipPlanRevisionId: frozen.revision.id,
    membershipPlanRevision: input.membershipPlanRevision,
    state: "active",
    currentPeriodStart: input.startsAt,
    currentPeriodEnd: periodEnd,
    cancelAt: null,
    revision: 1,
    entitlementCount: frozen.accessItems.length,
    downloadCreditsGranted: frozen.revision.download_credits,
    licenseCreditsGranted: frozen.revision.license_credits,
  });
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const mutationAuthority = combineAuthorities(
    ownerAuthority,
    customerAuthority,
  );
  const originConditionSql = `EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND membership_plan_id = ?
      AND membership_plan_revision_id = ? AND membership_plan_revision = ?
      AND source = 'owner' AND state = 'pending' AND revision = 1
      AND last_operation_key = ?
  )`;
  const originConditionBindings: readonly (number | string)[] = [
    membershipId,
    input.customerUserId,
    input.membershipPlanId,
    frozen.revision.id,
    input.membershipPlanRevision,
    mutation.namespacedKey,
  ];
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO memberships
          (id, customer_user_id, membership_plan_id,
           membership_plan_revision_id, membership_plan_revision, source,
           source_order_id, source_fulfillment_event_id, state, starts_at,
           current_period_start, current_period_end, cancel_at, canceled_at,
           expired_at, stripe_environment, livemode, revision,
           last_operation_key)
         SELECT ?, ?, ?, ?, ?, 'owner', NULL, NULL, 'pending', ?, ?, ?,
                NULL, NULL, NULL, 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM membership_plans
           WHERE id = ? AND state = 'active' AND current_revision = ?
         )
           AND EXISTS (
             SELECT 1 FROM membership_plan_revisions
             WHERE id = ? AND membership_plan_id = ? AND revision = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE customer_user_id = ? AND membership_plan_id = ?
               AND state IN
                 ('pending', 'active', 'paused', 'cancellation_scheduled')
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        input.membershipPlanId,
        frozen.revision.id,
        input.membershipPlanRevision,
        input.startsAt,
        input.startsAt,
        periodEnd,
        mutation.namespacedKey,
        input.membershipPlanId,
        input.membershipPlanRevision,
        frozen.revision.id,
        input.membershipPlanId,
        input.membershipPlanRevision,
        input.customerUserId,
        input.membershipPlanId,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  ];
  const entitlementIndexes = appendEntitlementStatements(binding, statements, {
    items: frozen.accessItems,
    customerUserId: input.customerUserId,
    sourceType: "membership",
    sourceId: membershipId,
    startsAt: input.startsAt,
    expiresAt: periodEnd,
    marker: mutation.namespacedKey,
    originConditionSql,
    originConditionBindings,
    authority: mutationAuthority,
    fulfillmentEventId: null,
  });
  const creditIndexes = appendCreditGrantStatements(binding, statements, {
    grants: creditGrants,
    customerUserId: input.customerUserId,
    originType: "membership",
    originId: membershipId,
    expiresAt: periodEnd,
    originConditionSql,
    originConditionBindings,
    authority: mutationAuthority,
    fulfillmentEventId: null,
  });
  const activationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE memberships
         SET state = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND state = 'pending'
           AND revision = 1 AND last_operation_key = ?
           AND (SELECT COUNT(*) FROM entitlements
                WHERE source_type = 'membership' AND source_id = ?
                  AND user_id = ? AND state = 'active'
                  AND last_operation_key = ?) = ?
           AND (SELECT COUNT(*) FROM credit_grant_lots
                WHERE origin_type = 'membership' AND origin_id = ?
                  AND customer_user_id = ? AND state = 'active') = ?
           AND (SELECT COUNT(*) FROM credit_ledger_entries
                WHERE origin_type = 'membership' AND origin_id = ?
                  AND customer_user_id = ? AND entry_type = 'grant') = ?
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        frozen.accessItems.length,
        membershipId,
        input.customerUserId,
        creditGrants.length,
        membershipId,
        input.customerUserId,
        creditGrants.length,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND state = 'active'
      AND revision = 1 AND last_operation_key = ?
  ) AND (
    SELECT COUNT(*) FROM entitlements
    WHERE source_type = 'membership' AND source_id = ? AND user_id = ?
      AND state = 'active' AND last_operation_key = ?
  ) = ? AND (
    SELECT COUNT(*) FROM credit_grant_lots
    WHERE origin_type = 'membership' AND origin_id = ?
      AND customer_user_id = ? AND state = 'active'
  ) = ? AND ${ownerAuthority.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    membershipId,
    input.customerUserId,
    mutation.namespacedKey,
    membershipId,
    input.customerUserId,
    mutation.namespacedKey,
    frozen.accessItems.length,
    membershipId,
    input.customerUserId,
    creditGrants.length,
    ...ownerAuthority.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "membership",
        subjectId: membershipId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          customerUserId: input.customerUserId,
          membershipPlanId: input.membershipPlanId,
          membershipPlanRevision: input.membershipPlanRevision,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  await appendRelationshipTelemetry(binding, statements, {
    eventName: "membership-activated",
    resourceType: "membership",
    resourceId: membershipId,
    customerUserId: input.customerUserId,
    operationKey: mutation.namespacedKey,
    context,
    durableConditionSql: exactSql,
    durableConditionBindings: exactBindings,
    occurredAt: input.startsAt,
  });
  try {
    const results = await runAtomicBatch(binding, statements);
    const everyRequiredChanged = [
      0,
      ...entitlementIndexes,
      ...creditIndexes,
      activationIndex,
      auditIndex,
    ].every((index) => changedRows(results[index]) === 1);
    if (!everyRequiredChanged) throw staleMutation("membership activation");
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "membership activation");
  }
}

export async function activateSubscription(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateSubscriptionActivationInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "subscription.activate";
  const mutation = await prepareMutation<SubscriptionMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  await requireActiveCustomer(binding, input.customerUserId);
  const subscriptionPlan = await readSubscriptionPlanRow(
    binding,
    input.subscriptionPlanId,
  );
  if (!subscriptionPlan) throw planNotFound("subscription");
  if (
    subscriptionPlan.state !== "active" ||
    subscriptionPlan.revision !== input.subscriptionPlanRevision
  ) {
    throw planUnavailable("subscription");
  }
  const frozen = await readFrozenMembershipPlan(
    binding,
    subscriptionPlan.membership_plan_id,
    subscriptionPlan.membership_plan_revision,
    false,
  );
  if (frozen.revision.id !== subscriptionPlan.membership_plan_revision_id) {
    throw integrity(
      "A subscription plan does not match its frozen membership revision.",
    );
  }
  const existing = await binding
    .prepare(
      `SELECT id FROM memberships
       WHERE customer_user_id = ?1 AND membership_plan_id = ?2
         AND state IN ('pending', 'active', 'paused', 'cancellation_scheduled')
       LIMIT 1`,
    )
    .bind(input.customerUserId, subscriptionPlan.membership_plan_id)
    .first<{ id: string }>();
  if (existing) {
    throw new RuntimeError(
      "MEMBERSHIP_ALREADY_ACTIVE",
      "The customer already has a live relationship for this membership plan.",
      {
        status: 409,
        publicMessage: "This customer already has that membership.",
      },
    );
  }

  const membershipId = `membership_${crypto.randomUUID()}`;
  const subscriptionId = `subscription_${crypto.randomUUID()}`;
  const eventId = `subscription_event_${crypto.randomUUID()}`;
  const periodEnd = addCalendarInterval(
    input.startsAt,
    subscriptionPlan.billing_interval,
    subscriptionPlan.interval_count,
  );
  const creditGrants = await planCreditGrants(
    binding,
    input.customerUserId,
    frozen.revision.download_credits,
    frozen.revision.license_credits,
    mutation.namespacedKey,
  );
  const result: SubscriptionMutationReceipt = Object.freeze({
    subscriptionId,
    membershipId,
    customerUserId: input.customerUserId,
    subscriptionPlanId: input.subscriptionPlanId,
    state: "active",
    currentPeriodStart: input.startsAt,
    currentPeriodEnd: periodEnd,
    cancelAt: null,
    revision: 1,
    membershipRevision: 1,
    entitlementCount: frozen.accessItems.length,
    downloadCreditsGranted: frozen.revision.download_credits,
    licenseCreditsGranted: frozen.revision.license_credits,
    eventType: "activated",
  });
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const mutationAuthority = combineAuthorities(
    ownerAuthority,
    customerAuthority,
  );
  const originConditionSql = `EXISTS (
    SELECT 1 FROM subscriptions
    JOIN memberships ON memberships.id = subscriptions.membership_id
      AND memberships.customer_user_id = subscriptions.customer_user_id
    WHERE subscriptions.id = ? AND subscriptions.customer_user_id = ?
      AND subscriptions.membership_id = ? AND subscriptions.state = 'pending'
      AND subscriptions.revision = 1
      AND subscriptions.last_operation_key = ?
      AND memberships.state = 'pending' AND memberships.revision = 1
      AND memberships.last_operation_key = ?
  )`;
  const originConditionBindings: readonly (number | string)[] = [
    subscriptionId,
    input.customerUserId,
    membershipId,
    mutation.namespacedKey,
    mutation.namespacedKey,
  ];
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO memberships
          (id, customer_user_id, membership_plan_id,
           membership_plan_revision_id, membership_plan_revision, source,
           source_order_id, source_fulfillment_event_id, state, starts_at,
           current_period_start, current_period_end, cancel_at, canceled_at,
           expired_at, stripe_environment, livemode, revision,
           last_operation_key)
         SELECT ?, ?, ?, ?, ?, 'owner', NULL, NULL, 'pending', ?, ?, ?,
                NULL, NULL, NULL, 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM subscription_plans
           WHERE id = ? AND state = 'active' AND revision = ?
             AND membership_plan_id = ?
             AND membership_plan_revision_id = ?
             AND membership_plan_revision = ?
         )
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE customer_user_id = ? AND membership_plan_id = ?
               AND state IN
                 ('pending', 'active', 'paused', 'cancellation_scheduled')
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        subscriptionPlan.membership_plan_id,
        frozen.revision.id,
        frozen.revision.revision,
        input.startsAt,
        input.startsAt,
        periodEnd,
        mutation.namespacedKey,
        input.subscriptionPlanId,
        input.subscriptionPlanRevision,
        subscriptionPlan.membership_plan_id,
        frozen.revision.id,
        frozen.revision.revision,
        input.customerUserId,
        subscriptionPlan.membership_plan_id,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO subscriptions
          (id, customer_user_id, membership_id, subscription_plan_id,
           commerce_product_id, commerce_price_id, source,
           stripe_subscription_id, stripe_customer_id, state,
           current_period_start, current_period_end, cancel_at_period_end,
           cancel_at, canceled_at, expired_at, last_provider_event_created_at,
           stripe_environment, livemode, revision, last_operation_key)
         SELECT ?, ?, ?, ?, NULL, NULL, 'owner', NULL, NULL, 'pending', ?, ?,
                0, NULL, NULL, NULL, NULL, 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM memberships
           WHERE id = ? AND customer_user_id = ? AND state = 'pending'
             AND revision = 1 AND last_operation_key = ?
         )
           AND EXISTS (
             SELECT 1 FROM subscription_plans
             WHERE id = ? AND state = 'active' AND revision = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        subscriptionId,
        input.customerUserId,
        membershipId,
        input.subscriptionPlanId,
        input.startsAt,
        periodEnd,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        input.subscriptionPlanId,
        input.subscriptionPlanRevision,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  ];
  const entitlementIndexes = appendEntitlementStatements(binding, statements, {
    items: frozen.accessItems,
    customerUserId: input.customerUserId,
    sourceType: "subscription",
    sourceId: subscriptionId,
    startsAt: input.startsAt,
    expiresAt: periodEnd,
    marker: mutation.namespacedKey,
    originConditionSql,
    originConditionBindings,
    authority: mutationAuthority,
    fulfillmentEventId: null,
  });
  const creditIndexes = appendCreditGrantStatements(binding, statements, {
    grants: creditGrants,
    customerUserId: input.customerUserId,
    originType: "subscription",
    originId: eventId,
    expiresAt: periodEnd,
    originConditionSql,
    originConditionBindings,
    authority: mutationAuthority,
    fulfillmentEventId: null,
  });
  const membershipActivationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE memberships
         SET state = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND state = 'pending'
           AND revision = 1 AND last_operation_key = ?
           AND (SELECT COUNT(*) FROM entitlements
                WHERE source_type = 'subscription' AND source_id = ?
                  AND user_id = ? AND state = 'active'
                  AND last_operation_key = ?) = ?
           AND (SELECT COUNT(*) FROM credit_grant_lots
                WHERE origin_type = 'subscription' AND origin_id = ?
                  AND customer_user_id = ? AND state = 'active') = ?
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        subscriptionId,
        input.customerUserId,
        mutation.namespacedKey,
        frozen.accessItems.length,
        eventId,
        input.customerUserId,
        creditGrants.length,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const subscriptionActivationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE subscriptions
         SET state = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND membership_id = ?
           AND state = 'pending' AND revision = 1 AND last_operation_key = ?
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
               AND revision = 1 AND last_operation_key = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        subscriptionId,
        input.customerUserId,
        membershipId,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const eventIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO subscription_events
          (id, subscription_id, customer_user_id, event_type, source,
           from_state, to_state, period_start, period_end, stripe_event_id,
           provider_object_id, fulfillment_event_id, order_id,
           idempotency_key, stripe_environment, livemode)
         SELECT ?, ?, ?, 'activated', 'owner', 'pending', 'active', ?, ?,
                NULL, NULL, NULL, NULL, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND membership_id = ?
             AND state = 'active' AND revision = 1
             AND last_operation_key = ?
         )
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
               AND revision = 1 AND last_operation_key = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        eventId,
        subscriptionId,
        input.customerUserId,
        input.startsAt,
        periodEnd,
        mutation.namespacedKey,
        subscriptionId,
        input.customerUserId,
        membershipId,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = ? AND customer_user_id = ? AND membership_id = ?
      AND state = 'active' AND revision = 1 AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND state = 'active'
      AND revision = 1 AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM subscription_events
    WHERE id = ? AND subscription_id = ? AND customer_user_id = ?
      AND event_type = 'activated' AND idempotency_key = ?
  ) AND (
    SELECT COUNT(*) FROM entitlements
    WHERE source_type = 'subscription' AND source_id = ? AND user_id = ?
      AND state = 'active' AND last_operation_key = ?
  ) = ? AND (
    SELECT COUNT(*) FROM credit_grant_lots
    WHERE origin_type = 'subscription' AND origin_id = ?
      AND customer_user_id = ? AND state = 'active'
  ) = ? AND ${ownerAuthority.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    subscriptionId,
    input.customerUserId,
    membershipId,
    mutation.namespacedKey,
    membershipId,
    input.customerUserId,
    mutation.namespacedKey,
    eventId,
    subscriptionId,
    input.customerUserId,
    mutation.namespacedKey,
    subscriptionId,
    input.customerUserId,
    mutation.namespacedKey,
    frozen.accessItems.length,
    eventId,
    input.customerUserId,
    creditGrants.length,
    ...ownerAuthority.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription",
        subjectId: subscriptionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          customerUserId: input.customerUserId,
          subscriptionPlanId: input.subscriptionPlanId,
          membershipPlanId: subscriptionPlan.membership_plan_id,
          membershipPlanRevision: subscriptionPlan.membership_plan_revision,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  await appendRelationshipTelemetry(binding, statements, {
    eventName: "subscription-activated",
    resourceType: "subscription",
    resourceId: subscriptionId,
    customerUserId: input.customerUserId,
    operationKey: mutation.namespacedKey,
    context,
    durableConditionSql: exactSql,
    durableConditionBindings: exactBindings,
    occurredAt: input.startsAt,
  });
  try {
    const results = await runAtomicBatch(binding, statements);
    const everyRequiredChanged = [
      0,
      1,
      ...entitlementIndexes,
      ...creditIndexes,
      membershipActivationIndex,
      subscriptionActivationIndex,
      eventIndex,
      auditIndex,
    ].every((index) => changedRows(results[index]) === 1);
    if (!everyRequiredChanged) throw staleMutation("subscription activation");
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "subscription activation");
  }
}

async function readMembershipAggregate(
  binding: D1Database,
  membershipId: string,
): Promise<MembershipAggregateRow | null> {
  return binding
    .prepare(
      `SELECT memberships.id, memberships.customer_user_id,
              memberships.membership_plan_id,
              memberships.membership_plan_revision_id,
              memberships.membership_plan_revision, memberships.source,
              memberships.state, memberships.starts_at,
              memberships.current_period_start,
              memberships.current_period_end, memberships.cancel_at,
              memberships.revision,
              (SELECT COUNT(*) FROM entitlements
               WHERE source_type = 'membership'
                 AND source_id = memberships.id) AS entitlement_count
       FROM memberships
       WHERE memberships.id = ?1
       LIMIT 1`,
    )
    .bind(membershipId)
    .first<MembershipAggregateRow>();
}

async function readSubscriptionAggregate(
  binding: D1Database,
  subscriptionId: string,
): Promise<SubscriptionAggregateRow | null> {
  return binding
    .prepare(
      `SELECT subscriptions.id, subscriptions.customer_user_id,
              subscriptions.membership_id,
              subscriptions.subscription_plan_id, subscriptions.source,
              subscriptions.state, subscriptions.current_period_start,
              subscriptions.current_period_end, subscriptions.cancel_at,
              subscriptions.revision,
              memberships.state AS membership_state,
              memberships.revision AS membership_revision,
              (SELECT COUNT(*) FROM entitlements
               WHERE source_type = 'subscription'
                 AND source_id = subscriptions.id) AS entitlement_count
       FROM subscriptions
       JOIN memberships
         ON memberships.id = subscriptions.membership_id
        AND memberships.customer_user_id = subscriptions.customer_user_id
       WHERE subscriptions.id = ?1
       LIMIT 1`,
    )
    .bind(subscriptionId)
    .first<SubscriptionAggregateRow>();
}

function nextState(
  subject: "membership" | "subscription",
  state: MembershipState,
  eventType: MembershipEventType,
): MembershipState {
  try {
    return transitionMembershipState(state, eventType);
  } catch (error) {
    if (error instanceof MembershipStateTransitionError) {
      throw transitionUnavailable(subject, state, eventType);
    }
    throw error;
  }
}

function transitionTimes(input: {
  readonly currentState: MembershipState;
  readonly nextState: MembershipState;
  readonly eventType: MembershipEventType;
  readonly currentPeriodEnd: string;
  readonly currentCancelAt: string | null;
  readonly effectiveAt: string | null;
}): {
  readonly cancelAt: string | null;
  readonly canceledAt: string | null;
  readonly expiredAt: string | null;
  readonly transitionAt: string;
} {
  const transitionAt = input.effectiveAt ?? new Date().toISOString();
  if (input.eventType === "cancellation_scheduled") {
    return {
      cancelAt: input.currentPeriodEnd,
      canceledAt: null,
      expiredAt: null,
      transitionAt,
    };
  }
  if (input.eventType === "cancellation_cleared") {
    return {
      cancelAt: null,
      canceledAt: null,
      expiredAt: null,
      transitionAt,
    };
  }
  if (input.nextState === "canceled") {
    if (
      input.currentState === "cancellation_scheduled" &&
      (input.currentCancelAt === null ||
        !boundaryReached(transitionAt, input.currentCancelAt))
    ) {
      throw new RuntimeError(
        "CANCELLATION_BOUNDARY_NOT_REACHED",
        "Scheduled cancellation cannot apply before its stored boundary.",
        {
          status: 409,
          publicMessage: "The cancellation boundary has not been reached.",
        },
      );
    }
    return {
      cancelAt:
        input.currentState === "cancellation_scheduled"
          ? input.currentCancelAt
          : null,
      canceledAt: transitionAt,
      expiredAt: null,
      transitionAt,
    };
  }
  if (input.nextState === "expired") {
    if (!boundaryReached(transitionAt, input.currentPeriodEnd)) {
      throw new RuntimeError(
        "EXPIRATION_BOUNDARY_NOT_REACHED",
        "Expiration cannot apply before the current period ends.",
        {
          status: 409,
          publicMessage: "The expiration boundary has not been reached.",
        },
      );
    }
    return {
      cancelAt: input.currentCancelAt,
      canceledAt: null,
      expiredAt: transitionAt,
      transitionAt,
    };
  }
  return {
    cancelAt: input.currentCancelAt,
    canceledAt: null,
    expiredAt: null,
    transitionAt,
  };
}

function entitlementTransition(eventType: MembershipEventType): {
  readonly from: "active" | "revoked";
  readonly to: "active" | "revoked" | "expired";
} | null {
  if (eventType === "paused") return { from: "active", to: "revoked" };
  if (eventType === "resumed") return { from: "revoked", to: "active" };
  if (eventType === "canceled" || eventType === "expired") {
    return { from: "active", to: "expired" };
  }
  return null;
}

async function transitionOwnerMembership(
  binding: D1Database,
  rawMembershipId: string,
  rawExpectedRevision: number,
  eventType: Exclude<MembershipEventType, "activated" | "renewed">,
  rawEffectiveAt: string | null,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const membershipId = safeId(rawMembershipId, "membershipId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const effectiveAt =
    rawEffectiveAt === null
      ? null
      : normalizedTimestamp(rawEffectiveAt, "effectiveAt");
  const operation = `membership.${eventType.replaceAll("_", "-")}`;
  const mutation = await prepareMutation<MembershipMutationReceipt>(
    binding,
    operation,
    context,
    { membershipId, expectedRevision, eventType, effectiveAt },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readMembershipAggregate(binding, membershipId);
  if (!aggregate) throw membershipNotFound();
  if (aggregate.source !== "owner") {
    throw new RuntimeError(
      "PROVIDER_MEMBERSHIP_REQUIRES_PROVIDER_EVENT",
      "A Stripe Test membership cannot be changed by the manual owner path.",
      {
        status: 409,
        publicMessage: "This membership follows its Test Mode event.",
      },
    );
  }
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("membership");
  }
  await requireActiveCustomer(binding, aggregate.customer_user_id);
  const stateAfter = nextState("membership", aggregate.state, eventType);
  const times = transitionTimes({
    currentState: aggregate.state,
    nextState: stateAfter,
    eventType,
    currentPeriodEnd: aggregate.current_period_end,
    currentCancelAt: aggregate.cancel_at,
    effectiveAt,
  });
  const entitlementChange = entitlementTransition(eventType);
  const result: MembershipMutationReceipt = Object.freeze({
    membershipId,
    customerUserId: aggregate.customer_user_id,
    membershipPlanId: aggregate.membership_plan_id,
    membershipPlanRevisionId: aggregate.membership_plan_revision_id,
    membershipPlanRevision: aggregate.membership_plan_revision,
    state: stateAfter,
    currentPeriodStart: aggregate.current_period_start,
    currentPeriodEnd: aggregate.current_period_end,
    cancelAt: times.cancelAt,
    revision: expectedRevision + 1,
    entitlementCount: aggregate.entitlement_count,
    downloadCreditsGranted: 0,
    licenseCreditsGranted: 0,
  });
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const customerAuthority = activeCustomerCondition(aggregate.customer_user_id);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE memberships
         SET state = ?, cancel_at = ?, canceled_at = ?, expired_at = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'owner'
           AND state = ? AND revision = ?
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        stateAfter,
        times.cancelAt,
        times.canceledAt,
        times.expiredAt,
        mutation.namespacedKey,
        membershipId,
        aggregate.customer_user_id,
        aggregate.state,
        expectedRevision,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  ];
  let entitlementIndex: number | null = null;
  if (entitlementChange) {
    entitlementIndex = statements.length;
    const acceptedStates =
      eventType === "canceled" || eventType === "expired"
        ? "('active', 'revoked')"
        : `('${entitlementChange.from}')`;
    statements.push(
      binding
        .prepare(
          `UPDATE entitlements
           SET state = ?, expires_at = CASE WHEN ? = 'expired' THEN ? ELSE expires_at END,
               revision = revision + 1, last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE source_type = 'membership' AND source_id = ? AND user_id = ?
             AND state IN ${acceptedStates}
             AND EXISTS (
               SELECT 1 FROM memberships
               WHERE id = ? AND customer_user_id = ? AND state = ?
                 AND revision = ? AND last_operation_key = ?
             )
             AND ${ownerAuthority.sql}
             AND ${customerAuthority.sql}`,
        )
        .bind(
          entitlementChange.to,
          entitlementChange.to,
          times.transitionAt,
          mutation.namespacedKey,
          membershipId,
          aggregate.customer_user_id,
          membershipId,
          aggregate.customer_user_id,
          stateAfter,
          result.revision,
          mutation.namespacedKey,
          ...ownerAuthority.bindings,
          ...customerAuthority.bindings,
        ),
    );
  }
  const expectedEntitlementState = entitlementChange?.to ?? null;
  const exactSql = `EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND state = ? AND revision = ?
      AND last_operation_key = ?
  ) AND (
    ? IS NULL OR (
      SELECT COUNT(*) FROM entitlements
      WHERE source_type = 'membership' AND source_id = ? AND user_id = ?
        AND state = ? AND last_operation_key = ?
    ) = ?
  ) AND ${ownerAuthority.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (null | number | string)[] = [
    membershipId,
    aggregate.customer_user_id,
    stateAfter,
    result.revision,
    mutation.namespacedKey,
    expectedEntitlementState,
    membershipId,
    aggregate.customer_user_id,
    expectedEntitlementState,
    mutation.namespacedKey,
    aggregate.entitlement_count,
    ...ownerAuthority.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "membership",
        subjectId: membershipId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { fromState: aggregate.state, toState: stateAfter },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      (entitlementIndex !== null &&
        changedRows(results[entitlementIndex]) !==
          aggregate.entitlement_count) ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("membership");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "membership");
  }
}

export async function pauseMembership(
  binding: D1Database,
  membershipId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  return transitionOwnerMembership(
    binding,
    membershipId,
    expectedRevision,
    "paused",
    null,
    context,
  );
}

export async function resumeMembership(
  binding: D1Database,
  membershipId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  return transitionOwnerMembership(
    binding,
    membershipId,
    expectedRevision,
    "resumed",
    null,
    context,
  );
}

export async function scheduleMembershipCancellation(
  binding: D1Database,
  membershipId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  return transitionOwnerMembership(
    binding,
    membershipId,
    expectedRevision,
    "cancellation_scheduled",
    null,
    context,
  );
}

export async function clearMembershipCancellation(
  binding: D1Database,
  membershipId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  return transitionOwnerMembership(
    binding,
    membershipId,
    expectedRevision,
    "cancellation_cleared",
    null,
    context,
  );
}

export async function applyMembershipCancellation(
  binding: D1Database,
  membershipId: string,
  expectedRevision: number,
  effectiveAt: string,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  return transitionOwnerMembership(
    binding,
    membershipId,
    expectedRevision,
    "canceled",
    effectiveAt,
    context,
  );
}

export async function expireMembership(
  binding: D1Database,
  membershipId: string,
  expectedRevision: number,
  effectiveAt: string,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  return transitionOwnerMembership(
    binding,
    membershipId,
    expectedRevision,
    "expired",
    effectiveAt,
    context,
  );
}

async function transitionOwnerSubscription(
  binding: D1Database,
  rawSubscriptionId: string,
  rawExpectedRevision: number,
  eventType: Exclude<MembershipEventType, "activated" | "renewed">,
  rawEffectiveAt: string | null,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const subscriptionId = safeId(rawSubscriptionId, "subscriptionId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const effectiveAt =
    rawEffectiveAt === null
      ? null
      : normalizedTimestamp(rawEffectiveAt, "effectiveAt");
  const operation = `subscription.${eventType.replaceAll("_", "-")}`;
  const mutation = await prepareMutation<SubscriptionMutationReceipt>(
    binding,
    operation,
    context,
    { subscriptionId, expectedRevision, eventType, effectiveAt },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readSubscriptionAggregate(binding, subscriptionId);
  if (!aggregate) throw subscriptionNotFound();
  if (aggregate.source !== "owner") {
    throw new RuntimeError(
      "PROVIDER_SUBSCRIPTION_REQUIRES_PROVIDER_EVENT",
      "A Stripe Test subscription cannot be changed by the manual owner path.",
      {
        status: 409,
        publicMessage: "This subscription follows its Test Mode event.",
      },
    );
  }
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("subscription");
  }
  if (aggregate.membership_state !== aggregate.state) {
    throw integrity("A subscription and its membership have diverged.");
  }
  await requireActiveCustomer(binding, aggregate.customer_user_id);
  const stateAfter = nextState("subscription", aggregate.state, eventType);
  const times = transitionTimes({
    currentState: aggregate.state,
    nextState: stateAfter,
    eventType,
    currentPeriodEnd: aggregate.current_period_end,
    currentCancelAt: aggregate.cancel_at,
    effectiveAt,
  });
  const entitlementChange = entitlementTransition(eventType);
  const eventId = `subscription_event_${crypto.randomUUID()}`;
  const result: SubscriptionMutationReceipt = Object.freeze({
    subscriptionId,
    membershipId: aggregate.membership_id,
    customerUserId: aggregate.customer_user_id,
    subscriptionPlanId: aggregate.subscription_plan_id,
    state: stateAfter,
    currentPeriodStart: aggregate.current_period_start,
    currentPeriodEnd: aggregate.current_period_end,
    cancelAt: times.cancelAt,
    revision: expectedRevision + 1,
    membershipRevision: aggregate.membership_revision + 1,
    entitlementCount: aggregate.entitlement_count,
    downloadCreditsGranted: 0,
    licenseCreditsGranted: 0,
    eventType,
  });
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const customerAuthority = activeCustomerCondition(aggregate.customer_user_id);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE memberships
         SET state = ?, cancel_at = ?, canceled_at = ?, expired_at = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'owner'
           AND state = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM subscriptions
             WHERE id = ? AND membership_id = memberships.id
               AND customer_user_id = memberships.customer_user_id
               AND source = 'owner' AND state = ? AND revision = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        stateAfter,
        times.cancelAt,
        times.canceledAt,
        times.expiredAt,
        mutation.namespacedKey,
        aggregate.membership_id,
        aggregate.customer_user_id,
        aggregate.state,
        aggregate.membership_revision,
        subscriptionId,
        aggregate.state,
        expectedRevision,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
    binding
      .prepare(
        `UPDATE subscriptions
         SET state = ?, cancel_at_period_end = ?, cancel_at = ?,
             canceled_at = ?, expired_at = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND membership_id = ?
           AND source = 'owner' AND state = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = ?
               AND revision = ? AND last_operation_key = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        stateAfter,
        stateAfter === "cancellation_scheduled" ? 1 : 0,
        times.cancelAt,
        times.canceledAt,
        times.expiredAt,
        mutation.namespacedKey,
        subscriptionId,
        aggregate.customer_user_id,
        aggregate.membership_id,
        aggregate.state,
        expectedRevision,
        aggregate.membership_id,
        aggregate.customer_user_id,
        stateAfter,
        result.membershipRevision,
        mutation.namespacedKey,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  ];
  let entitlementIndex: number | null = null;
  if (entitlementChange) {
    entitlementIndex = statements.length;
    const acceptedStates =
      eventType === "canceled" || eventType === "expired"
        ? "('active', 'revoked')"
        : `('${entitlementChange.from}')`;
    statements.push(
      binding
        .prepare(
          `UPDATE entitlements
           SET state = ?, expires_at = CASE WHEN ? = 'expired' THEN ? ELSE expires_at END,
               revision = revision + 1, last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE source_type = 'subscription' AND source_id = ? AND user_id = ?
             AND state IN ${acceptedStates}
             AND EXISTS (
               SELECT 1 FROM subscriptions
               WHERE id = ? AND customer_user_id = ? AND membership_id = ?
                 AND state = ? AND revision = ? AND last_operation_key = ?
             )
             AND ${ownerAuthority.sql}
             AND ${customerAuthority.sql}`,
        )
        .bind(
          entitlementChange.to,
          entitlementChange.to,
          times.transitionAt,
          mutation.namespacedKey,
          subscriptionId,
          aggregate.customer_user_id,
          subscriptionId,
          aggregate.customer_user_id,
          aggregate.membership_id,
          stateAfter,
          result.revision,
          mutation.namespacedKey,
          ...ownerAuthority.bindings,
          ...customerAuthority.bindings,
        ),
    );
  }
  const eventIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO subscription_events
          (id, subscription_id, customer_user_id, event_type, source,
           from_state, to_state, period_start, period_end, stripe_event_id,
           provider_object_id, fulfillment_event_id, order_id,
           idempotency_key, stripe_environment, livemode)
         SELECT ?, ?, ?, ?, 'owner', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?,
                'test', 0
         WHERE EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND membership_id = ?
             AND state = ? AND revision = ? AND last_operation_key = ?
         )
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = ?
               AND revision = ? AND last_operation_key = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        eventId,
        subscriptionId,
        aggregate.customer_user_id,
        eventType,
        aggregate.state,
        stateAfter,
        aggregate.current_period_start,
        aggregate.current_period_end,
        mutation.namespacedKey,
        subscriptionId,
        aggregate.customer_user_id,
        aggregate.membership_id,
        stateAfter,
        result.revision,
        mutation.namespacedKey,
        aggregate.membership_id,
        aggregate.customer_user_id,
        stateAfter,
        result.membershipRevision,
        mutation.namespacedKey,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const expectedEntitlementState = entitlementChange?.to ?? null;
  const exactSql = `EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = ? AND customer_user_id = ? AND membership_id = ?
      AND state = ? AND revision = ? AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND state = ? AND revision = ?
      AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM subscription_events
    WHERE id = ? AND subscription_id = ? AND customer_user_id = ?
      AND event_type = ? AND idempotency_key = ?
  ) AND (
    ? IS NULL OR (
      SELECT COUNT(*) FROM entitlements
      WHERE source_type = 'subscription' AND source_id = ? AND user_id = ?
        AND state = ? AND last_operation_key = ?
    ) = ?
  ) AND ${ownerAuthority.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (null | number | string)[] = [
    subscriptionId,
    aggregate.customer_user_id,
    aggregate.membership_id,
    stateAfter,
    result.revision,
    mutation.namespacedKey,
    aggregate.membership_id,
    aggregate.customer_user_id,
    stateAfter,
    result.membershipRevision,
    mutation.namespacedKey,
    eventId,
    subscriptionId,
    aggregate.customer_user_id,
    eventType,
    mutation.namespacedKey,
    expectedEntitlementState,
    subscriptionId,
    aggregate.customer_user_id,
    expectedEntitlementState,
    mutation.namespacedKey,
    aggregate.entitlement_count,
    ...ownerAuthority.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription",
        subjectId: subscriptionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { fromState: aggregate.state, toState: stateAfter },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  if (eventType === "canceled") {
    await appendRelationshipTelemetry(binding, statements, {
      eventName: "subscription-canceled",
      resourceType: "subscription",
      resourceId: subscriptionId,
      customerUserId: aggregate.customer_user_id,
      operationKey: mutation.namespacedKey,
      context,
      durableConditionSql: exactSql,
      durableConditionBindings: exactBindings,
      occurredAt: times.transitionAt,
    });
  }
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      (entitlementIndex !== null &&
        changedRows(results[entitlementIndex]) !==
          aggregate.entitlement_count) ||
      changedRows(results[eventIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("subscription");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "subscription");
  }
}

export async function pauseSubscription(
  binding: D1Database,
  subscriptionId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  return transitionOwnerSubscription(
    binding,
    subscriptionId,
    expectedRevision,
    "paused",
    null,
    context,
  );
}

export async function resumeSubscription(
  binding: D1Database,
  subscriptionId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  return transitionOwnerSubscription(
    binding,
    subscriptionId,
    expectedRevision,
    "resumed",
    null,
    context,
  );
}

export async function scheduleSubscriptionCancellation(
  binding: D1Database,
  subscriptionId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  return transitionOwnerSubscription(
    binding,
    subscriptionId,
    expectedRevision,
    "cancellation_scheduled",
    null,
    context,
  );
}

export async function clearSubscriptionCancellation(
  binding: D1Database,
  subscriptionId: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  return transitionOwnerSubscription(
    binding,
    subscriptionId,
    expectedRevision,
    "cancellation_cleared",
    null,
    context,
  );
}

export async function applySubscriptionCancellation(
  binding: D1Database,
  subscriptionId: string,
  expectedRevision: number,
  effectiveAt: string,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  return transitionOwnerSubscription(
    binding,
    subscriptionId,
    expectedRevision,
    "canceled",
    effectiveAt,
    context,
  );
}

export async function expireSubscription(
  binding: D1Database,
  subscriptionId: string,
  expectedRevision: number,
  effectiveAt: string,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  return transitionOwnerSubscription(
    binding,
    subscriptionId,
    expectedRevision,
    "expired",
    effectiveAt,
    context,
  );
}

export async function renewSubscription(
  binding: D1Database,
  rawSubscriptionId: string,
  rawExpectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const subscriptionId = safeId(rawSubscriptionId, "subscriptionId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const operation = "subscription.renew";
  const mutation = await prepareMutation<SubscriptionMutationReceipt>(
    binding,
    operation,
    context,
    { subscriptionId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readSubscriptionAggregate(binding, subscriptionId);
  if (!aggregate) throw subscriptionNotFound();
  if (aggregate.source !== "owner") {
    throw new RuntimeError(
      "PROVIDER_SUBSCRIPTION_REQUIRES_PROVIDER_EVENT",
      "A Stripe Test subscription renews only from its verified provider event.",
      {
        status: 409,
        publicMessage: "This subscription follows its Test Mode renewal event.",
      },
    );
  }
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("subscription");
  }
  if (aggregate.state !== "active" || aggregate.membership_state !== "active") {
    throw transitionUnavailable("subscription", aggregate.state, "renewed");
  }
  await requireActiveCustomer(binding, aggregate.customer_user_id);
  const subscriptionPlan = await readSubscriptionPlanRow(
    binding,
    aggregate.subscription_plan_id,
  );
  if (!subscriptionPlan) throw planNotFound("subscription");
  const frozen = await readFrozenMembershipPlan(
    binding,
    subscriptionPlan.membership_plan_id,
    subscriptionPlan.membership_plan_revision,
    false,
  );
  if (
    frozen.revision.id !== subscriptionPlan.membership_plan_revision_id ||
    frozen.accessItems.length !== aggregate.entitlement_count
  ) {
    throw integrity(
      "A subscription renewal does not match its frozen benefit definition.",
    );
  }
  const activeEntitlements = await binding
    .prepare(
      `SELECT COUNT(*) AS count FROM entitlements
       WHERE source_type = 'subscription' AND source_id = ?1
         AND user_id = ?2 AND state = 'active'`,
    )
    .bind(subscriptionId, aggregate.customer_user_id)
    .first<CountRow>();
  if (activeEntitlements?.count !== aggregate.entitlement_count) {
    throw integrity("A subscription renewal has incomplete active access.");
  }

  const eventId = `subscription_event_${crypto.randomUUID()}`;
  const periodStart = aggregate.current_period_end;
  const periodEnd = addCalendarInterval(
    periodStart,
    subscriptionPlan.billing_interval,
    subscriptionPlan.interval_count,
  );
  const creditGrants = await planCreditGrants(
    binding,
    aggregate.customer_user_id,
    frozen.revision.download_credits,
    frozen.revision.license_credits,
    mutation.namespacedKey,
  );
  const result: SubscriptionMutationReceipt = Object.freeze({
    subscriptionId,
    membershipId: aggregate.membership_id,
    customerUserId: aggregate.customer_user_id,
    subscriptionPlanId: aggregate.subscription_plan_id,
    state: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAt: null,
    revision: expectedRevision + 1,
    membershipRevision: aggregate.membership_revision + 1,
    entitlementCount: aggregate.entitlement_count,
    downloadCreditsGranted: frozen.revision.download_credits,
    licenseCreditsGranted: frozen.revision.license_credits,
    eventType: "renewed",
  });
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const customerAuthority = activeCustomerCondition(aggregate.customer_user_id);
  const mutationAuthority = combineAuthorities(
    ownerAuthority,
    customerAuthority,
  );
  const originConditionSql = `EXISTS (
    SELECT 1 FROM subscriptions
    JOIN memberships ON memberships.id = subscriptions.membership_id
      AND memberships.customer_user_id = subscriptions.customer_user_id
    WHERE subscriptions.id = ? AND subscriptions.customer_user_id = ?
      AND subscriptions.membership_id = ? AND subscriptions.state = 'active'
      AND subscriptions.revision = ?
      AND subscriptions.current_period_start = ?
      AND subscriptions.current_period_end = ?
      AND memberships.state = 'active' AND memberships.revision = ?
      AND memberships.current_period_start = ?
      AND memberships.current_period_end = ?
  )`;
  const originConditionBindings: readonly (number | string)[] = [
    subscriptionId,
    aggregate.customer_user_id,
    aggregate.membership_id,
    expectedRevision,
    aggregate.current_period_start,
    aggregate.current_period_end,
    aggregate.membership_revision,
    aggregate.current_period_start,
    aggregate.current_period_end,
  ];
  const statements: D1PreparedStatement[] = [];
  let entitlementIndex: number | null = null;
  if (aggregate.entitlement_count > 0) {
    entitlementIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE entitlements
           SET expires_at = ?, revision = revision + 1,
               last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE source_type = 'subscription' AND source_id = ?
             AND user_id = ? AND state = 'active'
             AND (${originConditionSql})
             AND ${ownerAuthority.sql}
             AND ${customerAuthority.sql}`,
        )
        .bind(
          periodEnd,
          mutation.namespacedKey,
          subscriptionId,
          aggregate.customer_user_id,
          ...originConditionBindings,
          ...ownerAuthority.bindings,
          ...customerAuthority.bindings,
        ),
    );
  }
  const creditIndexes = appendCreditGrantStatements(binding, statements, {
    grants: creditGrants,
    customerUserId: aggregate.customer_user_id,
    originType: "subscription",
    originId: eventId,
    expiresAt: periodEnd,
    originConditionSql,
    originConditionBindings,
    authority: mutationAuthority,
    fulfillmentEventId: null,
  });
  const membershipUpdateIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE memberships
         SET current_period_start = ?, current_period_end = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'owner'
           AND state = 'active' AND revision = ?
           AND current_period_start = ? AND current_period_end = ?
           AND (SELECT COUNT(*) FROM entitlements
                WHERE source_type = 'subscription' AND source_id = ?
                  AND user_id = ? AND state = 'active'
                  AND expires_at = ? AND last_operation_key = ?) = ?
           AND (SELECT COUNT(*) FROM credit_grant_lots
                WHERE origin_type = 'subscription' AND origin_id = ?
                  AND customer_user_id = ? AND state = 'active') = ?
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        aggregate.membership_id,
        aggregate.customer_user_id,
        aggregate.membership_revision,
        aggregate.current_period_start,
        aggregate.current_period_end,
        subscriptionId,
        aggregate.customer_user_id,
        periodEnd,
        mutation.namespacedKey,
        aggregate.entitlement_count,
        eventId,
        aggregate.customer_user_id,
        creditGrants.length,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const subscriptionUpdateIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE subscriptions
         SET current_period_start = ?, current_period_end = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND membership_id = ?
           AND source = 'owner' AND state = 'active' AND revision = ?
           AND current_period_start = ? AND current_period_end = ?
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
               AND revision = ? AND current_period_start = ?
               AND current_period_end = ? AND last_operation_key = ?
           )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        subscriptionId,
        aggregate.customer_user_id,
        aggregate.membership_id,
        expectedRevision,
        aggregate.current_period_start,
        aggregate.current_period_end,
        aggregate.membership_id,
        aggregate.customer_user_id,
        result.membershipRevision,
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const eventIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO subscription_events
          (id, subscription_id, customer_user_id, event_type, source,
           from_state, to_state, period_start, period_end, stripe_event_id,
           provider_object_id, fulfillment_event_id, order_id,
           idempotency_key, stripe_environment, livemode)
         SELECT ?, ?, ?, 'renewed', 'owner', 'active', 'active', ?, ?,
                NULL, NULL, NULL, NULL, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND membership_id = ?
             AND state = 'active' AND revision = ?
             AND current_period_start = ? AND current_period_end = ?
             AND last_operation_key = ?
         )
           AND ${ownerAuthority.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        eventId,
        subscriptionId,
        aggregate.customer_user_id,
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        subscriptionId,
        aggregate.customer_user_id,
        aggregate.membership_id,
        result.revision,
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        ...ownerAuthority.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = ? AND customer_user_id = ? AND membership_id = ?
      AND state = 'active' AND revision = ?
      AND current_period_start = ? AND current_period_end = ?
      AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND state = 'active'
      AND revision = ? AND current_period_start = ? AND current_period_end = ?
      AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM subscription_events
    WHERE id = ? AND subscription_id = ? AND customer_user_id = ?
      AND event_type = 'renewed' AND idempotency_key = ?
  ) AND (
    SELECT COUNT(*) FROM credit_grant_lots
    WHERE origin_type = 'subscription' AND origin_id = ?
      AND customer_user_id = ? AND state = 'active'
  ) = ? AND ${ownerAuthority.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    subscriptionId,
    aggregate.customer_user_id,
    aggregate.membership_id,
    result.revision,
    periodStart,
    periodEnd,
    mutation.namespacedKey,
    aggregate.membership_id,
    aggregate.customer_user_id,
    result.membershipRevision,
    periodStart,
    periodEnd,
    mutation.namespacedKey,
    eventId,
    subscriptionId,
    aggregate.customer_user_id,
    mutation.namespacedKey,
    eventId,
    aggregate.customer_user_id,
    creditGrants.length,
    ...ownerAuthority.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription",
        subjectId: subscriptionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          previousPeriodStart: aggregate.current_period_start,
          previousPeriodEnd: aggregate.current_period_end,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      (entitlementIndex !== null &&
        changedRows(results[entitlementIndex]) !==
          aggregate.entitlement_count) ||
      !creditIndexes.every((index) => changedRows(results[index]) === 1) ||
      changedRows(results[membershipUpdateIndex]) !== 1 ||
      changedRows(results[subscriptionUpdateIndex]) !== 1 ||
      changedRows(results[eventIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("subscription renewal");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "subscription renewal");
  }
}

type StripeTestFulfillmentOperation =
  | "membership_activation"
  | "subscription_activation"
  | "subscription_renewal"
  | "subscription_reconciliation";

interface SqlMembershipCondition {
  readonly sql: string;
  readonly bindings: readonly (number | string)[];
}

const STRIPE_TEST_FULFILLMENT_BASE_FROM = `FROM fulfillment_events AS fulfillment
  JOIN commerce_events AS event
    ON event.id = fulfillment.commerce_event_id
  JOIN orders AS provider_order
    ON provider_order.id = fulfillment.order_id
  JOIN order_items AS item
    ON item.order_id = provider_order.id
  JOIN commerce_products AS product
    ON product.id = item.commerce_product_id
  JOIN commerce_prices AS price
   ON price.id = item.commerce_price_id
   AND price.commerce_product_id = item.commerce_product_id`;

const STRIPE_TEST_ACTIVATION_FROM = `${STRIPE_TEST_FULFILLMENT_BASE_FROM}
  JOIN checkout_sessions AS checkout
    ON checkout.id = provider_order.checkout_session_id`;

function balancedSqlAnd(predicates: readonly string[]): string {
  if (predicates.length === 0) return "1 = 1";
  if (predicates.length === 1) return predicates[0];
  const midpoint = Math.floor(predicates.length / 2);
  return `(${balancedSqlAnd(predicates.slice(0, midpoint))}
    AND ${balancedSqlAnd(predicates.slice(midpoint))})`;
}

function stripeTestFulfillmentCondition(
  input: StripeTestFulfillmentReferenceInput,
  operation: StripeTestFulfillmentOperation,
): SqlMembershipCondition {
  const kind =
    operation === "membership_activation"
      ? "one_time"
      : operation === "subscription_activation"
        ? "initial_subscription"
        : operation === "subscription_renewal"
          ? "renewal"
          : "subscription_state";
  const productType =
    operation === "membership_activation" ? "membership" : "subscription";
  const checkoutMode =
    operation === "membership_activation" ? "payment" : "subscription";
  const isActivation =
    operation === "membership_activation" ||
    operation === "subscription_activation";
  const eventTypeSql =
    operation === "membership_activation"
      ? "event.event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded')"
      : operation === "subscription_activation" ||
          operation === "subscription_renewal"
        ? "event.event_type IN ('invoice.paid', 'invoice.payment_succeeded')"
        : "event.event_type IN ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed')";
  const eventObjectPredicates =
    operation === "membership_activation"
      ? [
          "event.checkout_session_id = checkout.id",
          "event.stripe_object_id = checkout.stripe_checkout_session_id",
        ]
      : operation === "subscription_activation"
        ? [
            "event.checkout_session_id = checkout.id",
            "event.stripe_object_id LIKE 'in_%'",
          ]
        : operation === "subscription_renewal"
          ? ["event.stripe_object_id LIKE 'in_%'"]
          : [
              "event.stripe_object_id = provider_order.stripe_subscription_id",
              "event.stripe_object_id LIKE 'sub_%'",
            ];
  const productAvailabilityPredicates =
    operation === "subscription_renewal" ||
    operation === "subscription_reconciliation"
      ? ["product.state IN ('active', 'archived')"]
      : ["product.state = 'active'", "price.active = 1"];
  const fromSql = isActivation
    ? STRIPE_TEST_ACTIVATION_FROM
    : STRIPE_TEST_FULFILLMENT_BASE_FROM;
  const sourceLinkPredicates = isActivation
    ? [
        "provider_order.checkout_session_id = checkout.id",
        "fulfillment.checkout_session_id = checkout.id",
        "checkout.customer_user_id = ?",
        "checkout.commerce_product_id = ?",
        "checkout.commerce_price_id = ?",
        "checkout.mode = ?",
        "checkout.status = 'completed'",
        "checkout.stripe_environment = 'test'",
        "checkout.livemode = 0",
      ]
    : [
        "provider_order.checkout_session_id IS NULL",
        "fulfillment.checkout_session_id IS NULL",
        "event.checkout_session_id IS NULL",
        "provider_order.stripe_subscription_id LIKE 'sub_%'",
      ];
  const sourceLinkBindings: readonly string[] = isActivation
    ? [
        input.customerUserId,
        input.commerceProductId,
        input.commercePriceId,
        checkoutMode,
      ]
    : [];
  const checkoutAmountPredicates = isActivation
    ? [
        "checkout.amount_minor = item.unit_amount_minor",
        "checkout.currency = item.currency",
      ]
    : [];

  const predicates = [
    "fulfillment.id = ?",
    "fulfillment.commerce_event_id = ?",
    "fulfillment.order_id = ?",
    "fulfillment.customer_user_id = ?",
    "fulfillment.commerce_product_id = ?",
    "fulfillment.kind = ?",
    "fulfillment.provider_object_id = ?",
    "fulfillment.facts_fingerprint = ?",
    "fulfillment.stripe_environment = 'test'",
    "fulfillment.livemode = 0",
    "event.id = ?",
    "event.stripe_event_id = ?",
    "event.stripe_object_id = ?",
    "event.event_created_at = ?",
    "event.facts_fingerprint = ?",
    "event.stripe_environment = 'test'",
    "event.livemode = 0",
    eventTypeSql,
    ...eventObjectPredicates,
    "provider_order.id = ?",
    "provider_order.customer_user_id = ?",
    "provider_order.commerce_event_id = event.id",
    "provider_order.stripe_environment = 'test'",
    "provider_order.livemode = 0",
    `(
      (event.status = 'processing'
       AND fulfillment.status = 'processing'
       AND provider_order.status = 'pending')
      OR
      (event.status = 'completed'
       AND fulfillment.status = 'fulfilled'
       AND provider_order.status = 'fulfilled')
    )`,
    ...sourceLinkPredicates,
    "item.commerce_product_id = ?",
    "item.commerce_price_id = ?",
    "item.product_type = ?",
    "item.quantity = 1",
    "item.commerce_product_revision = product.revision",
    "item.product_name = product.name",
    "item.unit_amount_minor = price.amount_minor",
    "item.currency = price.currency",
    "item.stripe_environment = 'test'",
    "item.livemode = 0",
    "product.id = ?",
    "product.product_type = ?",
    ...productAvailabilityPredicates,
    "price.id = ?",
    "price.stripe_environment = 'test'",
    "price.livemode = 0",
    "provider_order.total_minor = item.unit_amount_minor",
    "provider_order.currency = item.currency",
    ...checkoutAmountPredicates,
    `EXISTS (
      SELECT 1
      FROM users AS provider_customer
      JOIN role_assignments AS provider_customer_role
        ON provider_customer_role.user_id = provider_customer.id
       AND provider_customer_role.role_key = 'customer'
       AND provider_customer_role.revoked_at IS NULL
      WHERE provider_customer.id = ?
        AND provider_customer.status = 'active'
    )`,
  ];

  return Object.freeze({
    sql: `EXISTS (
      SELECT 1
      ${fromSql}
      WHERE ${balancedSqlAnd(predicates)}
    )`,
    bindings: Object.freeze([
      input.fulfillmentEventId,
      input.commerceEventId,
      input.orderId,
      input.customerUserId,
      input.commerceProductId,
      kind,
      input.fulfillmentProviderObjectId,
      input.factsFingerprint,
      input.commerceEventId,
      input.stripeEventId,
      input.stripeObjectId,
      input.providerEventCreatedAt,
      input.factsFingerprint,
      input.orderId,
      input.customerUserId,
      ...sourceLinkBindings,
      input.commerceProductId,
      input.commercePriceId,
      productType,
      input.commerceProductId,
      productType,
      input.commercePriceId,
      input.customerUserId,
    ]),
  });
}

function stripeTestSubscriptionStateCondition(
  input: StripeTestSubscriptionReconciliationInput,
): SqlMembershipCondition {
  const predicates = [
    "fulfillment.id = ?",
    "fulfillment.commerce_event_id = ?",
    "fulfillment.checkout_session_id IS NULL",
    "fulfillment.order_id IS NULL",
    "fulfillment.customer_user_id = ?",
    "fulfillment.commerce_product_id = ?",
    "fulfillment.kind = 'subscription_state'",
    "fulfillment.provider_object_id = ?",
    "fulfillment.facts_fingerprint = ?",
    "fulfillment.stripe_environment = 'test'",
    "fulfillment.livemode = 0",
    "event.id = ?",
    "event.checkout_session_id IS NULL",
    "event.stripe_event_id = ?",
    `event.event_type IN (
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'customer.subscription.paused',
      'customer.subscription.resumed'
    )`,
    "event.stripe_object_id = ?",
    "event.event_created_at = ?",
    "event.facts_fingerprint = ?",
    "event.stripe_environment = 'test'",
    "event.livemode = 0",
    `(
      (event.status = 'processing' AND fulfillment.status = 'processing')
      OR
      (event.status = 'completed' AND fulfillment.status = 'fulfilled')
    )`,
    "provider_subscription.customer_user_id = ?",
    "provider_subscription.source = 'stripe_test'",
    "provider_subscription.stripe_subscription_id = ?",
    "provider_subscription.stripe_customer_id = ?",
    "provider_subscription.commerce_product_id = ?",
    "provider_subscription.commerce_price_id = ?",
    "provider_subscription.stripe_environment = 'test'",
    "provider_subscription.livemode = 0",
    "product.id = ?",
    "product.product_type = 'subscription'",
    "product.state IN ('active', 'archived')",
    "price.id = ?",
    "price.stripe_environment = 'test'",
    "price.livemode = 0",
    `EXISTS (
      SELECT 1
      FROM users AS provider_customer
      JOIN role_assignments AS provider_customer_role
        ON provider_customer_role.user_id = provider_customer.id
       AND provider_customer_role.role_key = 'customer'
       AND provider_customer_role.revoked_at IS NULL
      WHERE provider_customer.id = ?
        AND provider_customer.status = 'active'
    )`,
  ];

  return Object.freeze({
    sql: `EXISTS (
      SELECT 1
      FROM fulfillment_events AS fulfillment
      JOIN commerce_events AS event
        ON event.id = fulfillment.commerce_event_id
      JOIN subscriptions AS provider_subscription
        ON provider_subscription.id = ?
      JOIN commerce_products AS product
        ON product.id = provider_subscription.commerce_product_id
      JOIN commerce_prices AS price
        ON price.id = provider_subscription.commerce_price_id
       AND price.commerce_product_id = product.id
      WHERE ${balancedSqlAnd(predicates)}
    )`,
    bindings: Object.freeze([
      input.subscriptionId,
      input.fulfillmentEventId,
      input.commerceEventId,
      input.customerUserId,
      input.commerceProductId,
      input.fulfillmentProviderObjectId,
      input.factsFingerprint,
      input.commerceEventId,
      input.stripeEventId,
      input.stripeObjectId,
      input.providerEventCreatedAt,
      input.factsFingerprint,
      input.customerUserId,
      input.stripeSubscriptionId,
      input.stripeCustomerId,
      input.commerceProductId,
      input.commercePriceId,
      input.commerceProductId,
      input.commercePriceId,
      input.customerUserId,
    ]),
  });
}

async function readStripeTestSubscriptionStateEventType(
  binding: D1Database,
  input: StripeTestSubscriptionReconciliationInput,
): Promise<string> {
  const condition = stripeTestSubscriptionStateCondition(input);
  const exact = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (exact?.count !== 1) throw stripeTestFulfillmentUnavailable();
  const row = await binding
    .prepare(
      `SELECT event_type
       FROM commerce_events
       WHERE id = ?1 AND stripe_event_id = ?2
         AND stripe_object_id = ?3 AND event_created_at = ?4
       LIMIT 1`,
    )
    .bind(
      input.commerceEventId,
      input.stripeEventId,
      input.stripeObjectId,
      input.providerEventCreatedAt,
    )
    .first<{ event_type: string }>();
  if (!row) throw stripeTestFulfillmentUnavailable();
  return row.event_type;
}

function stripeTestFulfillmentUnavailable(): RuntimeError {
  return new RuntimeError(
    "MEMBERSHIP_PROVIDER_FULFILLMENT_REQUIRED",
    "The exact verified Stripe Test fulfillment is not ready for this membership operation.",
    {
      status: 409,
      publicMessage:
        "The verified Stripe Test fulfillment is not ready for membership access.",
    },
  );
}

async function readStripeTestFulfillment(
  binding: D1Database,
  input: StripeTestFulfillmentReferenceInput,
  operation: StripeTestFulfillmentOperation,
): Promise<StripeTestFulfillmentRow> {
  const condition = stripeTestFulfillmentCondition(input, operation);
  const isActivation =
    operation === "membership_activation" ||
    operation === "subscription_activation";
  const fromSql = isActivation
    ? STRIPE_TEST_ACTIVATION_FROM
    : STRIPE_TEST_FULFILLMENT_BASE_FROM;
  const checkoutProjection = isActivation
    ? `checkout.mode AS checkout_mode,
       checkout.stripe_customer_id,
       checkout.stripe_subscription_id AS checkout_stripe_subscription_id`
    : `'subscription' AS checkout_mode,
       NULL AS stripe_customer_id,
       NULL AS checkout_stripe_subscription_id`;
  const exact = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (exact?.count !== 1) throw stripeTestFulfillmentUnavailable();
  const row = await binding
    .prepare(
      `SELECT event.id AS commerce_event_id,
              event.stripe_event_id, event.event_type,
              event.stripe_object_id,
              event.event_created_at AS provider_event_created_at,
              event.status AS event_status,
              fulfillment.id AS fulfillment_event_id,
              fulfillment.kind AS fulfillment_kind,
              fulfillment.provider_object_id AS fulfillment_provider_object_id,
              fulfillment.status AS fulfillment_status,
              provider_order.id AS order_id,
              provider_order.status AS order_status,
              provider_order.customer_user_id,
              product.id AS commerce_product_id,
              product.revision AS commerce_product_revision,
              price.id AS commerce_price_id,
              product.product_type, product.state AS product_state,
              product.membership_plan_id,
              product.membership_plan_revision_id,
              product.membership_plan_revision,
              product.subscription_plan_id,
              price.active AS price_active,
              price.billing_interval AS price_billing_interval,
              price.interval_count AS price_interval_count,
              ${checkoutProjection},
              provider_order.stripe_subscription_id AS order_stripe_subscription_id
       ${fromSql}
       WHERE fulfillment.id = ?1
         AND fulfillment.commerce_event_id = ?2
         AND fulfillment.order_id = ?3
         AND fulfillment.customer_user_id = ?4
         AND fulfillment.commerce_product_id = ?5
       LIMIT 1`,
    )
    .bind(
      input.fulfillmentEventId,
      input.commerceEventId,
      input.orderId,
      input.customerUserId,
      input.commerceProductId,
    )
    .first<StripeTestFulfillmentRow>();
  if (!row) throw stripeTestFulfillmentUnavailable();
  return row;
}

async function requireStripeTestProviderCustomer(
  binding: D1Database,
  customerUserId: string,
  context: MutationContext,
): Promise<void> {
  if (context.actorUserId !== customerUserId) {
    throw new RuntimeError(
      "MEMBERSHIP_PROVIDER_CUSTOMER_MISMATCH",
      "The provider operation customer does not match the verified customer.",
      {
        status: 403,
        publicMessage: "That verified membership operation is unavailable.",
      },
    );
  }
  await requireActiveCustomer(binding, customerUserId);
}

async function readStripeTestSubscriptionAggregate(
  binding: D1Database,
  subscriptionId: string,
): Promise<StripeTestSubscriptionAggregateRow | null> {
  return binding
    .prepare(
      `SELECT subscriptions.id, subscriptions.customer_user_id,
              subscriptions.membership_id,
              subscriptions.subscription_plan_id,
              subscriptions.commerce_product_id,
              subscriptions.commerce_price_id,
              subscriptions.source, subscriptions.stripe_subscription_id,
              subscriptions.stripe_customer_id, subscriptions.state,
              subscriptions.current_period_start,
              subscriptions.current_period_end, subscriptions.cancel_at,
              subscriptions.last_provider_event_created_at,
              subscriptions.revision,
              memberships.state AS membership_state,
              memberships.revision AS membership_revision,
              (SELECT COUNT(*) FROM entitlements
               WHERE source_type = 'subscription'
                 AND source_id = subscriptions.id) AS entitlement_count
       FROM subscriptions
       JOIN memberships
         ON memberships.id = subscriptions.membership_id
        AND memberships.customer_user_id = subscriptions.customer_user_id
       WHERE subscriptions.id = ?1
       LIMIT 1`,
    )
    .bind(subscriptionId)
    .first<StripeTestSubscriptionAggregateRow>();
}

export async function activateStripeTestMembership(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<MembershipMutationReceipt>> {
  const validated = validateStripeTestMembershipActivationInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input: StripeTestMembershipActivationInput = validated.value;
  await requireStripeTestProviderCustomer(
    binding,
    input.customerUserId,
    context,
  );
  const operation = "membership.activate.stripe-test";
  const mutation = await prepareMutation<MembershipMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const fulfillment = await readStripeTestFulfillment(
    binding,
    input,
    "membership_activation",
  );
  if (
    fulfillment.product_type !== "membership" ||
    fulfillment.checkout_mode !== "payment" ||
    fulfillment.price_billing_interval !== "one_time" ||
    fulfillment.membership_plan_id === null ||
    fulfillment.membership_plan_revision_id === null ||
    fulfillment.membership_plan_revision === null ||
    fulfillment.subscription_plan_id !== null ||
    fulfillment.checkout_stripe_subscription_id !== null ||
    fulfillment.order_stripe_subscription_id !== null
  ) {
    throw stripeTestFulfillmentUnavailable();
  }
  const frozen = await readFrozenMembershipPlan(
    binding,
    fulfillment.membership_plan_id,
    fulfillment.membership_plan_revision,
    false,
  );
  if (
    frozen.revision.id !== fulfillment.membership_plan_revision_id ||
    frozen.revision.duration_days === null
  ) {
    throw integrity(
      "A Stripe Test membership product does not match one finite frozen membership revision.",
    );
  }
  const existing = await binding
    .prepare(
      `SELECT id FROM memberships
       WHERE customer_user_id = ?1 AND membership_plan_id = ?2
         AND state IN ('pending', 'active', 'paused', 'cancellation_scheduled')
       LIMIT 1`,
    )
    .bind(input.customerUserId, fulfillment.membership_plan_id)
    .first<{ id: string }>();
  if (existing) {
    throw new RuntimeError(
      "MEMBERSHIP_ALREADY_ACTIVE",
      "The verified customer already has a live relationship for this membership plan.",
      {
        status: 409,
        publicMessage: "This customer already has that membership.",
      },
    );
  }

  const membershipId = `membership_${crypto.randomUUID()}`;
  const periodStart = input.providerEventCreatedAt;
  const periodEnd = addDurationDays(periodStart, frozen.revision.duration_days);
  const creditGrants = await planCreditGrants(
    binding,
    input.customerUserId,
    frozen.revision.download_credits,
    frozen.revision.license_credits,
    mutation.namespacedKey,
  );
  const result: MembershipMutationReceipt = Object.freeze({
    membershipId,
    customerUserId: input.customerUserId,
    membershipPlanId: fulfillment.membership_plan_id,
    membershipPlanRevisionId: frozen.revision.id,
    membershipPlanRevision: frozen.revision.revision,
    state: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAt: null,
    revision: 1,
    entitlementCount: frozen.accessItems.length,
    downloadCreditsGranted: frozen.revision.download_credits,
    licenseCreditsGranted: frozen.revision.license_credits,
  });
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const fulfillmentCondition = stripeTestFulfillmentCondition(
    input,
    "membership_activation",
  );
  const originConditionSql = `EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND membership_plan_id = ?
      AND membership_plan_revision_id = ? AND membership_plan_revision = ?
      AND source = 'stripe_test' AND source_order_id = ?
      AND source_fulfillment_event_id = ? AND state = 'pending'
      AND revision = 1 AND last_operation_key = ?
  ) AND ${fulfillmentCondition.sql}`;
  const originConditionBindings: readonly (number | string)[] = [
    membershipId,
    input.customerUserId,
    fulfillment.membership_plan_id,
    frozen.revision.id,
    frozen.revision.revision,
    input.orderId,
    input.fulfillmentEventId,
    mutation.namespacedKey,
    ...fulfillmentCondition.bindings,
  ];
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO memberships
          (id, customer_user_id, membership_plan_id,
           membership_plan_revision_id, membership_plan_revision, source,
           source_order_id, source_fulfillment_event_id, state, starts_at,
           current_period_start, current_period_end, cancel_at, canceled_at,
           expired_at, stripe_environment, livemode, revision,
           last_operation_key)
         SELECT ?, ?, ?, ?, ?, 'stripe_test', ?, ?, 'pending', ?, ?, ?,
                NULL, NULL, NULL, 'test', 0, 1, ?
         WHERE ${fulfillmentCondition.sql}
           AND EXISTS (
             SELECT 1 FROM membership_plan_revisions
             WHERE id = ? AND membership_plan_id = ? AND revision = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE customer_user_id = ? AND membership_plan_id = ?
               AND state IN
                 ('pending', 'active', 'paused', 'cancellation_scheduled')
           )
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE source_fulfillment_event_id = ?
           )
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        fulfillment.membership_plan_id,
        frozen.revision.id,
        frozen.revision.revision,
        input.orderId,
        input.fulfillmentEventId,
        periodStart,
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        frozen.revision.id,
        fulfillment.membership_plan_id,
        frozen.revision.revision,
        input.customerUserId,
        fulfillment.membership_plan_id,
        input.fulfillmentEventId,
        ...customerAuthority.bindings,
      ),
  ];
  const entitlementIndexes = appendEntitlementStatements(binding, statements, {
    items: frozen.accessItems,
    customerUserId: input.customerUserId,
    sourceType: "membership",
    sourceId: membershipId,
    startsAt: periodStart,
    expiresAt: periodEnd,
    marker: mutation.namespacedKey,
    originConditionSql,
    originConditionBindings,
    authority: customerAuthority,
    fulfillmentEventId: input.fulfillmentEventId,
  });
  const creditIndexes = appendCreditGrantStatements(binding, statements, {
    grants: creditGrants,
    customerUserId: input.customerUserId,
    originType: "membership",
    originId: membershipId,
    expiresAt: periodEnd,
    originConditionSql,
    originConditionBindings,
    authority: customerAuthority,
    fulfillmentEventId: input.fulfillmentEventId,
  });
  const activationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE memberships
         SET state = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
           AND source_order_id = ? AND source_fulfillment_event_id = ?
           AND state = 'pending' AND revision = 1
           AND last_operation_key = ?
           AND (SELECT COUNT(*) FROM entitlements
                WHERE source_type = 'membership' AND source_id = ?
                  AND user_id = ? AND state = 'active'
                  AND fulfillment_event_id = ?
                  AND last_operation_key = ?) = ?
           AND (SELECT COUNT(*) FROM credit_grant_lots
                WHERE origin_type = 'membership' AND origin_id = ?
                  AND customer_user_id = ? AND state = 'active'
                  AND fulfillment_event_id = ?) = ?
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        input.orderId,
        input.fulfillmentEventId,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        input.fulfillmentEventId,
        mutation.namespacedKey,
        frozen.accessItems.length,
        membershipId,
        input.customerUserId,
        input.fulfillmentEventId,
        creditGrants.length,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
      AND source_order_id = ? AND source_fulfillment_event_id = ?
      AND state = 'active' AND revision = 1 AND last_operation_key = ?
  ) AND (
    SELECT COUNT(*) FROM entitlements
    WHERE source_type = 'membership' AND source_id = ? AND user_id = ?
      AND state = 'active' AND fulfillment_event_id = ?
  ) = ? AND (
    SELECT COUNT(*) FROM credit_grant_lots
    WHERE origin_type = 'membership' AND origin_id = ?
      AND customer_user_id = ? AND state = 'active'
      AND fulfillment_event_id = ?
  ) = ? AND ${fulfillmentCondition.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    membershipId,
    input.customerUserId,
    input.orderId,
    input.fulfillmentEventId,
    mutation.namespacedKey,
    membershipId,
    input.customerUserId,
    input.fulfillmentEventId,
    frozen.accessItems.length,
    membershipId,
    input.customerUserId,
    input.fulfillmentEventId,
    creditGrants.length,
    ...fulfillmentCondition.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "membership",
        subjectId: membershipId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          source: "stripe_test",
          orderId: input.orderId,
          fulfillmentEventId: input.fulfillmentEventId,
          stripeEventId: input.stripeEventId,
          membershipPlanId: fulfillment.membership_plan_id,
          membershipPlanRevision: frozen.revision.revision,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  await appendRelationshipTelemetry(binding, statements, {
    eventName: "membership-activated",
    resourceType: "membership",
    resourceId: membershipId,
    customerUserId: input.customerUserId,
    operationKey: mutation.namespacedKey,
    context,
    durableConditionSql: exactSql,
    durableConditionBindings: exactBindings,
    occurredAt: input.providerEventCreatedAt,
  });
  try {
    const results = await runAtomicBatch(binding, statements);
    const everyRequiredChanged = [
      0,
      ...entitlementIndexes,
      ...creditIndexes,
      activationIndex,
      auditIndex,
    ].every((index) => changedRows(results[index]) === 1);
    if (!everyRequiredChanged) {
      throw staleMutation("Stripe Test membership activation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(
      binding,
      mutation,
      error,
      "Stripe Test membership activation",
    );
  }
}

export async function activateStripeTestSubscription(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  const validated = validateStripeTestSubscriptionActivationInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input: StripeTestSubscriptionActivationInput = validated.value;
  await requireStripeTestProviderCustomer(
    binding,
    input.customerUserId,
    context,
  );
  const operation = "subscription.activate.stripe-test";
  const mutation = await prepareMutation<SubscriptionMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const fulfillment = await readStripeTestFulfillment(
    binding,
    input,
    "subscription_activation",
  );
  if (
    fulfillment.product_type !== "subscription" ||
    fulfillment.checkout_mode !== "subscription" ||
    fulfillment.price_billing_interval === "one_time" ||
    fulfillment.membership_plan_id !== null ||
    fulfillment.membership_plan_revision_id !== null ||
    fulfillment.membership_plan_revision !== null ||
    fulfillment.subscription_plan_id === null ||
    fulfillment.stripe_customer_id === null ||
    fulfillment.checkout_stripe_subscription_id === null ||
    fulfillment.order_stripe_subscription_id === null ||
    fulfillment.checkout_stripe_subscription_id !==
      fulfillment.order_stripe_subscription_id ||
    fulfillment.checkout_stripe_subscription_id !==
      input.stripeSubscriptionId ||
    fulfillment.stripe_customer_id !== input.stripeCustomerId
  ) {
    throw stripeTestFulfillmentUnavailable();
  }
  const subscriptionPlan = await readSubscriptionPlanRow(
    binding,
    fulfillment.subscription_plan_id,
  );
  if (
    !subscriptionPlan ||
    subscriptionPlan.state !== "active" ||
    subscriptionPlan.billing_interval !== fulfillment.price_billing_interval ||
    subscriptionPlan.interval_count !== fulfillment.price_interval_count
  ) {
    throw planUnavailable("subscription");
  }
  if (
    addCalendarInterval(
      input.periodStart,
      subscriptionPlan.billing_interval,
      subscriptionPlan.interval_count,
    ) !== input.periodEnd
  ) {
    throw new RuntimeError(
      "MEMBERSHIP_PROVIDER_PERIOD_INVALID",
      "The verified initial invoice period does not match the pinned subscription cadence.",
      {
        status: 409,
        publicMessage:
          "The verified subscription period does not match this plan.",
      },
    );
  }
  const frozen = await readFrozenMembershipPlan(
    binding,
    subscriptionPlan.membership_plan_id,
    subscriptionPlan.membership_plan_revision,
    false,
  );
  if (frozen.revision.id !== subscriptionPlan.membership_plan_revision_id) {
    throw integrity(
      "A Stripe Test subscription product does not match its frozen membership revision.",
    );
  }
  const existing = await binding
    .prepare(
      `SELECT id FROM memberships
       WHERE customer_user_id = ?1 AND membership_plan_id = ?2
         AND state IN ('pending', 'active', 'paused', 'cancellation_scheduled')
       LIMIT 1`,
    )
    .bind(input.customerUserId, subscriptionPlan.membership_plan_id)
    .first<{ id: string }>();
  if (existing) {
    throw new RuntimeError(
      "MEMBERSHIP_ALREADY_ACTIVE",
      "The verified customer already has a live relationship for this membership plan.",
      {
        status: 409,
        publicMessage: "This customer already has that membership.",
      },
    );
  }

  const membershipId = `membership_${crypto.randomUUID()}`;
  const subscriptionId = `subscription_${crypto.randomUUID()}`;
  const eventId = `subscription_event_${crypto.randomUUID()}`;
  const periodStart = input.periodStart;
  const periodEnd = input.periodEnd;
  const creditGrants = await planCreditGrants(
    binding,
    input.customerUserId,
    frozen.revision.download_credits,
    frozen.revision.license_credits,
    mutation.namespacedKey,
  );
  const result: SubscriptionMutationReceipt = Object.freeze({
    subscriptionId,
    membershipId,
    customerUserId: input.customerUserId,
    subscriptionPlanId: subscriptionPlan.id,
    state: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAt: null,
    revision: 1,
    membershipRevision: 1,
    entitlementCount: frozen.accessItems.length,
    downloadCreditsGranted: frozen.revision.download_credits,
    licenseCreditsGranted: frozen.revision.license_credits,
    eventType: "activated",
  });
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const fulfillmentCondition = stripeTestFulfillmentCondition(
    input,
    "subscription_activation",
  );
  const originConditionSql = `EXISTS (
    SELECT 1 FROM subscriptions
    JOIN memberships ON memberships.id = subscriptions.membership_id
      AND memberships.customer_user_id = subscriptions.customer_user_id
    WHERE subscriptions.id = ? AND subscriptions.customer_user_id = ?
      AND subscriptions.membership_id = ? AND subscriptions.state = 'pending'
      AND subscriptions.source = 'stripe_test'
      AND subscriptions.stripe_subscription_id = ?
      AND subscriptions.commerce_product_id = ?
      AND subscriptions.commerce_price_id = ?
      AND subscriptions.revision = 1
      AND subscriptions.last_operation_key = ?
      AND memberships.source = 'stripe_test'
      AND memberships.source_order_id = ?
      AND memberships.source_fulfillment_event_id = ?
      AND memberships.state = 'pending' AND memberships.revision = 1
      AND memberships.last_operation_key = ?
  ) AND ${fulfillmentCondition.sql}`;
  const originConditionBindings: readonly (number | string)[] = [
    subscriptionId,
    input.customerUserId,
    membershipId,
    fulfillment.checkout_stripe_subscription_id,
    input.commerceProductId,
    input.commercePriceId,
    mutation.namespacedKey,
    input.orderId,
    input.fulfillmentEventId,
    mutation.namespacedKey,
    ...fulfillmentCondition.bindings,
  ];
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO memberships
          (id, customer_user_id, membership_plan_id,
           membership_plan_revision_id, membership_plan_revision, source,
           source_order_id, source_fulfillment_event_id, state, starts_at,
           current_period_start, current_period_end, cancel_at, canceled_at,
           expired_at, stripe_environment, livemode, revision,
           last_operation_key)
         SELECT ?, ?, ?, ?, ?, 'stripe_test', ?, ?, 'pending', ?, ?, ?,
                NULL, NULL, NULL, 'test', 0, 1, ?
         WHERE ${fulfillmentCondition.sql}
           AND EXISTS (
             SELECT 1 FROM subscription_plans
             WHERE id = ? AND state = 'active' AND revision = ?
               AND membership_plan_id = ?
               AND membership_plan_revision_id = ?
               AND membership_plan_revision = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE customer_user_id = ? AND membership_plan_id = ?
               AND state IN
                 ('pending', 'active', 'paused', 'cancellation_scheduled')
           )
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE source_fulfillment_event_id = ?
           )
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        subscriptionPlan.membership_plan_id,
        frozen.revision.id,
        frozen.revision.revision,
        input.orderId,
        input.fulfillmentEventId,
        periodStart,
        periodStart,
        periodEnd,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        subscriptionPlan.id,
        subscriptionPlan.revision,
        subscriptionPlan.membership_plan_id,
        frozen.revision.id,
        frozen.revision.revision,
        input.customerUserId,
        subscriptionPlan.membership_plan_id,
        input.fulfillmentEventId,
        ...customerAuthority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO subscriptions
          (id, customer_user_id, membership_id, subscription_plan_id,
           commerce_product_id, commerce_price_id, source,
           stripe_subscription_id, stripe_customer_id, state,
           current_period_start, current_period_end, cancel_at_period_end,
           cancel_at, canceled_at, expired_at, last_provider_event_created_at,
           stripe_environment, livemode, revision, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, 'stripe_test', ?, ?, 'pending', ?, ?, 0,
                NULL, NULL, NULL, ?, 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM memberships
           WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
             AND source_order_id = ? AND source_fulfillment_event_id = ?
             AND state = 'pending' AND revision = 1
             AND last_operation_key = ?
         )
           AND ${fulfillmentCondition.sql}
           AND NOT EXISTS (
             SELECT 1 FROM subscriptions
             WHERE stripe_subscription_id = ?
           )
           AND ${customerAuthority.sql}`,
      )
      .bind(
        subscriptionId,
        input.customerUserId,
        membershipId,
        subscriptionPlan.id,
        input.commerceProductId,
        input.commercePriceId,
        fulfillment.checkout_stripe_subscription_id,
        fulfillment.stripe_customer_id,
        periodStart,
        periodEnd,
        input.providerEventCreatedAt,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        input.orderId,
        input.fulfillmentEventId,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        fulfillment.checkout_stripe_subscription_id,
        ...customerAuthority.bindings,
      ),
  ];
  const entitlementIndexes = appendEntitlementStatements(binding, statements, {
    items: frozen.accessItems,
    customerUserId: input.customerUserId,
    sourceType: "subscription",
    sourceId: subscriptionId,
    startsAt: periodStart,
    expiresAt: periodEnd,
    marker: mutation.namespacedKey,
    originConditionSql,
    originConditionBindings,
    authority: customerAuthority,
    fulfillmentEventId: input.fulfillmentEventId,
  });
  const creditIndexes = appendCreditGrantStatements(binding, statements, {
    grants: creditGrants,
    customerUserId: input.customerUserId,
    originType: "subscription",
    originId: eventId,
    expiresAt: periodEnd,
    originConditionSql,
    originConditionBindings,
    authority: customerAuthority,
    fulfillmentEventId: input.fulfillmentEventId,
  });
  const membershipActivationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE memberships
         SET state = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
           AND source_order_id = ? AND source_fulfillment_event_id = ?
           AND state = 'pending' AND revision = 1
           AND last_operation_key = ?
           AND (SELECT COUNT(*) FROM entitlements
                WHERE source_type = 'subscription' AND source_id = ?
                  AND user_id = ? AND state = 'active'
                  AND fulfillment_event_id = ?) = ?
           AND (SELECT COUNT(*) FROM credit_grant_lots
                WHERE origin_type = 'subscription' AND origin_id = ?
                  AND customer_user_id = ? AND state = 'active'
                  AND fulfillment_event_id = ?) = ?
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        membershipId,
        input.customerUserId,
        input.orderId,
        input.fulfillmentEventId,
        mutation.namespacedKey,
        subscriptionId,
        input.customerUserId,
        input.fulfillmentEventId,
        frozen.accessItems.length,
        eventId,
        input.customerUserId,
        input.fulfillmentEventId,
        creditGrants.length,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const subscriptionActivationIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE subscriptions
         SET state = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND membership_id = ?
           AND source = 'stripe_test' AND stripe_subscription_id = ?
           AND state = 'pending' AND revision = 1
           AND last_operation_key = ?
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
               AND revision = 1 AND last_operation_key = ?
           )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        subscriptionId,
        input.customerUserId,
        membershipId,
        fulfillment.checkout_stripe_subscription_id,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const eventIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO subscription_events
          (id, subscription_id, customer_user_id, event_type, source,
           from_state, to_state, period_start, period_end, stripe_event_id,
           provider_object_id, fulfillment_event_id, order_id,
           idempotency_key, stripe_environment, livemode)
         SELECT ?, ?, ?, 'activated', 'stripe_test', 'pending', 'active', ?, ?,
                ?, ?, ?, ?, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND membership_id = ?
             AND source = 'stripe_test' AND stripe_subscription_id = ?
             AND state = 'active' AND revision = 1
             AND last_operation_key = ?
         )
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
               AND revision = 1 AND last_operation_key = ?
           )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        eventId,
        subscriptionId,
        input.customerUserId,
        periodStart,
        periodEnd,
        input.stripeEventId,
        fulfillment.checkout_stripe_subscription_id,
        input.fulfillmentEventId,
        input.orderId,
        mutation.namespacedKey,
        subscriptionId,
        input.customerUserId,
        membershipId,
        fulfillment.checkout_stripe_subscription_id,
        mutation.namespacedKey,
        membershipId,
        input.customerUserId,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = ? AND customer_user_id = ? AND membership_id = ?
      AND source = 'stripe_test' AND stripe_subscription_id = ?
      AND commerce_product_id = ? AND commerce_price_id = ?
      AND state = 'active' AND revision = 1 AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
      AND source_order_id = ? AND source_fulfillment_event_id = ?
      AND state = 'active' AND revision = 1 AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM subscription_events
    WHERE id = ? AND subscription_id = ? AND customer_user_id = ?
      AND event_type = 'activated' AND source = 'stripe_test'
      AND stripe_event_id = ? AND fulfillment_event_id = ?
      AND order_id = ? AND idempotency_key = ?
  ) AND (
    SELECT COUNT(*) FROM entitlements
    WHERE source_type = 'subscription' AND source_id = ? AND user_id = ?
      AND state = 'active' AND fulfillment_event_id = ?
  ) = ? AND (
    SELECT COUNT(*) FROM credit_grant_lots
    WHERE origin_type = 'subscription' AND origin_id = ?
      AND customer_user_id = ? AND state = 'active'
      AND fulfillment_event_id = ?
  ) = ? AND ${fulfillmentCondition.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    subscriptionId,
    input.customerUserId,
    membershipId,
    fulfillment.checkout_stripe_subscription_id,
    input.commerceProductId,
    input.commercePriceId,
    mutation.namespacedKey,
    membershipId,
    input.customerUserId,
    input.orderId,
    input.fulfillmentEventId,
    mutation.namespacedKey,
    eventId,
    subscriptionId,
    input.customerUserId,
    input.stripeEventId,
    input.fulfillmentEventId,
    input.orderId,
    mutation.namespacedKey,
    subscriptionId,
    input.customerUserId,
    input.fulfillmentEventId,
    frozen.accessItems.length,
    eventId,
    input.customerUserId,
    input.fulfillmentEventId,
    creditGrants.length,
    ...fulfillmentCondition.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription",
        subjectId: subscriptionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          source: "stripe_test",
          billingReason: input.billingReason,
          orderId: input.orderId,
          fulfillmentEventId: input.fulfillmentEventId,
          stripeEventId: input.stripeEventId,
          stripeSubscriptionId: fulfillment.checkout_stripe_subscription_id,
          subscriptionPlanId: subscriptionPlan.id,
          membershipPlanRevision: frozen.revision.revision,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  await appendRelationshipTelemetry(binding, statements, {
    eventName: "subscription-activated",
    resourceType: "subscription",
    resourceId: subscriptionId,
    customerUserId: input.customerUserId,
    operationKey: mutation.namespacedKey,
    context,
    durableConditionSql: exactSql,
    durableConditionBindings: exactBindings,
    occurredAt: input.providerEventCreatedAt,
  });
  try {
    const results = await runAtomicBatch(binding, statements);
    const everyRequiredChanged = [
      0,
      1,
      ...entitlementIndexes,
      ...creditIndexes,
      membershipActivationIndex,
      subscriptionActivationIndex,
      eventIndex,
      auditIndex,
    ].every((index) => changedRows(results[index]) === 1);
    if (!everyRequiredChanged) {
      throw staleMutation("Stripe Test subscription activation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(
      binding,
      mutation,
      error,
      "Stripe Test subscription activation",
    );
  }
}

export async function renewStripeTestSubscription(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  const validated = validateStripeTestSubscriptionRenewalInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input: StripeTestSubscriptionRenewalInput = validated.value;
  await requireStripeTestProviderCustomer(
    binding,
    input.customerUserId,
    context,
  );
  const operation = "subscription.renew.stripe-test";
  const mutation = await prepareMutation<SubscriptionMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const fulfillment = await readStripeTestFulfillment(
    binding,
    input,
    "subscription_renewal",
  );
  const aggregate = await readStripeTestSubscriptionAggregate(
    binding,
    input.subscriptionId,
  );
  if (!aggregate) throw subscriptionNotFound();
  if (
    aggregate.source !== "stripe_test" ||
    aggregate.customer_user_id !== input.customerUserId ||
    aggregate.commerce_product_id !== input.commerceProductId ||
    aggregate.commerce_price_id !== input.commercePriceId ||
    aggregate.stripe_subscription_id !== input.stripeSubscriptionId ||
    aggregate.stripe_customer_id !== input.stripeCustomerId ||
    fulfillment.order_stripe_subscription_id !== input.stripeSubscriptionId ||
    fulfillment.subscription_plan_id !== aggregate.subscription_plan_id ||
    fulfillment.product_type !== "subscription" ||
    fulfillment.price_billing_interval === "one_time"
  ) {
    throw stripeTestFulfillmentUnavailable();
  }
  if (aggregate.revision !== input.expectedRevision) {
    throw staleMutation("subscription");
  }
  if (aggregate.state !== "active" || aggregate.membership_state !== "active") {
    throw transitionUnavailable("subscription", aggregate.state, "renewed");
  }
  if (
    typeof aggregate.last_provider_event_created_at !== "string" ||
    input.providerEventCreatedAt <= aggregate.last_provider_event_created_at
  ) {
    throw new RuntimeError(
      "MEMBERSHIP_PROVIDER_EVENT_STALE",
      "The Stripe Test renewal event is not newer than durable provider state.",
      {
        status: 409,
        publicMessage: "That Test Mode subscription event is out of date.",
      },
    );
  }
  if (input.periodStart !== aggregate.current_period_end) {
    throw new RuntimeError(
      "MEMBERSHIP_PROVIDER_PERIOD_INVALID",
      "The Stripe Test renewal period does not begin at the durable boundary.",
      {
        status: 409,
        publicMessage:
          "The verified renewal period does not match this subscription.",
      },
    );
  }
  const subscriptionPlan = await readSubscriptionPlanRow(
    binding,
    aggregate.subscription_plan_id,
  );
  if (!subscriptionPlan) throw planNotFound("subscription");
  if (
    subscriptionPlan.billing_interval !== fulfillment.price_billing_interval ||
    subscriptionPlan.interval_count !== fulfillment.price_interval_count ||
    addCalendarInterval(
      input.periodStart,
      subscriptionPlan.billing_interval,
      subscriptionPlan.interval_count,
    ) !== input.periodEnd
  ) {
    throw new RuntimeError(
      "MEMBERSHIP_PROVIDER_PERIOD_INVALID",
      "The Stripe Test renewal period does not match the pinned subscription cadence.",
      {
        status: 409,
        publicMessage:
          "The verified renewal period does not match this subscription.",
      },
    );
  }
  const frozen = await readFrozenMembershipPlan(
    binding,
    subscriptionPlan.membership_plan_id,
    subscriptionPlan.membership_plan_revision,
    false,
  );
  if (
    frozen.revision.id !== subscriptionPlan.membership_plan_revision_id ||
    frozen.accessItems.length !== aggregate.entitlement_count
  ) {
    throw integrity(
      "A Stripe Test renewal does not match its frozen membership benefits.",
    );
  }
  const activeEntitlements = await binding
    .prepare(
      `SELECT COUNT(*) AS count FROM entitlements
       WHERE source_type = 'subscription' AND source_id = ?1
         AND user_id = ?2 AND state = 'active'`,
    )
    .bind(input.subscriptionId, input.customerUserId)
    .first<CountRow>();
  if (activeEntitlements?.count !== aggregate.entitlement_count) {
    throw integrity("A Stripe Test renewal has incomplete active access.");
  }

  const eventId = `subscription_event_${crypto.randomUUID()}`;
  const creditGrants = await planCreditGrants(
    binding,
    input.customerUserId,
    frozen.revision.download_credits,
    frozen.revision.license_credits,
    mutation.namespacedKey,
  );
  const result: SubscriptionMutationReceipt = Object.freeze({
    subscriptionId: input.subscriptionId,
    membershipId: aggregate.membership_id,
    customerUserId: input.customerUserId,
    subscriptionPlanId: aggregate.subscription_plan_id,
    state: "active",
    currentPeriodStart: input.periodStart,
    currentPeriodEnd: input.periodEnd,
    cancelAt: null,
    revision: input.expectedRevision + 1,
    membershipRevision: aggregate.membership_revision + 1,
    entitlementCount: aggregate.entitlement_count,
    downloadCreditsGranted: frozen.revision.download_credits,
    licenseCreditsGranted: frozen.revision.license_credits,
    eventType: "renewed",
  });
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const fulfillmentCondition = stripeTestFulfillmentCondition(
    input,
    "subscription_renewal",
  );
  const originConditionSql = `EXISTS (
    SELECT 1 FROM subscriptions
    JOIN memberships ON memberships.id = subscriptions.membership_id
      AND memberships.customer_user_id = subscriptions.customer_user_id
    WHERE subscriptions.id = ? AND subscriptions.customer_user_id = ?
      AND subscriptions.membership_id = ?
      AND subscriptions.subscription_plan_id = ?
      AND subscriptions.commerce_product_id = ?
      AND subscriptions.commerce_price_id = ?
      AND subscriptions.source = 'stripe_test'
      AND subscriptions.stripe_subscription_id = ?
      AND subscriptions.stripe_customer_id = ?
      AND subscriptions.state = 'active' AND subscriptions.revision = ?
      AND subscriptions.current_period_start = ?
      AND subscriptions.current_period_end = ?
      AND subscriptions.last_provider_event_created_at = ?
      AND memberships.source = 'stripe_test'
      AND memberships.state = 'active' AND memberships.revision = ?
      AND memberships.current_period_start = ?
      AND memberships.current_period_end = ?
  ) AND ${fulfillmentCondition.sql}`;
  const originConditionBindings: readonly (number | string)[] = [
    input.subscriptionId,
    input.customerUserId,
    aggregate.membership_id,
    aggregate.subscription_plan_id,
    input.commerceProductId,
    input.commercePriceId,
    input.stripeSubscriptionId,
    input.stripeCustomerId,
    input.expectedRevision,
    aggregate.current_period_start,
    aggregate.current_period_end,
    aggregate.last_provider_event_created_at,
    aggregate.membership_revision,
    aggregate.current_period_start,
    aggregate.current_period_end,
    ...fulfillmentCondition.bindings,
  ];
  const statements: D1PreparedStatement[] = [];
  let entitlementIndex: number | null = null;
  if (aggregate.entitlement_count > 0) {
    entitlementIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE entitlements
           SET expires_at = ?, revision = revision + 1,
               last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE source_type = 'subscription' AND source_id = ?
             AND user_id = ? AND state = 'active'
             AND (${originConditionSql})
             AND ${customerAuthority.sql}`,
        )
        .bind(
          input.periodEnd,
          mutation.namespacedKey,
          input.subscriptionId,
          input.customerUserId,
          ...originConditionBindings,
          ...customerAuthority.bindings,
        ),
    );
  }
  const creditIndexes = appendCreditGrantStatements(binding, statements, {
    grants: creditGrants,
    customerUserId: input.customerUserId,
    originType: "subscription",
    originId: eventId,
    expiresAt: input.periodEnd,
    originConditionSql,
    originConditionBindings,
    authority: customerAuthority,
    fulfillmentEventId: input.fulfillmentEventId,
  });
  const membershipUpdateIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE memberships
         SET current_period_start = ?, current_period_end = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
           AND state = 'active' AND revision = ?
           AND current_period_start = ? AND current_period_end = ?
           AND (SELECT COUNT(*) FROM entitlements
                WHERE source_type = 'subscription' AND source_id = ?
                  AND user_id = ? AND state = 'active'
                  AND expires_at = ? AND last_operation_key = ?) = ?
           AND (SELECT COUNT(*) FROM credit_grant_lots
                WHERE origin_type = 'subscription' AND origin_id = ?
                  AND customer_user_id = ? AND state = 'active'
                  AND fulfillment_event_id = ?) = ?
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        input.periodStart,
        input.periodEnd,
        mutation.namespacedKey,
        aggregate.membership_id,
        input.customerUserId,
        aggregate.membership_revision,
        aggregate.current_period_start,
        aggregate.current_period_end,
        input.subscriptionId,
        input.customerUserId,
        input.periodEnd,
        mutation.namespacedKey,
        aggregate.entitlement_count,
        eventId,
        input.customerUserId,
        input.fulfillmentEventId,
        creditGrants.length,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const subscriptionUpdateIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `UPDATE subscriptions
         SET current_period_start = ?, current_period_end = ?,
             last_provider_event_created_at = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND membership_id = ?
           AND source = 'stripe_test' AND stripe_subscription_id = ?
           AND stripe_customer_id = ? AND commerce_product_id = ?
           AND commerce_price_id = ? AND state = 'active' AND revision = ?
           AND current_period_start = ? AND current_period_end = ?
           AND last_provider_event_created_at = ?
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = 'active'
               AND revision = ? AND current_period_start = ?
               AND current_period_end = ? AND last_operation_key = ?
           )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        input.periodStart,
        input.periodEnd,
        input.providerEventCreatedAt,
        mutation.namespacedKey,
        input.subscriptionId,
        input.customerUserId,
        aggregate.membership_id,
        input.stripeSubscriptionId,
        input.stripeCustomerId,
        input.commerceProductId,
        input.commercePriceId,
        input.expectedRevision,
        aggregate.current_period_start,
        aggregate.current_period_end,
        aggregate.last_provider_event_created_at,
        aggregate.membership_id,
        input.customerUserId,
        result.membershipRevision,
        input.periodStart,
        input.periodEnd,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const eventIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO subscription_events
          (id, subscription_id, customer_user_id, event_type, source,
           from_state, to_state, period_start, period_end, stripe_event_id,
           provider_object_id, fulfillment_event_id, order_id,
           idempotency_key, stripe_environment, livemode)
         SELECT ?, ?, ?, 'renewed', 'stripe_test', 'active', 'active', ?, ?,
                ?, ?, ?, ?, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND membership_id = ?
             AND source = 'stripe_test' AND stripe_subscription_id = ?
             AND state = 'active' AND revision = ?
             AND current_period_start = ? AND current_period_end = ?
             AND last_provider_event_created_at = ?
             AND last_operation_key = ?
         )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        eventId,
        input.subscriptionId,
        input.customerUserId,
        input.periodStart,
        input.periodEnd,
        input.stripeEventId,
        input.stripeObjectId,
        input.fulfillmentEventId,
        input.orderId,
        mutation.namespacedKey,
        input.subscriptionId,
        input.customerUserId,
        aggregate.membership_id,
        input.stripeSubscriptionId,
        result.revision,
        input.periodStart,
        input.periodEnd,
        input.providerEventCreatedAt,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const exactSql = `EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = ? AND customer_user_id = ? AND membership_id = ?
      AND source = 'stripe_test' AND stripe_subscription_id = ?
      AND state = 'active' AND revision = ?
      AND current_period_start = ? AND current_period_end = ?
      AND last_provider_event_created_at = ? AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
      AND state = 'active' AND revision = ?
      AND current_period_start = ? AND current_period_end = ?
      AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM subscription_events
    WHERE id = ? AND subscription_id = ? AND customer_user_id = ?
      AND event_type = 'renewed' AND source = 'stripe_test'
      AND stripe_event_id = ? AND provider_object_id = ?
      AND fulfillment_event_id = ? AND order_id = ?
      AND idempotency_key = ?
  ) AND (
    SELECT COUNT(*) FROM credit_grant_lots
    WHERE origin_type = 'subscription' AND origin_id = ?
      AND customer_user_id = ? AND state = 'active'
      AND fulfillment_event_id = ?
  ) = ? AND ${fulfillmentCondition.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (number | string)[] = [
    input.subscriptionId,
    input.customerUserId,
    aggregate.membership_id,
    input.stripeSubscriptionId,
    result.revision,
    input.periodStart,
    input.periodEnd,
    input.providerEventCreatedAt,
    mutation.namespacedKey,
    aggregate.membership_id,
    input.customerUserId,
    result.membershipRevision,
    input.periodStart,
    input.periodEnd,
    mutation.namespacedKey,
    eventId,
    input.subscriptionId,
    input.customerUserId,
    input.stripeEventId,
    input.stripeObjectId,
    input.fulfillmentEventId,
    input.orderId,
    mutation.namespacedKey,
    eventId,
    input.customerUserId,
    input.fulfillmentEventId,
    creditGrants.length,
    ...fulfillmentCondition.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription",
        subjectId: input.subscriptionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          source: "stripe_test",
          billingReason: input.billingReason,
          stripeEventId: input.stripeEventId,
          stripeInvoiceId: input.stripeObjectId,
          orderId: input.orderId,
          fulfillmentEventId: input.fulfillmentEventId,
          previousPeriodStart: aggregate.current_period_start,
          previousPeriodEnd: aggregate.current_period_end,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      (entitlementIndex !== null &&
        changedRows(results[entitlementIndex]) !==
          aggregate.entitlement_count) ||
      !creditIndexes.every((index) => changedRows(results[index]) === 1) ||
      changedRows(results[membershipUpdateIndex]) !== 1 ||
      changedRows(results[subscriptionUpdateIndex]) !== 1 ||
      changedRows(results[eventIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("Stripe Test subscription renewal");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(
      binding,
      mutation,
      error,
      "Stripe Test subscription renewal",
    );
  }
}

export async function reconcileStripeTestSubscription(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<SubscriptionMutationReceipt>> {
  const validated = validateStripeTestSubscriptionReconciliationInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input: StripeTestSubscriptionReconciliationInput = validated.value;
  await requireStripeTestProviderCustomer(
    binding,
    input.customerUserId,
    context,
  );
  const operation = "subscription.reconcile.stripe-test";
  const mutation = await prepareMutation<SubscriptionMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const providerEventType = await readStripeTestSubscriptionStateEventType(
    binding,
    input,
  );
  const aggregate = await readStripeTestSubscriptionAggregate(
    binding,
    input.subscriptionId,
  );
  if (!aggregate) throw subscriptionNotFound();
  if (
    aggregate.source !== "stripe_test" ||
    aggregate.customer_user_id !== input.customerUserId ||
    aggregate.commerce_product_id !== input.commerceProductId ||
    aggregate.commerce_price_id !== input.commercePriceId ||
    aggregate.stripe_subscription_id !== input.stripeSubscriptionId ||
    aggregate.stripe_customer_id !== input.stripeCustomerId ||
    input.stripeObjectId !== input.stripeSubscriptionId ||
    input.fulfillmentProviderObjectId !== input.stripeSubscriptionId
  ) {
    throw stripeTestFulfillmentUnavailable();
  }
  if (aggregate.revision !== input.expectedRevision) {
    throw staleMutation("subscription");
  }
  if (aggregate.membership_state !== aggregate.state) {
    throw integrity("A Stripe Test subscription and membership have diverged.");
  }
  if (
    typeof aggregate.last_provider_event_created_at !== "string" ||
    input.providerEventCreatedAt <= aggregate.last_provider_event_created_at
  ) {
    throw new RuntimeError(
      "MEMBERSHIP_PROVIDER_EVENT_STALE",
      "The Stripe Test state event is not newer than durable provider state.",
      {
        status: 409,
        publicMessage: "That Test Mode subscription event is out of date.",
      },
    );
  }

  let eventType: Exclude<MembershipEventType, "activated" | "renewed">;
  if (input.targetState === "paused") {
    eventType = "paused";
  } else if (input.targetState === "cancellation_scheduled") {
    eventType = "cancellation_scheduled";
  } else if (input.targetState === "canceled") {
    eventType = "canceled";
  } else if (input.targetState === "expired") {
    eventType = "expired";
  } else if (aggregate.state === "paused") {
    eventType = "resumed";
  } else if (aggregate.state === "cancellation_scheduled") {
    eventType = "cancellation_cleared";
  } else {
    throw transitionUnavailable("subscription", aggregate.state, "resumed");
  }
  const providerEventAllowed =
    (eventType === "paused" &&
      (providerEventType === "customer.subscription.paused" ||
        providerEventType === "customer.subscription.updated")) ||
    (eventType === "resumed" &&
      (providerEventType === "customer.subscription.resumed" ||
        providerEventType === "customer.subscription.updated")) ||
    ((eventType === "cancellation_scheduled" ||
      eventType === "cancellation_cleared") &&
      providerEventType === "customer.subscription.updated") ||
    ((eventType === "canceled" || eventType === "expired") &&
      providerEventType === "customer.subscription.deleted");
  if (!providerEventAllowed) throw stripeTestFulfillmentUnavailable();
  const stateAfter = nextState("subscription", aggregate.state, eventType);
  if (stateAfter !== input.targetState) {
    throw transitionUnavailable("subscription", aggregate.state, eventType);
  }
  const times = transitionTimes({
    currentState: aggregate.state,
    nextState: stateAfter,
    eventType,
    currentPeriodEnd: aggregate.current_period_end,
    currentCancelAt: aggregate.cancel_at,
    effectiveAt: input.providerEventCreatedAt,
  });
  const entitlementChange = entitlementTransition(eventType);
  const eventId = `subscription_event_${crypto.randomUUID()}`;
  const result: SubscriptionMutationReceipt = Object.freeze({
    subscriptionId: input.subscriptionId,
    membershipId: aggregate.membership_id,
    customerUserId: input.customerUserId,
    subscriptionPlanId: aggregate.subscription_plan_id,
    state: stateAfter,
    currentPeriodStart: aggregate.current_period_start,
    currentPeriodEnd: aggregate.current_period_end,
    cancelAt: times.cancelAt,
    revision: input.expectedRevision + 1,
    membershipRevision: aggregate.membership_revision + 1,
    entitlementCount: aggregate.entitlement_count,
    downloadCreditsGranted: 0,
    licenseCreditsGranted: 0,
    eventType,
  });
  const customerAuthority = activeCustomerCondition(input.customerUserId);
  const fulfillmentCondition = stripeTestSubscriptionStateCondition(input);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE memberships
         SET state = ?, cancel_at = ?, canceled_at = ?, expired_at = ?,
             revision = revision + 1, last_operation_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
           AND state = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM subscriptions
             WHERE id = ? AND membership_id = memberships.id
               AND customer_user_id = memberships.customer_user_id
               AND source = 'stripe_test' AND stripe_subscription_id = ?
               AND state = ? AND revision = ?
               AND last_provider_event_created_at = ?
           )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        stateAfter,
        times.cancelAt,
        times.canceledAt,
        times.expiredAt,
        mutation.namespacedKey,
        aggregate.membership_id,
        input.customerUserId,
        aggregate.state,
        aggregate.membership_revision,
        input.subscriptionId,
        input.stripeSubscriptionId,
        aggregate.state,
        input.expectedRevision,
        aggregate.last_provider_event_created_at,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
    binding
      .prepare(
        `UPDATE subscriptions
         SET state = ?, cancel_at_period_end = ?, cancel_at = ?,
             canceled_at = ?, expired_at = ?,
             last_provider_event_created_at = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_user_id = ? AND membership_id = ?
           AND source = 'stripe_test' AND stripe_subscription_id = ?
           AND stripe_customer_id = ? AND commerce_product_id = ?
           AND commerce_price_id = ? AND state = ? AND revision = ?
           AND last_provider_event_created_at = ?
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = ?
               AND revision = ? AND last_operation_key = ?
           )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        stateAfter,
        stateAfter === "cancellation_scheduled" ? 1 : 0,
        times.cancelAt,
        times.canceledAt,
        times.expiredAt,
        input.providerEventCreatedAt,
        mutation.namespacedKey,
        input.subscriptionId,
        input.customerUserId,
        aggregate.membership_id,
        input.stripeSubscriptionId,
        input.stripeCustomerId,
        input.commerceProductId,
        input.commercePriceId,
        aggregate.state,
        input.expectedRevision,
        aggregate.last_provider_event_created_at,
        aggregate.membership_id,
        input.customerUserId,
        stateAfter,
        result.membershipRevision,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  ];
  let entitlementIndex: number | null = null;
  if (entitlementChange) {
    entitlementIndex = statements.length;
    const acceptedStates =
      eventType === "canceled" || eventType === "expired"
        ? "('active', 'revoked')"
        : `('${entitlementChange.from}')`;
    statements.push(
      binding
        .prepare(
          `UPDATE entitlements
           SET state = ?,
               expires_at = CASE WHEN ? = 'expired' THEN ? ELSE expires_at END,
               revision = revision + 1, last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE source_type = 'subscription' AND source_id = ?
             AND user_id = ? AND state IN ${acceptedStates}
             AND EXISTS (
               SELECT 1 FROM subscriptions
               WHERE id = ? AND customer_user_id = ? AND membership_id = ?
                 AND source = 'stripe_test' AND state = ? AND revision = ?
                 AND last_provider_event_created_at = ?
                 AND last_operation_key = ?
             )
             AND ${fulfillmentCondition.sql}
             AND ${customerAuthority.sql}`,
        )
        .bind(
          entitlementChange.to,
          entitlementChange.to,
          times.transitionAt,
          mutation.namespacedKey,
          input.subscriptionId,
          input.customerUserId,
          input.subscriptionId,
          input.customerUserId,
          aggregate.membership_id,
          stateAfter,
          result.revision,
          input.providerEventCreatedAt,
          mutation.namespacedKey,
          ...fulfillmentCondition.bindings,
          ...customerAuthority.bindings,
        ),
    );
  }
  const eventIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO subscription_events
          (id, subscription_id, customer_user_id, event_type, source,
           from_state, to_state, period_start, period_end, stripe_event_id,
           provider_object_id, fulfillment_event_id, order_id,
           idempotency_key, stripe_environment, livemode)
         SELECT ?, ?, ?, ?, 'stripe_test', ?, ?, ?, ?, ?, ?, ?, NULL, ?,
                'test', 0
         WHERE EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND membership_id = ?
             AND source = 'stripe_test' AND stripe_subscription_id = ?
             AND state = ? AND revision = ?
             AND last_provider_event_created_at = ?
             AND last_operation_key = ?
         )
           AND EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND customer_user_id = ? AND state = ?
               AND revision = ? AND last_operation_key = ?
           )
           AND ${fulfillmentCondition.sql}
           AND ${customerAuthority.sql}`,
      )
      .bind(
        eventId,
        input.subscriptionId,
        input.customerUserId,
        eventType,
        aggregate.state,
        stateAfter,
        aggregate.current_period_start,
        aggregate.current_period_end,
        input.stripeEventId,
        input.stripeSubscriptionId,
        input.fulfillmentEventId,
        mutation.namespacedKey,
        input.subscriptionId,
        input.customerUserId,
        aggregate.membership_id,
        input.stripeSubscriptionId,
        stateAfter,
        result.revision,
        input.providerEventCreatedAt,
        mutation.namespacedKey,
        aggregate.membership_id,
        input.customerUserId,
        stateAfter,
        result.membershipRevision,
        mutation.namespacedKey,
        ...fulfillmentCondition.bindings,
        ...customerAuthority.bindings,
      ),
  );
  const expectedEntitlementState = entitlementChange?.to ?? null;
  const exactSql = `EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = ? AND customer_user_id = ? AND membership_id = ?
      AND source = 'stripe_test' AND stripe_subscription_id = ?
      AND state = ? AND revision = ?
      AND last_provider_event_created_at = ? AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM memberships
    WHERE id = ? AND customer_user_id = ? AND source = 'stripe_test'
      AND state = ? AND revision = ? AND last_operation_key = ?
  ) AND EXISTS (
    SELECT 1 FROM subscription_events
    WHERE id = ? AND subscription_id = ? AND customer_user_id = ?
      AND event_type = ? AND source = 'stripe_test'
      AND stripe_event_id = ? AND provider_object_id = ?
      AND fulfillment_event_id = ? AND order_id IS NULL
      AND idempotency_key = ?
  ) AND (
    ? IS NULL OR (
      SELECT COUNT(*) FROM entitlements
      WHERE source_type = 'subscription' AND source_id = ? AND user_id = ?
        AND state = ? AND last_operation_key = ?
    ) = ?
  ) AND ${fulfillmentCondition.sql} AND ${customerAuthority.sql}`;
  const exactBindings: readonly (null | number | string)[] = [
    input.subscriptionId,
    input.customerUserId,
    aggregate.membership_id,
    input.stripeSubscriptionId,
    stateAfter,
    result.revision,
    input.providerEventCreatedAt,
    mutation.namespacedKey,
    aggregate.membership_id,
    input.customerUserId,
    stateAfter,
    result.membershipRevision,
    mutation.namespacedKey,
    eventId,
    input.subscriptionId,
    input.customerUserId,
    eventType,
    input.stripeEventId,
    input.stripeSubscriptionId,
    input.fulfillmentEventId,
    mutation.namespacedKey,
    expectedEntitlementState,
    input.subscriptionId,
    input.customerUserId,
    expectedEntitlementState,
    mutation.namespacedKey,
    aggregate.entitlement_count,
    ...fulfillmentCondition.bindings,
    ...customerAuthority.bindings,
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "subscription",
        subjectId: input.subscriptionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          source: "stripe_test",
          stripeEventId: input.stripeEventId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          fulfillmentEventId: input.fulfillmentEventId,
          providerEventType,
          previousState: aggregate.state,
        },
        result: { ...result },
      },
      exactSql,
      exactBindings,
    ),
  );
  if (eventType === "canceled") {
    await appendRelationshipTelemetry(binding, statements, {
      eventName: "subscription-canceled",
      resourceType: "subscription",
      resourceId: input.subscriptionId,
      customerUserId: input.customerUserId,
      operationKey: mutation.namespacedKey,
      context,
      durableConditionSql: exactSql,
      durableConditionBindings: exactBindings,
      occurredAt: input.providerEventCreatedAt,
    });
  }
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      (entitlementIndex !== null &&
        changedRows(results[entitlementIndex]) !==
          aggregate.entitlement_count) ||
      changedRows(results[eventIndex]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("Stripe Test subscription reconciliation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(
      binding,
      mutation,
      error,
      "Stripe Test subscription reconciliation",
    );
  }
}
