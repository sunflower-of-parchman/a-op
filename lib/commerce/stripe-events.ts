import {
  SITES_COMMERCE_ADAPTER,
  STRIPE_TEST_ENVIRONMENT,
} from "./environment.ts";
import { CommerceAdapterError } from "./errors.ts";

export const STRIPE_TEST_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.voided",
] as const);

export type StripeTestEventType = (typeof STRIPE_TEST_EVENT_TYPES)[number];
export type StripeCheckoutEventType = Extract<
  StripeTestEventType,
  `checkout.session.${string}`
>;
export type StripeSubscriptionEventType = Extract<
  StripeTestEventType,
  `customer.subscription.${string}`
>;
export type StripeInvoiceEventType = Extract<
  StripeTestEventType,
  `invoice.${string}`
>;

export interface StripeApplicationMetadata {
  readonly checkoutId: string;
  readonly productId: string;
  readonly customerUserId: string;
}

interface StripeTestEventBase<TType extends StripeTestEventType> {
  readonly adapter: typeof SITES_COMMERCE_ADAPTER;
  readonly stripeEnvironment: typeof STRIPE_TEST_ENVIRONMENT;
  readonly livemode: false;
  readonly stripeEventId: string;
  readonly stripeEventType: TType;
  readonly createdAtUnix: number;
}

export interface StripeCheckoutSessionFacts {
  readonly checkoutSessionId: string;
  readonly mode: "payment" | "subscription";
  readonly status: "open" | "complete" | "expired";
  readonly paymentStatus: "paid" | "unpaid" | "no_payment_required";
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly amountTotal: number | null;
  readonly currency: string | null;
  readonly application: StripeApplicationMetadata;
}

export interface StripeCheckoutEvent extends StripeTestEventBase<StripeCheckoutEventType> {
  readonly objectKind: "checkout-session";
  readonly checkoutSession: StripeCheckoutSessionFacts;
}

export interface StripeSubscriptionFacts {
  readonly stripeSubscriptionId: string;
  readonly stripeCustomerId: string;
  readonly status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelAtUnix: number | null;
  readonly canceledAtUnix: number | null;
  readonly endedAtUnix: number | null;
  readonly application: StripeApplicationMetadata;
}

export interface StripeSubscriptionEvent extends StripeTestEventBase<StripeSubscriptionEventType> {
  readonly objectKind: "subscription";
  readonly subscription: StripeSubscriptionFacts;
}

export interface StripeInvoiceFacts {
  readonly stripeInvoiceId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly status: "draft" | "open" | "paid" | "uncollectible" | "void";
  readonly paid: boolean;
  readonly amountPaid: number;
  readonly amountDue: number;
  readonly currency: string;
  readonly billingReason:
    | "subscription"
    | "subscription_create"
    | "subscription_cycle"
    | "subscription_threshold"
    | "subscription_update";
  readonly periodStartUnix: number;
  readonly periodEndUnix: number;
  readonly application: StripeApplicationMetadata;
}

export interface StripeInvoiceEvent extends StripeTestEventBase<StripeInvoiceEventType> {
  readonly objectKind: "invoice";
  readonly invoice: StripeInvoiceFacts;
}

export type StripeTestEvent =
  StripeCheckoutEvent | StripeSubscriptionEvent | StripeInvoiceEvent;

const EVENT_TYPE_SET = new Set<string>(STRIPE_TEST_EVENT_TYPES);
const SAFE_APPLICATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STRIPE_ID_SUFFIX = "[A-Za-z0-9]{6,255}";
const STRIPE_EVENT_ID = new RegExp(`^evt_${STRIPE_ID_SUFFIX}$`);
const STRIPE_CHECKOUT_ID = new RegExp(`^cs_test_${STRIPE_ID_SUFFIX}$`);
const STRIPE_CUSTOMER_ID = new RegExp(`^cus_${STRIPE_ID_SUFFIX}$`);
const STRIPE_SUBSCRIPTION_ID = new RegExp(`^sub_${STRIPE_ID_SUFFIX}$`);
const STRIPE_INVOICE_ID = new RegExp(`^in_${STRIPE_ID_SUFFIX}$`);
const CURRENCY = /^[a-z]{3}$/;
const CHECKOUT_MODES = new Set(["payment", "subscription"]);
const CHECKOUT_STATUSES = new Set(["open", "complete", "expired"]);
const PAYMENT_STATUSES = new Set(["paid", "unpaid", "no_payment_required"]);
const SUBSCRIPTION_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
const INVOICE_STATUSES = new Set([
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
]);
const SUBSCRIPTION_BILLING_REASONS = new Set([
  "subscription",
  "subscription_create",
  "subscription_cycle",
  "subscription_threshold",
  "subscription_update",
]);
const APPLICATION_METADATA_KEYS = Object.freeze([
  "aop_checkout_id",
  "aop_product_id",
  "aop_customer_id",
] as const);

function invalidPayload(): never {
  throw new CommerceAdapterError(
    "STRIPE_WEBHOOK_PAYLOAD_INVALID",
    "The verified Stripe event payload is invalid.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : invalidPayload();
}

function exactString(value: unknown, allowed: ReadonlySet<string>): string {
  return typeof value === "string" && allowed.has(value)
    ? value
    : invalidPayload();
}

function stripeId(value: unknown, pattern: RegExp): string {
  return typeof value === "string" && pattern.test(value)
    ? value
    : invalidPayload();
}

function nullableStripeId(value: unknown, pattern: RegExp): string | null {
  return value === null ? null : stripeId(value, pattern);
}

function integer(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : invalidPayload();
}

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function nullableAmount(value: unknown): number | null {
  return value === null ? null : integer(value);
}

function currency(value: unknown, nullable: true): string | null;
function currency(value: unknown, nullable?: false): string;
function currency(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  return typeof value === "string" && CURRENCY.test(value)
    ? value
    : invalidPayload();
}

function applicationMetadata(value: unknown): StripeApplicationMetadata {
  const metadata = record(value);
  const actualKeys = Object.keys(metadata).sort();
  const allowedKeys = [...APPLICATION_METADATA_KEYS].sort();

  if (
    actualKeys.length !== allowedKeys.length ||
    actualKeys.some((key, index) => key !== allowedKeys[index])
  ) {
    invalidPayload();
  }

  const checkoutId = metadata.aop_checkout_id;
  const productId = metadata.aop_product_id;
  const customerUserId = metadata.aop_customer_id;
  if (
    typeof checkoutId !== "string" ||
    typeof productId !== "string" ||
    typeof customerUserId !== "string" ||
    !SAFE_APPLICATION_ID.test(checkoutId) ||
    !SAFE_APPLICATION_ID.test(productId) ||
    !SAFE_APPLICATION_ID.test(customerUserId)
  ) {
    invalidPayload();
  }

  return Object.freeze({ checkoutId, productId, customerUserId });
}

function eventBase<TType extends StripeTestEventType>(
  event: Record<string, unknown>,
  type: TType,
): StripeTestEventBase<TType> {
  return Object.freeze({
    adapter: SITES_COMMERCE_ADAPTER,
    stripeEnvironment: STRIPE_TEST_ENVIRONMENT,
    livemode: false,
    stripeEventId: stripeId(event.id, STRIPE_EVENT_ID),
    stripeEventType: type,
    createdAtUnix: integer(event.created),
  });
}

function requireTestObject(object: Record<string, unknown>): void {
  if (object.livemode === true) {
    throw new CommerceAdapterError(
      "STRIPE_LIVE_EVENT_REJECTED",
      "Live Stripe events are disabled for this Sites application.",
    );
  }
  if (object.livemode !== false) invalidPayload();
}

function checkoutEvent(
  event: Record<string, unknown>,
  type: StripeCheckoutEventType,
  object: Record<string, unknown>,
): StripeCheckoutEvent {
  if (object.object !== "checkout.session") invalidPayload();
  requireTestObject(object);
  const application = applicationMetadata(object.metadata);
  if (object.client_reference_id !== application.checkoutId) invalidPayload();

  const checkoutSession = Object.freeze({
    checkoutSessionId: stripeId(object.id, STRIPE_CHECKOUT_ID),
    mode: exactString(object.mode, CHECKOUT_MODES) as
      "payment" | "subscription",
    status: exactString(object.status, CHECKOUT_STATUSES) as
      "open" | "complete" | "expired",
    paymentStatus: exactString(object.payment_status, PAYMENT_STATUSES) as
      "paid" | "unpaid" | "no_payment_required",
    stripeCustomerId: nullableStripeId(object.customer, STRIPE_CUSTOMER_ID),
    stripeSubscriptionId: nullableStripeId(
      object.subscription,
      STRIPE_SUBSCRIPTION_ID,
    ),
    amountTotal: nullableAmount(object.amount_total),
    currency: currency(object.currency, true),
    application,
  });

  return Object.freeze({
    ...eventBase(event, type),
    objectKind: "checkout-session",
    checkoutSession,
  });
}

function subscriptionEvent(
  event: Record<string, unknown>,
  type: StripeSubscriptionEventType,
  object: Record<string, unknown>,
): StripeSubscriptionEvent {
  if (object.object !== "subscription") invalidPayload();
  requireTestObject(object);

  const subscription = Object.freeze({
    stripeSubscriptionId: stripeId(object.id, STRIPE_SUBSCRIPTION_ID),
    stripeCustomerId: stripeId(object.customer, STRIPE_CUSTOMER_ID),
    status: exactString(
      object.status,
      SUBSCRIPTION_STATUSES,
    ) as StripeSubscriptionFacts["status"],
    cancelAtPeriodEnd:
      typeof object.cancel_at_period_end === "boolean"
        ? object.cancel_at_period_end
        : invalidPayload(),
    cancelAtUnix: nullableInteger(object.cancel_at),
    canceledAtUnix: nullableInteger(object.canceled_at),
    endedAtUnix: nullableInteger(object.ended_at),
    application: applicationMetadata(object.metadata),
  });

  return Object.freeze({
    ...eventBase(event, type),
    objectKind: "subscription",
    subscription,
  });
}

function invoiceSubscriptionDetails(
  object: Record<string, unknown>,
): Record<string, unknown> {
  if (isRecord(object.parent)) {
    const current = object.parent;
    if (current.type !== "subscription_details") invalidPayload();
    return record(current.subscription_details);
  }

  // Accept Stripe API versions from before the invoice parent migration.
  return Object.freeze({
    ...record(object.subscription_details),
    subscription: object.subscription,
  });
}

function invoicePaid(
  object: Record<string, unknown>,
  status: StripeInvoiceFacts["status"],
): boolean {
  if (typeof object.paid === "boolean") return object.paid;
  if (object.paid !== null && object.paid !== undefined) invalidPayload();

  // Stripe's 2026-06-24 API removed the legacy invoice `paid` boolean.
  // A current invoice is paid only when its terminal status and remaining
  // amount agree; downstream fulfillment still verifies the exact amount.
  return status === "paid" && integer(object.amount_remaining) === 0;
}

function invoicePeriod(
  object: Record<string, unknown>,
  stripeSubscriptionId: string,
): Readonly<{ start: number; end: number }> {
  const legacyStart = nullableInteger(object.period_start);
  const legacyEnd = nullableInteger(object.period_end);
  if (legacyStart !== null && legacyEnd !== null && legacyEnd > legacyStart) {
    return Object.freeze({ start: legacyStart, end: legacyEnd });
  }

  const lines = record(object.lines);
  if (!Array.isArray(lines.data)) invalidPayload();
  const periods: Array<{ start: number; end: number }> = [];
  for (const value of lines.data) {
    const line = record(value);
    const parent = record(line.parent);
    if (parent.type !== "subscription_item_details") continue;
    const details = record(parent.subscription_item_details);
    if (
      details.subscription !== stripeSubscriptionId ||
      details.proration !== false
    ) {
      continue;
    }
    const period = record(line.period);
    const start = integer(period.start);
    const end = integer(period.end);
    if (end <= start) invalidPayload();
    periods.push({ start, end });
  }
  if (periods.length !== 1) invalidPayload();
  return Object.freeze(periods[0]);
}

function invoiceEvent(
  event: Record<string, unknown>,
  type: StripeInvoiceEventType,
  object: Record<string, unknown>,
): StripeInvoiceEvent {
  if (object.object !== "invoice") invalidPayload();
  requireTestObject(object);
  const subscriptionDetails = invoiceSubscriptionDetails(object);
  const stripeSubscriptionId = stripeId(
    subscriptionDetails.subscription,
    STRIPE_SUBSCRIPTION_ID,
  );
  const status = exactString(
    object.status,
    INVOICE_STATUSES,
  ) as StripeInvoiceFacts["status"];
  const period = invoicePeriod(object, stripeSubscriptionId);

  const invoice = Object.freeze({
    stripeInvoiceId: stripeId(object.id, STRIPE_INVOICE_ID),
    stripeCustomerId: stripeId(object.customer, STRIPE_CUSTOMER_ID),
    stripeSubscriptionId,
    status,
    paid: invoicePaid(object, status),
    amountPaid: integer(object.amount_paid),
    amountDue: integer(object.amount_due),
    currency: currency(object.currency),
    billingReason: exactString(
      object.billing_reason,
      SUBSCRIPTION_BILLING_REASONS,
    ) as StripeInvoiceFacts["billingReason"],
    periodStartUnix: period.start,
    periodEndUnix: period.end,
    application: applicationMetadata(subscriptionDetails.metadata),
  });

  return Object.freeze({
    ...eventBase(event, type),
    objectKind: "invoice",
    invoice,
  });
}

/** Projects a previously signature-verified Stripe event into minimal safe facts. */
export function parseVerifiedStripeTestEvent(value: unknown): StripeTestEvent {
  const event = record(value);

  if (event.livemode === true) {
    throw new CommerceAdapterError(
      "STRIPE_LIVE_EVENT_REJECTED",
      "Live Stripe events are disabled for this Sites application.",
    );
  }
  if (event.livemode !== false) invalidPayload();

  if (typeof event.type !== "string" || !EVENT_TYPE_SET.has(event.type)) {
    throw new CommerceAdapterError(
      "STRIPE_EVENT_UNSUPPORTED",
      "That Stripe event type is not accepted by this application.",
    );
  }

  const type = event.type as StripeTestEventType;
  const object = record(record(event.data).object);

  if (type.startsWith("checkout.session.")) {
    return checkoutEvent(event, type as StripeCheckoutEventType, object);
  }
  if (type.startsWith("customer.subscription.")) {
    return subscriptionEvent(
      event,
      type as StripeSubscriptionEventType,
      object,
    );
  }
  return invoiceEvent(event, type as StripeInvoiceEventType, object);
}
