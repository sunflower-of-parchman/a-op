import { changedRows } from "./audit-events.ts";
import {
  readCheckoutSession,
  readStoredCommerceProduct,
  type ActiveCommerceProduct,
  type StoredCheckoutSession,
} from "./commerce-read.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  activateStripeTestSubscription,
  reconcileStripeTestSubscription,
  renewStripeTestSubscription,
} from "./membership-write.ts";
import type {
  StripeInvoiceEvent,
  StripeSubscriptionEvent,
} from "@/lib/commerce/stripe-events.ts";
import type { MembershipState } from "@/lib/memberships/types.ts";
import { RuntimeError, isRequestId } from "@/lib/runtime/index.ts";

export type CommerceRecurringResultType =
  | "initial-subscription"
  | "renewal"
  | "subscription-state"
  | "invoice-not-paid"
  | "invoice-not-fulfillable"
  | "subscription-awaiting-invoice"
  | "subscription-state-deferred"
  | "subscription-state-unchanged"
  | "subscription-state-stale"
  | "already-fulfilled";

export interface CommerceRecurringReceipt {
  readonly stripeEventId: string;
  readonly commerceEventId: string;
  readonly checkoutId: string | null;
  readonly status: "fulfilled" | "ignored" | "pending";
  readonly orderId: string | null;
  readonly fulfillmentEventId: string | null;
  readonly resultType: CommerceRecurringResultType;
  readonly replayed: boolean;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

interface VerifiedEventInputBase {
  readonly rawBodyDigest: string;
  readonly factsFingerprint: string;
  readonly requestId: string;
  readonly processedAt: string;
}

export interface ProcessInvoiceEventInput extends VerifiedEventInputBase {
  readonly event: StripeInvoiceEvent;
}

export interface ProcessSubscriptionEventInput extends VerifiedEventInputBase {
  readonly event: StripeSubscriptionEvent;
}

type ProcessRecurringEventInput =
  ProcessInvoiceEventInput | ProcessSubscriptionEventInput;

interface ExistingEventRow {
  id: string;
  event_type: string;
  stripe_object_id: string;
  checkout_session_id: string | null;
  raw_body_digest: string;
  facts_fingerprint: string;
  status: string;
}

interface ExistingProviderObjectRow {
  commerce_event_id: string;
  fulfillment_event_id: string;
  order_id: string | null;
  status: string;
}

interface RecurringScaffoldRow {
  commerce_event_id: string;
  event_type: string;
  stripe_object_id: string;
  event_created_at: string;
  event_status: string;
  checkout_session_id: string | null;
  order_id: string | null;
  order_status: string | null;
  customer_user_id: string;
  commerce_product_id: string;
  commerce_price_id: string;
  stripe_subscription_id: string | null;
  fulfillment_event_id: string;
  fulfillment_kind: string;
  provider_object_id: string;
  facts_fingerprint: string;
  fulfillment_status: string;
  result_json: string;
}

interface SubscriptionAggregateRow {
  id: string;
  customer_user_id: string;
  commerce_product_id: string;
  commerce_price_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  state: MembershipState;
  current_period_start: string;
  current_period_end: string;
  cancel_at: string | null;
  last_provider_event_created_at: string;
  revision: number;
}

interface RenewalScaffoldState {
  readonly subscriptionId: string;
  readonly expectedRevision: number;
}

interface SubscriptionStateScaffoldState extends RenewalScaffoldState {
  readonly targetState:
    "active" | "paused" | "cancellation_scheduled" | "canceled" | "expired";
}

interface DeferredSubscriptionStateScaffoldState {
  readonly phase: "awaiting-initial-invoice";
  readonly targetState: SubscriptionStateScaffoldState["targetState"];
  readonly eventCreatedAtUnix: number;
  readonly stripeCustomerId: string;
  readonly subscriptionStatus: StripeSubscriptionEvent["subscription"]["status"];
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelAtUnix: number | null;
  readonly canceledAtUnix: number | null;
  readonly endedAtUnix: number | null;
  readonly requestId: string;
  readonly processedAt: string;
}

type StoredSubscriptionStateScaffold =
  SubscriptionStateScaffoldState | DeferredSubscriptionStateScaffoldState;

interface AppliedProviderEventRow {
  readonly stripe_event_id: string;
  readonly subscription_event_type: string;
  readonly provider_event_created_at: string;
}

interface DeferredSubscriptionEventRow {
  readonly commerce_event_id: string;
  readonly stripe_event_id: string;
  readonly event_type: StripeSubscriptionEvent["stripeEventType"];
  readonly stripe_object_id: string;
  readonly raw_body_digest: string;
  readonly facts_fingerprint: string;
  readonly fulfillment_event_id: string;
  readonly result_json: string;
}

const HEX_DIGEST = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const MEMBERSHIP_STATES = new Set<MembershipState>([
  "pending",
  "active",
  "paused",
  "cancellation_scheduled",
  "canceled",
  "expired",
]);

function recurringError(
  code: string,
  message: string,
  publicMessage = "The verified Stripe Test event could not be applied.",
): RuntimeError {
  return new RuntimeError(code, message, { status: 409, publicMessage });
}

function integrity(message: string): RuntimeError {
  return new RuntimeError("COMMERCE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Recurring commerce is temporarily unavailable.",
  });
}

function validTimestamp(value: string): boolean {
  return (
    value.trim() === value &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function unixTime(unix: number): string {
  const value = new Date(unix * 1_000);
  if (!Number.isFinite(value.valueOf())) {
    throw recurringError(
      "STRIPE_WEBHOOK_PAYLOAD_INVALID",
      "The verified Stripe event timestamp is invalid.",
    );
  }
  return value.toISOString();
}

function subscriptionTargetRank(
  target: SubscriptionStateScaffoldState["targetState"] | null,
): number {
  if (target === "canceled" || target === "expired") return 9;
  if (target === "cancellation_scheduled") return 7;
  if (target === "paused") return 6;
  if (target === "active") return 4;
  return 2;
}

function recurringEventRank(input: ProcessRecurringEventInput): number {
  if (input.event.objectKind === "invoice") return 1;
  return subscriptionTargetRank(
    subscriptionTarget(input as ProcessSubscriptionEventInput),
  );
}

/**
 * Stripe's `created` value has one-second precision. A deterministic semantic
 * offset keeps terminal and access-reducing events later than activation,
 * renewal, or resume within that same provider second.
 */
function baseProviderEventCursor(input: ProcessRecurringEventInput): string {
  const value = new Date(
    input.event.createdAtUnix * 1_000 + recurringEventRank(input) * 100,
  );
  if (!Number.isFinite(value.valueOf())) {
    throw recurringError(
      "STRIPE_WEBHOOK_PAYLOAD_INVALID",
      "The verified Stripe event timestamp is invalid.",
    );
  }
  return value.toISOString();
}

function requireInput(input: ProcessRecurringEventInput): void {
  if (
    !HEX_DIGEST.test(input.rawBodyDigest) ||
    !HEX_DIGEST.test(input.factsFingerprint) ||
    !isRequestId(input.requestId) ||
    !validTimestamp(input.processedAt) ||
    input.event.stripeEnvironment !== "test" ||
    input.event.livemode !== false
  ) {
    throw new TypeError("A verified Stripe Test event input is required.");
  }
}

function stripeObjectId(input: ProcessRecurringEventInput): string {
  return input.event.objectKind === "invoice"
    ? input.event.invoice.stripeInvoiceId
    : input.event.subscription.stripeSubscriptionId;
}

async function existingReceipt(
  binding: D1Database,
  input: ProcessRecurringEventInput,
): Promise<CommerceRecurringReceipt | null> {
  const row = await binding
    .prepare(
      `SELECT id, event_type, stripe_object_id, checkout_session_id,
              raw_body_digest, facts_fingerprint, status
       FROM commerce_events
       WHERE stripe_event_id = ?1
       LIMIT 1`,
    )
    .bind(input.event.stripeEventId)
    .first<ExistingEventRow>();
  if (!row) return null;
  if (
    row.event_type !== input.event.stripeEventType ||
    row.stripe_object_id !== stripeObjectId(input) ||
    row.raw_body_digest !== input.rawBodyDigest ||
    row.facts_fingerprint !== input.factsFingerprint
  ) {
    throw recurringError(
      "STRIPE_EVENT_REPLAY_CONFLICT",
      "A Stripe event ID was replayed with different verified facts.",
    );
  }
  if (row.status === "processing") return null;
  if (row.status !== "completed" && row.status !== "ignored") {
    throw integrity("A recurring commerce event has an invalid replay state.");
  }
  const audit = await binding
    .prepare(
      `SELECT result_json
       FROM audit_events
       WHERE idempotency_key = ?1
       LIMIT 1`,
    )
    .bind(`commerce.webhook:${input.event.stripeEventId}`)
    .first<{ result_json: string }>();
  if (!audit) throw integrity("A processed recurring event has no receipt.");
  let result: CommerceRecurringReceipt;
  try {
    result = JSON.parse(audit.result_json) as CommerceRecurringReceipt;
  } catch {
    throw integrity("A recurring commerce event receipt is invalid.");
  }
  if (
    result.stripeEventId !== input.event.stripeEventId ||
    result.commerceEventId !== row.id ||
    result.stripeEnvironment !== "test" ||
    result.livemode !== false
  ) {
    throw integrity("A recurring commerce event receipt does not match D1.");
  }
  return Object.freeze({ ...result, replayed: true });
}

function prepareRequiredAudit(
  binding: D1Database,
  input: {
    readonly conditionSql: string;
    readonly conditionBindings: readonly (null | number | string)[];
    readonly action: string;
    readonly subjectId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly requestId: string;
    readonly details: Readonly<Record<string, unknown>>;
    readonly result: unknown;
  },
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, NULL, CASE WHEN (${input.conditionSql}) THEN ? ELSE NULL END,
               'commerce-event', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      ...input.conditionBindings,
      input.action,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details),
      JSON.stringify(input.result),
    );
}

function prepareCommerceEvent(
  binding: D1Database,
  input: ProcessRecurringEventInput,
  commerceEventId: string,
  checkoutId: string | null,
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
  providerEventCreatedAt = baseProviderEventCursor(input),
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id,
         checkout_session_id, event_created_at, raw_body_digest,
         facts_fingerprint, status, stripe_environment, livemode)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'processing', 'test', 0
       WHERE (${conditionSql})`,
    )
    .bind(
      commerceEventId,
      input.event.stripeEventId,
      input.event.stripeEventType,
      stripeObjectId(input),
      checkoutId,
      providerEventCreatedAt,
      input.rawBodyDigest,
      input.factsFingerprint,
      ...conditionBindings,
    );
}

function productSnapshot(product: ActiveCommerceProduct): string {
  return JSON.stringify({
    productType: product.productType,
    resourceType: product.resourceType,
    resourceId: product.resourceId,
    accessPlanId: product.accessPlanId,
    accessPlanRevision: product.accessPlanRevision,
    membershipPlanId: product.membershipPlanId,
    membershipPlanRevisionId: product.membershipPlanRevisionId,
    membershipPlanRevision: product.membershipPlanRevision,
    subscriptionPlanId: product.subscriptionPlanId,
    creditKind: product.creditKind,
    creditQuantity: product.creditQuantity,
  });
}

async function recordIgnored(
  binding: D1Database,
  input: ProcessRecurringEventInput,
  options: {
    readonly checkoutId: string | null;
    readonly resultType: CommerceRecurringResultType;
    readonly conditionSql: string;
    readonly conditionBindings: readonly (null | number | string)[];
  },
): Promise<CommerceRecurringReceipt> {
  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const operationKey = `commerce.webhook:${input.event.stripeEventId}`;
  const result: CommerceRecurringReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId,
    checkoutId: options.checkoutId,
    status: "ignored",
    orderId: null,
    fulfillmentEventId: null,
    resultType: options.resultType,
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(
      binding,
      input,
      commerceEventId,
      options.checkoutId,
      options.conditionSql,
      options.conditionBindings,
    ),
    binding
      .prepare(
        `UPDATE commerce_events
         SET status = 'ignored', processed_at = ?1
         WHERE id = ?2 AND status = 'processing'`,
      )
      .bind(input.processedAt, commerceEventId),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND stripe_event_id = ? AND status = 'ignored'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND NOT EXISTS (
        SELECT 1 FROM orders WHERE commerce_event_id = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM fulfillment_events WHERE commerce_event_id = ?
      )`,
      conditionBindings: [
        commerceEventId,
        input.event.stripeEventId,
        commerceEventId,
        commerceEventId,
      ],
      action: "commerce.webhook.ignored",
      subjectId: commerceEventId,
      idempotencyKey: operationKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        eventType: input.event.stripeEventType,
        objectKind: input.event.objectKind,
        resultType: options.resultType,
        stripeEnvironment: "test",
        livemode: false,
      },
      result,
    }),
  );
  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity(
        "The ignored recurring event was not recorded exactly once.",
      );
    }
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

async function readExistingProviderObject(
  binding: D1Database,
  kind: "initial_subscription" | "renewal",
  providerObjectId: string,
): Promise<ExistingProviderObjectRow | null> {
  return binding
    .prepare(
      `SELECT commerce_event_id, id AS fulfillment_event_id, order_id, status
       FROM fulfillment_events
       WHERE kind = ?1 AND provider_object_id = ?2
       LIMIT 1`,
    )
    .bind(kind, providerObjectId)
    .first<ExistingProviderObjectRow>();
}

async function readRecurringScaffold(
  binding: D1Database,
  stripeEventId: string,
): Promise<RecurringScaffoldRow | null> {
  return binding
    .prepare(
      `SELECT event.id AS commerce_event_id,
              event.event_type, event.stripe_object_id,
              event.event_created_at,
              event.status AS event_status,
              event.checkout_session_id,
              provider_order.id AS order_id,
              provider_order.status AS order_status,
              fulfillment.customer_user_id,
              fulfillment.commerce_product_id,
              item.commerce_price_id,
              provider_order.stripe_subscription_id,
              fulfillment.id AS fulfillment_event_id,
              fulfillment.kind AS fulfillment_kind,
              fulfillment.provider_object_id,
              fulfillment.facts_fingerprint,
              fulfillment.status AS fulfillment_status,
              fulfillment.result_json
       FROM commerce_events AS event
       JOIN fulfillment_events AS fulfillment
         ON fulfillment.commerce_event_id = event.id
       LEFT JOIN orders AS provider_order
         ON provider_order.id = fulfillment.order_id
       LEFT JOIN order_items AS item
         ON item.order_id = provider_order.id
       WHERE event.stripe_event_id = ?1
       LIMIT 1`,
    )
    .bind(stripeEventId)
    .first<RecurringScaffoldRow>();
}

function validateScaffoldPhase(row: RecurringScaffoldRow): void {
  const processing =
    row.event_status === "processing" &&
    row.fulfillment_status === "processing" &&
    (row.order_id === null || row.order_status === "pending");
  const complete =
    row.event_status === "completed" &&
    row.fulfillment_status === "fulfilled" &&
    (row.order_id === null || row.order_status === "fulfilled");
  if (!processing && !complete) {
    throw integrity("A recurring fulfillment has mismatched durable phases.");
  }
}

function parseScaffoldState<T extends object>(
  value: string,
  validate: (candidate: Record<string, unknown>) => boolean,
): T {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value) as unknown;
  } catch {
    throw integrity("A recurring fulfillment scaffold is invalid.");
  }
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    !validate(candidate as Record<string, unknown>)
  ) {
    throw integrity("A recurring fulfillment scaffold is invalid.");
  }
  return Object.freeze(candidate) as T;
}

function renewalScaffoldState(value: string): RenewalScaffoldState {
  return parseScaffoldState<RenewalScaffoldState>(value, (candidate) => {
    return (
      Object.keys(candidate).length === 2 &&
      typeof candidate.subscriptionId === "string" &&
      SAFE_ID.test(candidate.subscriptionId) &&
      Number.isSafeInteger(candidate.expectedRevision) &&
      (candidate.expectedRevision as number) > 0
    );
  });
}

function subscriptionStateScaffoldState(
  value: string,
): SubscriptionStateScaffoldState {
  const targets = new Set([
    "active",
    "paused",
    "cancellation_scheduled",
    "canceled",
    "expired",
  ]);
  return parseScaffoldState<SubscriptionStateScaffoldState>(
    value,
    (candidate) =>
      Object.keys(candidate).length === 3 &&
      typeof candidate.subscriptionId === "string" &&
      SAFE_ID.test(candidate.subscriptionId) &&
      Number.isSafeInteger(candidate.expectedRevision) &&
      (candidate.expectedRevision as number) > 0 &&
      typeof candidate.targetState === "string" &&
      targets.has(candidate.targetState),
  );
}

function deferredSubscriptionStateScaffoldState(
  value: string,
): DeferredSubscriptionStateScaffoldState {
  const targets = new Set([
    "active",
    "paused",
    "cancellation_scheduled",
    "canceled",
    "expired",
  ]);
  const statuses = new Set([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]);
  return parseScaffoldState<DeferredSubscriptionStateScaffoldState>(
    value,
    (candidate) =>
      Object.keys(candidate).length === 11 &&
      candidate.phase === "awaiting-initial-invoice" &&
      typeof candidate.targetState === "string" &&
      targets.has(candidate.targetState) &&
      Number.isSafeInteger(candidate.eventCreatedAtUnix) &&
      (candidate.eventCreatedAtUnix as number) >= 0 &&
      typeof candidate.stripeCustomerId === "string" &&
      candidate.stripeCustomerId.startsWith("cus_") &&
      typeof candidate.subscriptionStatus === "string" &&
      statuses.has(candidate.subscriptionStatus) &&
      typeof candidate.cancelAtPeriodEnd === "boolean" &&
      (candidate.cancelAtUnix === null ||
        (Number.isSafeInteger(candidate.cancelAtUnix) &&
          (candidate.cancelAtUnix as number) >= 0)) &&
      (candidate.canceledAtUnix === null ||
        (Number.isSafeInteger(candidate.canceledAtUnix) &&
          (candidate.canceledAtUnix as number) >= 0)) &&
      (candidate.endedAtUnix === null ||
        (Number.isSafeInteger(candidate.endedAtUnix) &&
          (candidate.endedAtUnix as number) >= 0)) &&
      typeof candidate.requestId === "string" &&
      isRequestId(candidate.requestId) &&
      typeof candidate.processedAt === "string" &&
      validTimestamp(candidate.processedAt),
  );
}

function isDeferredSubscriptionState(
  state: StoredSubscriptionStateScaffold,
): state is DeferredSubscriptionStateScaffoldState {
  return "phase" in state && state.phase === "awaiting-initial-invoice";
}

function pendingSubscriptionReceipt(
  input: ProcessSubscriptionEventInput,
  scaffold: RecurringScaffoldRow,
  replayed: boolean,
): CommerceRecurringReceipt {
  return Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId: scaffold.commerce_event_id,
    checkoutId: null,
    status: "pending",
    orderId: null,
    fulfillmentEventId: scaffold.fulfillment_event_id,
    resultType: "subscription-state-deferred",
    replayed,
    stripeEnvironment: "test",
    livemode: false,
  });
}

const STRIPE_SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

async function readDeferredSubscriptionEvents(
  binding: D1Database,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  stripeSubscriptionId: string,
): Promise<
  readonly {
    readonly row: DeferredSubscriptionEventRow;
    readonly state: DeferredSubscriptionStateScaffoldState;
  }[]
> {
  const result = await binding
    .prepare(
      `SELECT event.id AS commerce_event_id,
              event.stripe_event_id, event.event_type,
              event.stripe_object_id, event.raw_body_digest,
              event.facts_fingerprint,
              fulfillment.id AS fulfillment_event_id,
              fulfillment.result_json
       FROM fulfillment_events AS fulfillment
       JOIN commerce_events AS event
         ON event.id = fulfillment.commerce_event_id
       WHERE fulfillment.customer_user_id = ?1
         AND fulfillment.commerce_product_id = ?2
         AND fulfillment.kind = 'subscription_state'
         AND fulfillment.provider_object_id = ?3
         AND fulfillment.checkout_session_id IS NULL
         AND fulfillment.order_id IS NULL
         AND fulfillment.status = 'processing'
         AND fulfillment.stripe_environment = 'test'
         AND fulfillment.livemode = 0
         AND event.status = 'processing'
         AND event.checkout_session_id IS NULL
         AND event.stripe_object_id = ?3
         AND event.stripe_environment = 'test' AND event.livemode = 0
       ORDER BY event.event_created_at, event.stripe_event_id`,
    )
    .bind(checkout.customerUserId, product.id, stripeSubscriptionId)
    .all<DeferredSubscriptionEventRow>();
  const deferred: {
    readonly row: DeferredSubscriptionEventRow;
    readonly state: DeferredSubscriptionStateScaffoldState;
  }[] = [];
  for (const row of result.results) {
    let serialized: unknown;
    try {
      serialized = JSON.parse(row.result_json) as unknown;
    } catch {
      throw integrity("A pending subscription-state event is invalid.");
    }
    if (
      serialized === null ||
      typeof serialized !== "object" ||
      Array.isArray(serialized) ||
      (serialized as Record<string, unknown>).phase !==
        "awaiting-initial-invoice"
    ) {
      continue;
    }
    if (
      !STRIPE_SUBSCRIPTION_EVENT_TYPES.has(row.event_type) ||
      row.stripe_object_id !== stripeSubscriptionId ||
      row.facts_fingerprint.length !== 64 ||
      row.raw_body_digest.length !== 64
    ) {
      throw integrity("A pending subscription-state event is invalid.");
    }
    deferred.push(
      Object.freeze({
        row,
        state: deferredSubscriptionStateScaffoldState(row.result_json),
      }),
    );
  }
  return Object.freeze(deferred);
}

function deferredSubscriptionInput(
  deferred: {
    readonly row: DeferredSubscriptionEventRow;
    readonly state: DeferredSubscriptionStateScaffoldState;
  },
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): ProcessSubscriptionEventInput {
  const row = deferred.row;
  const state = deferred.state;
  return Object.freeze({
    event: Object.freeze({
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      stripeEventId: row.stripe_event_id,
      stripeEventType: row.event_type,
      createdAtUnix: state.eventCreatedAtUnix,
      objectKind: "subscription",
      subscription: Object.freeze({
        stripeSubscriptionId: row.stripe_object_id,
        stripeCustomerId: state.stripeCustomerId,
        status: state.subscriptionStatus,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        cancelAtUnix: state.cancelAtUnix,
        canceledAtUnix: state.canceledAtUnix,
        endedAtUnix: state.endedAtUnix,
        application: Object.freeze({
          checkoutId: checkout.id,
          productId: product.id,
          customerUserId: checkout.customerUserId,
        }),
      }),
    }),
    rawBodyDigest: row.raw_body_digest,
    factsFingerprint: row.facts_fingerprint,
    requestId: state.requestId,
    processedAt: state.processedAt,
  });
}

async function finalizeDeferredSubscriptionAsIgnored(
  binding: D1Database,
  input: ProcessSubscriptionEventInput,
  scaffold: RecurringScaffoldRow,
  resultType: "subscription-state-stale" | "subscription-state-unchanged",
): Promise<CommerceRecurringReceipt> {
  const result: CommerceRecurringReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId: scaffold.commerce_event_id,
    checkoutId: null,
    status: "ignored",
    orderId: null,
    fulfillmentEventId: scaffold.fulfillment_event_id,
    resultType,
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE fulfillment_events
         SET status = 'ignored', result_json = ?, completed_at = ?
         WHERE id = ? AND commerce_event_id = ?
           AND checkout_session_id IS NULL AND order_id IS NULL
           AND customer_user_id = ? AND kind = 'subscription_state'
           AND provider_object_id = ? AND facts_fingerprint = ?
           AND status = 'processing'
           AND stripe_environment = 'test' AND livemode = 0`,
      )
      .bind(
        JSON.stringify(result),
        input.processedAt,
        scaffold.fulfillment_event_id,
        scaffold.commerce_event_id,
        scaffold.customer_user_id,
        input.event.subscription.stripeSubscriptionId,
        input.factsFingerprint,
      ),
    binding
      .prepare(
        `UPDATE commerce_events
         SET status = 'ignored', processed_at = ?
         WHERE id = ? AND stripe_event_id = ? AND status = 'processing'
           AND facts_fingerprint = ?
           AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM fulfillment_events
             WHERE id = ? AND status = 'ignored'
           )`,
      )
      .bind(
        input.processedAt,
        scaffold.commerce_event_id,
        input.event.stripeEventId,
        input.factsFingerprint,
        scaffold.fulfillment_event_id,
      ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND stripe_event_id = ? AND status = 'ignored'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM fulfillment_events
        WHERE id = ? AND commerce_event_id = ? AND status = 'ignored'
          AND checkout_session_id IS NULL AND order_id IS NULL
          AND stripe_environment = 'test' AND livemode = 0
      ) AND NOT EXISTS (
        SELECT 1 FROM orders WHERE commerce_event_id = ?
      )`,
      conditionBindings: [
        scaffold.commerce_event_id,
        input.event.stripeEventId,
        scaffold.fulfillment_event_id,
        scaffold.commerce_event_id,
        scaffold.commerce_event_id,
      ],
      action: "commerce.webhook.ignored",
      subjectId: scaffold.commerce_event_id,
      idempotencyKey: `commerce.webhook:${input.event.stripeEventId}`,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        eventType: input.event.stripeEventType,
        objectKind: "subscription",
        resultType,
        stripeEnvironment: "test",
        livemode: false,
      },
      result,
    }),
  );
  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[1]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity(
        "The deferred subscription-state event did not finalize exactly once.",
      );
    }
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

async function readSubscriptionAggregate(
  binding: D1Database,
  stripeSubscriptionId: string,
): Promise<SubscriptionAggregateRow | null> {
  const row = await binding
    .prepare(
      `SELECT id, customer_user_id, commerce_product_id, commerce_price_id,
              stripe_subscription_id, stripe_customer_id, state,
              current_period_start, current_period_end, cancel_at,
              last_provider_event_created_at, revision
       FROM subscriptions
       WHERE source = 'stripe_test' AND stripe_subscription_id = ?1
         AND stripe_environment = 'test' AND livemode = 0
       LIMIT 1`,
    )
    .bind(stripeSubscriptionId)
    .first<SubscriptionAggregateRow>();
  if (!row) return null;
  if (
    !SAFE_ID.test(row.id) ||
    !SAFE_ID.test(row.customer_user_id) ||
    !SAFE_ID.test(row.commerce_product_id) ||
    !SAFE_ID.test(row.commerce_price_id) ||
    !MEMBERSHIP_STATES.has(row.state) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    !validTimestamp(row.current_period_start) ||
    !validTimestamp(row.current_period_end) ||
    !validTimestamp(row.last_provider_event_created_at)
  ) {
    throw integrity("A Stripe Test subscription record is invalid.");
  }
  return row;
}

function appliedProviderEventRank(eventType: string): number {
  if (eventType === "canceled" || eventType === "expired") return 9;
  if (eventType === "cancellation_scheduled") return 7;
  if (eventType === "paused") return 6;
  if (eventType === "resumed" || eventType === "cancellation_cleared") {
    return 4;
  }
  if (eventType === "activated" || eventType === "renewed") return 1;
  throw integrity(
    "A Stripe Test subscription event has an invalid ordering type.",
  );
}

async function readAppliedProviderEvent(
  binding: D1Database,
  aggregate: SubscriptionAggregateRow,
): Promise<AppliedProviderEventRow> {
  const row = await binding
    .prepare(
      `SELECT commerce.stripe_event_id,
              lifecycle.event_type AS subscription_event_type,
              commerce.event_created_at AS provider_event_created_at
       FROM subscription_events AS lifecycle
       JOIN commerce_events AS commerce
         ON commerce.stripe_event_id = lifecycle.stripe_event_id
        AND commerce.stripe_environment = 'test' AND commerce.livemode = 0
       WHERE lifecycle.subscription_id = ?1
         AND lifecycle.customer_user_id = ?2
         AND lifecycle.source = 'stripe_test'
         AND lifecycle.stripe_environment = 'test' AND lifecycle.livemode = 0
       ORDER BY commerce.event_created_at DESC, commerce.stripe_event_id DESC
       LIMIT 1`,
    )
    .bind(aggregate.id, aggregate.customer_user_id)
    .first<AppliedProviderEventRow>();
  if (
    !row ||
    row.provider_event_created_at !== aggregate.last_provider_event_created_at
  ) {
    throw integrity(
      "A Stripe Test subscription ordering cursor has no matching lifecycle event.",
    );
  }
  return row;
}

/**
 * Resolves a total, safety-first cursor for Stripe events that share the
 * provider's second-resolution `created` timestamp. A null result is stale.
 */
async function resolveProviderEventCursor(
  binding: D1Database,
  aggregate: SubscriptionAggregateRow,
  input: ProcessRecurringEventInput,
): Promise<string | null> {
  const currentMilliseconds = Date.parse(
    aggregate.last_provider_event_created_at,
  );
  if (!Number.isFinite(currentMilliseconds)) {
    throw integrity("A Stripe Test subscription ordering cursor is invalid.");
  }
  const currentSecond = Math.floor(currentMilliseconds / 1_000);
  if (input.event.createdAtUnix < currentSecond) return null;
  const baseCursor = baseProviderEventCursor(input);
  if (input.event.createdAtUnix > currentSecond) return baseCursor;

  const applied = await readAppliedProviderEvent(binding, aggregate);
  const incomingRank = recurringEventRank(input);
  const currentRank = appliedProviderEventRank(applied.subscription_event_type);
  if (incomingRank < currentRank) return null;
  if (
    incomingRank === currentRank &&
    input.event.stripeEventId <= applied.stripe_event_id
  ) {
    return null;
  }

  const nextMilliseconds = Math.max(
    Date.parse(baseCursor),
    currentMilliseconds + 1,
  );
  return new Date(nextMilliseconds).toISOString();
}

async function requireInitialProductAvailable(
  binding: D1Database,
  product: ActiveCommerceProduct,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT 1 AS valid
       FROM commerce_products
       JOIN commerce_prices
         ON commerce_prices.id = ?1
        AND commerce_prices.commerce_product_id = commerce_products.id
       JOIN artist_modules
         ON artist_modules.module_key = 'subscriptions'
        AND artist_modules.active = 1
       WHERE commerce_products.id = ?2
         AND commerce_products.product_type = 'subscription'
         AND commerce_products.state = 'active'
         AND commerce_products.revision = ?3
         AND commerce_prices.active = 1
         AND commerce_prices.stripe_environment = 'test'
         AND commerce_prices.livemode = 0
       LIMIT 1`,
    )
    .bind(product.priceId, product.id, product.revision)
    .first<{ valid: number }>();
  if (row?.valid !== 1) {
    throw recurringError(
      "COMMERCE_PRODUCT_UNAVAILABLE",
      "The initial subscription product is no longer active.",
      "That Test Mode subscription is unavailable.",
    );
  }
}

function validateInvoiceContext(
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  input: ProcessInvoiceEventInput,
): void {
  const invoice = input.event.invoice;
  if (
    checkout.id !== invoice.application.checkoutId ||
    checkout.customerUserId !== invoice.application.customerUserId ||
    checkout.commerceProductId !== invoice.application.productId ||
    checkout.commerceProductId !== product.id ||
    checkout.commercePriceId !== product.priceId ||
    checkout.mode !== "subscription" ||
    product.productType !== "subscription" ||
    checkout.amountMinor !== product.amountMinor ||
    checkout.currency !== product.currency ||
    invoice.currency.toUpperCase() !== product.currency ||
    (checkout.stripeCustomerId !== null &&
      checkout.stripeCustomerId !== invoice.stripeCustomerId) ||
    (checkout.stripeSubscriptionId !== null &&
      checkout.stripeSubscriptionId !== invoice.stripeSubscriptionId)
  ) {
    throw recurringError(
      "STRIPE_INVOICE_MISMATCH",
      "The verified invoice does not match the server-owned subscription intent.",
    );
  }
}

function isPaidInvoice(input: ProcessInvoiceEventInput): boolean {
  return (
    (input.event.stripeEventType === "invoice.paid" ||
      input.event.stripeEventType === "invoice.payment_succeeded") &&
    input.event.invoice.status === "paid" &&
    input.event.invoice.paid === true
  );
}

function validatePaidAmount(
  product: ActiveCommerceProduct,
  input: ProcessInvoiceEventInput,
): void {
  if (
    input.event.invoice.amountPaid !== product.amountMinor ||
    input.event.invoice.amountDue !== product.amountMinor
  ) {
    throw recurringError(
      "STRIPE_INVOICE_AMOUNT_MISMATCH",
      "The verified invoice amount does not match the pinned test price.",
    );
  }
}

function validateInvoiceScaffold(
  row: RecurringScaffoldRow,
  input: ProcessInvoiceEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  kind: "initial_subscription" | "renewal",
): void {
  validateScaffoldPhase(row);
  const checkoutValid =
    kind === "initial_subscription"
      ? row.checkout_session_id === checkout.id
      : row.checkout_session_id === null;
  const orderLinkValid =
    kind === "initial_subscription"
      ? row.order_id !== null
      : row.order_id !== null && row.checkout_session_id === null;
  if (
    !checkoutValid ||
    !orderLinkValid ||
    row.event_type !== input.event.stripeEventType ||
    row.stripe_object_id !== input.event.invoice.stripeInvoiceId ||
    row.customer_user_id !== checkout.customerUserId ||
    row.commerce_product_id !== product.id ||
    row.commerce_price_id !== product.priceId ||
    row.stripe_subscription_id !== input.event.invoice.stripeSubscriptionId ||
    row.fulfillment_kind !== kind ||
    row.provider_object_id !== input.event.invoice.stripeInvoiceId ||
    row.facts_fingerprint !== input.factsFingerprint
  ) {
    throw recurringError(
      "STRIPE_EVENT_REPLAY_CONFLICT",
      "A recurring invoice scaffold does not match its verified facts.",
    );
  }
}

async function createInvoiceScaffold(
  binding: D1Database,
  input: ProcessInvoiceEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  kind: "initial_subscription" | "renewal",
  renewal: RenewalScaffoldState | null,
  providerEventCreatedAt: string,
): Promise<RecurringScaffoldRow> {
  const invoice = input.event.invoice;
  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const orderId = `order_${crypto.randomUUID()}`;
  const orderItemId = `order_item_${crypto.randomUUID()}`;
  const fulfillmentEventId = `fulfillment_${crypto.randomUUID()}`;
  const checkoutId = kind === "initial_subscription" ? checkout.id : null;
  const scaffoldKey = `commerce.webhook.scaffold:${input.event.stripeEventId}`;
  const conditionSql = `EXISTS (
    SELECT 1 FROM checkout_sessions
    WHERE id = ? AND customer_user_id = ? AND commerce_product_id = ?
      AND commerce_price_id = ? AND mode = 'subscription'
      AND stripe_environment = 'test' AND livemode = 0
  )`;
  const conditionBindings = [
    checkout.id,
    checkout.customerUserId,
    product.id,
    product.priceId,
  ];
  const scaffoldState = renewal
    ? JSON.stringify(renewal)
    : JSON.stringify({ billingReason: "subscription_create" });
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(
      binding,
      input,
      commerceEventId,
      checkoutId,
      conditionSql,
      conditionBindings,
      providerEventCreatedAt,
    ),
  ];
  if (kind === "initial_subscription") {
    statements.push(
      binding
        .prepare(
          `UPDATE checkout_sessions
           SET status = 'completed', stripe_customer_id = ?,
               stripe_subscription_id = ?,
               completed_at = COALESCE(completed_at, ?),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND customer_user_id = ?
             AND commerce_product_id = ? AND commerce_price_id = ?
             AND mode = 'subscription'
             AND status IN ('open', 'completed', 'failed')
             AND (stripe_customer_id IS NULL OR stripe_customer_id = ?)
             AND (stripe_subscription_id IS NULL OR stripe_subscription_id = ?)
             AND stripe_environment = 'test' AND livemode = 0
             AND EXISTS (
               SELECT 1 FROM commerce_events
               WHERE id = ? AND status = 'processing'
             )`,
        )
        .bind(
          invoice.stripeCustomerId,
          invoice.stripeSubscriptionId,
          input.processedAt,
          checkout.id,
          checkout.customerUserId,
          product.id,
          product.priceId,
          invoice.stripeCustomerId,
          invoice.stripeSubscriptionId,
          commerceEventId,
        ),
    );
  }
  statements.push(
    binding
      .prepare(
        `INSERT INTO orders
          (id, customer_user_id, checkout_session_id, commerce_event_id,
           status, total_minor, currency, stripe_subscription_id,
           stripe_environment, livemode)
         SELECT ?, ?, ?, ?, 'pending', ?, ?, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM commerce_events
           WHERE id = ? AND status = 'processing'
         ) AND ${
           kind === "initial_subscription"
             ? `EXISTS (
                 SELECT 1 FROM checkout_sessions
                 WHERE id = ? AND status = 'completed'
                   AND stripe_customer_id = ? AND stripe_subscription_id = ?
               )`
             : `EXISTS (
                 SELECT 1 FROM subscriptions
                 WHERE id = ? AND customer_user_id = ?
                   AND stripe_subscription_id = ? AND source = 'stripe_test'
                   AND revision = ? AND state = 'active'
                   AND stripe_environment = 'test' AND livemode = 0
               )`
         }`,
      )
      .bind(
        orderId,
        checkout.customerUserId,
        checkoutId,
        commerceEventId,
        product.amountMinor,
        product.currency,
        invoice.stripeSubscriptionId,
        commerceEventId,
        ...(kind === "initial_subscription"
          ? [
              checkout.id,
              invoice.stripeCustomerId,
              invoice.stripeSubscriptionId,
            ]
          : [
              renewal!.subscriptionId,
              checkout.customerUserId,
              invoice.stripeSubscriptionId,
              renewal!.expectedRevision,
            ]),
      ),
    binding
      .prepare(
        `INSERT INTO order_items
          (id, order_id, commerce_product_id, commerce_product_revision,
           commerce_price_id, product_type, product_name,
           fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
           stripe_environment, livemode)
         SELECT ?, ?, ?, ?, ?, 'subscription', ?, ?, 1, ?, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM orders WHERE id = ? AND status = 'pending'
         )`,
      )
      .bind(
        orderItemId,
        orderId,
        product.id,
        product.revision,
        product.priceId,
        product.name,
        productSnapshot(product),
        product.amountMinor,
        product.currency,
        orderId,
      ),
    binding
      .prepare(
        `INSERT INTO fulfillment_events
          (id, commerce_event_id, checkout_session_id, order_id,
           customer_user_id, commerce_product_id, kind, provider_object_id,
           facts_fingerprint, status, result_json, stripe_environment,
           livemode)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM orders WHERE id = ? AND status = 'pending'
         ) AND EXISTS (
           SELECT 1 FROM order_items
           WHERE id = ? AND order_id = ? AND product_type = 'subscription'
         )`,
      )
      .bind(
        fulfillmentEventId,
        commerceEventId,
        checkoutId,
        orderId,
        checkout.customerUserId,
        product.id,
        kind,
        invoice.stripeInvoiceId,
        input.factsFingerprint,
        scaffoldState,
        orderId,
        orderItemId,
        orderId,
      ),
  );
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND status = 'processing'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM orders
        WHERE id = ? AND status = 'pending'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM fulfillment_events
        WHERE id = ? AND commerce_event_id = ? AND order_id = ?
          AND status = 'processing' AND stripe_environment = 'test'
          AND livemode = 0
      )`,
      conditionBindings: [
        commerceEventId,
        orderId,
        fulfillmentEventId,
        commerceEventId,
        orderId,
      ],
      action: "commerce.webhook.processing",
      subjectId: commerceEventId,
      idempotencyKey: scaffoldKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        productId: product.id,
        productType: "subscription",
        fulfillmentKind: kind,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: {
        commerceEventId,
        orderId,
        fulfillmentEventId,
        status: "processing",
      },
    }),
  );

  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity(
        "The recurring invoice scaffold was not created exactly once.",
      );
    }
  } catch (error) {
    const current = await readRecurringScaffold(
      binding,
      input.event.stripeEventId,
    );
    if (!current) throw error;
  }
  const scaffold = await readRecurringScaffold(
    binding,
    input.event.stripeEventId,
  );
  if (!scaffold)
    throw integrity("The recurring invoice scaffold is unavailable.");
  validateInvoiceScaffold(scaffold, input, checkout, product, kind);
  return scaffold;
}

async function finalizeInvoiceScaffold(
  binding: D1Database,
  input: ProcessInvoiceEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  scaffold: RecurringScaffoldRow,
  kind: "initial_subscription" | "renewal",
): Promise<CommerceRecurringReceipt> {
  if (!scaffold.order_id) throw integrity("A recurring invoice has no order.");
  const invoice = input.event.invoice;
  let providerResult: unknown;
  let subscriptionId: string;
  if (kind === "initial_subscription") {
    const activation = await activateStripeTestSubscription(
      binding,
      {
        customerUserId: checkout.customerUserId,
        commerceProductId: product.id,
        commercePriceId: product.priceId,
        commerceEventId: scaffold.commerce_event_id,
        orderId: scaffold.order_id,
        fulfillmentEventId: scaffold.fulfillment_event_id,
        factsFingerprint: input.factsFingerprint,
        stripeEventId: input.event.stripeEventId,
        stripeObjectId: invoice.stripeInvoiceId,
        fulfillmentProviderObjectId: invoice.stripeInvoiceId,
        providerEventCreatedAt: scaffold.event_created_at,
        billingReason: "subscription_create",
        stripeCustomerId: invoice.stripeCustomerId,
        stripeSubscriptionId: invoice.stripeSubscriptionId,
        periodStart: unixTime(invoice.periodStartUnix),
        periodEnd: unixTime(invoice.periodEndUnix),
      },
      {
        actorUserId: checkout.customerUserId,
        idempotencyKey: `stripe-test:${input.event.stripeEventId}`,
        requestId: input.requestId,
      },
    );
    providerResult = activation.value;
    subscriptionId = activation.value.subscriptionId;
  } else {
    const pinned = renewalScaffoldState(scaffold.result_json);
    const renewal = await renewStripeTestSubscription(
      binding,
      {
        customerUserId: checkout.customerUserId,
        commerceProductId: product.id,
        commercePriceId: product.priceId,
        commerceEventId: scaffold.commerce_event_id,
        orderId: scaffold.order_id,
        fulfillmentEventId: scaffold.fulfillment_event_id,
        factsFingerprint: input.factsFingerprint,
        stripeEventId: input.event.stripeEventId,
        stripeObjectId: invoice.stripeInvoiceId,
        fulfillmentProviderObjectId: invoice.stripeInvoiceId,
        providerEventCreatedAt: scaffold.event_created_at,
        billingReason: "subscription_cycle",
        subscriptionId: pinned.subscriptionId,
        stripeCustomerId: invoice.stripeCustomerId,
        stripeSubscriptionId: invoice.stripeSubscriptionId,
        expectedRevision: pinned.expectedRevision,
        periodStart: unixTime(invoice.periodStartUnix),
        periodEnd: unixTime(invoice.periodEndUnix),
      },
      {
        actorUserId: checkout.customerUserId,
        idempotencyKey: `stripe-test:${input.event.stripeEventId}`,
        requestId: input.requestId,
      },
    );
    providerResult = renewal.value;
    subscriptionId = renewal.value.subscriptionId;
  }

  const operationKey = `commerce.webhook:${input.event.stripeEventId}`;
  const result: CommerceRecurringReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId: scaffold.commerce_event_id,
    checkoutId: kind === "initial_subscription" ? checkout.id : null,
    status: "fulfilled",
    orderId: scaffold.order_id,
    fulfillmentEventId: scaffold.fulfillment_event_id,
    resultType:
      kind === "initial_subscription" ? "initial-subscription" : "renewal",
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE fulfillment_events
         SET status = 'fulfilled', result_json = ?, completed_at = ?
         WHERE id = ? AND commerce_event_id = ? AND order_id = ?
           AND customer_user_id = ? AND commerce_product_id = ?
           AND kind = ? AND provider_object_id = ?
           AND facts_fingerprint = ? AND status = 'processing'
           AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM subscriptions
             WHERE id = ? AND customer_user_id = ?
               AND stripe_subscription_id = ? AND source = 'stripe_test'
               AND stripe_environment = 'test' AND livemode = 0
           ) AND EXISTS (
             SELECT 1 FROM subscription_events
             WHERE subscription_id = ? AND customer_user_id = ?
               AND stripe_event_id = ? AND fulfillment_event_id = ?
               AND order_id = ? AND source = 'stripe_test'
           )`,
      )
      .bind(
        JSON.stringify(providerResult),
        input.processedAt,
        scaffold.fulfillment_event_id,
        scaffold.commerce_event_id,
        scaffold.order_id,
        checkout.customerUserId,
        product.id,
        kind,
        invoice.stripeInvoiceId,
        input.factsFingerprint,
        subscriptionId,
        checkout.customerUserId,
        invoice.stripeSubscriptionId,
        subscriptionId,
        checkout.customerUserId,
        input.event.stripeEventId,
        scaffold.fulfillment_event_id,
        scaffold.order_id,
      ),
    binding
      .prepare(
        `UPDATE orders
         SET status = 'fulfilled', completed_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'
           AND EXISTS (
             SELECT 1 FROM fulfillment_events
             WHERE id = ? AND status = 'fulfilled'
           )`,
      )
      .bind(
        input.processedAt,
        scaffold.order_id,
        scaffold.fulfillment_event_id,
      ),
    binding
      .prepare(
        `UPDATE commerce_events
         SET status = 'completed', processed_at = ?
         WHERE id = ? AND status = 'processing'
           AND EXISTS (
             SELECT 1 FROM orders WHERE id = ? AND status = 'fulfilled'
           )`,
      )
      .bind(input.processedAt, scaffold.commerce_event_id, scaffold.order_id),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND status = 'completed'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM orders
        WHERE id = ? AND status = 'fulfilled'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM fulfillment_events
        WHERE id = ? AND status = 'fulfilled'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM subscriptions
        WHERE id = ? AND customer_user_id = ?
          AND stripe_subscription_id = ? AND source = 'stripe_test'
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [
        scaffold.commerce_event_id,
        scaffold.order_id,
        scaffold.fulfillment_event_id,
        subscriptionId,
        checkout.customerUserId,
        invoice.stripeSubscriptionId,
      ],
      action: "commerce.webhook.fulfilled",
      subjectId: scaffold.commerce_event_id,
      idempotencyKey: operationKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        orderId: scaffold.order_id,
        productId: product.id,
        fulfillmentKind: kind,
        subscriptionId,
        stripeEnvironment: "test",
        livemode: false,
      },
      result,
    }),
  );
  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity("The recurring invoice did not finalize exactly once.");
    }
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

function invoiceIgnoredCondition(
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): { readonly sql: string; readonly bindings: readonly string[] } {
  return Object.freeze({
    sql: `EXISTS (
      SELECT 1 FROM checkout_sessions
      WHERE id = ? AND customer_user_id = ? AND commerce_product_id = ?
        AND commerce_price_id = ? AND mode = 'subscription'
        AND stripe_environment = 'test' AND livemode = 0
    )`,
    bindings: Object.freeze([
      checkout.id,
      checkout.customerUserId,
      product.id,
      product.priceId,
    ]),
  });
}

async function finalizeDeferredEventsWithoutSubscription(
  binding: D1Database,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  stripeSubscriptionId: string,
): Promise<void> {
  const deferredEvents = await readDeferredSubscriptionEvents(
    binding,
    checkout,
    product,
    stripeSubscriptionId,
  );
  for (const deferred of deferredEvents) {
    const deferredInput = deferredSubscriptionInput(
      deferred,
      checkout,
      product,
    );
    const scaffold = await readRecurringScaffold(
      binding,
      deferred.row.stripe_event_id,
    );
    if (!scaffold) {
      throw integrity("A deferred subscription-state scaffold is unavailable.");
    }
    await finalizeDeferredSubscriptionAsIgnored(
      binding,
      deferredInput,
      scaffold,
      "subscription-state-unchanged",
    );
  }
}

async function preemptInitialInvoiceForDeferredTerminal(
  binding: D1Database,
  input: ProcessInvoiceEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  ignoredCondition: ReturnType<typeof invoiceIgnoredCondition>,
): Promise<CommerceRecurringReceipt | null> {
  const deferredEvents = await readDeferredSubscriptionEvents(
    binding,
    checkout,
    product,
    input.event.invoice.stripeSubscriptionId,
  );
  if (
    !deferredEvents.some(
      ({ state }) =>
        state.targetState === "canceled" || state.targetState === "expired",
    )
  ) {
    return null;
  }
  const terminal = deferredEvents.find(
    ({ state }) =>
      state.targetState === "canceled" || state.targetState === "expired",
  );
  if (!terminal) {
    throw integrity("A deferred terminal subscription event is unavailable.");
  }
  const checkoutCancellation = await binding
    .prepare(
      `UPDATE checkout_sessions
       SET status = 'canceled',
           stripe_customer_id = COALESCE(stripe_customer_id, ?1),
           stripe_subscription_id = COALESCE(stripe_subscription_id, ?2),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?3 AND customer_user_id = ?4
         AND commerce_product_id = ?5 AND commerce_price_id = ?6
         AND mode = 'subscription'
         AND status IN ('open', 'completed', 'failed', 'canceled')
         AND (stripe_customer_id IS NULL OR stripe_customer_id = ?1)
         AND (stripe_subscription_id IS NULL OR stripe_subscription_id = ?2)
         AND stripe_environment = 'test' AND livemode = 0
         AND EXISTS (
           SELECT 1 FROM fulfillment_events AS fulfillment
           JOIN commerce_events AS event
             ON event.id = fulfillment.commerce_event_id
           WHERE fulfillment.id = ?7
             AND fulfillment.commerce_event_id = ?8
             AND fulfillment.customer_user_id = ?4
             AND fulfillment.commerce_product_id = ?5
             AND fulfillment.kind = 'subscription_state'
             AND fulfillment.provider_object_id = ?2
             AND fulfillment.status = 'processing'
             AND fulfillment.stripe_environment = 'test'
             AND fulfillment.livemode = 0
             AND event.stripe_event_id = ?9
             AND event.status = 'processing'
             AND event.stripe_environment = 'test' AND event.livemode = 0
         )`,
    )
    .bind(
      terminal.state.stripeCustomerId,
      input.event.invoice.stripeSubscriptionId,
      checkout.id,
      checkout.customerUserId,
      product.id,
      product.priceId,
      terminal.row.fulfillment_event_id,
      terminal.row.commerce_event_id,
      terminal.row.stripe_event_id,
    )
    .run();
  if (changedRows(checkoutCancellation) !== 1) {
    throw integrity(
      "The deferred terminal subscription event did not close checkout.",
    );
  }
  const result = await recordIgnored(binding, input, {
    checkoutId: checkout.id,
    resultType: "invoice-not-fulfillable",
    conditionSql: ignoredCondition.sql,
    conditionBindings: ignoredCondition.bindings,
  });
  await finalizeDeferredEventsWithoutSubscription(
    binding,
    checkout,
    product,
    input.event.invoice.stripeSubscriptionId,
  );
  return result;
}

async function drainDeferredSubscriptionEvents(
  binding: D1Database,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  stripeSubscriptionId: string,
): Promise<void> {
  const deferredEvents = await readDeferredSubscriptionEvents(
    binding,
    checkout,
    product,
    stripeSubscriptionId,
  );
  for (const deferred of deferredEvents) {
    await processVerifiedSubscriptionEvent(
      binding,
      deferredSubscriptionInput(deferred, checkout, product),
    );
  }
}

/** Processes one already signature-verified Stripe Test invoice event. */
export async function processVerifiedInvoiceEvent(
  binding: D1Database,
  input: ProcessInvoiceEventInput,
): Promise<CommerceRecurringReceipt> {
  requireInput(input);
  const replay = await existingReceipt(binding, input);

  const invoice = input.event.invoice;
  const checkout = await readCheckoutSession(
    binding,
    invoice.application.checkoutId,
  );
  if (!checkout) {
    throw recurringError(
      "STRIPE_CHECKOUT_NOT_FOUND",
      "The verified invoice does not identify a stored checkout.",
    );
  }
  const product = await readStoredCommerceProduct(
    binding,
    checkout.commerceProductId,
    checkout.commercePriceId,
  );
  if (!product) throw integrity("The invoice product snapshot is unavailable.");
  validateInvoiceContext(checkout, product, input);
  const ignoredCondition = invoiceIgnoredCondition(checkout, product);

  if (replay) {
    if (
      invoice.billingReason === "subscription_create" &&
      replay.resultType === "initial-subscription"
    ) {
      await drainDeferredSubscriptionEvents(
        binding,
        checkout,
        product,
        invoice.stripeSubscriptionId,
      );
    } else if (
      invoice.billingReason === "subscription_create" &&
      replay.resultType === "invoice-not-fulfillable"
    ) {
      await finalizeDeferredEventsWithoutSubscription(
        binding,
        checkout,
        product,
        invoice.stripeSubscriptionId,
      );
    }
    return replay;
  }

  if (!isPaidInvoice(input)) {
    return recordIgnored(binding, input, {
      checkoutId:
        invoice.billingReason === "subscription_create" ? checkout.id : null,
      resultType: "invoice-not-paid",
      conditionSql: ignoredCondition.sql,
      conditionBindings: ignoredCondition.bindings,
    });
  }
  if (
    invoice.billingReason !== "subscription_create" &&
    invoice.billingReason !== "subscription_cycle"
  ) {
    return recordIgnored(binding, input, {
      checkoutId: null,
      resultType: "invoice-not-fulfillable",
      conditionSql: ignoredCondition.sql,
      conditionBindings: ignoredCondition.bindings,
    });
  }
  validatePaidAmount(product, input);

  if (
    invoice.billingReason === "subscription_create" &&
    checkout.status === "canceled"
  ) {
    return recordIgnored(binding, input, {
      checkoutId: checkout.id,
      resultType: "invoice-not-fulfillable",
      conditionSql: `${ignoredCondition.sql} AND EXISTS (
        SELECT 1 FROM checkout_sessions
        WHERE id = ? AND status = 'canceled'
          AND stripe_subscription_id = ?
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [
        ...ignoredCondition.bindings,
        checkout.id,
        invoice.stripeSubscriptionId,
      ],
    });
  }

  const kind =
    invoice.billingReason === "subscription_create"
      ? "initial_subscription"
      : "renewal";
  let providerEventCreatedAt = baseProviderEventCursor(input);
  let scaffold = await readRecurringScaffold(
    binding,
    input.event.stripeEventId,
  );
  if (scaffold) {
    validateInvoiceScaffold(scaffold, input, checkout, product, kind);
    if (scaffold.event_status === "completed") {
      const completed = await existingReceipt(binding, input);
      if (completed) return completed;
      throw integrity("A completed recurring invoice has no receipt.");
    }
    const result = await finalizeInvoiceScaffold(
      binding,
      input,
      checkout,
      product,
      scaffold,
      kind,
    );
    if (kind === "initial_subscription") {
      await drainDeferredSubscriptionEvents(
        binding,
        checkout,
        product,
        invoice.stripeSubscriptionId,
      );
    }
    return result;
  }

  const existingProvider = await readExistingProviderObject(
    binding,
    kind,
    invoice.stripeInvoiceId,
  );
  if (existingProvider) {
    if (existingProvider.status === "fulfilled") {
      return recordIgnored(binding, input, {
        checkoutId: kind === "initial_subscription" ? checkout.id : null,
        resultType: "already-fulfilled",
        conditionSql: `EXISTS (
          SELECT 1 FROM fulfillment_events
          WHERE id = ? AND kind = ? AND provider_object_id = ?
            AND status = 'fulfilled' AND stripe_environment = 'test'
            AND livemode = 0
        )`,
        conditionBindings: [
          existingProvider.fulfillment_event_id,
          kind,
          invoice.stripeInvoiceId,
        ],
      });
    }
    throw recurringError(
      "COMMERCE_PROVIDER_OBJECT_BUSY",
      "That Stripe invoice already has a processing fulfillment.",
    );
  }

  let renewal: RenewalScaffoldState | null = null;
  if (kind === "initial_subscription") {
    const preempted = await preemptInitialInvoiceForDeferredTerminal(
      binding,
      input,
      checkout,
      product,
      ignoredCondition,
    );
    if (preempted) return preempted;
    await requireInitialProductAvailable(binding, product);
    const existingOrder = await binding
      .prepare(
        `SELECT id, status FROM orders
         WHERE checkout_session_id = ?1
         LIMIT 1`,
      )
      .bind(checkout.id)
      .first<{ id: string; status: string }>();
    if (existingOrder) {
      if (existingOrder.status === "fulfilled") {
        return recordIgnored(binding, input, {
          checkoutId: checkout.id,
          resultType: "already-fulfilled",
          conditionSql: `EXISTS (
            SELECT 1 FROM orders
            WHERE id = ? AND checkout_session_id = ?
              AND status = 'fulfilled' AND stripe_environment = 'test'
              AND livemode = 0
          )`,
          conditionBindings: [existingOrder.id, checkout.id],
        });
      }
      throw integrity("An initial subscription order is still processing.");
    }
  } else {
    const aggregate = await readSubscriptionAggregate(
      binding,
      invoice.stripeSubscriptionId,
    );
    if (!aggregate) {
      return recordIgnored(binding, input, {
        checkoutId: null,
        resultType: "subscription-awaiting-invoice",
        conditionSql: ignoredCondition.sql,
        conditionBindings: ignoredCondition.bindings,
      });
    }
    if (
      aggregate.customer_user_id !== checkout.customerUserId ||
      aggregate.commerce_product_id !== product.id ||
      aggregate.commerce_price_id !== product.priceId ||
      aggregate.stripe_customer_id !== invoice.stripeCustomerId ||
      aggregate.stripe_subscription_id !== invoice.stripeSubscriptionId
    ) {
      throw recurringError(
        "STRIPE_SUBSCRIPTION_MISMATCH",
        "The verified renewal does not match the durable subscription.",
      );
    }
    const resolvedProviderEventCreatedAt = await resolveProviderEventCursor(
      binding,
      aggregate,
      input,
    );
    if (
      aggregate.state !== "active" ||
      resolvedProviderEventCreatedAt === null
    ) {
      return recordIgnored(binding, input, {
        checkoutId: null,
        resultType: "invoice-not-fulfillable",
        conditionSql: `EXISTS (
          SELECT 1 FROM subscriptions
          WHERE id = ? AND customer_user_id = ? AND revision = ?
            AND stripe_subscription_id = ? AND source = 'stripe_test'
            AND stripe_environment = 'test' AND livemode = 0
        )`,
        conditionBindings: [
          aggregate.id,
          aggregate.customer_user_id,
          aggregate.revision,
          aggregate.stripe_subscription_id,
        ],
      });
    }
    providerEventCreatedAt = resolvedProviderEventCreatedAt;
    renewal = Object.freeze({
      subscriptionId: aggregate.id,
      expectedRevision: aggregate.revision,
    });
  }

  scaffold = await createInvoiceScaffold(
    binding,
    input,
    checkout,
    product,
    kind,
    renewal,
    providerEventCreatedAt,
  );
  const result = await finalizeInvoiceScaffold(
    binding,
    input,
    checkout,
    product,
    scaffold,
    kind,
  );
  if (kind === "initial_subscription") {
    await drainDeferredSubscriptionEvents(
      binding,
      checkout,
      product,
      invoice.stripeSubscriptionId,
    );
  }
  return result;
}

function subscriptionTarget(
  input: ProcessSubscriptionEventInput,
): SubscriptionStateScaffoldState["targetState"] | null {
  const event = input.event;
  const subscription = event.subscription;
  if (event.stripeEventType === "customer.subscription.created") return null;
  if (event.stripeEventType === "customer.subscription.paused") return "paused";
  if (event.stripeEventType === "customer.subscription.resumed")
    return "active";
  if (event.stripeEventType === "customer.subscription.deleted") {
    return subscription.status === "incomplete_expired"
      ? "expired"
      : "canceled";
  }
  if (subscription.status === "paused") return "paused";
  if (subscription.cancelAtPeriodEnd) return "cancellation_scheduled";
  if (subscription.status === "active" || subscription.status === "trialing") {
    return "active";
  }
  return null;
}

function stateTransitionSupported(
  current: MembershipState,
  target: SubscriptionStateScaffoldState["targetState"],
  aggregate: SubscriptionAggregateRow,
  providerEventCreatedAt: string,
): boolean {
  if (current === target) return false;
  if (target === "paused") return current === "active";
  if (target === "cancellation_scheduled") return current === "active";
  if (target === "active") {
    return current === "paused" || current === "cancellation_scheduled";
  }
  if (target === "canceled") {
    if (current !== "cancellation_scheduled") {
      return current === "active" || current === "paused";
    }
    return (
      aggregate.cancel_at !== null &&
      providerEventCreatedAt >= aggregate.cancel_at
    );
  }
  return providerEventCreatedAt >= aggregate.current_period_end;
}

function validateSubscriptionScaffold(
  row: RecurringScaffoldRow,
  input: ProcessSubscriptionEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): StoredSubscriptionStateScaffold {
  validateScaffoldPhase(row);
  let serialized: unknown;
  try {
    serialized = JSON.parse(row.result_json) as unknown;
  } catch {
    throw integrity("A recurring fulfillment scaffold is invalid.");
  }
  const stored =
    serialized !== null &&
    typeof serialized === "object" &&
    !Array.isArray(serialized) &&
    (serialized as Record<string, unknown>).phase === "awaiting-initial-invoice"
      ? deferredSubscriptionStateScaffoldState(row.result_json)
      : subscriptionStateScaffoldState(row.result_json);
  if (
    row.checkout_session_id !== null ||
    row.order_id !== null ||
    row.order_status !== null ||
    row.event_type !== input.event.stripeEventType ||
    row.stripe_object_id !== input.event.subscription.stripeSubscriptionId ||
    row.customer_user_id !== checkout.customerUserId ||
    row.commerce_product_id !== product.id ||
    row.commerce_price_id !== null ||
    row.stripe_subscription_id !== null ||
    row.fulfillment_kind !== "subscription_state" ||
    row.provider_object_id !== input.event.subscription.stripeSubscriptionId ||
    row.facts_fingerprint !== input.factsFingerprint
  ) {
    throw recurringError(
      "STRIPE_EVENT_REPLAY_CONFLICT",
      "A subscription-state scaffold does not match its verified facts.",
    );
  }
  if (isDeferredSubscriptionState(stored)) {
    const subscription = input.event.subscription;
    if (
      stored.targetState !== subscriptionTarget(input) ||
      stored.eventCreatedAtUnix !== input.event.createdAtUnix ||
      stored.stripeCustomerId !== subscription.stripeCustomerId ||
      stored.subscriptionStatus !== subscription.status ||
      stored.cancelAtPeriodEnd !== subscription.cancelAtPeriodEnd ||
      stored.cancelAtUnix !== subscription.cancelAtUnix ||
      stored.canceledAtUnix !== subscription.canceledAtUnix ||
      stored.endedAtUnix !== subscription.endedAtUnix ||
      stored.requestId !== input.requestId ||
      stored.processedAt !== input.processedAt
    ) {
      throw recurringError(
        "STRIPE_EVENT_REPLAY_CONFLICT",
        "A deferred subscription-state event does not match its verified facts.",
      );
    }
  }
  return stored;
}

async function createDeferredSubscriptionStateScaffold(
  binding: D1Database,
  input: ProcessSubscriptionEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  targetState: SubscriptionStateScaffoldState["targetState"],
): Promise<RecurringScaffoldRow> {
  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const fulfillmentEventId = `fulfillment_${crypto.randomUUID()}`;
  const scaffoldKey = `commerce.webhook.scaffold:${input.event.stripeEventId}`;
  const subscription = input.event.subscription;
  const deferred: DeferredSubscriptionStateScaffoldState = Object.freeze({
    phase: "awaiting-initial-invoice",
    targetState,
    eventCreatedAtUnix: input.event.createdAtUnix,
    stripeCustomerId: subscription.stripeCustomerId,
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    cancelAtUnix: subscription.cancelAtUnix,
    canceledAtUnix: subscription.canceledAtUnix,
    endedAtUnix: subscription.endedAtUnix,
    requestId: input.requestId,
    processedAt: input.processedAt,
  });
  const conditionSql = `EXISTS (
    SELECT 1 FROM checkout_sessions
    WHERE id = ? AND customer_user_id = ? AND commerce_product_id = ?
      AND commerce_price_id = ? AND mode = 'subscription'
      AND stripe_environment = 'test' AND livemode = 0
  )`;
  const conditionBindings = [
    checkout.id,
    checkout.customerUserId,
    product.id,
    product.priceId,
  ];
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(
      binding,
      input,
      commerceEventId,
      null,
      conditionSql,
      conditionBindings,
    ),
    binding
      .prepare(
        `INSERT INTO fulfillment_events
          (id, commerce_event_id, checkout_session_id, order_id,
           customer_user_id, commerce_product_id, kind, provider_object_id,
           facts_fingerprint, status, result_json, stripe_environment,
           livemode)
         SELECT ?, ?, NULL, NULL, ?, ?, 'subscription_state', ?, ?,
                'processing', ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM commerce_events
           WHERE id = ? AND status = 'processing'
             AND stripe_environment = 'test' AND livemode = 0
         )`,
      )
      .bind(
        fulfillmentEventId,
        commerceEventId,
        checkout.customerUserId,
        product.id,
        subscription.stripeSubscriptionId,
        input.factsFingerprint,
        JSON.stringify(deferred),
        commerceEventId,
      ),
  ];
  const pendingResult: CommerceRecurringReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId,
    checkoutId: null,
    status: "pending",
    orderId: null,
    fulfillmentEventId,
    resultType: "subscription-state-deferred",
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND status = 'processing'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM fulfillment_events
        WHERE id = ? AND commerce_event_id = ?
          AND checkout_session_id IS NULL AND order_id IS NULL
          AND kind = 'subscription_state' AND status = 'processing'
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [commerceEventId, fulfillmentEventId, commerceEventId],
      action: "commerce.webhook.processing",
      subjectId: commerceEventId,
      idempotencyKey: scaffoldKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        productId: product.id,
        fulfillmentKind: "subscription_state",
        targetState,
        deferred: true,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: pendingResult,
    }),
  );
  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[1]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity(
        "The deferred subscription-state event was not recorded exactly once.",
      );
    }
  } catch (error) {
    const current = await readRecurringScaffold(
      binding,
      input.event.stripeEventId,
    );
    if (!current) throw error;
  }
  const scaffold = await readRecurringScaffold(
    binding,
    input.event.stripeEventId,
  );
  if (!scaffold) {
    throw integrity("The deferred subscription-state event is unavailable.");
  }
  const stored = validateSubscriptionScaffold(
    scaffold,
    input,
    checkout,
    product,
  );
  if (!isDeferredSubscriptionState(stored)) {
    throw integrity("A deferred subscription-state event changed phase.");
  }
  return scaffold;
}

async function createSubscriptionStateScaffold(
  binding: D1Database,
  input: ProcessSubscriptionEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  aggregate: SubscriptionAggregateRow,
  targetState: SubscriptionStateScaffoldState["targetState"],
  providerEventCreatedAt: string,
): Promise<RecurringScaffoldRow> {
  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const fulfillmentEventId = `fulfillment_${crypto.randomUUID()}`;
  const scaffoldKey = `commerce.webhook.scaffold:${input.event.stripeEventId}`;
  const pinned: SubscriptionStateScaffoldState = Object.freeze({
    subscriptionId: aggregate.id,
    expectedRevision: aggregate.revision,
    targetState,
  });
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(
      binding,
      input,
      commerceEventId,
      null,
      `EXISTS (
        SELECT 1 FROM subscriptions
        WHERE id = ? AND customer_user_id = ? AND commerce_product_id = ?
          AND commerce_price_id = ? AND stripe_subscription_id = ?
          AND stripe_customer_id = ? AND revision = ?
          AND source = 'stripe_test' AND stripe_environment = 'test'
          AND livemode = 0
      )`,
      [
        aggregate.id,
        checkout.customerUserId,
        product.id,
        product.priceId,
        input.event.subscription.stripeSubscriptionId,
        input.event.subscription.stripeCustomerId,
        aggregate.revision,
      ],
      providerEventCreatedAt,
    ),
    binding
      .prepare(
        `INSERT INTO fulfillment_events
          (id, commerce_event_id, checkout_session_id, order_id,
           customer_user_id, commerce_product_id, kind, provider_object_id,
           facts_fingerprint, status, result_json, stripe_environment,
           livemode)
         SELECT ?, ?, NULL, NULL, ?, ?, 'subscription_state', ?, ?,
                'processing', ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM commerce_events
           WHERE id = ? AND status = 'processing'
         ) AND EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = ? AND customer_user_id = ? AND revision = ?
             AND stripe_subscription_id = ? AND source = 'stripe_test'
         )`,
      )
      .bind(
        fulfillmentEventId,
        commerceEventId,
        checkout.customerUserId,
        product.id,
        input.event.subscription.stripeSubscriptionId,
        input.factsFingerprint,
        JSON.stringify(pinned),
        commerceEventId,
        aggregate.id,
        checkout.customerUserId,
        aggregate.revision,
        input.event.subscription.stripeSubscriptionId,
      ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND status = 'processing'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM fulfillment_events
        WHERE id = ? AND commerce_event_id = ?
          AND checkout_session_id IS NULL AND order_id IS NULL
          AND kind = 'subscription_state' AND status = 'processing'
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [commerceEventId, fulfillmentEventId, commerceEventId],
      action: "commerce.webhook.processing",
      subjectId: commerceEventId,
      idempotencyKey: scaffoldKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        productId: product.id,
        fulfillmentKind: "subscription_state",
        targetState,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { commerceEventId, fulfillmentEventId, status: "processing" },
    }),
  );
  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity(
        "The subscription-state scaffold was not created exactly once.",
      );
    }
  } catch (error) {
    const current = await readRecurringScaffold(
      binding,
      input.event.stripeEventId,
    );
    if (!current) throw error;
  }
  const scaffold = await readRecurringScaffold(
    binding,
    input.event.stripeEventId,
  );
  if (!scaffold)
    throw integrity("The subscription-state scaffold is unavailable.");
  validateSubscriptionScaffold(scaffold, input, checkout, product);
  return scaffold;
}

async function promoteDeferredSubscriptionStateScaffold(
  binding: D1Database,
  input: ProcessSubscriptionEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  scaffold: RecurringScaffoldRow,
  aggregate: SubscriptionAggregateRow,
  deferred: DeferredSubscriptionStateScaffoldState,
  providerEventCreatedAt: string,
): Promise<RecurringScaffoldRow> {
  const pinned: SubscriptionStateScaffoldState = Object.freeze({
    subscriptionId: aggregate.id,
    expectedRevision: aggregate.revision,
    targetState: deferred.targetState,
  });
  const applied = await runAtomicBatch(binding, [
    binding
      .prepare(
        `UPDATE commerce_events
         SET event_created_at = ?
         WHERE id = ? AND stripe_event_id = ? AND status = 'processing'
           AND facts_fingerprint = ?
           AND stripe_environment = 'test' AND livemode = 0`,
      )
      .bind(
        providerEventCreatedAt,
        scaffold.commerce_event_id,
        input.event.stripeEventId,
        input.factsFingerprint,
      ),
    binding
      .prepare(
        `UPDATE fulfillment_events
         SET result_json = ?
         WHERE id = ? AND commerce_event_id = ?
           AND customer_user_id = ? AND commerce_product_id = ?
           AND kind = 'subscription_state' AND provider_object_id = ?
           AND facts_fingerprint = ? AND status = 'processing'
           AND result_json = ? AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM subscriptions
             WHERE id = ? AND customer_user_id = ?
               AND commerce_product_id = ? AND commerce_price_id = ?
               AND stripe_subscription_id = ? AND stripe_customer_id = ?
               AND revision = ? AND source = 'stripe_test'
               AND stripe_environment = 'test' AND livemode = 0
           )`,
      )
      .bind(
        JSON.stringify(pinned),
        scaffold.fulfillment_event_id,
        scaffold.commerce_event_id,
        checkout.customerUserId,
        product.id,
        input.event.subscription.stripeSubscriptionId,
        input.factsFingerprint,
        scaffold.result_json,
        aggregate.id,
        checkout.customerUserId,
        product.id,
        product.priceId,
        input.event.subscription.stripeSubscriptionId,
        input.event.subscription.stripeCustomerId,
        aggregate.revision,
      ),
  ]);
  if (changedRows(applied[0]) !== 1 || changedRows(applied[1]) !== 1) {
    throw integrity(
      "The deferred subscription-state event could not advance to reconciliation.",
    );
  }
  const promoted = await readRecurringScaffold(
    binding,
    input.event.stripeEventId,
  );
  if (!promoted) {
    throw integrity("The promoted subscription-state event is unavailable.");
  }
  const stored = validateSubscriptionScaffold(
    promoted,
    input,
    checkout,
    product,
  );
  if (isDeferredSubscriptionState(stored)) {
    throw integrity("The subscription-state event did not advance phase.");
  }
  return promoted;
}

async function finalizeSubscriptionStateScaffold(
  binding: D1Database,
  input: ProcessSubscriptionEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  scaffold: RecurringScaffoldRow,
): Promise<CommerceRecurringReceipt> {
  const pinned = validateSubscriptionScaffold(
    scaffold,
    input,
    checkout,
    product,
  );
  if (isDeferredSubscriptionState(pinned)) {
    throw integrity(
      "A deferred subscription-state event cannot finalize before promotion.",
    );
  }
  const subscription = input.event.subscription;
  const reconciliation = await reconcileStripeTestSubscription(
    binding,
    {
      customerUserId: checkout.customerUserId,
      commerceProductId: product.id,
      commercePriceId: product.priceId,
      commerceEventId: scaffold.commerce_event_id,
      orderId: null,
      fulfillmentEventId: scaffold.fulfillment_event_id,
      factsFingerprint: input.factsFingerprint,
      stripeEventId: input.event.stripeEventId,
      stripeObjectId: subscription.stripeSubscriptionId,
      fulfillmentProviderObjectId: subscription.stripeSubscriptionId,
      providerEventCreatedAt: scaffold.event_created_at,
      subscriptionId: pinned.subscriptionId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      expectedRevision: pinned.expectedRevision,
      targetState: pinned.targetState,
    },
    {
      actorUserId: checkout.customerUserId,
      idempotencyKey: `stripe-test:${input.event.stripeEventId}`,
      requestId: input.requestId,
    },
  );
  const result: CommerceRecurringReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId: scaffold.commerce_event_id,
    checkoutId: null,
    status: "fulfilled",
    orderId: null,
    fulfillmentEventId: scaffold.fulfillment_event_id,
    resultType: "subscription-state",
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE fulfillment_events
         SET status = 'fulfilled', result_json = ?, completed_at = ?
         WHERE id = ? AND commerce_event_id = ?
           AND checkout_session_id IS NULL AND order_id IS NULL
           AND customer_user_id = ? AND commerce_product_id = ?
           AND kind = 'subscription_state' AND provider_object_id = ?
           AND facts_fingerprint = ? AND status = 'processing'
           AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM subscriptions
             WHERE id = ? AND customer_user_id = ?
               AND stripe_subscription_id = ? AND source = 'stripe_test'
               AND state = ? AND stripe_environment = 'test' AND livemode = 0
           ) AND EXISTS (
             SELECT 1 FROM subscription_events
             WHERE subscription_id = ? AND customer_user_id = ?
               AND stripe_event_id = ? AND fulfillment_event_id = ?
               AND order_id IS NULL AND source = 'stripe_test'
           )`,
      )
      .bind(
        JSON.stringify(reconciliation.value),
        input.processedAt,
        scaffold.fulfillment_event_id,
        scaffold.commerce_event_id,
        checkout.customerUserId,
        product.id,
        subscription.stripeSubscriptionId,
        input.factsFingerprint,
        pinned.subscriptionId,
        checkout.customerUserId,
        subscription.stripeSubscriptionId,
        pinned.targetState,
        pinned.subscriptionId,
        checkout.customerUserId,
        input.event.stripeEventId,
        scaffold.fulfillment_event_id,
      ),
    binding
      .prepare(
        `UPDATE commerce_events
         SET status = 'completed', processed_at = ?
         WHERE id = ? AND status = 'processing'
           AND EXISTS (
             SELECT 1 FROM fulfillment_events
             WHERE id = ? AND status = 'fulfilled'
           )`,
      )
      .bind(
        input.processedAt,
        scaffold.commerce_event_id,
        scaffold.fulfillment_event_id,
      ),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND status = 'completed'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM fulfillment_events
        WHERE id = ? AND status = 'fulfilled'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM subscriptions
        WHERE id = ? AND customer_user_id = ?
          AND stripe_subscription_id = ? AND state = ?
          AND source = 'stripe_test' AND stripe_environment = 'test'
          AND livemode = 0
      )`,
      conditionBindings: [
        scaffold.commerce_event_id,
        scaffold.fulfillment_event_id,
        pinned.subscriptionId,
        checkout.customerUserId,
        subscription.stripeSubscriptionId,
        pinned.targetState,
      ],
      action: "commerce.webhook.fulfilled",
      subjectId: scaffold.commerce_event_id,
      idempotencyKey: `commerce.webhook:${input.event.stripeEventId}`,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        productId: product.id,
        fulfillmentKind: "subscription_state",
        subscriptionId: pinned.subscriptionId,
        targetState: pinned.targetState,
        stripeEnvironment: "test",
        livemode: false,
      },
      result,
    }),
  );
  try {
    const applied = await runAtomicBatch(binding, statements);
    if (
      changedRows(applied[0]) !== 1 ||
      changedRows(applied[auditIndex]) !== 1
    ) {
      throw integrity(
        "The subscription-state event did not finalize exactly once.",
      );
    }
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

/** Processes one already signature-verified Stripe Test subscription event. */
export async function processVerifiedSubscriptionEvent(
  binding: D1Database,
  input: ProcessSubscriptionEventInput,
): Promise<CommerceRecurringReceipt> {
  requireInput(input);
  const replay = await existingReceipt(binding, input);
  if (replay) return replay;

  const subscription = input.event.subscription;
  const checkout = await readCheckoutSession(
    binding,
    subscription.application.checkoutId,
  );
  if (
    !checkout ||
    checkout.customerUserId !== subscription.application.customerUserId ||
    checkout.commerceProductId !== subscription.application.productId ||
    checkout.mode !== "subscription" ||
    (checkout.stripeCustomerId !== null &&
      checkout.stripeCustomerId !== subscription.stripeCustomerId) ||
    (checkout.stripeSubscriptionId !== null &&
      checkout.stripeSubscriptionId !== subscription.stripeSubscriptionId)
  ) {
    throw recurringError(
      "STRIPE_SUBSCRIPTION_MISMATCH",
      "The verified subscription event does not match its application intent.",
    );
  }
  const product = await readStoredCommerceProduct(
    binding,
    checkout.commerceProductId,
    checkout.commercePriceId,
  );
  if (!product || product.productType !== "subscription") {
    throw integrity("The subscription product snapshot is unavailable.");
  }

  let scaffold = await readRecurringScaffold(
    binding,
    input.event.stripeEventId,
  );
  const aggregate = await readSubscriptionAggregate(
    binding,
    subscription.stripeSubscriptionId,
  );
  const baseCondition = invoiceIgnoredCondition(checkout, product);
  const target = subscriptionTarget(input);

  if (scaffold) {
    const stored = validateSubscriptionScaffold(
      scaffold,
      input,
      checkout,
      product,
    );
    if (scaffold.event_status === "completed") {
      const completed = await existingReceipt(binding, input);
      if (completed) return completed;
      throw integrity("A completed subscription-state event has no receipt.");
    }
    if (!isDeferredSubscriptionState(stored)) {
      return finalizeSubscriptionStateScaffold(
        binding,
        input,
        checkout,
        product,
        scaffold,
      );
    }
    if (!aggregate) {
      return pendingSubscriptionReceipt(input, scaffold, true);
    }
    if (
      aggregate.customer_user_id !== checkout.customerUserId ||
      aggregate.commerce_product_id !== product.id ||
      aggregate.commerce_price_id !== product.priceId ||
      aggregate.stripe_customer_id !== subscription.stripeCustomerId ||
      aggregate.stripe_subscription_id !== subscription.stripeSubscriptionId
    ) {
      throw recurringError(
        "STRIPE_SUBSCRIPTION_MISMATCH",
        "The deferred subscription event does not match durable state.",
      );
    }
    const providerEventCreatedAt = await resolveProviderEventCursor(
      binding,
      aggregate,
      input,
    );
    if (providerEventCreatedAt === null) {
      return finalizeDeferredSubscriptionAsIgnored(
        binding,
        input,
        scaffold,
        "subscription-state-stale",
      );
    }
    if (
      target === null ||
      target !== stored.targetState ||
      !stateTransitionSupported(
        aggregate.state,
        target,
        aggregate,
        providerEventCreatedAt,
      )
    ) {
      return finalizeDeferredSubscriptionAsIgnored(
        binding,
        input,
        scaffold,
        "subscription-state-unchanged",
      );
    }
    scaffold = await promoteDeferredSubscriptionStateScaffold(
      binding,
      input,
      checkout,
      product,
      scaffold,
      aggregate,
      stored,
      providerEventCreatedAt,
    );
    return finalizeSubscriptionStateScaffold(
      binding,
      input,
      checkout,
      product,
      scaffold,
    );
  }

  if (!aggregate) {
    if (target !== null) {
      scaffold = await createDeferredSubscriptionStateScaffold(
        binding,
        input,
        checkout,
        product,
        target,
      );
      return pendingSubscriptionReceipt(input, scaffold, false);
    }
    return recordIgnored(binding, input, {
      checkoutId: null,
      resultType: "subscription-awaiting-invoice",
      conditionSql: baseCondition.sql,
      conditionBindings: baseCondition.bindings,
    });
  }
  if (
    aggregate.customer_user_id !== checkout.customerUserId ||
    aggregate.commerce_product_id !== product.id ||
    aggregate.commerce_price_id !== product.priceId ||
    aggregate.stripe_customer_id !== subscription.stripeCustomerId ||
    aggregate.stripe_subscription_id !== subscription.stripeSubscriptionId
  ) {
    throw recurringError(
      "STRIPE_SUBSCRIPTION_MISMATCH",
      "The verified subscription event does not match durable state.",
    );
  }
  const providerEventCreatedAt = await resolveProviderEventCursor(
    binding,
    aggregate,
    input,
  );
  if (providerEventCreatedAt === null) {
    return recordIgnored(binding, input, {
      checkoutId: null,
      resultType: "subscription-state-stale",
      conditionSql: `EXISTS (
        SELECT 1 FROM subscriptions
        WHERE id = ? AND customer_user_id = ? AND revision = ?
          AND last_provider_event_created_at = ? AND source = 'stripe_test'
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [
        aggregate.id,
        aggregate.customer_user_id,
        aggregate.revision,
        aggregate.last_provider_event_created_at,
      ],
    });
  }
  if (
    target === null ||
    !stateTransitionSupported(
      aggregate.state,
      target,
      aggregate,
      providerEventCreatedAt,
    )
  ) {
    return recordIgnored(binding, input, {
      checkoutId: null,
      resultType: "subscription-state-unchanged",
      conditionSql: `EXISTS (
        SELECT 1 FROM subscriptions
        WHERE id = ? AND customer_user_id = ? AND revision = ?
          AND state = ? AND source = 'stripe_test'
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [
        aggregate.id,
        aggregate.customer_user_id,
        aggregate.revision,
        aggregate.state,
      ],
    });
  }

  scaffold = await createSubscriptionStateScaffold(
    binding,
    input,
    checkout,
    product,
    aggregate,
    target,
    providerEventCreatedAt,
  );
  return finalizeSubscriptionStateScaffold(
    binding,
    input,
    checkout,
    product,
    scaffold,
  );
}
