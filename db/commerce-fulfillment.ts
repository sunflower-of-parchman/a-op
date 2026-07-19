import { changedRows } from "./audit-events.ts";
import {
  readCheckoutSession,
  readStoredCommerceProduct,
  type ActiveCommerceProduct,
  type StoredCheckoutSession,
} from "./commerce-read.ts";
import { runAtomicBatch } from "./d1.ts";
import { issueLicenseFromVerifiedStripeTestFulfillment } from "./licensing-write.ts";
import type {
  StripeCheckoutEvent,
  StripeCheckoutSessionFacts,
} from "@/lib/commerce/stripe-events.ts";
import { RuntimeError, isRequestId } from "@/lib/runtime/index.ts";

export interface CommerceFulfillmentReceipt {
  readonly stripeEventId: string;
  readonly commerceEventId: string;
  readonly checkoutId: string;
  readonly status: "fulfilled" | "ignored";
  readonly orderId: string | null;
  readonly fulfillmentEventId: string | null;
  readonly resultType:
    | "direct-access"
    | "credit-grant"
    | "membership"
    | "awaiting-subscription-invoice"
    | "license"
    | "checkout-failed"
    | "checkout-expired"
    | "payment-pending"
    | "already-fulfilled";
  readonly replayed: boolean;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface ProcessCheckoutEventInput {
  readonly event: StripeCheckoutEvent;
  readonly rawBodyDigest: string;
  readonly factsFingerprint: string;
  readonly requestId: string;
  readonly processedAt: string;
}

interface ExistingEventRow {
  id: string;
  checkout_session_id: string | null;
  raw_body_digest: string;
  facts_fingerprint: string;
  status: string;
}

interface ExistingOrderRow {
  id: string;
  status: string;
}

interface LicenseScaffoldRow {
  commerce_event_id: string;
  commerce_event_status: string;
  order_id: string;
  order_status: string;
  fulfillment_event_id: string;
  fulfillment_status: string;
  checkout_session_id: string;
  customer_user_id: string;
  commerce_product_id: string;
  commerce_price_id: string;
  provider_object_id: string;
  facts_fingerprint: string;
}

interface AccessItemRow {
  resource_type: string;
  resource_id: string;
  actions_json: string;
  download_disposition: string | null;
}

interface MembershipRevisionRow {
  id: string;
  membership_plan_id: string;
  revision: number;
  access_plan_id: string | null;
  access_plan_revision: number | null;
  download_credits: number;
  license_credits: number;
  duration_days: number | null;
}

interface CreditAccountRow {
  id: string;
  available_balance: number;
  reserved_balance: number;
  consumed_balance: number;
  revision: number;
  lot_available: number;
  lot_reserved: number;
  lot_consumed: number;
}

interface CreditGrantPlan {
  readonly accountId: string;
  readonly accountExists: boolean;
  readonly accountRevision: number;
  readonly creditKind: "download" | "license";
  readonly quantity: number;
  readonly availableBefore: number;
  readonly reservedBefore: number;
  readonly consumedBefore: number;
  readonly lotId: string;
  readonly ledgerId: string;
  readonly originType: "order" | "membership" | "subscription";
  readonly originId: string;
}

interface DomainPlan {
  readonly kind: "direct-access" | "credit-grant" | "membership";
  readonly resultType: CommerceFulfillmentReceipt["resultType"];
  readonly statements: readonly D1PreparedStatement[];
  readonly exactSql: string;
  readonly exactBindings: readonly (number | string)[];
  readonly result: Readonly<Record<string, unknown>>;
}

const HEX_DIGEST = /^[a-f0-9]{64}$/;

function fulfillmentError(
  code: string,
  message: string,
  publicMessage = "The verified Test Checkout could not be fulfilled.",
): RuntimeError {
  return new RuntimeError(code, message, {
    status: 409,
    publicMessage,
  });
}

function integrity(message: string): RuntimeError {
  return new RuntimeError("COMMERCE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Commerce fulfillment is temporarily unavailable.",
  });
}

function validTimestamp(value: string): boolean {
  return (
    value.trim() === value &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function requireInput(input: ProcessCheckoutEventInput): void {
  if (
    !HEX_DIGEST.test(input.rawBodyDigest) ||
    !HEX_DIGEST.test(input.factsFingerprint) ||
    !isRequestId(input.requestId) ||
    !validTimestamp(input.processedAt) ||
    input.event.stripeEnvironment !== "test" ||
    input.event.livemode !== false
  ) {
    throw new TypeError("A verified test fulfillment input is required.");
  }
}

function eventTime(unix: number): string {
  const date = new Date(unix * 1_000);
  if (!Number.isFinite(date.valueOf())) {
    throw fulfillmentError(
      "STRIPE_WEBHOOK_PAYLOAD_INVALID",
      "The verified Stripe event timestamp is invalid.",
    );
  }
  return date.toISOString();
}

async function existingReceipt(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
): Promise<CommerceFulfillmentReceipt | null> {
  const row = await binding
    .prepare(
      `SELECT id, checkout_session_id, raw_body_digest, facts_fingerprint,
              status
       FROM commerce_events
       WHERE stripe_event_id = ?1
       LIMIT 1`,
    )
    .bind(input.event.stripeEventId)
    .first<ExistingEventRow>();
  if (!row) return null;
  if (
    row.raw_body_digest !== input.rawBodyDigest ||
    row.facts_fingerprint !== input.factsFingerprint ||
    row.checkout_session_id !==
      input.event.checkoutSession.application.checkoutId
  ) {
    throw fulfillmentError(
      "STRIPE_EVENT_REPLAY_CONFLICT",
      "A Stripe event ID was replayed with different verified facts.",
    );
  }
  if (row.status === "processing") return null;
  if (row.status !== "completed" && row.status !== "ignored") {
    throw integrity("A commerce event is in an invalid replay state.");
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
  if (!audit)
    throw integrity("A processed commerce event has no audit receipt.");
  try {
    const result = JSON.parse(audit.result_json) as CommerceFulfillmentReceipt;
    return Object.freeze({ ...result, replayed: true });
  } catch {
    throw integrity("A commerce event audit receipt is invalid.");
  }
}

function validateCheckoutFacts(
  checkout: StoredCheckoutSession,
  facts: StripeCheckoutSessionFacts,
): void {
  if (
    checkout.id !== facts.application.checkoutId ||
    checkout.customerUserId !== facts.application.customerUserId ||
    checkout.commerceProductId !== facts.application.productId ||
    checkout.mode !== facts.mode ||
    checkout.stripeCheckoutSessionId !== facts.checkoutSessionId ||
    (checkout.status !== "open" && checkout.status !== "completed") ||
    facts.amountTotal !== checkout.amountMinor ||
    facts.currency?.toUpperCase() !== checkout.currency
  ) {
    throw fulfillmentError(
      "STRIPE_CHECKOUT_MISMATCH",
      "The verified Stripe checkout facts do not match the server-owned intent.",
    );
  }
}

function prepareCommerceEvent(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
  commerceEventId: string,
  checkout: StoredCheckoutSession,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id,
         checkout_session_id, event_created_at, raw_body_digest,
         facts_fingerprint, status, stripe_environment, livemode)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'processing', 'test', 0
       WHERE EXISTS (
         SELECT 1 FROM checkout_sessions
         WHERE id = ? AND customer_user_id = ?
           AND commerce_product_id = ? AND commerce_price_id = ?
           AND stripe_checkout_session_id = ?
           AND stripe_environment = 'test' AND livemode = 0
       )`,
    )
    .bind(
      commerceEventId,
      input.event.stripeEventId,
      input.event.stripeEventType,
      input.event.checkoutSession.checkoutSessionId,
      checkout.id,
      eventTime(input.event.createdAtUnix),
      input.rawBodyDigest,
      input.factsFingerprint,
      checkout.id,
      checkout.customerUserId,
      checkout.commerceProductId,
      checkout.commercePriceId,
      input.event.checkoutSession.checkoutSessionId,
    );
}

function prepareRequiredAudit(
  binding: D1Database,
  input: {
    readonly conditionSql: string;
    readonly conditionBindings: readonly (number | string)[];
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

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.valueOf()))
    throw integrity("Invalid membership period.");
  return date.toISOString();
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

async function readAccessItems(
  binding: D1Database,
  accessPlanId: string,
  revision: number,
): Promise<readonly AccessItemRow[]> {
  const result = await binding
    .prepare(
      `SELECT access_plan_items.resource_type,
              access_plan_items.resource_id,
              access_plan_items.actions_json,
              access_plan_items.download_disposition
       FROM access_plans
       JOIN access_plan_items
         ON access_plan_items.access_plan_id = access_plans.id
       WHERE access_plans.id = ?1 AND access_plans.revision = ?2
         AND access_plans.state = 'active'
       ORDER BY access_plan_items.position`,
    )
    .bind(accessPlanId, revision)
    .all<AccessItemRow>();
  if (result.results.length === 0) {
    throw fulfillmentError(
      "COMMERCE_PRODUCT_DEFINITION_INVALID",
      "The product has no frozen access definition.",
    );
  }
  return Object.freeze(result.results);
}

async function readCreditAccount(
  binding: D1Database,
  customerUserId: string,
  creditKind: "download" | "license",
): Promise<CreditAccountRow | null> {
  const row = await binding
    .prepare(
      `SELECT credit_accounts.id, credit_accounts.available_balance,
              credit_accounts.reserved_balance,
              credit_accounts.consumed_balance, credit_accounts.revision,
              COALESCE(SUM(credit_grant_lots.quantity_available), 0)
                AS lot_available,
              COALESCE(SUM(credit_grant_lots.quantity_reserved), 0)
                AS lot_reserved,
              COALESCE(SUM(credit_grant_lots.quantity_consumed), 0)
                AS lot_consumed
       FROM credit_accounts
       LEFT JOIN credit_grant_lots
         ON credit_grant_lots.credit_account_id = credit_accounts.id
       WHERE credit_accounts.customer_user_id = ?1
         AND credit_accounts.credit_kind = ?2
         AND credit_accounts.stripe_environment = 'test'
         AND credit_accounts.livemode = 0
       GROUP BY credit_accounts.id
       LIMIT 1`,
    )
    .bind(customerUserId, creditKind)
    .first<CreditAccountRow>();
  if (
    row &&
    (row.available_balance !== row.lot_available ||
      row.reserved_balance !== row.lot_reserved ||
      row.consumed_balance !== row.lot_consumed)
  ) {
    throw integrity("A credit account does not reconcile to its grant lots.");
  }
  return row;
}

async function planCreditGrant(
  binding: D1Database,
  input: {
    readonly customerUserId: string;
    readonly creditKind: "download" | "license";
    readonly quantity: number;
    readonly originType: CreditGrantPlan["originType"];
    readonly originId: string;
  },
): Promise<CreditGrantPlan> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw integrity("A commerce credit grant quantity is invalid.");
  }
  const account = await readCreditAccount(
    binding,
    input.customerUserId,
    input.creditKind,
  );
  return Object.freeze({
    accountId: account?.id ?? `credit_account_${crypto.randomUUID()}`,
    accountExists: account !== null,
    accountRevision: account?.revision ?? 0,
    creditKind: input.creditKind,
    quantity: input.quantity,
    availableBefore: account?.available_balance ?? 0,
    reservedBefore: account?.reserved_balance ?? 0,
    consumedBefore: account?.consumed_balance ?? 0,
    lotId: `credit_lot_${crypto.randomUUID()}`,
    ledgerId: `credit_entry_${crypto.randomUUID()}`,
    originType: input.originType,
    originId: input.originId,
  });
}

function creditGrantStatements(
  binding: D1Database,
  input: {
    readonly plan: CreditGrantPlan;
    readonly customerUserId: string;
    readonly fulfillmentEventId: string;
    readonly operationKey: string;
    readonly conditionSql: string;
    readonly conditionBindings: readonly (number | string)[];
    readonly expiresAt: string | null;
  },
): readonly D1PreparedStatement[] {
  const afterAvailable = input.plan.availableBefore + input.plan.quantity;
  const account = input.plan.accountExists
    ? binding
        .prepare(
          `UPDATE credit_accounts
           SET available_balance = ?, revision = revision + 1,
               last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
             AND revision = ? AND available_balance = ?
             AND reserved_balance = ? AND consumed_balance = ?
             AND stripe_environment = 'test' AND livemode = 0
             AND (${input.conditionSql})`,
        )
        .bind(
          afterAvailable,
          input.operationKey,
          input.plan.accountId,
          input.customerUserId,
          input.plan.creditKind,
          input.plan.accountRevision,
          input.plan.availableBefore,
          input.plan.reservedBefore,
          input.plan.consumedBefore,
          ...input.conditionBindings,
        )
    : binding
        .prepare(
          `INSERT INTO credit_accounts
            (id, customer_user_id, credit_kind, available_balance,
             reserved_balance, consumed_balance, stripe_environment,
             livemode, revision, last_operation_key)
           SELECT ?, ?, ?, ?, 0, 0, 'test', 0, 1, ?
           WHERE (${input.conditionSql})
             AND NOT EXISTS (
               SELECT 1 FROM credit_accounts
               WHERE customer_user_id = ? AND credit_kind = ?
             )`,
        )
        .bind(
          input.plan.accountId,
          input.customerUserId,
          input.plan.creditKind,
          afterAvailable,
          input.operationKey,
          ...input.conditionBindings,
          input.customerUserId,
          input.plan.creditKind,
        );
  const expectedRevision = input.plan.accountExists
    ? input.plan.accountRevision + 1
    : 1;
  const exactAccount = `EXISTS (
    SELECT 1 FROM credit_accounts
    WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
      AND revision = ? AND available_balance = ?
      AND reserved_balance = ? AND consumed_balance = ?
      AND last_operation_key = ?
      AND stripe_environment = 'test' AND livemode = 0
  )`;
  const exactBindings: readonly (number | string)[] = [
    input.plan.accountId,
    input.customerUserId,
    input.plan.creditKind,
    expectedRevision,
    afterAvailable,
    input.plan.reservedBefore,
    input.plan.consumedBefore,
    input.operationKey,
  ];
  const lot = binding
    .prepare(
      `INSERT INTO credit_grant_lots
        (id, credit_account_id, customer_user_id, credit_kind, origin_type,
         origin_id, quantity_granted, quantity_available,
         quantity_reserved, quantity_consumed, quantity_expired,
         quantity_reversed, state, expires_at, fulfillment_event_id,
         stripe_environment, livemode, revision, last_operation_key)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'active', ?, ?,
              'test', 0, 1, ?
       WHERE ${exactAccount}
         AND (${input.conditionSql})`,
    )
    .bind(
      input.plan.lotId,
      input.plan.accountId,
      input.customerUserId,
      input.plan.creditKind,
      input.plan.originType,
      input.plan.originId,
      input.plan.quantity,
      input.plan.quantity,
      input.expiresAt,
      input.fulfillmentEventId,
      input.operationKey,
      ...exactBindings,
      ...input.conditionBindings,
    );
  const ledger = binding
    .prepare(
      `INSERT INTO credit_ledger_entries
        (id, credit_account_id, customer_user_id, credit_kind,
         credit_grant_lot_id, credit_reservation_id, entry_type,
         available_delta, reserved_delta, consumed_delta, available_after,
         reserved_after, consumed_after, origin_type, origin_id,
         fulfillment_event_id, stripe_environment, livemode, idempotency_key)
       SELECT ?, ?, ?, ?, ?, NULL, 'grant', ?, 0, 0, ?, ?, ?, ?, ?, ?,
              'test', 0, ?
       WHERE ${exactAccount}
         AND EXISTS (
           SELECT 1 FROM credit_grant_lots
           WHERE id = ? AND credit_account_id = ?
             AND quantity_granted = ? AND quantity_available = ?
             AND fulfillment_event_id = ?
         )
         AND (${input.conditionSql})`,
    )
    .bind(
      input.plan.ledgerId,
      input.plan.accountId,
      input.customerUserId,
      input.plan.creditKind,
      input.plan.lotId,
      input.plan.quantity,
      afterAvailable,
      input.plan.reservedBefore,
      input.plan.consumedBefore,
      input.plan.originType,
      input.plan.originId,
      input.fulfillmentEventId,
      input.operationKey,
      ...exactBindings,
      input.plan.lotId,
      input.plan.accountId,
      input.plan.quantity,
      input.plan.quantity,
      input.fulfillmentEventId,
      ...input.conditionBindings,
    );
  return Object.freeze([account, lot, ledger]);
}

function creditGrantExact(
  plan: CreditGrantPlan,
  customerUserId: string,
  fulfillmentEventId: string,
  operationKey: string,
): { readonly sql: string; readonly bindings: readonly (number | string)[] } {
  return {
    sql: `EXISTS (
      SELECT 1 FROM credit_grant_lots
      WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
        AND credit_kind = ? AND origin_type = ? AND origin_id = ?
        AND quantity_granted = ? AND quantity_available = ?
        AND fulfillment_event_id = ? AND last_operation_key = ?
        AND stripe_environment = 'test' AND livemode = 0
    ) AND EXISTS (
      SELECT 1 FROM credit_ledger_entries
      WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
        AND entry_type = 'grant' AND available_delta = ?
        AND fulfillment_event_id = ? AND idempotency_key = ?
        AND stripe_environment = 'test' AND livemode = 0
    )`,
    bindings: [
      plan.lotId,
      plan.accountId,
      customerUserId,
      plan.creditKind,
      plan.originType,
      plan.originId,
      plan.quantity,
      plan.quantity,
      fulfillmentEventId,
      operationKey,
      plan.ledgerId,
      plan.accountId,
      customerUserId,
      plan.quantity,
      fulfillmentEventId,
      operationKey,
    ],
  };
}

async function directAccessPlan(
  binding: D1Database,
  input: {
    readonly product: ActiveCommerceProduct;
    readonly checkout: StoredCheckoutSession;
    readonly orderId: string;
    readonly fulfillmentEventId: string;
    readonly operationKey: string;
    readonly conditionSql: string;
    readonly conditionBindings: readonly (number | string)[];
  },
): Promise<DomainPlan> {
  if (!input.product.accessPlanId || !input.product.accessPlanRevision) {
    throw fulfillmentError(
      "COMMERCE_PRODUCT_DEFINITION_INVALID",
      "A direct-access product has no pinned access plan.",
    );
  }
  const items = await readAccessItems(
    binding,
    input.product.accessPlanId,
    input.product.accessPlanRevision,
  );
  const statements = items.map((item) =>
    binding
      .prepare(
        `INSERT INTO entitlements
          (id, user_id, source_type, source_id, grant_id, resource_type,
           resource_id, actions_json, state, starts_at, expires_at,
           remaining_uses, download_disposition, stripe_environment,
           livemode, fulfillment_event_id, credit_reservation_id, revision,
           last_operation_key)
         SELECT ?, ?, 'order', ?, NULL, ?, ?, ?, 'active', NULL, NULL,
                NULL, ?, 'test', 0, ?, NULL, 1, ?
         WHERE (${input.conditionSql})`,
      )
      .bind(
        `entitlement_order_${crypto.randomUUID()}`,
        input.checkout.customerUserId,
        input.orderId,
        item.resource_type,
        item.resource_id,
        item.actions_json,
        item.download_disposition,
        input.fulfillmentEventId,
        input.operationKey,
        ...input.conditionBindings,
      ),
  );
  return Object.freeze({
    kind: "direct-access",
    resultType: "direct-access",
    statements: Object.freeze(statements),
    exactSql: `(SELECT COUNT(*) FROM entitlements
      WHERE source_type = 'order' AND source_id = ? AND user_id = ?
        AND state = 'active' AND fulfillment_event_id = ?
        AND stripe_environment = 'test' AND livemode = 0) = ?`,
    exactBindings: [
      input.orderId,
      input.checkout.customerUserId,
      input.fulfillmentEventId,
      items.length,
    ],
    result: Object.freeze({ entitlementCount: items.length }),
  });
}

async function creditProductPlan(
  binding: D1Database,
  input: {
    readonly product: ActiveCommerceProduct;
    readonly checkout: StoredCheckoutSession;
    readonly orderId: string;
    readonly fulfillmentEventId: string;
    readonly operationKey: string;
    readonly conditionSql: string;
    readonly conditionBindings: readonly (number | string)[];
  },
): Promise<DomainPlan> {
  if (!input.product.creditKind || !input.product.creditQuantity) {
    throw fulfillmentError(
      "COMMERCE_PRODUCT_DEFINITION_INVALID",
      "A credit product has no exact benefit definition.",
    );
  }
  const plan = await planCreditGrant(binding, {
    customerUserId: input.checkout.customerUserId,
    creditKind: input.product.creditKind,
    quantity: input.product.creditQuantity,
    originType: "order",
    originId: input.orderId,
  });
  const exact = creditGrantExact(
    plan,
    input.checkout.customerUserId,
    input.fulfillmentEventId,
    input.operationKey,
  );
  return Object.freeze({
    kind: "credit-grant",
    resultType: "credit-grant",
    statements: creditGrantStatements(binding, {
      plan,
      customerUserId: input.checkout.customerUserId,
      fulfillmentEventId: input.fulfillmentEventId,
      operationKey: input.operationKey,
      conditionSql: input.conditionSql,
      conditionBindings: input.conditionBindings,
      expiresAt: null,
    }),
    exactSql: exact.sql,
    exactBindings: exact.bindings,
    result: Object.freeze({
      creditKind: plan.creditKind,
      creditQuantity: plan.quantity,
      creditAccountId: plan.accountId,
      creditLedgerEntryId: plan.ledgerId,
    }),
  });
}

async function membershipProductPlan(
  binding: D1Database,
  input: {
    readonly product: ActiveCommerceProduct;
    readonly checkout: StoredCheckoutSession;
    readonly orderId: string;
    readonly fulfillmentEventId: string;
    readonly operationKey: string;
    readonly processedAt: string;
    readonly conditionSql: string;
    readonly conditionBindings: readonly (number | string)[];
  },
): Promise<DomainPlan> {
  if (
    !input.product.membershipPlanId ||
    !input.product.membershipPlanRevisionId ||
    !input.product.membershipPlanRevision
  ) {
    throw fulfillmentError(
      "COMMERCE_PRODUCT_DEFINITION_INVALID",
      "A membership product has no frozen membership definition.",
    );
  }
  const revision = await binding
    .prepare(
      `SELECT id, membership_plan_id, revision, access_plan_id,
              access_plan_revision, download_credits, license_credits,
              duration_days
       FROM membership_plan_revisions
       WHERE id = ?1 AND membership_plan_id = ?2 AND revision = ?3
       LIMIT 1`,
    )
    .bind(
      input.product.membershipPlanRevisionId,
      input.product.membershipPlanId,
      input.product.membershipPlanRevision,
    )
    .first<MembershipRevisionRow>();
  if (!revision || !revision.duration_days) {
    throw fulfillmentError(
      "COMMERCE_PRODUCT_DEFINITION_INVALID",
      "A one-time membership needs a positive frozen duration.",
    );
  }
  const items =
    revision.access_plan_id && revision.access_plan_revision
      ? await readAccessItems(
          binding,
          revision.access_plan_id,
          revision.access_plan_revision,
        )
      : Object.freeze([]);
  const membershipId = `membership_${crypto.randomUUID()}`;
  const periodEnd = addDays(input.processedAt, revision.duration_days);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO memberships
          (id, customer_user_id, membership_plan_id,
           membership_plan_revision_id, membership_plan_revision, source,
           source_order_id, source_fulfillment_event_id, state, starts_at,
           current_period_start, current_period_end, stripe_environment,
           livemode, revision, last_operation_key)
         SELECT ?, ?, ?, ?, ?, 'stripe_test', ?, ?, 'active', ?, ?, ?,
                'test', 0, 1, ?
         WHERE (${input.conditionSql})
           AND NOT EXISTS (
             SELECT 1 FROM memberships
             WHERE customer_user_id = ? AND membership_plan_id = ?
               AND state IN
                 ('pending','active','paused','cancellation_scheduled')
           )`,
      )
      .bind(
        membershipId,
        input.checkout.customerUserId,
        revision.membership_plan_id,
        revision.id,
        revision.revision,
        input.orderId,
        input.fulfillmentEventId,
        input.processedAt,
        input.processedAt,
        periodEnd,
        input.operationKey,
        ...input.conditionBindings,
        input.checkout.customerUserId,
        revision.membership_plan_id,
      ),
  ];
  for (const item of items) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO entitlements
            (id, user_id, source_type, source_id, grant_id, resource_type,
             resource_id, actions_json, state, starts_at, expires_at,
             remaining_uses, download_disposition, stripe_environment,
             livemode, fulfillment_event_id, credit_reservation_id,
             revision, last_operation_key)
           SELECT ?, ?, 'membership', ?, NULL, ?, ?, ?, 'active', ?, ?,
                  NULL, ?, 'test', 0, ?, NULL, 1, ?
           WHERE EXISTS (
             SELECT 1 FROM memberships
             WHERE id = ? AND state = 'active' AND last_operation_key = ?
           ) AND (${input.conditionSql})`,
        )
        .bind(
          `entitlement_membership_${crypto.randomUUID()}`,
          input.checkout.customerUserId,
          membershipId,
          item.resource_type,
          item.resource_id,
          item.actions_json,
          input.processedAt,
          periodEnd,
          item.download_disposition,
          input.fulfillmentEventId,
          input.operationKey,
          membershipId,
          input.operationKey,
          ...input.conditionBindings,
        ),
    );
  }
  const creditPlans: CreditGrantPlan[] = [];
  for (const [creditKind, quantity] of [
    ["download", revision.download_credits],
    ["license", revision.license_credits],
  ] as const) {
    if (quantity <= 0) continue;
    const plan = await planCreditGrant(binding, {
      customerUserId: input.checkout.customerUserId,
      creditKind,
      quantity,
      originType: "membership",
      originId: membershipId,
    });
    creditPlans.push(plan);
    statements.push(
      ...creditGrantStatements(binding, {
        plan,
        customerUserId: input.checkout.customerUserId,
        fulfillmentEventId: input.fulfillmentEventId,
        operationKey: `${input.operationKey}:${creditKind}`,
        conditionSql: `EXISTS (
          SELECT 1 FROM memberships
          WHERE id = ? AND state = 'active' AND last_operation_key = ?
        ) AND (${input.conditionSql})`,
        conditionBindings: [
          membershipId,
          input.operationKey,
          ...input.conditionBindings,
        ],
        expiresAt: periodEnd,
      }),
    );
  }
  const exactParts = [
    `EXISTS (
      SELECT 1 FROM memberships
      WHERE id = ? AND customer_user_id = ? AND state = 'active'
        AND source = 'stripe_test' AND source_order_id = ?
        AND source_fulfillment_event_id = ? AND last_operation_key = ?
        AND stripe_environment = 'test' AND livemode = 0
    )`,
    `(SELECT COUNT(*) FROM entitlements
      WHERE source_type = 'membership' AND source_id = ? AND user_id = ?
        AND state = 'active' AND fulfillment_event_id = ?) = ?`,
  ];
  const exactBindings: (number | string)[] = [
    membershipId,
    input.checkout.customerUserId,
    input.orderId,
    input.fulfillmentEventId,
    input.operationKey,
    membershipId,
    input.checkout.customerUserId,
    input.fulfillmentEventId,
    items.length,
  ];
  creditPlans.forEach((plan) => {
    const exact = creditGrantExact(
      plan,
      input.checkout.customerUserId,
      input.fulfillmentEventId,
      `${input.operationKey}:${plan.creditKind}`,
    );
    exactParts.push(exact.sql);
    exactBindings.push(...exact.bindings);
  });
  return Object.freeze({
    kind: "membership",
    resultType: "membership",
    statements: Object.freeze(statements),
    exactSql: exactParts.join(" AND "),
    exactBindings: Object.freeze(exactBindings),
    result: Object.freeze({
      membershipId,
      entitlementCount: items.length,
      downloadCreditsGranted: revision.download_credits,
      licenseCreditsGranted: revision.license_credits,
      currentPeriodEnd: periodEnd,
    }),
  });
}

async function domainPlan(
  binding: D1Database,
  input: {
    readonly product: ActiveCommerceProduct;
    readonly checkout: StoredCheckoutSession;
    readonly orderId: string;
    readonly fulfillmentEventId: string;
    readonly operationKey: string;
    readonly processedAt: string;
    readonly conditionSql: string;
    readonly conditionBindings: readonly (number | string)[];
  },
): Promise<DomainPlan> {
  if (
    input.product.productType === "track" ||
    input.product.productType === "release" ||
    input.product.productType === "collection"
  ) {
    return directAccessPlan(binding, input);
  }
  if (
    input.product.productType === "download-credits" ||
    input.product.productType === "license-credits"
  ) {
    return creditProductPlan(binding, input);
  }
  if (input.product.productType === "membership") {
    return membershipProductPlan(binding, input);
  }
  throw fulfillmentError(
    "COMMERCE_FULFILLMENT_UNSUPPORTED",
    `The ${input.product.productType} fulfillment path is not ready.`,
    "That test product cannot be fulfilled yet.",
  );
}

async function processIgnoredCheckout(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
  checkout: StoredCheckoutSession,
  resultType: CommerceFulfillmentReceipt["resultType"],
  checkoutStatus: "open" | "expired" | "failed" | "completed",
  alreadyFulfilledOrder: ExistingOrderRow | null = null,
): Promise<CommerceFulfillmentReceipt> {
  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const operationKey = `commerce.webhook:${input.event.stripeEventId}`;
  const result: CommerceFulfillmentReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId,
    checkoutId: checkout.id,
    status: "ignored",
    orderId: alreadyFulfilledOrder?.id ?? null,
    fulfillmentEventId: null,
    resultType,
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(binding, input, commerceEventId, checkout),
  ];
  if (checkoutStatus !== "open") {
    statements.push(
      binding
        .prepare(
          `UPDATE checkout_sessions
           SET status = ?, stripe_customer_id = COALESCE(?, stripe_customer_id),
               stripe_subscription_id = COALESCE(?, stripe_subscription_id),
               completed_at = CASE
                 WHEN ? = 'completed' THEN COALESCE(completed_at, ?)
                 ELSE completed_at
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND stripe_checkout_session_id = ?
             AND status IN ('open','completed')
             AND stripe_environment = 'test' AND livemode = 0
             AND EXISTS (
               SELECT 1 FROM commerce_events
               WHERE id = ? AND status = 'processing'
             )`,
        )
        .bind(
          checkoutStatus,
          input.event.checkoutSession.stripeCustomerId,
          input.event.checkoutSession.stripeSubscriptionId,
          checkoutStatus,
          input.processedAt,
          checkout.id,
          input.event.checkoutSession.checkoutSessionId,
          commerceEventId,
        ),
    );
  }
  statements.push(
    binding
      .prepare(
        `UPDATE commerce_events
         SET status = 'ignored', processed_at = ?1
         WHERE id = ?2 AND status = 'processing'`,
      )
      .bind(input.processedAt, commerceEventId),
  );
  const requiredStatus =
    checkoutStatus === "open" ? checkout.status : checkoutStatus;
  const orderCondition = alreadyFulfilledOrder
    ? `EXISTS (
        SELECT 1 FROM orders
        WHERE id = ? AND checkout_session_id = ? AND status = 'fulfilled'
          AND stripe_environment = 'test' AND livemode = 0
      )`
    : `NOT EXISTS (
        SELECT 1 FROM orders WHERE checkout_session_id = ?
      )`;
  const orderBindings = alreadyFulfilledOrder
    ? [alreadyFulfilledOrder.id, checkout.id]
    : [checkout.id];
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND stripe_event_id = ? AND status = 'ignored'
          AND stripe_environment = 'test' AND livemode = 0
      ) AND EXISTS (
        SELECT 1 FROM checkout_sessions
        WHERE id = ? AND status = ?
      ) AND ${orderCondition}`,
      conditionBindings: [
        commerceEventId,
        input.event.stripeEventId,
        checkout.id,
        requiredStatus,
        ...orderBindings,
      ],
      action: "commerce.webhook.ignored",
      subjectId: commerceEventId,
      idempotencyKey: operationKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        eventType: input.event.stripeEventType,
        checkoutId: checkout.id,
        resultType,
        stripeEnvironment: "test",
        livemode: false,
      },
      result,
    }),
  );
  try {
    await runAtomicBatch(binding, statements);
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

async function readLicenseScaffold(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
): Promise<LicenseScaffoldRow | null> {
  return binding
    .prepare(
      `SELECT event.id AS commerce_event_id,
              event.status AS commerce_event_status,
              provider_order.id AS order_id,
              provider_order.status AS order_status,
              fulfillment.id AS fulfillment_event_id,
              fulfillment.status AS fulfillment_status,
              checkout.id AS checkout_session_id,
              provider_order.customer_user_id,
              item.commerce_product_id,
              item.commerce_price_id,
              fulfillment.provider_object_id,
              fulfillment.facts_fingerprint
       FROM commerce_events AS event
       JOIN checkout_sessions AS checkout
         ON checkout.id = event.checkout_session_id
       JOIN orders AS provider_order
         ON provider_order.commerce_event_id = event.id
        AND provider_order.checkout_session_id = checkout.id
       JOIN order_items AS item ON item.order_id = provider_order.id
       JOIN fulfillment_events AS fulfillment
         ON fulfillment.commerce_event_id = event.id
        AND fulfillment.order_id = provider_order.id
        AND fulfillment.checkout_session_id = checkout.id
       WHERE event.stripe_event_id = ?1
         AND item.product_type = 'license'
       LIMIT 1`,
    )
    .bind(input.event.stripeEventId)
    .first<LicenseScaffoldRow>();
}

function validateLicenseScaffold(
  row: LicenseScaffoldRow,
  input: ProcessCheckoutEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): void {
  const phaseValid =
    (row.commerce_event_status === "processing" &&
      row.order_status === "pending" &&
      row.fulfillment_status === "processing") ||
    (row.commerce_event_status === "completed" &&
      row.order_status === "fulfilled" &&
      row.fulfillment_status === "fulfilled");
  if (
    !phaseValid ||
    row.checkout_session_id !== checkout.id ||
    row.customer_user_id !== checkout.customerUserId ||
    row.commerce_product_id !== product.id ||
    row.commerce_price_id !== product.priceId ||
    row.provider_object_id !== input.event.checkoutSession.checkoutSessionId ||
    row.facts_fingerprint !== input.factsFingerprint
  ) {
    throw fulfillmentError(
      "STRIPE_EVENT_REPLAY_CONFLICT",
      "A Stripe license event scaffold does not match its verified facts.",
    );
  }
}

async function createLicenseScaffold(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): Promise<LicenseScaffoldRow> {
  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const orderId = `order_${crypto.randomUUID()}`;
  const orderItemId = `order_item_${crypto.randomUUID()}`;
  const fulfillmentEventId = `fulfillment_${crypto.randomUUID()}`;
  const scaffoldKey = `commerce.webhook.scaffold:${input.event.stripeEventId}`;
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(binding, input, commerceEventId, checkout),
    binding
      .prepare(
        `UPDATE checkout_sessions
         SET status = 'completed',
             stripe_customer_id = COALESCE(?, stripe_customer_id),
             completed_at = COALESCE(completed_at, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'open' AND stripe_checkout_session_id = ?
           AND license_request_id IS NOT NULL
           AND amount_minor = ? AND currency = ?
           AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM commerce_events
             WHERE id = ? AND status = 'processing'
           )`,
      )
      .bind(
        input.event.checkoutSession.stripeCustomerId,
        input.processedAt,
        checkout.id,
        input.event.checkoutSession.checkoutSessionId,
        checkout.amountMinor,
        checkout.currency,
        commerceEventId,
      ),
    binding
      .prepare(
        `INSERT INTO orders
          (id, customer_user_id, checkout_session_id, commerce_event_id,
           status, total_minor, currency, stripe_environment, livemode)
         SELECT ?, ?, ?, ?, 'pending', ?, ?, 'test', 0
         WHERE EXISTS (
           SELECT 1 FROM commerce_events
           WHERE id = ? AND status = 'processing'
         ) AND EXISTS (
           SELECT 1 FROM checkout_sessions
           WHERE id = ? AND status = 'completed'
             AND license_request_id IS NOT NULL
         )`,
      )
      .bind(
        orderId,
        checkout.customerUserId,
        checkout.id,
        commerceEventId,
        checkout.amountMinor,
        checkout.currency,
        commerceEventId,
        checkout.id,
      ),
    binding
      .prepare(
        `INSERT INTO order_items
          (id, order_id, commerce_product_id, commerce_product_revision,
           commerce_price_id, product_type, product_name,
           fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
           stripe_environment, livemode)
         SELECT ?, ?, ?, ?, ?, 'license', ?, ?, 1, ?, ?, 'test', 0
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
        checkout.amountMinor,
        checkout.currency,
        orderId,
      ),
    binding
      .prepare(
        `INSERT INTO fulfillment_events
          (id, commerce_event_id, checkout_session_id, order_id,
           customer_user_id, commerce_product_id, kind, provider_object_id,
           facts_fingerprint, status, result_json, stripe_environment,
           livemode)
         SELECT ?, ?, ?, ?, ?, ?, 'one_time', ?, ?, 'processing', '{}',
                'test', 0
         WHERE EXISTS (
           SELECT 1 FROM orders WHERE id = ? AND status = 'pending'
         ) AND EXISTS (
           SELECT 1 FROM order_items
           WHERE id = ? AND order_id = ? AND product_type = 'license'
         )`,
      )
      .bind(
        fulfillmentEventId,
        commerceEventId,
        checkout.id,
        orderId,
        checkout.customerUserId,
        product.id,
        input.event.checkoutSession.checkoutSessionId,
        input.factsFingerprint,
        orderId,
        orderItemId,
        orderId,
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
        SELECT 1 FROM orders
        WHERE id = ? AND checkout_session_id = ? AND status = 'pending'
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
        checkout.id,
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
        checkoutId: checkout.id,
        productId: product.id,
        productType: "license",
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
        "The license fulfillment scaffold was not created exactly once.",
      );
    }
  } catch (error) {
    const current = await readLicenseScaffold(binding, input);
    if (!current) throw error;
  }
  const scaffold = await readLicenseScaffold(binding, input);
  if (!scaffold)
    throw integrity("The license fulfillment scaffold is unavailable.");
  validateLicenseScaffold(scaffold, input, checkout, product);
  return scaffold;
}

async function finalizeLicenseScaffold(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
  scaffold: LicenseScaffoldRow,
): Promise<CommerceFulfillmentReceipt> {
  const issuance = await issueLicenseFromVerifiedStripeTestFulfillment(
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
      stripeObjectId: input.event.checkoutSession.checkoutSessionId,
      fulfillmentProviderObjectId:
        input.event.checkoutSession.checkoutSessionId,
      providerEventCreatedAt: eventTime(input.event.createdAtUnix),
      requestId: input.requestId,
    },
  );
  const operationKey = `commerce.webhook:${input.event.stripeEventId}`;
  const result: CommerceFulfillmentReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId: scaffold.commerce_event_id,
    checkoutId: checkout.id,
    status: "fulfilled",
    orderId: scaffold.order_id,
    fulfillmentEventId: scaffold.fulfillment_event_id,
    resultType: "license",
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
           AND status = 'processing' AND facts_fingerprint = ?
           AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM issued_licenses
             WHERE id = ? AND customer_user_id = ? AND order_id = ?
               AND fulfillment_event_id = ? AND source = 'stripe_test_order'
               AND state = 'active' AND stripe_environment = 'test'
               AND livemode = 0
           )`,
      )
      .bind(
        JSON.stringify(issuance.value),
        input.processedAt,
        scaffold.fulfillment_event_id,
        scaffold.commerce_event_id,
        scaffold.order_id,
        checkout.customerUserId,
        product.id,
        input.factsFingerprint,
        issuance.value.issuedLicenseId,
        checkout.customerUserId,
        scaffold.order_id,
        scaffold.fulfillment_event_id,
      ),
    binding
      .prepare(
        `UPDATE orders
         SET status = 'fulfilled', completed_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND checkout_session_id = ? AND status = 'pending'
           AND EXISTS (
             SELECT 1 FROM fulfillment_events
             WHERE id = ? AND status = 'fulfilled'
           )`,
      )
      .bind(
        input.processedAt,
        scaffold.order_id,
        checkout.id,
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
        SELECT 1 FROM issued_licenses
        WHERE id = ? AND order_id = ? AND fulfillment_event_id = ?
          AND source = 'stripe_test_order' AND state = 'active'
          AND stripe_environment = 'test' AND livemode = 0
      )`,
      conditionBindings: [
        scaffold.commerce_event_id,
        scaffold.order_id,
        scaffold.fulfillment_event_id,
        issuance.value.issuedLicenseId,
        scaffold.order_id,
        scaffold.fulfillment_event_id,
      ],
      action: "commerce.webhook.fulfilled",
      subjectId: scaffold.commerce_event_id,
      idempotencyKey: operationKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        checkoutId: checkout.id,
        orderId: scaffold.order_id,
        productId: product.id,
        productType: "license",
        issuedLicenseId: issuance.value.issuedLicenseId,
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
        "The verified license fulfillment did not finalize exactly once.",
      );
    }
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

async function processLicenseCheckout(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): Promise<CommerceFulfillmentReceipt> {
  let scaffold = await readLicenseScaffold(binding, input);
  if (scaffold) {
    validateLicenseScaffold(scaffold, input, checkout, product);
    if (scaffold.commerce_event_status === "completed") {
      const replay = await existingReceipt(binding, input);
      if (replay) return replay;
      throw integrity("A completed license fulfillment has no receipt.");
    }
  } else {
    const existingOrder = await binding
      .prepare(
        "SELECT id, status FROM orders WHERE checkout_session_id = ?1 LIMIT 1",
      )
      .bind(checkout.id)
      .first<ExistingOrderRow>();
    if (existingOrder) {
      if (existingOrder.status !== "fulfilled") {
        throw integrity(
          "An existing license order is not in a terminal fulfilled state.",
        );
      }
      return processIgnoredCheckout(
        binding,
        input,
        checkout,
        "already-fulfilled",
        "completed",
        existingOrder,
      );
    }
    scaffold = await createLicenseScaffold(binding, input, checkout, product);
  }
  return finalizeLicenseScaffold(binding, input, checkout, product, scaffold);
}

async function processPaidCheckout(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
  checkout: StoredCheckoutSession,
  product: ActiveCommerceProduct,
): Promise<CommerceFulfillmentReceipt> {
  const existingOrder = await binding
    .prepare(
      "SELECT id, status FROM orders WHERE checkout_session_id = ?1 LIMIT 1",
    )
    .bind(checkout.id)
    .first<ExistingOrderRow>();
  if (existingOrder) {
    if (existingOrder.status !== "fulfilled") {
      throw integrity(
        "An existing checkout order is not in a terminal fulfilled state.",
      );
    }
    return processIgnoredCheckout(
      binding,
      input,
      checkout,
      "already-fulfilled",
      "completed",
      existingOrder,
    );
  }

  const commerceEventId = `commerce_event_${crypto.randomUUID()}`;
  const orderId = `order_${crypto.randomUUID()}`;
  const orderItemId = `order_item_${crypto.randomUUID()}`;
  const fulfillmentEventId = `fulfillment_${crypto.randomUUID()}`;
  const operationKey = `commerce.webhook:${input.event.stripeEventId}`;
  const baseCondition = `EXISTS (
    SELECT 1 FROM commerce_events
    WHERE id = ? AND stripe_event_id = ? AND status = 'processing'
      AND stripe_environment = 'test' AND livemode = 0
  ) AND EXISTS (
    SELECT 1 FROM orders
    WHERE id = ? AND checkout_session_id = ? AND status = 'pending'
      AND stripe_environment = 'test' AND livemode = 0
  ) AND EXISTS (
    SELECT 1 FROM fulfillment_events
    WHERE id = ? AND commerce_event_id = ? AND order_id = ?
      AND status = 'processing' AND customer_user_id = ?
      AND stripe_environment = 'test' AND livemode = 0
  )`;
  const baseBindings: readonly string[] = [
    commerceEventId,
    input.event.stripeEventId,
    orderId,
    checkout.id,
    fulfillmentEventId,
    commerceEventId,
    orderId,
    checkout.customerUserId,
  ];
  const plan = await domainPlan(binding, {
    product,
    checkout,
    orderId,
    fulfillmentEventId,
    operationKey,
    processedAt: input.processedAt,
    conditionSql: baseCondition,
    conditionBindings: baseBindings,
  });
  const result: CommerceFulfillmentReceipt = Object.freeze({
    stripeEventId: input.event.stripeEventId,
    commerceEventId,
    checkoutId: checkout.id,
    status: "fulfilled",
    orderId,
    fulfillmentEventId,
    resultType: plan.resultType,
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const snapshot = productSnapshot(product);
  const statements: D1PreparedStatement[] = [
    prepareCommerceEvent(binding, input, commerceEventId, checkout),
    binding
      .prepare(
        `UPDATE checkout_sessions
         SET status = 'completed',
             stripe_customer_id = COALESCE(?, stripe_customer_id),
             stripe_subscription_id = COALESCE(?, stripe_subscription_id),
             completed_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'open' AND stripe_checkout_session_id = ?
           AND amount_minor = ? AND currency = ?
           AND stripe_environment = 'test' AND livemode = 0
           AND EXISTS (
             SELECT 1 FROM commerce_events
             WHERE id = ? AND status = 'processing'
           )`,
      )
      .bind(
        input.event.checkoutSession.stripeCustomerId,
        input.event.checkoutSession.stripeSubscriptionId,
        input.processedAt,
        checkout.id,
        input.event.checkoutSession.checkoutSessionId,
        checkout.amountMinor,
        checkout.currency,
        commerceEventId,
      ),
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
         ) AND EXISTS (
           SELECT 1 FROM checkout_sessions
           WHERE id = ? AND status = 'completed'
         )`,
      )
      .bind(
        orderId,
        checkout.customerUserId,
        checkout.id,
        commerceEventId,
        checkout.amountMinor,
        checkout.currency,
        input.event.checkoutSession.stripeSubscriptionId,
        commerceEventId,
        checkout.id,
      ),
    binding
      .prepare(
        `INSERT INTO order_items
          (id, order_id, commerce_product_id, commerce_product_revision,
           commerce_price_id, product_type, product_name,
           fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
           stripe_environment, livemode)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'test', 0
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
        product.productType,
        product.name,
        snapshot,
        checkout.amountMinor,
        checkout.currency,
        orderId,
      ),
    binding
      .prepare(
        `INSERT INTO fulfillment_events
          (id, commerce_event_id, checkout_session_id, order_id,
           customer_user_id, commerce_product_id, kind, provider_object_id,
           facts_fingerprint, status, result_json, stripe_environment,
           livemode)
         SELECT ?, ?, ?, ?, ?, ?, 'one_time', ?, ?, 'processing', '{}',
                'test', 0
         WHERE EXISTS (
           SELECT 1 FROM orders WHERE id = ? AND status = 'pending'
         ) AND EXISTS (
           SELECT 1 FROM order_items WHERE id = ? AND order_id = ?
         )`,
      )
      .bind(
        fulfillmentEventId,
        commerceEventId,
        checkout.id,
        orderId,
        checkout.customerUserId,
        product.id,
        input.event.checkoutSession.checkoutSessionId,
        input.factsFingerprint,
        orderId,
        orderItemId,
        orderId,
      ),
    ...plan.statements,
    binding
      .prepare(
        `UPDATE fulfillment_events
         SET status = 'fulfilled', result_json = ?, completed_at = ?
         WHERE id = ? AND status = 'processing'
           AND (${plan.exactSql})`,
      )
      .bind(
        JSON.stringify(plan.result),
        input.processedAt,
        fulfillmentEventId,
        ...plan.exactBindings,
      ),
    binding
      .prepare(
        `UPDATE orders
         SET status = 'fulfilled', completed_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'
           AND EXISTS (
             SELECT 1 FROM fulfillment_events
             WHERE id = ? AND status = 'fulfilled'
           )`,
      )
      .bind(input.processedAt, orderId, fulfillmentEventId),
    binding
      .prepare(
        `UPDATE commerce_events
         SET status = 'completed', processed_at = ?
         WHERE id = ? AND status = 'processing'
           AND EXISTS (
             SELECT 1 FROM orders WHERE id = ? AND status = 'fulfilled'
           )`,
      )
      .bind(input.processedAt, commerceEventId, orderId),
  ];
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAudit(binding, {
      conditionSql: `EXISTS (
        SELECT 1 FROM commerce_events
        WHERE id = ? AND status = 'completed'
      ) AND EXISTS (
        SELECT 1 FROM checkout_sessions
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
      ) AND (${plan.exactSql})`,
      conditionBindings: [
        commerceEventId,
        checkout.id,
        orderId,
        fulfillmentEventId,
        ...plan.exactBindings,
      ],
      action: "commerce.webhook.fulfilled",
      subjectId: commerceEventId,
      idempotencyKey: operationKey,
      requestFingerprint: input.factsFingerprint,
      requestId: input.requestId,
      details: {
        checkoutId: checkout.id,
        orderId,
        productId: product.id,
        productType: product.productType,
        resultType: plan.resultType,
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
        "The fulfillment transaction did not reach its exact result.",
      );
    }
    return result;
  } catch (error) {
    const replay = await existingReceipt(binding, input);
    if (replay) return replay;
    throw error;
  }
}

/** Processes one already signature-verified Stripe Test Checkout event. */
export async function processVerifiedCheckoutEvent(
  binding: D1Database,
  input: ProcessCheckoutEventInput,
): Promise<CommerceFulfillmentReceipt> {
  requireInput(input);
  const replay = await existingReceipt(binding, input);
  if (replay) return replay;

  const facts = input.event.checkoutSession;
  const checkout = await readCheckoutSession(
    binding,
    facts.application.checkoutId,
  );
  if (!checkout) {
    throw fulfillmentError(
      "STRIPE_CHECKOUT_NOT_FOUND",
      "The verified event does not identify a stored checkout.",
    );
  }
  validateCheckoutFacts(checkout, facts);
  const product = await readStoredCommerceProduct(
    binding,
    checkout.commerceProductId,
    checkout.commercePriceId,
  );
  if (!product)
    throw integrity("The checkout product snapshot is unavailable.");

  if (input.event.stripeEventType === "checkout.session.expired") {
    return processIgnoredCheckout(
      binding,
      input,
      checkout,
      "checkout-expired",
      "expired",
    );
  }
  if (input.event.stripeEventType === "checkout.session.async_payment_failed") {
    return processIgnoredCheckout(
      binding,
      input,
      checkout,
      "checkout-failed",
      "failed",
    );
  }
  if (facts.status !== "complete" || facts.paymentStatus !== "paid") {
    return processIgnoredCheckout(
      binding,
      input,
      checkout,
      "payment-pending",
      "open",
    );
  }
  if (checkout.mode === "subscription") {
    return processIgnoredCheckout(
      binding,
      input,
      checkout,
      "awaiting-subscription-invoice",
      "completed",
    );
  }
  if (product.productType === "license") {
    return processLicenseCheckout(binding, input, checkout, product);
  }
  return processPaidCheckout(binding, input, checkout, product);
}
