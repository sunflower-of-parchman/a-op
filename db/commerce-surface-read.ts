import type {
  CommerceCheckoutStatus,
  CommerceProductType,
} from "@/lib/commerce/domain.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export type CommerceOrderStatus =
  "pending" | "fulfilled" | "failed" | "canceled" | "reversed";

export type CommerceEventStatus =
  "processing" | "completed" | "ignored" | "failed";

export type CommerceFulfillmentStatus =
  "processing" | "fulfilled" | "ignored" | "failed";

export type CommerceFulfillmentKind =
  "one_time" | "initial_subscription" | "renewal" | "subscription_state";

export interface CustomerCommerceOrder {
  readonly id: string;
  readonly checkoutId: string | null;
  readonly productName: string;
  readonly productType: CommerceProductType;
  readonly status: CommerceOrderStatus;
  readonly fulfillmentStatus: CommerceFulfillmentStatus | null;
  readonly fulfillmentKind: CommerceFulfillmentKind | null;
  readonly totalMinor: number;
  readonly currency: string;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface CommerceReturnState {
  readonly checkoutId: string;
  readonly checkoutStatus: CommerceCheckoutStatus;
  readonly productName: string;
  readonly productType: CommerceProductType;
  readonly amountMinor: number;
  readonly currency: string;
  readonly orderId: string | null;
  readonly orderStatus: CommerceOrderStatus | null;
  readonly fulfillmentStatus: CommerceFulfillmentStatus | null;
  readonly fulfillmentKind: CommerceFulfillmentKind | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface AdminCommerceOrder extends CustomerCommerceOrder {
  readonly customerUserId: string;
  readonly customerName: string;
  readonly customerEmail: string;
}

export interface AdminCommerceEvent {
  readonly id: string;
  readonly stripeEventId: string;
  readonly eventType: string;
  readonly stripeObjectId: string;
  readonly checkoutId: string | null;
  readonly customerUserId: string | null;
  readonly customerName: string | null;
  readonly customerEmail: string | null;
  readonly status: CommerceEventStatus;
  readonly failureCategory: string | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly receivedAt: string;
  readonly processedAt: string | null;
}

export interface AdminCommerceFulfillment {
  readonly id: string;
  readonly orderId: string | null;
  readonly checkoutId: string | null;
  readonly productName: string | null;
  readonly customerUserId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly kind: CommerceFulfillmentKind;
  readonly providerObjectId: string;
  readonly status: CommerceFulfillmentStatus;
  readonly failureCategory: string | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface AdminCommerceEvidence {
  readonly orders: readonly AdminCommerceOrder[];
  readonly events: readonly AdminCommerceEvent[];
  readonly fulfillments: readonly AdminCommerceFulfillment[];
}

interface OrderRow {
  order_id: unknown;
  checkout_id: unknown;
  customer_user_id?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  product_name: unknown;
  product_type: unknown;
  order_status: unknown;
  fulfillment_status: unknown;
  fulfillment_kind: unknown;
  total_minor: unknown;
  currency: unknown;
  order_environment: unknown;
  order_livemode: unknown;
  item_environment: unknown;
  item_livemode: unknown;
  checkout_environment: unknown;
  checkout_livemode: unknown;
  fulfillment_environment: unknown;
  fulfillment_livemode: unknown;
  created_at: unknown;
  completed_at: unknown;
}

interface ReturnRow {
  checkout_id: unknown;
  checkout_status: unknown;
  product_name: unknown;
  product_type: unknown;
  amount_minor: unknown;
  currency: unknown;
  order_id: unknown;
  order_status: unknown;
  fulfillment_status: unknown;
  fulfillment_kind: unknown;
  checkout_environment: unknown;
  checkout_livemode: unknown;
  order_environment: unknown;
  order_livemode: unknown;
  fulfillment_environment: unknown;
  fulfillment_livemode: unknown;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
}

interface EventRow {
  event_id: unknown;
  stripe_event_id: unknown;
  event_type: unknown;
  stripe_object_id: unknown;
  checkout_id: unknown;
  customer_user_id: unknown;
  customer_name: unknown;
  customer_email: unknown;
  event_status: unknown;
  failure_category: unknown;
  event_environment: unknown;
  event_livemode: unknown;
  checkout_environment: unknown;
  checkout_livemode: unknown;
  received_at: unknown;
  processed_at: unknown;
}

interface FulfillmentRow {
  fulfillment_id: unknown;
  order_id: unknown;
  checkout_id: unknown;
  product_name: unknown;
  customer_user_id: unknown;
  customer_name: unknown;
  customer_email: unknown;
  fulfillment_kind: unknown;
  provider_object_id: unknown;
  fulfillment_status: unknown;
  failure_category: unknown;
  fulfillment_environment: unknown;
  fulfillment_livemode: unknown;
  order_environment: unknown;
  order_livemode: unknown;
  checkout_environment: unknown;
  checkout_livemode: unknown;
  created_at: unknown;
  completed_at: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const PRODUCT_TYPES = new Set<CommerceProductType>([
  "track",
  "release",
  "collection",
  "membership",
  "subscription",
  "license",
  "download-credits",
  "license-credits",
]);
const CHECKOUT_STATUSES = new Set<CommerceCheckoutStatus>([
  "creating",
  "open",
  "completed",
  "expired",
  "canceled",
  "failed",
]);
const ORDER_STATUSES = new Set<CommerceOrderStatus>([
  "pending",
  "fulfilled",
  "failed",
  "canceled",
  "reversed",
]);
const EVENT_STATUSES = new Set<CommerceEventStatus>([
  "processing",
  "completed",
  "ignored",
  "failed",
]);
const FULFILLMENT_STATUSES = new Set<CommerceFulfillmentStatus>([
  "processing",
  "fulfilled",
  "ignored",
  "failed",
]);
const FULFILLMENT_KINDS = new Set<CommerceFulfillmentKind>([
  "one_time",
  "initial_subscription",
  "renewal",
  "subscription_state",
]);

function integrity(message: string): never {
  throw new RuntimeError("COMMERCE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Commerce history is temporarily unavailable.",
  });
}

function text(value: unknown, label: string, maximum = 4_096): string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum
    ? value
    : integrity(`D1 returned an invalid ${label}.`);
}

function optionalText(
  value: unknown,
  label: string,
  maximum = 4_096,
): string | null {
  return value === null ? null : text(value, label, maximum);
}

function id(value: unknown, label: string): string {
  return typeof value === "string" && SAFE_ID.test(value)
    ? value
    : integrity(`D1 returned an invalid ${label}.`);
}

function optionalId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : integrity(`D1 returned an invalid ${label}.`);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T {
  return typeof value === "string" && allowed.has(value as T)
    ? (value as T)
    : integrity(`D1 returned an invalid ${label}.`);
}

function optionalEnumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T | null {
  return value === null ? null : enumValue(value, allowed, label);
}

function requireTestRecord(
  environment: unknown,
  livemode: unknown,
  label: string,
): void {
  if (environment !== "test" || livemode !== 0) {
    integrity(`D1 returned ${label} outside Stripe Test Mode.`);
  }
}

function requireOptionalTestRecord(
  environment: unknown,
  livemode: unknown,
  label: string,
): void {
  if (environment === null && livemode === null) return;
  requireTestRecord(environment, livemode, label);
}

function productType(value: unknown): CommerceProductType {
  return enumValue(value, PRODUCT_TYPES, "commerce product type");
}

function parseOrder(
  row: OrderRow,
  includeCustomer: false,
): CustomerCommerceOrder;
function parseOrder(row: OrderRow, includeCustomer: true): AdminCommerceOrder;
function parseOrder(
  row: OrderRow,
  includeCustomer: boolean,
): CustomerCommerceOrder | AdminCommerceOrder {
  requireTestRecord(row.order_environment, row.order_livemode, "order record");
  requireTestRecord(
    row.item_environment,
    row.item_livemode,
    "order-item record",
  );
  requireOptionalTestRecord(
    row.checkout_environment,
    row.checkout_livemode,
    "checkout record",
  );
  requireOptionalTestRecord(
    row.fulfillment_environment,
    row.fulfillment_livemode,
    "fulfillment record",
  );
  const order: CustomerCommerceOrder = Object.freeze({
    id: id(row.order_id, "order ID"),
    checkoutId: optionalId(row.checkout_id, "checkout ID"),
    productName: text(row.product_name, "order product name", 160),
    productType: productType(row.product_type),
    status: enumValue(row.order_status, ORDER_STATUSES, "order status"),
    fulfillmentStatus: optionalEnumValue(
      row.fulfillment_status,
      FULFILLMENT_STATUSES,
      "fulfillment status",
    ),
    fulfillmentKind: optionalEnumValue(
      row.fulfillment_kind,
      FULFILLMENT_KINDS,
      "fulfillment kind",
    ),
    totalMinor: positiveInteger(row.total_minor, "order total"),
    currency: text(row.currency, "order currency", 3),
    stripeEnvironment: "test",
    livemode: false,
    createdAt: text(row.created_at, "order creation timestamp", 80),
    completedAt: optionalText(
      row.completed_at,
      "order completion timestamp",
      80,
    ),
  });
  if (!includeCustomer) return order;
  return Object.freeze({
    ...order,
    customerUserId: id(row.customer_user_id, "order customer ID"),
    customerName: text(row.customer_name, "order customer name", 160),
    customerEmail: text(row.customer_email, "order customer email", 320),
  });
}

const ORDER_SELECT = `SELECT
  orders.id AS order_id,
  checkout_sessions.id AS checkout_id,
  orders.customer_user_id AS customer_user_id,
  COALESCE(profiles.display_name, users.email) AS customer_name,
  users.email AS customer_email,
  order_items.product_name AS product_name,
  order_items.product_type AS product_type,
  orders.status AS order_status,
  fulfillment_events.status AS fulfillment_status,
  fulfillment_events.kind AS fulfillment_kind,
  orders.total_minor AS total_minor,
  orders.currency AS currency,
  orders.stripe_environment AS order_environment,
  orders.livemode AS order_livemode,
  order_items.stripe_environment AS item_environment,
  order_items.livemode AS item_livemode,
  checkout_sessions.stripe_environment AS checkout_environment,
  checkout_sessions.livemode AS checkout_livemode,
  fulfillment_events.stripe_environment AS fulfillment_environment,
  fulfillment_events.livemode AS fulfillment_livemode,
  orders.created_at AS created_at,
  orders.completed_at AS completed_at
FROM orders
LEFT JOIN checkout_sessions ON checkout_sessions.id = orders.checkout_session_id
JOIN order_items ON order_items.order_id = orders.id
JOIN users ON users.id = orders.customer_user_id
LEFT JOIN profiles ON profiles.user_id = users.id
LEFT JOIN fulfillment_events
  ON fulfillment_events.id = (
    SELECT candidate.id
    FROM fulfillment_events AS candidate
    WHERE candidate.order_id = orders.id
    ORDER BY candidate.created_at DESC, candidate.id DESC
    LIMIT 1
  )`;

export async function readCustomerCommerceOrders(
  binding: D1Database,
  customerUserId: string,
): Promise<readonly CustomerCommerceOrder[]> {
  if (!SAFE_ID.test(customerUserId)) return Object.freeze([]);
  const result = await binding
    .prepare(
      `${ORDER_SELECT}
       WHERE orders.customer_user_id = ?1
       ORDER BY orders.created_at DESC, orders.id DESC
       LIMIT 100`,
    )
    .bind(customerUserId)
    .all<OrderRow>();
  return Object.freeze(result.results.map((row) => parseOrder(row, false)));
}

export async function readCustomerCommerceReturn(
  binding: D1Database,
  customerUserId: string,
  checkoutId: string,
): Promise<CommerceReturnState | null> {
  if (!SAFE_ID.test(customerUserId) || !SAFE_ID.test(checkoutId)) return null;
  const row = await binding
    .prepare(
      `SELECT
        checkout_sessions.id AS checkout_id,
        checkout_sessions.status AS checkout_status,
        COALESCE(order_items.product_name, commerce_products.name) AS product_name,
        COALESCE(order_items.product_type, commerce_products.product_type) AS product_type,
        checkout_sessions.amount_minor AS amount_minor,
        checkout_sessions.currency AS currency,
        orders.id AS order_id,
        orders.status AS order_status,
        fulfillment_events.status AS fulfillment_status,
        fulfillment_events.kind AS fulfillment_kind,
        checkout_sessions.stripe_environment AS checkout_environment,
        checkout_sessions.livemode AS checkout_livemode,
        orders.stripe_environment AS order_environment,
        orders.livemode AS order_livemode,
        fulfillment_events.stripe_environment AS fulfillment_environment,
        fulfillment_events.livemode AS fulfillment_livemode,
        checkout_sessions.created_at AS created_at,
        checkout_sessions.updated_at AS updated_at,
        COALESCE(orders.completed_at, checkout_sessions.completed_at) AS completed_at
       FROM checkout_sessions
       JOIN commerce_products
         ON commerce_products.id = checkout_sessions.commerce_product_id
       LEFT JOIN orders
         ON orders.checkout_session_id = checkout_sessions.id
       LEFT JOIN order_items
         ON order_items.order_id = orders.id
       LEFT JOIN fulfillment_events
         ON fulfillment_events.id = (
           SELECT candidate.id
           FROM fulfillment_events AS candidate
           WHERE candidate.order_id = orders.id
           ORDER BY candidate.created_at DESC, candidate.id DESC
           LIMIT 1
         )
       WHERE checkout_sessions.id = ?1
         AND checkout_sessions.customer_user_id = ?2
       LIMIT 1`,
    )
    .bind(checkoutId, customerUserId)
    .first<ReturnRow>();
  if (!row) return null;

  requireTestRecord(
    row.checkout_environment,
    row.checkout_livemode,
    "checkout record",
  );
  requireOptionalTestRecord(
    row.order_environment,
    row.order_livemode,
    "order record",
  );
  requireOptionalTestRecord(
    row.fulfillment_environment,
    row.fulfillment_livemode,
    "fulfillment record",
  );
  return Object.freeze({
    checkoutId: id(row.checkout_id, "checkout ID"),
    checkoutStatus: enumValue(
      row.checkout_status,
      CHECKOUT_STATUSES,
      "checkout status",
    ),
    productName: text(row.product_name, "checkout product name", 160),
    productType: productType(row.product_type),
    amountMinor: positiveInteger(row.amount_minor, "checkout amount"),
    currency: text(row.currency, "checkout currency", 3),
    orderId: optionalId(row.order_id, "order ID"),
    orderStatus: optionalEnumValue(
      row.order_status,
      ORDER_STATUSES,
      "order status",
    ),
    fulfillmentStatus: optionalEnumValue(
      row.fulfillment_status,
      FULFILLMENT_STATUSES,
      "fulfillment status",
    ),
    fulfillmentKind: optionalEnumValue(
      row.fulfillment_kind,
      FULFILLMENT_KINDS,
      "fulfillment kind",
    ),
    stripeEnvironment: "test",
    livemode: false,
    createdAt: text(row.created_at, "checkout creation timestamp", 80),
    updatedAt: text(row.updated_at, "checkout update timestamp", 80),
    completedAt: optionalText(
      row.completed_at,
      "checkout completion timestamp",
      80,
    ),
  });
}

function parseEvent(row: EventRow): AdminCommerceEvent {
  requireTestRecord(
    row.event_environment,
    row.event_livemode,
    "commerce-event record",
  );
  requireOptionalTestRecord(
    row.checkout_environment,
    row.checkout_livemode,
    "checkout record",
  );
  return Object.freeze({
    id: id(row.event_id, "commerce event ID"),
    stripeEventId: text(row.stripe_event_id, "Stripe event ID", 255),
    eventType: text(row.event_type, "commerce event type", 160),
    stripeObjectId: text(row.stripe_object_id, "Stripe object ID", 255),
    checkoutId: optionalId(row.checkout_id, "checkout ID"),
    customerUserId: optionalId(row.customer_user_id, "event customer ID"),
    customerName: optionalText(row.customer_name, "event customer name", 160),
    customerEmail: optionalText(
      row.customer_email,
      "event customer email",
      320,
    ),
    status: enumValue(
      row.event_status,
      EVENT_STATUSES,
      "commerce event status",
    ),
    failureCategory: optionalText(
      row.failure_category,
      "event failure category",
      120,
    ),
    stripeEnvironment: "test",
    livemode: false,
    receivedAt: text(row.received_at, "event receipt timestamp", 80),
    processedAt: optionalText(
      row.processed_at,
      "event processing timestamp",
      80,
    ),
  });
}

function parseFulfillment(row: FulfillmentRow): AdminCommerceFulfillment {
  requireTestRecord(
    row.fulfillment_environment,
    row.fulfillment_livemode,
    "fulfillment record",
  );
  requireOptionalTestRecord(
    row.order_environment,
    row.order_livemode,
    "order record",
  );
  requireOptionalTestRecord(
    row.checkout_environment,
    row.checkout_livemode,
    "checkout record",
  );
  return Object.freeze({
    id: id(row.fulfillment_id, "fulfillment ID"),
    orderId: optionalId(row.order_id, "fulfillment order ID"),
    checkoutId: optionalId(row.checkout_id, "fulfillment checkout ID"),
    productName: optionalText(
      row.product_name,
      "fulfillment product name",
      160,
    ),
    customerUserId: id(row.customer_user_id, "fulfillment customer ID"),
    customerName: text(row.customer_name, "fulfillment customer name", 160),
    customerEmail: text(row.customer_email, "fulfillment customer email", 320),
    kind: enumValue(
      row.fulfillment_kind,
      FULFILLMENT_KINDS,
      "fulfillment kind",
    ),
    providerObjectId: text(
      row.provider_object_id,
      "fulfillment provider object ID",
      255,
    ),
    status: enumValue(
      row.fulfillment_status,
      FULFILLMENT_STATUSES,
      "fulfillment status",
    ),
    failureCategory: optionalText(
      row.failure_category,
      "fulfillment failure category",
      120,
    ),
    stripeEnvironment: "test",
    livemode: false,
    createdAt: text(row.created_at, "fulfillment creation timestamp", 80),
    completedAt: optionalText(
      row.completed_at,
      "fulfillment completion timestamp",
      80,
    ),
  });
}

export async function readAdminCommerceEvidence(
  binding: D1Database,
): Promise<AdminCommerceEvidence> {
  const [orderResult, eventResult, fulfillmentResult] = await Promise.all([
    binding
      .prepare(
        `${ORDER_SELECT}
         ORDER BY orders.created_at DESC, orders.id DESC
         LIMIT 100`,
      )
      .all<OrderRow>(),
    binding
      .prepare(
        `SELECT
          commerce_events.id AS event_id,
          commerce_events.stripe_event_id AS stripe_event_id,
          commerce_events.event_type AS event_type,
          commerce_events.stripe_object_id AS stripe_object_id,
          checkout_sessions.id AS checkout_id,
          COALESCE(
            checkout_sessions.customer_user_id,
            orders.customer_user_id
          ) AS customer_user_id,
          COALESCE(profiles.display_name, users.email) AS customer_name,
          users.email AS customer_email,
          commerce_events.status AS event_status,
          commerce_events.failure_category AS failure_category,
          commerce_events.stripe_environment AS event_environment,
          commerce_events.livemode AS event_livemode,
          checkout_sessions.stripe_environment AS checkout_environment,
          checkout_sessions.livemode AS checkout_livemode,
          commerce_events.created_at AS received_at,
          commerce_events.processed_at AS processed_at
         FROM commerce_events
         LEFT JOIN checkout_sessions
           ON checkout_sessions.id = commerce_events.checkout_session_id
         LEFT JOIN orders
           ON orders.commerce_event_id = commerce_events.id
         LEFT JOIN users
           ON users.id = COALESCE(
             checkout_sessions.customer_user_id,
             orders.customer_user_id
           )
         LEFT JOIN profiles ON profiles.user_id = users.id
         ORDER BY commerce_events.created_at DESC, commerce_events.id DESC
         LIMIT 100`,
      )
      .all<EventRow>(),
    binding
      .prepare(
        `SELECT
          fulfillment_events.id AS fulfillment_id,
          fulfillment_events.order_id AS order_id,
          fulfillment_events.checkout_session_id AS checkout_id,
          commerce_products.name AS product_name,
          fulfillment_events.customer_user_id AS customer_user_id,
          COALESCE(profiles.display_name, users.email) AS customer_name,
          users.email AS customer_email,
          fulfillment_events.kind AS fulfillment_kind,
          fulfillment_events.provider_object_id AS provider_object_id,
          fulfillment_events.status AS fulfillment_status,
          fulfillment_events.failure_category AS failure_category,
          fulfillment_events.stripe_environment AS fulfillment_environment,
          fulfillment_events.livemode AS fulfillment_livemode,
          orders.stripe_environment AS order_environment,
          orders.livemode AS order_livemode,
          checkout_sessions.stripe_environment AS checkout_environment,
          checkout_sessions.livemode AS checkout_livemode,
          fulfillment_events.created_at AS created_at,
          fulfillment_events.completed_at AS completed_at
         FROM fulfillment_events
         JOIN users ON users.id = fulfillment_events.customer_user_id
         LEFT JOIN profiles ON profiles.user_id = users.id
         LEFT JOIN orders ON orders.id = fulfillment_events.order_id
         LEFT JOIN checkout_sessions
           ON checkout_sessions.id = fulfillment_events.checkout_session_id
         LEFT JOIN commerce_products
           ON commerce_products.id = fulfillment_events.commerce_product_id
         ORDER BY fulfillment_events.created_at DESC, fulfillment_events.id DESC
         LIMIT 100`,
      )
      .all<FulfillmentRow>(),
  ]);

  return Object.freeze({
    orders: Object.freeze(
      orderResult.results.map((row) => parseOrder(row, true)),
    ),
    events: Object.freeze(eventResult.results.map(parseEvent)),
    fulfillments: Object.freeze(
      fulfillmentResult.results.map(parseFulfillment),
    ),
  });
}
