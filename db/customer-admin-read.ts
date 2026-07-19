import { activeOwnerCondition } from "./authority-guards.ts";
import type {
  CustomerAdminDetail,
  CustomerContactSummary,
  CustomerCourseProgressSummary,
  CustomerCreditSummary,
  CustomerEntitlementSummary,
  CustomerFulfillmentSummary,
  CustomerLicenseSummary,
  CustomerMembershipSummary,
  CustomerOrderSummary,
  CustomerSubscriptionSummary,
} from "@/lib/operations/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

type Row = Record<string, unknown>;

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_ACTIONS = new Set(["view", "stream", "download"]);

function integrity(message: string): never {
  throw new Error(`Customer administration integrity error: ${message}`);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function text(
  value: unknown,
  label: string,
  options: { readonly allowEmpty?: boolean; readonly maximum?: number } = {},
): string {
  const maximum = options.maximum ?? 4_000;
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (!options.allowEmpty && value.trim().length === 0) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    return integrity(`D1 returned invalid ${label}.`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !Number.isFinite(Date.parse(value))
  ) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

function booleanValue(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value === 1;
}

function requireTestEnvironment(
  environment: unknown,
  livemode: unknown,
  label: string,
): { readonly stripeEnvironment: "test"; readonly livemode: false } {
  if (environment !== "test" || livemode !== 0) {
    return integrity(`D1 returned live or unknown ${label} commerce state.`);
  }
  return { stripeEnvironment: "test", livemode: false };
}

function nullableTestEnvironment(
  environment: unknown,
  livemode: unknown,
  label: string,
): {
  readonly stripeEnvironment: "test" | null;
  readonly livemode: false | null;
} {
  if (environment === null && livemode === null) {
    return { stripeEnvironment: null, livemode: null };
  }
  return requireTestEnvironment(environment, livemode, label);
}

function actions(value: unknown): readonly string[] {
  if (typeof value !== "string") {
    return integrity("D1 returned invalid entitlement actions.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return integrity("D1 returned invalid entitlement action JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > SAFE_ACTIONS.size ||
    !parsed.every(
      (action) => typeof action === "string" && SAFE_ACTIONS.has(action),
    )
  ) {
    return integrity("D1 returned unsupported entitlement actions.");
  }
  return Object.freeze([...new Set(parsed as string[])]);
}

function completedItemCount(value: unknown): number {
  if (typeof value !== "string") {
    return integrity("D1 returned invalid Course progress JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return integrity("D1 returned invalid Course progress JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 10_000 ||
    !parsed.every((item) => typeof item === "string" && SAFE_ID.test(item))
  ) {
    return integrity("D1 returned invalid completed Course items.");
  }
  return new Set(parsed).size;
}

function safeActorUserId(value: string): string {
  if (!SAFE_ID.test(value)) {
    throw new TypeError("A safe owner user ID is required.");
  }
  return value;
}

function safeCustomerUserId(value: string): string {
  if (!SAFE_ID.test(value)) {
    throw new TypeError("A safe customer user ID is required.");
  }
  return value;
}

async function requireCurrentRelationship(
  binding: D1Database,
  actorUserId: string,
  customerUserId: string,
): Promise<Row> {
  const owner = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(
      `SELECT users.id AS user_id, users.email, users.status,
              users.created_at, users.updated_at,
              profiles.display_name AS display_name
       FROM users
       JOIN profiles ON profiles.user_id = users.id
       JOIN role_assignments AS customer_role
         ON customer_role.user_id = users.id
        AND customer_role.role_key = 'customer'
        AND customer_role.revoked_at IS NULL
       WHERE users.id = ? AND users.status = 'active'
         AND ${owner.sql}
       LIMIT 1`,
    )
    .bind(customerUserId, ...owner.bindings)
    .first<Row>();
  if (row) return row;
  throw new RuntimeError(
    "CUSTOMER_NOT_FOUND",
    "The exact active D1 customer relationship was not found.",
    { status: 404, publicMessage: "That active customer was not found." },
  );
}

async function all(
  binding: D1Database,
  sql: string,
  customerUserId: string,
  actorUserId: string,
): Promise<readonly Row[]> {
  const owner = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(`${sql} AND ${owner.sql}`)
    .bind(customerUserId, ...owner.bindings)
    .all<Row>();
  return result.results;
}

function projectEntitlement(row: Row): CustomerEntitlementSummary {
  const environment = nullableTestEnvironment(
    row.stripe_environment,
    row.livemode,
    "entitlement",
  );
  return Object.freeze({
    id: id(row.id, "entitlement ID"),
    sourceType: text(row.source_type, "entitlement source type", {
      maximum: 32,
    }),
    sourceId: id(row.source_id, "entitlement source ID"),
    resourceType: text(row.resource_type, "entitlement resource type", {
      maximum: 32,
    }),
    resourceId: id(row.resource_id, "entitlement resource ID"),
    actions: actions(row.actions_json),
    state: text(row.state, "entitlement state", { maximum: 32 }),
    startsAt: nullableTimestamp(row.starts_at, "entitlement start timestamp"),
    expiresAt: nullableTimestamp(
      row.expires_at,
      "entitlement expiry timestamp",
    ),
    remainingUses: nullableInteger(
      row.remaining_uses,
      "entitlement remaining uses",
    ),
    ...environment,
    createdAt: timestamp(row.created_at, "entitlement creation timestamp"),
    updatedAt: timestamp(row.updated_at, "entitlement update timestamp"),
  });
}

function projectMembership(row: Row): CustomerMembershipSummary {
  return Object.freeze({
    id: id(row.id, "membership ID"),
    planId: id(row.plan_id, "membership plan ID"),
    planName: text(row.plan_name, "membership plan name", { maximum: 120 }),
    source: text(row.source, "membership source", { maximum: 32 }),
    state: text(row.state, "membership state", { maximum: 40 }),
    currentPeriodStart: timestamp(
      row.current_period_start,
      "membership period start",
    ),
    currentPeriodEnd: timestamp(
      row.current_period_end,
      "membership period end",
    ),
    ...requireTestEnvironment(
      row.stripe_environment,
      row.livemode,
      "membership",
    ),
    createdAt: timestamp(row.created_at, "membership creation timestamp"),
    updatedAt: timestamp(row.updated_at, "membership update timestamp"),
  });
}

function projectSubscription(row: Row): CustomerSubscriptionSummary {
  return Object.freeze({
    id: id(row.id, "subscription ID"),
    membershipId: id(row.membership_id, "subscription membership ID"),
    planId: id(row.plan_id, "subscription plan ID"),
    planName: text(row.plan_name, "subscription plan name", { maximum: 120 }),
    source: text(row.source, "subscription source", { maximum: 32 }),
    state: text(row.state, "subscription state", { maximum: 40 }),
    currentPeriodStart: timestamp(
      row.current_period_start,
      "subscription period start",
    ),
    currentPeriodEnd: timestamp(
      row.current_period_end,
      "subscription period end",
    ),
    cancelAtPeriodEnd: booleanValue(
      row.cancel_at_period_end,
      "subscription cancellation flag",
    ),
    ...requireTestEnvironment(
      row.stripe_environment,
      row.livemode,
      "subscription",
    ),
    createdAt: timestamp(row.created_at, "subscription creation timestamp"),
    updatedAt: timestamp(row.updated_at, "subscription update timestamp"),
  });
}

function projectCredit(row: Row): CustomerCreditSummary {
  const kind = row.credit_kind;
  if (kind !== "download" && kind !== "license") {
    return integrity("D1 returned an invalid credit kind.");
  }
  return Object.freeze({
    id: id(row.id, "credit account ID"),
    kind,
    available: integer(row.available_balance, "available credit balance"),
    reserved: integer(row.reserved_balance, "reserved credit balance"),
    consumed: integer(row.consumed_balance, "consumed credit balance"),
    lotCount: integer(row.lot_count, "credit lot count"),
    ...requireTestEnvironment(row.stripe_environment, row.livemode, "credit"),
    updatedAt: timestamp(row.updated_at, "credit account update timestamp"),
  });
}

function projectOrder(row: Row): CustomerOrderSummary {
  return Object.freeze({
    id: id(row.id, "order ID"),
    status: text(row.status, "order status", { maximum: 32 }),
    productType:
      row.product_type === null
        ? null
        : text(row.product_type, "order product type", { maximum: 40 }),
    productName:
      row.product_name === null
        ? null
        : text(row.product_name, "order product name", { maximum: 160 }),
    totalMinor: integer(row.total_minor, "order total"),
    currency: text(row.currency, "order currency", { maximum: 3 }),
    ...requireTestEnvironment(row.stripe_environment, row.livemode, "order"),
    completedAt: nullableTimestamp(
      row.completed_at,
      "order completion timestamp",
    ),
    createdAt: timestamp(row.created_at, "order creation timestamp"),
    updatedAt: timestamp(row.updated_at, "order update timestamp"),
  });
}

function projectFulfillment(row: Row): CustomerFulfillmentSummary {
  return Object.freeze({
    id: id(row.id, "fulfillment ID"),
    orderId:
      row.order_id === null ? null : id(row.order_id, "fulfillment order ID"),
    kind: text(row.kind, "fulfillment kind", { maximum: 40 }),
    status: text(row.status, "fulfillment status", { maximum: 32 }),
    failureCategory:
      row.failure_category === null
        ? null
        : text(row.failure_category, "fulfillment failure category", {
            maximum: 120,
          }),
    ...requireTestEnvironment(
      row.stripe_environment,
      row.livemode,
      "fulfillment",
    ),
    createdAt: timestamp(row.created_at, "fulfillment creation timestamp"),
    completedAt: nullableTimestamp(
      row.completed_at,
      "fulfillment completion timestamp",
    ),
  });
}

function projectLicense(row: Row): CustomerLicenseSummary {
  return Object.freeze({
    requestId: id(row.request_id, "license request ID"),
    requestState: text(row.request_state, "license request state", {
      maximum: 40,
    }),
    trackId: id(row.track_id, "licensed track ID"),
    trackTitle: text(row.track_title, "licensed track title", { maximum: 300 }),
    issuedLicenseId:
      row.issued_license_id === null
        ? null
        : id(row.issued_license_id, "issued license ID"),
    licenseState:
      row.license_state === null
        ? null
        : text(row.license_state, "issued license state", { maximum: 32 }),
    licenseSource:
      row.license_source === null
        ? null
        : text(row.license_source, "issued license source", { maximum: 40 }),
    documentId:
      row.document_id === null
        ? null
        : id(row.document_id, "license document ID"),
    documentState:
      row.document_state === null
        ? null
        : text(row.document_state, "license document state", { maximum: 32 }),
    ...requireTestEnvironment(
      row.stripe_environment,
      row.livemode,
      "license request",
    ),
    createdAt: timestamp(row.created_at, "license request creation timestamp"),
    updatedAt: timestamp(row.updated_at, "license request update timestamp"),
  });
}

function projectProgress(row: Row): CustomerCourseProgressSummary {
  return Object.freeze({
    id: id(row.id, "Course progress ID"),
    courseId: id(row.course_id, "Course ID"),
    courseTitle: text(row.course_title, "Course title", { maximum: 200 }),
    lessonKey: id(row.lesson_key, "Course lesson key"),
    state: text(row.state, "Course progress state", { maximum: 32 }),
    completedItemCount: completedItemCount(row.completed_item_keys_json),
    startedAt: timestamp(row.started_at, "Course start timestamp"),
    completedAt: nullableTimestamp(
      row.completed_at,
      "Course completion timestamp",
    ),
    updatedAt: timestamp(row.updated_at, "Course progress update timestamp"),
  });
}

function projectContact(row: Row): CustomerContactSummary {
  return Object.freeze({
    id: id(row.id, "contact submission ID"),
    category: text(row.category, "contact category", { maximum: 80 }),
    subject: text(row.subject, "contact subject", { maximum: 240 }),
    state: text(row.state, "contact state", { maximum: 32 }),
    consentedAt: timestamp(row.consented_at, "contact consent timestamp"),
    createdAt: timestamp(row.created_at, "contact creation timestamp"),
    updatedAt: timestamp(row.updated_at, "contact update timestamp"),
  });
}

/**
 * Reads one joined customer relationship. Every query repeats both the exact
 * customer ID and current owner authority; contact never falls back to email.
 */
export async function readCustomerAdminDetail(
  binding: D1Database,
  rawActorUserId: string,
  rawCustomerUserId: string,
): Promise<CustomerAdminDetail> {
  const actorUserId = safeActorUserId(rawActorUserId);
  const customerUserId = safeCustomerUserId(rawCustomerUserId);
  const identity = await requireCurrentRelationship(
    binding,
    actorUserId,
    customerUserId,
  );
  const [
    entitlementRows,
    membershipRows,
    subscriptionRows,
    creditRows,
    orderRows,
    fulfillmentRows,
    licenseRows,
    progressRows,
    contactRows,
  ] = await Promise.all([
    all(
      binding,
      `SELECT id, source_type, source_id, resource_type, resource_id,
              actions_json, state, starts_at, expires_at, remaining_uses,
              stripe_environment, livemode, created_at, updated_at
       FROM entitlements WHERE user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT memberships.id, memberships.membership_plan_id AS plan_id,
              membership_plan_revisions.name AS plan_name,
              memberships.source, memberships.state,
              memberships.current_period_start, memberships.current_period_end,
              memberships.stripe_environment, memberships.livemode,
              memberships.created_at, memberships.updated_at
       FROM memberships
       JOIN membership_plan_revisions
         ON membership_plan_revisions.id = memberships.membership_plan_revision_id
        AND membership_plan_revisions.membership_plan_id = memberships.membership_plan_id
        AND membership_plan_revisions.revision = memberships.membership_plan_revision
       WHERE memberships.customer_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT subscriptions.id, subscriptions.membership_id,
              subscriptions.subscription_plan_id AS plan_id,
              subscription_plans.name AS plan_name,
              subscriptions.source, subscriptions.state,
              subscriptions.current_period_start, subscriptions.current_period_end,
              subscriptions.cancel_at_period_end, subscriptions.stripe_environment,
              subscriptions.livemode, subscriptions.created_at,
              subscriptions.updated_at
       FROM subscriptions
       JOIN subscription_plans
         ON subscription_plans.id = subscriptions.subscription_plan_id
       WHERE subscriptions.customer_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT credit_accounts.id, credit_accounts.credit_kind,
              credit_accounts.available_balance, credit_accounts.reserved_balance,
              credit_accounts.consumed_balance, credit_accounts.stripe_environment,
              credit_accounts.livemode, credit_accounts.updated_at,
              (SELECT COUNT(*) FROM credit_grant_lots
               WHERE credit_grant_lots.credit_account_id = credit_accounts.id
                 AND credit_grant_lots.customer_user_id = credit_accounts.customer_user_id) AS lot_count
       FROM credit_accounts WHERE credit_accounts.customer_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT orders.id, orders.status,
              (SELECT product_type FROM order_items
               WHERE order_items.order_id = orders.id LIMIT 1) AS product_type,
              (SELECT product_name FROM order_items
               WHERE order_items.order_id = orders.id LIMIT 1) AS product_name,
              orders.total_minor, orders.currency,
              orders.stripe_environment, orders.livemode, orders.completed_at,
              orders.created_at, orders.updated_at
       FROM orders
       WHERE orders.customer_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT id, order_id, kind, status, failure_category,
              stripe_environment, livemode, created_at, completed_at
       FROM fulfillment_events WHERE customer_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT license_requests.id AS request_id,
              license_requests.state AS request_state,
              license_requests.track_id,
              json_extract(
                license_requests.terms_snapshot_json,
                '$.track.title'
              ) AS track_title,
              issued_licenses.id AS issued_license_id,
              issued_licenses.state AS license_state,
              issued_licenses.source AS license_source,
              license_documents.id AS document_id,
              license_documents.state AS document_state,
              license_requests.stripe_environment,
              license_requests.livemode,
              license_requests.created_at, license_requests.updated_at
       FROM license_requests
       LEFT JOIN issued_licenses
         ON issued_licenses.license_request_id = license_requests.id
        AND issued_licenses.customer_user_id = license_requests.customer_user_id
       LEFT JOIN license_documents
         ON license_documents.issued_license_id = issued_licenses.id
        AND license_documents.customer_user_id = license_requests.customer_user_id
       WHERE license_requests.customer_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT course_progress.id, course_progress.course_id,
              course_revisions.title AS course_title,
              course_progress.lesson_key, course_progress.state,
              course_progress.completed_item_keys_json,
              course_progress.started_at, course_progress.completed_at,
              course_progress.updated_at
       FROM course_progress
       JOIN courses ON courses.id = course_progress.course_id
       JOIN course_revisions
         ON course_revisions.id = COALESCE(courses.published_revision_id, courses.draft_revision_id)
        AND course_revisions.course_id = courses.id
       WHERE course_progress.user_id = ?`,
      customerUserId,
      actorUserId,
    ),
    all(
      binding,
      `SELECT id, category, subject, state, consented_at, created_at, updated_at
       FROM contact_submissions WHERE submitter_user_id = ?`,
      customerUserId,
      actorUserId,
    ),
  ]);
  await requireCurrentRelationship(binding, actorUserId, customerUserId);
  if (identity.status !== "active") {
    return integrity("D1 returned an inactive customer relationship.");
  }
  return Object.freeze({
    stripeTestOnly: true,
    identity: Object.freeze({
      userId: id(identity.user_id, "customer user ID"),
      email: text(identity.email, "customer email", { maximum: 320 }),
      displayName: text(identity.display_name, "customer display name", {
        maximum: 120,
      }),
      status: "active",
      createdAt: timestamp(identity.created_at, "customer creation timestamp"),
      updatedAt: timestamp(identity.updated_at, "customer update timestamp"),
    }),
    entitlements: Object.freeze(entitlementRows.map(projectEntitlement)),
    memberships: Object.freeze(membershipRows.map(projectMembership)),
    subscriptions: Object.freeze(subscriptionRows.map(projectSubscription)),
    credits: Object.freeze(creditRows.map(projectCredit)),
    orders: Object.freeze(orderRows.map(projectOrder)),
    fulfillmentEvents: Object.freeze(fulfillmentRows.map(projectFulfillment)),
    licenses: Object.freeze(licenseRows.map(projectLicense)),
    courseProgress: Object.freeze(progressRows.map(projectProgress)),
    contactSubmissions: Object.freeze(contactRows.map(projectContact)),
  });
}
