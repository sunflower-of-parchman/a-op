import { env } from "cloudflare:workers";
import { runAtomicBatch } from "@/db/d1.ts";
import {
  readJsonMutation,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError, resolveSimulationMode } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

const SNAPSHOT_PREFIX = "m6-runtime-snapshot:";
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MODULE_KEYS = ["memberships", "subscriptions"] as const;
const COUNT_KEYS = [
  "users",
  "profiles",
  "roleAssignments",
  "artistModules",
  "tracks",
  "trackRevisions",
  "accessPlans",
  "accessPlanItems",
  "membershipPlans",
  "membershipPlanRevisions",
  "subscriptionPlans",
  "commerceProducts",
  "commercePrices",
  "checkoutSessions",
  "commerceEvents",
  "orders",
  "orderItems",
  "fulfillmentEvents",
  "memberships",
  "subscriptions",
  "subscriptionEvents",
  "creditAccounts",
  "creditGrantLots",
  "creditReservations",
  "creditReservationAllocations",
  "creditLedgerEntries",
  "entitlements",
  "auditEvents",
  "mediaObjects",
  "mediaDerivatives",
  "runtimeProofs",
] as const;

type D1Scalar = string | number | null;
type D1Row = Record<string, D1Scalar>;
type CountKey = (typeof COUNT_KEYS)[number];
type TableCounts = Readonly<Record<CountKey, number>>;

interface ModuleState {
  readonly module_key: (typeof MODULE_KEYS)[number];
  readonly active: number;
  readonly revision: number;
  readonly settings_json: string;
  readonly activated_at: string | null;
  readonly deactivated_at: string | null;
  readonly updated_by_user_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface RunFacts {
  readonly runId: string;
  readonly shortId: string;
  readonly ownerId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly customerDisplayName: string;
  readonly customerRoleId: string;
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly trackSlug: string;
  readonly trackTitle: string;
  readonly accessPlanId: string;
  readonly accessPlanItemId: string;
  readonly accessPlanSlug: string;
  readonly membershipPlanId: string;
  readonly membershipPlanRevisionId: string;
  readonly membershipPlanSlug: string;
  readonly membershipPlanName: string;
  readonly subscriptionPlanId: string;
  readonly subscriptionPlanSlug: string;
  readonly subscriptionPlanName: string;
  readonly commerceProductId: string;
  readonly commerceProductSlug: string;
  readonly commerceProductName: string;
  readonly commercePriceId: string;
  readonly stripePriceId: string;
  readonly checkoutId: string;
  readonly stripeCheckoutSessionId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly checkoutEventId: string;
  readonly invoiceEventId: string;
  readonly invoiceId: string;
  readonly liveEventId: string;
  readonly liveInvoiceId: string;
  readonly invalidSignatureEventId: string;
  readonly invalidSignatureInvoiceId: string;
  readonly amountMinor: number;
  readonly currency: "USD";
}

interface M6Snapshot {
  readonly version: 1;
  readonly run: RunFacts;
  readonly baselineCounts: TableCounts;
  readonly baselineModules: readonly ModuleState[];
}

interface OwnerRow {
  readonly id: string;
  readonly email: string;
  readonly display_name: string | null;
}

const RUN_STRING_KEYS = [
  "shortId",
  "ownerId",
  "ownerEmail",
  "ownerDisplayName",
  "customerId",
  "customerEmail",
  "customerDisplayName",
  "customerRoleId",
  "trackId",
  "trackRevisionId",
  "trackSlug",
  "trackTitle",
  "accessPlanId",
  "accessPlanItemId",
  "accessPlanSlug",
  "membershipPlanId",
  "membershipPlanRevisionId",
  "membershipPlanSlug",
  "membershipPlanName",
  "subscriptionPlanId",
  "subscriptionPlanSlug",
  "subscriptionPlanName",
  "commerceProductId",
  "commerceProductSlug",
  "commerceProductName",
  "commercePriceId",
  "stripePriceId",
  "checkoutId",
  "stripeCheckoutSessionId",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "checkoutEventId",
  "invoiceEventId",
  "invoiceId",
  "liveEventId",
  "liveInvoiceId",
  "invalidSignatureEventId",
  "invalidSignatureInvoiceId",
  "currency",
] as const;

function runtimeLabEnabled(): boolean {
  return resolveSimulationMode({
    AOP_RUNTIME_ENV: env.AOP_RUNTIME_ENV,
    AOP_SIMULATION_MODE: env.AOP_SIMULATION_MODE,
  }).enabled;
}

function runtimeError(
  code: string,
  message: string,
  status: number,
): RuntimeError {
  return new RuntimeError(code, message, {
    status,
    publicMessage: message,
  });
}

function unavailable(): never {
  throw runtimeError("NOT_FOUND", "The requested resource was not found.", 404);
}

function requireLab(): void {
  if (!runtimeLabEnabled()) unavailable();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
  return value;
}

function requireBeginInput(value: unknown): void {
  const input = requireExactObject(value, ["action"]);
  if (input.action !== "begin") {
    throw runtimeError("INVALID_INPUT", "Provide valid runtime input.", 400);
  }
}

function requireRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) {
    throw runtimeError("INVALID_INPUT", "Provide a valid runtime run ID.", 400);
  }
  return value;
}

function requireCleanupInput(value: unknown): string {
  const input = requireExactObject(value, ["runId"]);
  return requireRunId(input.runId);
}

function factsForRun(runId: string, owner: OwnerRow): RunFacts {
  const shortId = runId.replaceAll("-", "").slice(0, 12);
  return Object.freeze({
    runId,
    shortId,
    ownerId: owner.id,
    ownerEmail: owner.email,
    ownerDisplayName: owner.display_name ?? "Fictional Owner",
    customerId: `user_m6_customer_${shortId}`,
    customerEmail: `m6-customer-${shortId}@a-op.invalid`,
    customerDisplayName: `Fictional M6 Customer ${shortId}`,
    customerRoleId: `role_m6_customer_${shortId}`,
    trackId: `track_m6_${shortId}`,
    trackRevisionId: `track_revision_m6_${shortId}`,
    trackSlug: `runtime-commerce-track-${shortId}`,
    trackTitle: `Fictional commerce track ${shortId}`,
    accessPlanId: `access_plan_m6_${shortId}`,
    accessPlanItemId: `access_item_m6_${shortId}`,
    accessPlanSlug: `runtime-commerce-access-${shortId}`,
    membershipPlanId: `membership_plan_m6_${shortId}`,
    membershipPlanRevisionId: `membership_revision_m6_${shortId}`,
    membershipPlanSlug: `runtime-membership-${shortId}`,
    membershipPlanName: `Fictional membership ${shortId}`,
    subscriptionPlanId: `subscription_plan_m6_${shortId}`,
    subscriptionPlanSlug: `runtime-subscription-${shortId}`,
    subscriptionPlanName: `Fictional subscription ${shortId}`,
    commerceProductId: `commerce_product_m6_${shortId}`,
    commerceProductSlug: `runtime-test-subscription-${shortId}`,
    commerceProductName: `Fictional Test subscription ${shortId}`,
    commercePriceId: `commerce_price_m6_${shortId}`,
    stripePriceId: `price_M6${shortId}`,
    checkoutId: `checkout_m6_${shortId}`,
    stripeCheckoutSessionId: `cs_test_M6Checkout${shortId}`,
    stripeCustomerId: `cus_M6Customer${shortId}`,
    stripeSubscriptionId: `sub_M6Subscription${shortId}`,
    checkoutEventId: `evt_M6Checkout${shortId}`,
    invoiceEventId: `evt_M6Invoice${shortId}`,
    invoiceId: `in_M6Invoice${shortId}`,
    liveEventId: `evt_M6Live${shortId}`,
    liveInvoiceId: `in_M6Live${shortId}`,
    invalidSignatureEventId: `evt_M6Invalid${shortId}`,
    invalidSignatureInvoiceId: `in_M6Invalid${shortId}`,
    amountMinor: 900,
    currency: "USD",
  });
}

async function firstRow<T>(
  sql: string,
  bindings: readonly D1Scalar[] = [],
): Promise<T | null> {
  return env.DB.prepare(sql)
    .bind(...bindings)
    .first<T>();
}

async function currentOwner(): Promise<OwnerRow> {
  const owner = await firstRow<OwnerRow>(
    `SELECT users.id, users.email, profiles.display_name
     FROM users
     JOIN role_assignments
       ON role_assignments.user_id = users.id
      AND role_assignments.role_key = 'owner'
      AND role_assignments.revoked_at IS NULL
     LEFT JOIN profiles ON profiles.user_id = users.id
     WHERE users.status = 'active'
     ORDER BY CASE users.normalized_email
                WHEN 'owner@a-op.invalid' THEN 0 ELSE 1 END,
              users.id
     LIMIT 1`,
  );
  if (!owner) {
    throw runtimeError(
      "M6_RUNTIME_OWNER_REQUIRED",
      "The Milestone 6 runtime journey requires an active local owner.",
      409,
    );
  }
  return owner;
}

function countValue(row: D1Row, key: CountKey): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw runtimeError(
      "M6_RUNTIME_STATE_INVALID",
      "The Milestone 6 runtime state contains an invalid table count.",
      500,
    );
  }
  return value as number;
}

async function readTableCounts(): Promise<TableCounts> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM profiles) AS profiles,
       (SELECT COUNT(*) FROM role_assignments) AS roleAssignments,
       (SELECT COUNT(*) FROM artist_modules) AS artistModules,
       (SELECT COUNT(*) FROM tracks) AS tracks,
       (SELECT COUNT(*) FROM track_revisions) AS trackRevisions,
       (SELECT COUNT(*) FROM access_plans) AS accessPlans,
       (SELECT COUNT(*) FROM access_plan_items) AS accessPlanItems,
       (SELECT COUNT(*) FROM membership_plans) AS membershipPlans,
       (SELECT COUNT(*) FROM membership_plan_revisions) AS membershipPlanRevisions,
       (SELECT COUNT(*) FROM subscription_plans) AS subscriptionPlans,
       (SELECT COUNT(*) FROM commerce_products) AS commerceProducts,
       (SELECT COUNT(*) FROM commerce_prices) AS commercePrices,
       (SELECT COUNT(*) FROM checkout_sessions) AS checkoutSessions,
       (SELECT COUNT(*) FROM commerce_events) AS commerceEvents,
       (SELECT COUNT(*) FROM orders) AS orders,
       (SELECT COUNT(*) FROM order_items) AS orderItems,
       (SELECT COUNT(*) FROM fulfillment_events) AS fulfillmentEvents,
       (SELECT COUNT(*) FROM memberships) AS memberships,
       (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
       (SELECT COUNT(*) FROM subscription_events) AS subscriptionEvents,
       (SELECT COUNT(*) FROM credit_accounts) AS creditAccounts,
       (SELECT COUNT(*) FROM credit_grant_lots) AS creditGrantLots,
       (SELECT COUNT(*) FROM credit_reservations) AS creditReservations,
       (SELECT COUNT(*) FROM credit_reservation_allocations) AS creditReservationAllocations,
       (SELECT COUNT(*) FROM credit_ledger_entries) AS creditLedgerEntries,
       (SELECT COUNT(*) FROM entitlements) AS entitlements,
       (SELECT COUNT(*) FROM audit_events) AS auditEvents,
       (SELECT COUNT(*) FROM media_objects) AS mediaObjects,
       (SELECT COUNT(*) FROM media_derivatives) AS mediaDerivatives,
       (SELECT COUNT(*) FROM runtime_proofs) AS runtimeProofs`,
  );
  if (!row) {
    throw runtimeError(
      "M6_RUNTIME_STATE_INVALID",
      "The Milestone 6 runtime table counts are unavailable.",
      500,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      COUNT_KEYS.map((key) => [key, countValue(row, key)]),
    ) as Record<CountKey, number>,
  );
}

function validModuleState(value: unknown): value is ModuleState {
  return (
    isPlainRecord(value) &&
    MODULE_KEYS.includes(value.module_key as (typeof MODULE_KEYS)[number]) &&
    (value.active === 0 || value.active === 1) &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) > 0 &&
    typeof value.settings_json === "string" &&
    (value.activated_at === null || typeof value.activated_at === "string") &&
    (value.deactivated_at === null ||
      typeof value.deactivated_at === "string") &&
    (value.updated_by_user_id === null ||
      typeof value.updated_by_user_id === "string") &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

async function readModuleStates(): Promise<readonly ModuleState[]> {
  const result = await env.DB.prepare(
    `SELECT module_key, active, revision, settings_json, activated_at,
            deactivated_at, updated_by_user_id, created_at, updated_at
     FROM artist_modules
     WHERE module_key IN ('memberships', 'subscriptions')
     ORDER BY module_key`,
  ).all<ModuleState>();
  const rows = result.results;
  if (
    rows.length !== MODULE_KEYS.length ||
    rows.some((row) => !validModuleState(row))
  ) {
    throw runtimeError(
      "M6_RUNTIME_MODULE_STATE_INVALID",
      "The Milestone 6 module baseline is unavailable.",
      500,
    );
  }
  return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

function parseSnapshot(value: string): M6Snapshot {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw runtimeError(
      "M6_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 6 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  if (!isPlainRecord(candidate) || candidate.version !== 1) {
    throw runtimeError(
      "M6_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 6 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const run = candidate.run;
  const counts = candidate.baselineCounts;
  const modules = candidate.baselineModules;
  if (
    !isPlainRecord(run) ||
    !isPlainRecord(counts) ||
    !Array.isArray(modules) ||
    modules.length !== MODULE_KEYS.length ||
    modules.some((module) => !validModuleState(module)) ||
    RUN_STRING_KEYS.some((key) => typeof run[key] !== "string") ||
    run.currency !== "USD" ||
    !Number.isSafeInteger(run.amountMinor) ||
    (run.amountMinor as number) <= 0
  ) {
    throw runtimeError(
      "M6_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 6 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  const runId = requireRunId(run.runId);
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
      throw runtimeError(
        "M6_RUNTIME_SNAPSHOT_INVALID",
        "The Milestone 6 runtime cleanup snapshot is invalid.",
        500,
      );
    }
  }
  return Object.freeze({
    version: 1,
    run: Object.freeze({ ...(run as unknown as RunFacts), runId }),
    baselineCounts: Object.freeze(
      Object.fromEntries(COUNT_KEYS.map((key) => [key, counts[key]])) as Record<
        CountKey,
        number
      >,
    ),
    baselineModules: Object.freeze(
      modules.map((module) => Object.freeze({ ...module })) as ModuleState[],
    ),
  });
}

async function readSnapshot(runId: string): Promise<M6Snapshot> {
  const row = await firstRow<{ value: string }>(
    "SELECT value FROM runtime_proofs WHERE key = ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}${runId}`],
  );
  if (!row) unavailable();
  const snapshot = parseSnapshot(row.value);
  if (snapshot.run.runId !== runId) {
    throw runtimeError(
      "M6_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 6 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  return snapshot;
}

async function beginRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  requireBeginInput(await readJsonMutation(request));
  const active = await firstRow<{ key: string }>(
    "SELECT key FROM runtime_proofs WHERE key LIKE ?1 LIMIT 1",
    [`${SNAPSHOT_PREFIX}%`],
  );
  if (active) {
    throw runtimeError(
      "M6_RUNTIME_RUN_ACTIVE",
      "A Milestone 6 runtime journey is already active.",
      409,
    );
  }

  const owner = await currentOwner();
  const run = factsForRun(crypto.randomUUID(), owner);
  const snapshot: M6Snapshot = Object.freeze({
    version: 1,
    run,
    baselineCounts: await readTableCounts(),
    baselineModules: await readModuleStates(),
  });
  const requestFingerprint = run.shortId.repeat(6).slice(0, 64);

  await runAtomicBatch(env.DB, [
    env.DB.prepare(
      `INSERT INTO runtime_proofs (key, value, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(`${SNAPSHOT_PREFIX}${run.runId}`, JSON.stringify(snapshot)),
    env.DB.prepare(
      `UPDATE artist_modules SET active = 1
       WHERE module_key = 'memberships'`,
    ),
    env.DB.prepare(
      `UPDATE artist_modules SET active = 1
       WHERE module_key = 'subscriptions'`,
    ),
    env.DB.prepare(
      `INSERT INTO users (id, email, normalized_email, status)
       VALUES (?1, ?2, ?2, 'active')`,
    ).bind(run.customerId, run.customerEmail),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, display_name, revision)
       VALUES (?1, ?2, 1)`,
    ).bind(run.customerId, run.customerDisplayName),
    env.DB.prepare(
      `INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
       VALUES (?1, ?2, 'customer', ?3)`,
    ).bind(run.customerRoleId, run.customerId, run.ownerId),
    env.DB.prepare(
      `INSERT INTO tracks
        (id, slug, draft_revision_id, published_revision_id,
         publication_state, version, published_at)
       VALUES (?1, ?2, ?3, ?3, 'published', 1, CURRENT_TIMESTAMP)`,
    ).bind(run.trackId, run.trackSlug, run.trackRevisionId),
    env.DB.prepare(
      `INSERT INTO track_revisions
        (id, track_id, revision, title, description, view_mode, stream_mode,
         download_mode, tags_json, created_by_user_id)
       VALUES (?1, ?2, 1, ?3, ?4, 'protected', 'unavailable',
               'unavailable', '[]', ?5)`,
    ).bind(
      run.trackRevisionId,
      run.trackId,
      run.trackTitle,
      `Metadata-only protected track for Milestone 6 runtime verification ${run.shortId}.`,
      run.ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO access_plans
        (id, slug, name, description, state, revision, created_by_user_id)
       VALUES (?1, ?2, ?3, ?4, 'active', 1, ?5)`,
    ).bind(
      run.accessPlanId,
      run.accessPlanSlug,
      `Fictional commerce access ${run.shortId}`,
      `One protected metadata-only track for ${run.shortId}.`,
      run.ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO access_plan_items
        (id, access_plan_id, position, resource_type, resource_id,
         actions_json)
       VALUES (?1, ?2, 1, 'track', ?3, '["view"]')`,
    ).bind(run.accessPlanItemId, run.accessPlanId, run.trackId),
    env.DB.prepare(
      `INSERT INTO membership_plans
        (id, slug, state, current_revision, created_by_user_id)
       VALUES (?1, ?2, 'active', 1, ?3)`,
    ).bind(run.membershipPlanId, run.membershipPlanSlug, run.ownerId),
    env.DB.prepare(
      `INSERT INTO membership_plan_revisions
        (id, membership_plan_id, revision, name, description, benefits_json,
         access_plan_id, access_plan_revision, download_credits,
         license_credits, duration_days, created_by_user_id)
       VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, 1, 2, 1, NULL, ?7)`,
    ).bind(
      run.membershipPlanRevisionId,
      run.membershipPlanId,
      run.membershipPlanName,
      "Fictional monthly benefits for the local Stripe Test Mode journey.",
      JSON.stringify(["Protected track", "Download credits", "License credit"]),
      run.accessPlanId,
      run.ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO subscription_plans
        (id, slug, name, description, membership_plan_id,
         membership_plan_revision_id, membership_plan_revision,
         billing_interval, interval_count, state, revision,
         created_by_user_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 'month', 1, 'active', 1, ?7)`,
    ).bind(
      run.subscriptionPlanId,
      run.subscriptionPlanSlug,
      run.subscriptionPlanName,
      "Fictional monthly Stripe Test Mode subscription.",
      run.membershipPlanId,
      run.membershipPlanRevisionId,
      run.ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO commerce_products
        (id, slug, name, description, product_type, subscription_plan_id,
         state, revision, created_by_user_id)
       VALUES (?1, ?2, ?3, ?4, 'subscription', ?5, 'active', 1, ?6)`,
    ).bind(
      run.commerceProductId,
      run.commerceProductSlug,
      run.commerceProductName,
      "Fictional Stripe Test product for the Milestone 6 local journey.",
      run.subscriptionPlanId,
      run.ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO commerce_prices
        (id, commerce_product_id, amount_minor, currency, billing_interval,
         interval_count, stripe_price_id, active, stripe_environment,
         livemode, revision)
       VALUES (?1, ?2, ?3, ?4, 'month', 1, ?5, 1, 'test', 0, 1)`,
    ).bind(
      run.commercePriceId,
      run.commerceProductId,
      run.amountMinor,
      run.currency,
      run.stripePriceId,
    ),
    env.DB.prepare(
      `INSERT INTO checkout_sessions
        (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
         status, return_path, stripe_checkout_session_id,
         stripe_checkout_url, amount_minor, currency, stripe_environment,
         livemode, idempotency_key, request_fingerprint)
       VALUES (?1, ?2, ?3, ?4, 'subscription', 'open', '/commerce/return',
               ?5, ?6, ?7, ?8, 'test', 0, ?9, ?10)`,
    ).bind(
      run.checkoutId,
      run.customerId,
      run.commerceProductId,
      run.commercePriceId,
      run.stripeCheckoutSessionId,
      `https://checkout.stripe.com/c/pay/${run.shortId}`,
      run.amountMinor,
      run.currency,
      `m6-runtime-checkout-${run.runId}`,
      requestFingerprint,
    ),
  ]);

  return apiJson({ run }, requestId, 201);
}

async function readArtifactCounts(run: RunFacts): Promise<D1Row> {
  const row = await firstRow<D1Row>(
    `SELECT
       (SELECT COUNT(*) FROM runtime_proofs WHERE key = ?1) AS proofs,
       (SELECT COUNT(*) FROM users WHERE id = ?2) AS users,
       (SELECT COUNT(*) FROM profiles WHERE user_id = ?2) AS profiles,
       (SELECT COUNT(*) FROM role_assignments WHERE user_id = ?2) AS roles,
       (SELECT COUNT(*) FROM tracks WHERE id = ?3) AS tracks,
       (SELECT COUNT(*) FROM track_revisions WHERE track_id = ?3) AS trackRevisions,
       (SELECT COUNT(*) FROM access_plans WHERE id = ?4) AS accessPlans,
       (SELECT COUNT(*) FROM access_plan_items WHERE access_plan_id = ?4) AS accessPlanItems,
       (SELECT COUNT(*) FROM membership_plans WHERE id = ?5) AS membershipPlans,
       (SELECT COUNT(*) FROM membership_plan_revisions WHERE membership_plan_id = ?5) AS membershipPlanRevisions,
       (SELECT COUNT(*) FROM subscription_plans WHERE id = ?6) AS subscriptionPlans,
       (SELECT COUNT(*) FROM commerce_products WHERE id = ?7) AS commerceProducts,
       (SELECT COUNT(*) FROM commerce_prices WHERE commerce_product_id = ?7) AS commercePrices,
       (SELECT COUNT(*) FROM checkout_sessions WHERE id = ?8) AS checkoutSessions,
       (SELECT COUNT(*) FROM commerce_events WHERE checkout_session_id = ?8) AS commerceEvents,
       (SELECT COUNT(*) FROM orders WHERE customer_user_id = ?2) AS orders,
       (SELECT COUNT(*) FROM order_items
        WHERE order_id IN (SELECT id FROM orders WHERE customer_user_id = ?2)) AS orderItems,
       (SELECT COUNT(*) FROM fulfillment_events WHERE customer_user_id = ?2) AS fulfillmentEvents,
       (SELECT COUNT(*) FROM memberships WHERE customer_user_id = ?2) AS memberships,
       (SELECT COUNT(*) FROM subscriptions WHERE customer_user_id = ?2) AS subscriptions,
       (SELECT COUNT(*) FROM subscription_events WHERE customer_user_id = ?2) AS subscriptionEvents,
       (SELECT COUNT(*) FROM credit_accounts WHERE customer_user_id = ?2) AS creditAccounts,
       (SELECT COUNT(*) FROM credit_grant_lots WHERE customer_user_id = ?2) AS creditGrantLots,
       (SELECT COUNT(*) FROM credit_reservations WHERE customer_user_id = ?2) AS creditReservations,
       (SELECT COUNT(*) FROM credit_reservation_allocations
        WHERE credit_reservation_id IN (
          SELECT id FROM credit_reservations WHERE customer_user_id = ?2
        )) AS creditReservationAllocations,
       (SELECT COUNT(*) FROM credit_ledger_entries WHERE customer_user_id = ?2) AS creditLedgerEntries,
       (SELECT COUNT(*) FROM entitlements WHERE user_id = ?2) AS entitlements,
       (SELECT COUNT(*) FROM audit_events
        WHERE actor_user_id = ?2 OR subject_id IN (
          SELECT id FROM commerce_events WHERE checkout_session_id = ?8
        )) AS auditEvents,
       (SELECT COUNT(*) FROM media_objects WHERE owner_user_id = ?2) AS mediaObjects,
       (SELECT COUNT(*) FROM media_derivatives
        WHERE source_media_id IN (
          SELECT id FROM media_objects WHERE owner_user_id = ?2
        )) AS mediaDerivatives`,
    [
      `${SNAPSHOT_PREFIX}${run.runId}`,
      run.customerId,
      run.trackId,
      run.accessPlanId,
      run.membershipPlanId,
      run.subscriptionPlanId,
      run.commerceProductId,
      run.checkoutId,
    ],
  );
  if (!row) {
    throw runtimeError(
      "M6_RUNTIME_STATE_INVALID",
      "The Milestone 6 runtime artifact state is unavailable.",
      500,
    );
  }
  return row;
}

async function readRunState(
  runId: string,
  requestId: string,
): Promise<Response> {
  const snapshot = await readSnapshot(runId);
  const checkout = await firstRow<D1Row>(
    `SELECT status, stripe_customer_id, stripe_subscription_id,
            stripe_environment, livemode
     FROM checkout_sessions WHERE id = ?1 LIMIT 1`,
    [snapshot.run.checkoutId],
  );
  const order = await firstRow<D1Row>(
    `SELECT id, status, stripe_environment, livemode
     FROM orders WHERE customer_user_id = ?1
     ORDER BY created_at DESC LIMIT 1`,
    [snapshot.run.customerId],
  );
  const subscription = await firstRow<D1Row>(
    `SELECT id, state, stripe_environment, livemode
     FROM subscriptions WHERE customer_user_id = ?1 LIMIT 1`,
    [snapshot.run.customerId],
  );
  const balances = await firstRow<D1Row>(
    `SELECT
       COALESCE(SUM(CASE WHEN credit_kind = 'download' THEN available_balance ELSE 0 END), 0) AS downloadAvailable,
       COALESCE(SUM(CASE WHEN credit_kind = 'license' THEN available_balance ELSE 0 END), 0) AS licenseAvailable
     FROM credit_accounts WHERE customer_user_id = ?1`,
    [snapshot.run.customerId],
  );
  return apiJson(
    {
      run: snapshot.run,
      state: {
        artifacts: await readArtifactCounts(snapshot.run),
        checkout,
        order,
        subscription,
        balances,
        modules: await readModuleStates(),
      },
    },
    requestId,
  );
}

function countsEqual(left: TableCounts, right: TableCounts): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function modulesEqual(
  left: readonly ModuleState[],
  right: readonly ModuleState[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function cleanupRun(
  request: Request,
  requestId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const runId = requireCleanupInput(await readJsonMutation(request));
  const snapshot = await readSnapshot(runId);
  const { run } = snapshot;
  const [membershipModule, subscriptionModule] = snapshot.baselineModules;
  if (!membershipModule || !subscriptionModule) {
    throw runtimeError(
      "M6_RUNTIME_SNAPSHOT_INVALID",
      "The Milestone 6 runtime cleanup snapshot is invalid.",
      500,
    );
  }
  await runAtomicBatch(env.DB, [
    env.DB.prepare(
      `UPDATE artist_modules
       SET active = ?1, revision = ?2, settings_json = ?3,
           activated_at = ?4, deactivated_at = ?5, updated_by_user_id = ?6,
           updated_at = ?7
       WHERE module_key = ?8`,
    ).bind(
      membershipModule.active,
      membershipModule.revision,
      membershipModule.settings_json,
      membershipModule.activated_at,
      membershipModule.deactivated_at,
      membershipModule.updated_by_user_id,
      membershipModule.updated_at,
      membershipModule.module_key,
    ),
    env.DB.prepare(
      `UPDATE artist_modules
       SET active = ?1, revision = ?2, settings_json = ?3,
           activated_at = ?4, deactivated_at = ?5, updated_by_user_id = ?6,
           updated_at = ?7
       WHERE module_key = ?8`,
    ).bind(
      subscriptionModule.active,
      subscriptionModule.revision,
      subscriptionModule.settings_json,
      subscriptionModule.activated_at,
      subscriptionModule.deactivated_at,
      subscriptionModule.updated_by_user_id,
      subscriptionModule.updated_at,
      subscriptionModule.module_key,
    ),
    env.DB.prepare("DELETE FROM entitlements WHERE user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare(
      "DELETE FROM credit_reservation_allocations WHERE credit_reservation_id IN (SELECT id FROM credit_reservations WHERE customer_user_id = ?1)",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM credit_ledger_entries WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM credit_reservations WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM credit_grant_lots WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM credit_accounts WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM subscription_events WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM subscriptions WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare("DELETE FROM memberships WHERE customer_user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare(
      "DELETE FROM fulfillment_events WHERE customer_user_id = ?1",
    ).bind(run.customerId),
    env.DB.prepare(
      "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_user_id = ?1)",
    ).bind(run.customerId),
    env.DB.prepare("DELETE FROM orders WHERE customer_user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare(
      `DELETE FROM audit_events
       WHERE actor_user_id = ?1 OR subject_id IN (
         SELECT id FROM commerce_events WHERE checkout_session_id = ?2
       )`,
    ).bind(run.customerId, run.checkoutId),
    env.DB.prepare(
      "DELETE FROM commerce_events WHERE checkout_session_id = ?1",
    ).bind(run.checkoutId),
    env.DB.prepare("DELETE FROM checkout_sessions WHERE id = ?1").bind(
      run.checkoutId,
    ),
    env.DB.prepare(
      "DELETE FROM commerce_prices WHERE commerce_product_id = ?1",
    ).bind(run.commerceProductId),
    env.DB.prepare("DELETE FROM commerce_products WHERE id = ?1").bind(
      run.commerceProductId,
    ),
    env.DB.prepare("DELETE FROM subscription_plans WHERE id = ?1").bind(
      run.subscriptionPlanId,
    ),
    env.DB.prepare(
      "DELETE FROM membership_plan_revisions WHERE membership_plan_id = ?1",
    ).bind(run.membershipPlanId),
    env.DB.prepare("DELETE FROM membership_plans WHERE id = ?1").bind(
      run.membershipPlanId,
    ),
    env.DB.prepare(
      "DELETE FROM access_plan_items WHERE access_plan_id = ?1",
    ).bind(run.accessPlanId),
    env.DB.prepare("DELETE FROM access_plans WHERE id = ?1").bind(
      run.accessPlanId,
    ),
    env.DB.prepare("DELETE FROM tracks WHERE id = ?1").bind(run.trackId),
    env.DB.prepare("DELETE FROM role_assignments WHERE user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare("DELETE FROM profiles WHERE user_id = ?1").bind(
      run.customerId,
    ),
    env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(run.customerId),
    env.DB.prepare("DELETE FROM runtime_proofs WHERE key = ?1").bind(
      `${SNAPSHOT_PREFIX}${run.runId}`,
    ),
  ]);

  const retained = await readArtifactCounts(run);
  const retainedVerificationRows = Object.values(retained).reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0,
  );
  const restoredCounts = await readTableCounts();
  const restoredModules = await readModuleStates();
  const countDifferences = Object.fromEntries(
    COUNT_KEYS.filter(
      (key) => restoredCounts[key] !== snapshot.baselineCounts[key],
    ).map((key) => [
      key,
      {
        baseline: snapshot.baselineCounts[key],
        restored: restoredCounts[key],
      },
    ]),
  );
  const moduleStateRestored = modulesEqual(
    restoredModules,
    snapshot.baselineModules,
  );
  if (
    retainedVerificationRows !== 0 ||
    !countsEqual(restoredCounts, snapshot.baselineCounts) ||
    !moduleStateRestored
  ) {
    throw new RuntimeError(
      "M6_RUNTIME_CLEANUP_FAILED",
      "The Milestone 6 runtime state was not restored exactly.",
      {
        status: 500,
        publicMessage:
          "The Milestone 6 runtime state was not restored exactly.",
        details: {
          retainedVerificationRows,
          countDifferences,
          moduleStateRestored,
        },
      },
    );
  }

  return apiJson(
    {
      cleanup: {
        restored: true,
        retainedVerificationRows,
        baselineCountsRestored: true,
        moduleStateRestored: true,
        r2ObjectsTouched: 0,
        mediaRowsCreated: 0,
        temporaryFilesCreated: 0,
      },
    },
    requestId,
  );
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("runtime.m6_begin_failed", async (requestId) => {
    requireLab();
    return beginRun(request, requestId);
  });
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute("runtime.m6_read_failed", async (requestId) => {
    requireLab();
    const runId = new URL(request.url).searchParams.get("run");
    if (!runId) {
      throw runtimeError("INVALID_INPUT", "Provide a runtime run ID.", 400);
    }
    return readRunState(requireRunId(runId), requestId);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return runApiRoute("runtime.m6_cleanup_failed", async (requestId) => {
    requireLab();
    return cleanupRun(request, requestId);
  });
}
