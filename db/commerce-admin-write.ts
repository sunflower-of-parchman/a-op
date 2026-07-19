import { changedRows } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
  type PreparedMutation,
} from "./mutation.ts";
import type {
  CommerceLicenseOfferReferenceInput,
  CommerceProductCreateInput,
  CommerceProductMutationReceipt,
  CommerceProductState,
} from "@/lib/commerce-admin/types.ts";
import {
  validateCommerceLicenseOfferReference,
  validateCommerceProductCreateInput,
  type CommerceProductValidationIssue,
} from "@/lib/commerce-admin/validation.ts";
import type { CommerceProductType } from "@/lib/commerce/domain.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CountRow {
  count: number;
}

interface ProductAggregateRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  product_type: CommerceProductType;
  resource_type: "track" | "release" | "collection" | null;
  resource_id: string | null;
  access_plan_id: string | null;
  access_plan_revision: number | null;
  membership_plan_id: string | null;
  membership_plan_revision_id: string | null;
  membership_plan_revision: number | null;
  subscription_plan_id: string | null;
  credit_kind: "download" | "license" | null;
  credit_quantity: number | null;
  state: CommerceProductState;
  revision: number;
  price_id: string;
  amount_minor: number;
  currency: string;
  billing_interval: "one_time" | "month" | "year";
  interval_count: number;
  stripe_price_id: string;
  price_active: number;
  price_environment: string;
  price_livemode: number;
  price_revision: number;
  order_count: number;
}

interface CreationAuditRow {
  details_json: string;
}

interface SqlCondition {
  readonly sql: string;
  readonly bindings: readonly (null | number | string)[];
}

interface ProductColumns {
  readonly resourceType: "track" | "release" | "collection" | null;
  readonly resourceId: string | null;
  readonly accessPlanId: string | null;
  readonly accessPlanRevision: number | null;
  readonly membershipPlanId: string | null;
  readonly membershipPlanRevisionId: string | null;
  readonly membershipPlanRevision: number | null;
  readonly subscriptionPlanId: string | null;
  readonly creditKind: "download" | "license" | null;
  readonly creditQuantity: number | null;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function invalidInput(
  issues: readonly CommerceProductValidationIssue[],
): RuntimeError {
  return new RuntimeError(
    "COMMERCE_PRODUCT_INPUT_INVALID",
    "The commerce product input did not satisfy its server contract.",
    {
      status: 400,
      publicMessage: "Review the test product fields and try again.",
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

function productNotFound(): RuntimeError {
  return new RuntimeError(
    "COMMERCE_PRODUCT_NOT_FOUND",
    "Commerce product not found.",
    {
      status: 404,
      publicMessage: "That test product was not found.",
    },
  );
}

function definitionUnavailable(message: string): RuntimeError {
  return new RuntimeError("COMMERCE_PRODUCT_REFERENCE_UNAVAILABLE", message, {
    status: 409,
    publicMessage:
      "The product references are no longer current. Review the product definition.",
  });
}

function invalidState(message: string): RuntimeError {
  return new RuntimeError("COMMERCE_PRODUCT_STATE_INVALID", message, {
    status: 409,
    publicMessage: "This test product cannot make that state change.",
  });
}

function integrity(message: string): RuntimeError {
  return new RuntimeError("COMMERCE_PRODUCT_INTEGRITY", message, {
    status: 500,
    publicMessage: "The saved test product could not be read safely.",
  });
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
    "COMMERCE_OWNER_REQUIRED",
    "Commerce product administration requires live owner authority.",
    {
      status: 403,
      publicMessage: "Owner access is required for this operation.",
    },
  );
}

function activeModuleSql(moduleKey: string): SqlCondition {
  return {
    sql: `EXISTS (
      SELECT 1 FROM artist_modules
      WHERE module_key = ? AND active = 1
    )`,
    bindings: [moduleKey],
  };
}

function accessPlanSql(input: {
  readonly accessPlanId: string;
  readonly accessPlanRevision: number;
  readonly requiredResourceType?: "track" | "release" | "collection";
  readonly requiredResourceId?: string;
}): SqlCondition {
  const resourceCondition =
    input.requiredResourceType && input.requiredResourceId
      ? `AND EXISTS (
          SELECT 1 FROM access_plan_items AS required_item
          WHERE required_item.access_plan_id = access_plans.id
            AND required_item.resource_type = ?
            AND required_item.resource_id = ?
        )`
      : "";
  return {
    sql: `EXISTS (
      SELECT 1 FROM access_plans
      WHERE access_plans.id = ?
        AND access_plans.revision = ?
        AND access_plans.state = 'active'
        ${resourceCondition}
    )`,
    bindings: [
      input.accessPlanId,
      input.accessPlanRevision,
      ...(input.requiredResourceType && input.requiredResourceId
        ? [input.requiredResourceType, input.requiredResourceId]
        : []),
    ],
  };
}

function downloadsNeededForAccessPlanSql(accessPlanId: string): SqlCondition {
  const downloads = activeModuleSql("downloads");
  return {
    sql: `(NOT EXISTS (
      SELECT 1
      FROM access_plan_items AS download_item,
           json_each(download_item.actions_json) AS download_action
      WHERE download_item.access_plan_id = ?
        AND download_action.value = 'download'
    ) OR ${downloads.sql})`,
    bindings: [accessPlanId, ...downloads.bindings],
  };
}

function catalogReferenceSql(
  input: Extract<
    CommerceProductCreateInput,
    { productType: "track" | "release" | "collection" }
  >,
): SqlCondition {
  const root =
    input.productType === "track"
      ? "tracks"
      : input.productType === "release"
        ? "releases"
        : "collections";
  const revisions =
    input.productType === "track"
      ? "track_revisions"
      : input.productType === "release"
        ? "release_revisions"
        : "collection_revisions";
  const ownerColumn =
    input.productType === "track"
      ? "track_id"
      : input.productType === "release"
        ? "release_id"
        : "collection_id";
  const plan = accessPlanSql({
    accessPlanId: input.subject.accessPlanId,
    accessPlanRevision: input.subject.accessPlanRevision,
    requiredResourceType: input.productType,
    requiredResourceId: input.subject.resourceId,
  });
  const downloads = downloadsNeededForAccessPlanSql(input.subject.accessPlanId);
  return {
    sql: `EXISTS (
      SELECT 1
      FROM ${root} AS resource_root
      JOIN ${revisions} AS resource_revision
        ON resource_revision.id = resource_root.published_revision_id
       AND resource_revision.${ownerColumn} = resource_root.id
      WHERE resource_root.id = ?
        AND resource_root.version = ?
        AND resource_root.publication_state = 'published'
        AND resource_root.published_revision_id = ?
    ) AND ${plan.sql} AND ${downloads.sql}`,
    bindings: [
      input.subject.resourceId,
      input.subject.resourceVersion,
      input.subject.resourceRevisionId,
      ...plan.bindings,
      ...downloads.bindings,
    ],
  };
}

function membershipRevisionRequirementsSql(
  membershipPlanAlias: string,
  membershipRevisionAlias: string,
): SqlCondition {
  const memberships = activeModuleSql("memberships");
  const downloads = activeModuleSql("downloads");
  const licensing = activeModuleSql("licensing");
  return {
    sql: `${memberships.sql}
        AND ${membershipPlanAlias}.state = 'active'
        AND ${membershipPlanAlias}.current_revision = ${membershipRevisionAlias}.revision
        AND (
          ${membershipRevisionAlias}.access_plan_id IS NULL
          OR EXISTS (
            SELECT 1 FROM access_plans
            WHERE access_plans.id = ${membershipRevisionAlias}.access_plan_id
              AND access_plans.revision = ${membershipRevisionAlias}.access_plan_revision
              AND access_plans.state = 'active'
          )
        )
        AND (
          ${membershipRevisionAlias}.download_credits = 0
          AND NOT EXISTS (
            SELECT 1
            FROM access_plan_items AS membership_download_item,
                 json_each(membership_download_item.actions_json) AS membership_download_action
            WHERE membership_download_item.access_plan_id = ${membershipRevisionAlias}.access_plan_id
              AND membership_download_action.value = 'download'
          )
          OR ${downloads.sql}
        )
        AND (
          ${membershipRevisionAlias}.license_credits = 0
          OR ${licensing.sql}
        )`,
    bindings: [
      ...memberships.bindings,
      ...downloads.bindings,
      ...licensing.bindings,
    ],
  };
}

function membershipBenefitsSql(
  membershipPlanId: string,
  membershipPlanRevision: number,
): SqlCondition {
  const requirements = membershipRevisionRequirementsSql(
    "membership_plan",
    "membership_revision",
  );
  return {
    sql: `EXISTS (
      SELECT 1
      FROM membership_plans AS membership_plan
      JOIN membership_plan_revisions AS membership_revision
        ON membership_revision.membership_plan_id = membership_plan.id
       AND membership_revision.revision = membership_plan.current_revision
      WHERE membership_plan.id = ?
        AND membership_plan.current_revision = ?
        AND ${requirements.sql}
    )`,
    bindings: [
      membershipPlanId,
      membershipPlanRevision,
      ...requirements.bindings,
    ],
  };
}

function referenceSql(input: CommerceProductCreateInput): SqlCondition {
  if (
    input.productType === "track" ||
    input.productType === "release" ||
    input.productType === "collection"
  ) {
    return catalogReferenceSql(input);
  }
  if (input.productType === "membership") {
    return membershipBenefitsSql(
      input.subject.membershipPlanId,
      input.subject.membershipPlanRevision,
    );
  }
  if (input.productType === "subscription") {
    const subscriptions = activeModuleSql("subscriptions");
    const membership = membershipRevisionRequirementsSql(
      "subscription_membership_plan",
      "subscription_membership_revision",
    );
    return {
      sql: `${subscriptions.sql} AND EXISTS (
        SELECT 1
        FROM subscription_plans AS subscription_plan
        JOIN membership_plans AS subscription_membership_plan
          ON subscription_membership_plan.id = subscription_plan.membership_plan_id
        JOIN membership_plan_revisions AS subscription_membership_revision
          ON subscription_membership_revision.id = subscription_plan.membership_plan_revision_id
         AND subscription_membership_revision.membership_plan_id = subscription_membership_plan.id
         AND subscription_membership_revision.revision = subscription_plan.membership_plan_revision
        WHERE subscription_plan.id = ?
          AND subscription_plan.revision = ?
          AND subscription_plan.state = 'active'
          AND subscription_plan.billing_interval = ?
          AND subscription_plan.interval_count = ?
          AND ${membership.sql}
      )`,
      bindings: [
        ...subscriptions.bindings,
        input.subject.subscriptionPlanId,
        input.subject.subscriptionPlanRevision,
        input.price.billingInterval,
        input.price.intervalCount,
        ...membership.bindings,
      ],
    };
  }
  if (input.productType === "license") {
    const licensing = activeModuleSql("licensing");
    return {
      sql: `${licensing.sql} AND EXISTS (
        SELECT 1
        FROM tracks
        JOIN track_revisions
          ON track_revisions.id = tracks.published_revision_id
         AND track_revisions.track_id = tracks.id
        WHERE tracks.id = ?
          AND tracks.version = ?
          AND tracks.publication_state = 'published'
          AND tracks.published_revision_id = ?
      )`,
      bindings: [
        ...licensing.bindings,
        input.subject.trackId,
        input.subject.trackVersion,
        input.subject.trackRevisionId,
      ],
    };
  }
  const requiredModule = activeModuleSql(
    input.productType === "download-credits" ? "downloads" : "licensing",
  );
  return requiredModule;
}

async function requireAvailableReferences(
  binding: D1Database,
  input: CommerceProductCreateInput,
): Promise<void> {
  const condition = referenceSql(input);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw definitionUnavailable(
    "The product requires current active modules and exact published resource and plan revisions.",
  );
}

async function membershipRevisionId(
  binding: D1Database,
  membershipPlanId: string,
  membershipPlanRevision: number,
): Promise<string> {
  const row = await binding
    .prepare(
      `SELECT id
       FROM membership_plan_revisions
       WHERE membership_plan_id = ? AND revision = ?
       LIMIT 1`,
    )
    .bind(membershipPlanId, membershipPlanRevision)
    .first<{ id: string }>();
  if (!row || !SAFE_ID.test(row.id)) {
    throw definitionUnavailable(
      "The membership product does not reference an exact plan revision.",
    );
  }
  return row.id;
}

async function productColumns(
  binding: D1Database,
  input: CommerceProductCreateInput,
): Promise<ProductColumns> {
  if (
    input.productType === "track" ||
    input.productType === "release" ||
    input.productType === "collection"
  ) {
    return {
      resourceType: input.productType,
      resourceId: input.subject.resourceId,
      accessPlanId: input.subject.accessPlanId,
      accessPlanRevision: input.subject.accessPlanRevision,
      membershipPlanId: null,
      membershipPlanRevisionId: null,
      membershipPlanRevision: null,
      subscriptionPlanId: null,
      creditKind: null,
      creditQuantity: null,
    };
  }
  if (input.productType === "membership") {
    return {
      resourceType: null,
      resourceId: null,
      accessPlanId: null,
      accessPlanRevision: null,
      membershipPlanId: input.subject.membershipPlanId,
      membershipPlanRevisionId: await membershipRevisionId(
        binding,
        input.subject.membershipPlanId,
        input.subject.membershipPlanRevision,
      ),
      membershipPlanRevision: input.subject.membershipPlanRevision,
      subscriptionPlanId: null,
      creditKind: null,
      creditQuantity: null,
    };
  }
  if (input.productType === "subscription") {
    return {
      resourceType: null,
      resourceId: null,
      accessPlanId: null,
      accessPlanRevision: null,
      membershipPlanId: null,
      membershipPlanRevisionId: null,
      membershipPlanRevision: null,
      subscriptionPlanId: input.subject.subscriptionPlanId,
      creditKind: null,
      creditQuantity: null,
    };
  }
  if (input.productType === "license") {
    return {
      resourceType: "track",
      resourceId: input.subject.trackId,
      accessPlanId: null,
      accessPlanRevision: null,
      membershipPlanId: null,
      membershipPlanRevisionId: null,
      membershipPlanRevision: null,
      subscriptionPlanId: null,
      creditKind: null,
      creditQuantity: null,
    };
  }
  const creditInput = input as Extract<
    CommerceProductCreateInput,
    { productType: "download-credits" | "license-credits" }
  >;
  return {
    resourceType: null,
    resourceId: null,
    accessPlanId: null,
    accessPlanRevision: null,
    membershipPlanId: null,
    membershipPlanRevisionId: null,
    membershipPlanRevision: null,
    subscriptionPlanId: null,
    creditKind:
      creditInput.productType === "download-credits" ? "download" : "license",
    creditQuantity: creditInput.subject.quantity,
  };
}

function prepareRequiredAuditEvent(
  binding: D1Database,
  input: {
    readonly actorUserId: string;
    readonly action: string;
    readonly subjectId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly requestId: string;
    readonly details: Record<string, unknown>;
    readonly result: Record<string, unknown>;
  },
  condition: SqlCondition,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, ?, CASE WHEN (${condition.sql}) THEN ? ELSE NULL END,
               'commerce-product', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      ...condition.bindings,
      input.action,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details),
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

async function readProduct(
  binding: D1Database,
  productId: string,
): Promise<ProductAggregateRow | null> {
  const rows = await binding
    .prepare(
      `SELECT
         commerce_products.*,
         commerce_prices.id AS price_id,
         commerce_prices.amount_minor,
         commerce_prices.currency,
         commerce_prices.billing_interval,
         commerce_prices.interval_count,
         commerce_prices.stripe_price_id,
         commerce_prices.active AS price_active,
         commerce_prices.stripe_environment AS price_environment,
         commerce_prices.livemode AS price_livemode,
         commerce_prices.revision AS price_revision,
         (SELECT COUNT(*) FROM order_items
          WHERE commerce_product_id = commerce_products.id) AS order_count
       FROM commerce_products
       JOIN commerce_prices
         ON commerce_prices.commerce_product_id = commerce_products.id
       WHERE commerce_products.id = ?
       ORDER BY commerce_prices.id`,
    )
    .bind(productId)
    .all<ProductAggregateRow>();
  if (rows.results.length === 0) return null;
  if (rows.results.length !== 1) {
    throw integrity("A commerce product has an ambiguous price history.");
  }
  return rows.results[0];
}

async function readCreationDefinition(
  binding: D1Database,
  productId: string,
): Promise<CommerceProductCreateInput> {
  const row = await binding
    .prepare(
      `SELECT details_json
       FROM audit_events
       WHERE subject_type = 'commerce-product'
         AND subject_id = ?
         AND action = 'commerce.product.create'
       ORDER BY created_at
       LIMIT 1`,
    )
    .bind(productId)
    .first<CreationAuditRow>();
  if (!row) throw integrity("The product creation receipt is missing.");
  let details: unknown;
  try {
    details = JSON.parse(row.details_json);
  } catch {
    throw integrity("The product creation receipt is invalid JSON.");
  }
  const definition =
    details !== null &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    "definition" in details
      ? (details as { definition: unknown }).definition
      : null;
  const validated = validateCommerceProductCreateInput(definition);
  if (!validated.ok) {
    throw integrity("The product creation receipt failed current validation.");
  }
  return validated.value;
}

function assertStoredDefinition(
  row: ProductAggregateRow,
  input: CommerceProductCreateInput,
): void {
  const priceMatches =
    row.stripe_price_id === input.price.stripePriceId &&
    row.amount_minor === input.price.amountMinor &&
    row.currency === input.price.currency &&
    row.billing_interval === input.price.billingInterval &&
    row.interval_count === input.price.intervalCount &&
    row.price_environment === "test" &&
    row.price_livemode === 0 &&
    row.price_revision === 1;
  let subjectMatches = false;
  if (
    input.productType === "track" ||
    input.productType === "release" ||
    input.productType === "collection"
  ) {
    subjectMatches =
      row.resource_type === input.productType &&
      row.resource_id === input.subject.resourceId &&
      row.access_plan_id === input.subject.accessPlanId &&
      row.access_plan_revision === input.subject.accessPlanRevision;
  } else if (input.productType === "membership") {
    subjectMatches =
      row.membership_plan_id === input.subject.membershipPlanId &&
      row.membership_plan_revision === input.subject.membershipPlanRevision &&
      row.membership_plan_revision_id !== null;
  } else if (input.productType === "subscription") {
    subjectMatches =
      row.subscription_plan_id === input.subject.subscriptionPlanId;
  } else if (input.productType === "license") {
    subjectMatches =
      row.resource_type === "track" &&
      row.resource_id === input.subject.trackId;
  } else {
    const creditInput = input as Extract<
      CommerceProductCreateInput,
      { productType: "download-credits" | "license-credits" }
    >;
    subjectMatches =
      row.credit_kind ===
        (creditInput.productType === "download-credits"
          ? "download"
          : "license") && row.credit_quantity === creditInput.subject.quantity;
  }
  if (
    row.slug !== input.slug ||
    row.name !== input.name ||
    row.description !== input.description ||
    row.product_type !== input.productType ||
    !priceMatches ||
    !subjectMatches
  ) {
    throw integrity(
      "The product row no longer matches its immutable creation receipt.",
    );
  }
}

function exactStoredProductSql(
  row: ProductAggregateRow,
  expectedRevision: number,
  expectedState: "draft" | "active",
): SqlCondition {
  return {
    sql: `EXISTS (
      SELECT 1 FROM commerce_products
      JOIN commerce_prices
        ON commerce_prices.id = ?
       AND commerce_prices.commerce_product_id = commerce_products.id
      WHERE commerce_products.id = ?
        AND commerce_products.state = ?
        AND commerce_products.revision = ?
        AND commerce_products.slug = ?
        AND commerce_products.name = ?
        AND commerce_products.description = ?
        AND commerce_products.product_type = ?
        AND commerce_products.resource_type IS ?
        AND commerce_products.resource_id IS ?
        AND commerce_products.access_plan_id IS ?
        AND commerce_products.access_plan_revision IS ?
        AND commerce_products.membership_plan_id IS ?
        AND commerce_products.membership_plan_revision_id IS ?
        AND commerce_products.membership_plan_revision IS ?
        AND commerce_products.subscription_plan_id IS ?
        AND commerce_products.credit_kind IS ?
        AND commerce_products.credit_quantity IS ?
        AND commerce_prices.amount_minor = ?
        AND commerce_prices.currency = ?
        AND commerce_prices.billing_interval = ?
        AND commerce_prices.interval_count = ?
        AND commerce_prices.stripe_price_id = ?
        AND commerce_prices.active = 1
        AND commerce_prices.revision = 1
        AND commerce_prices.stripe_environment = 'test'
        AND commerce_prices.livemode = 0
    )`,
    bindings: [
      row.price_id,
      row.id,
      expectedState,
      expectedRevision,
      row.slug,
      row.name,
      row.description,
      row.product_type,
      row.resource_type,
      row.resource_id,
      row.access_plan_id,
      row.access_plan_revision,
      row.membership_plan_id,
      row.membership_plan_revision_id,
      row.membership_plan_revision,
      row.subscription_plan_id,
      row.credit_kind,
      row.credit_quantity,
      row.amount_minor,
      row.currency,
      row.billing_interval,
      row.interval_count,
      row.stripe_price_id,
    ],
  };
}

function creationAuditSql(
  productId: string,
  priceId: string,
  definition: CommerceProductCreateInput,
): SqlCondition {
  const expectedDetails = JSON.stringify({
    definition,
    commercePriceId: priceId,
    stripeEnvironment: "test",
    livemode: false,
  });
  return {
    sql: `EXISTS (
      SELECT 1 FROM audit_events
      WHERE subject_type = 'commerce-product'
        AND subject_id = ?
        AND action = 'commerce.product.create'
        AND details_json = ?
    )`,
    bindings: [productId, expectedDetails],
  };
}

function licenseOfferSql(
  row: ProductAggregateRow,
  definition: Extract<CommerceProductCreateInput, { productType: "license" }>,
  reference: CommerceLicenseOfferReferenceInput,
): SqlCondition {
  return {
    sql: `EXISTS (
      SELECT 1 FROM license_offers
      WHERE id = ?
        AND revision = ?
        AND state IN ('draft', 'active')
        AND track_id = ?
        AND track_revision_id = ?
        AND commerce_product_id = ?
        AND commerce_price_id = ?
    )`,
    bindings: [
      reference.licenseOfferId,
      reference.licenseOfferRevision,
      definition.subject.trackId,
      definition.subject.trackRevisionId,
      row.id,
      row.price_id,
    ],
  };
}

export async function createCommerceProduct(
  binding: D1Database,
  rawInput: unknown,
  context: MutationContext,
): Promise<MutationResult<CommerceProductMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const validated = validateCommerceProductCreateInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  const operation = "commerce.product.create";
  const mutation = await prepareMutation<CommerceProductMutationReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const duplicate = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM commerce_products
       WHERE slug = ?
       UNION ALL
       SELECT COUNT(*) AS count
       FROM commerce_prices
       WHERE stripe_price_id = ?`,
    )
    .bind(input.slug, input.price.stripePriceId)
    .all<CountRow>();
  if (duplicate.results.some((row) => row.count > 0)) {
    throw new RuntimeError(
      "COMMERCE_PRODUCT_IDENTITY_TAKEN",
      "A commerce product slug or Stripe price is already registered.",
      {
        status: 409,
        publicMessage: "Choose a different product slug or test price.",
      },
    );
  }
  await requireAvailableReferences(binding, input);
  const columns = await productColumns(binding, input);
  const productId = `commerce_product_${crypto.randomUUID()}`;
  const priceId = `commerce_price_${crypto.randomUUID()}`;
  const result: CommerceProductMutationReceipt = Object.freeze({
    commerceProductId: productId,
    commercePriceId: priceId,
    slug: input.slug,
    productType: input.productType,
    state: "draft",
    revision: 1,
    stripePriceId: input.price.stripePriceId,
    stripeEnvironment: "test",
    livemode: false,
    created: true,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const references = referenceSql(input);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `INSERT INTO commerce_products
          (id, slug, name, description, product_type, resource_type,
           resource_id, access_plan_id, access_plan_revision,
           membership_plan_id, membership_plan_revision_id,
           membership_plan_revision, subscription_plan_id, credit_kind,
           credit_quantity, state, revision, created_by_user_id,
           last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'draft', 1, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM commerce_products WHERE slug = ?
         )
           AND NOT EXISTS (
             SELECT 1 FROM commerce_prices WHERE stripe_price_id = ?
           )
           AND ${references.sql}
           AND ${authority.sql}`,
      )
      .bind(
        productId,
        input.slug,
        input.name,
        input.description,
        input.productType,
        columns.resourceType,
        columns.resourceId,
        columns.accessPlanId,
        columns.accessPlanRevision,
        columns.membershipPlanId,
        columns.membershipPlanRevisionId,
        columns.membershipPlanRevision,
        columns.subscriptionPlanId,
        columns.creditKind,
        columns.creditQuantity,
        context.actorUserId,
        mutation.namespacedKey,
        input.slug,
        input.price.stripePriceId,
        ...references.bindings,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO commerce_prices
          (id, commerce_product_id, amount_minor, currency,
           billing_interval, interval_count, stripe_price_id, active,
           stripe_environment, livemode, revision, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, 1, 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM commerce_products
           WHERE id = ? AND state = 'draft' AND revision = 1
             AND last_operation_key = ?
         )
           AND NOT EXISTS (
             SELECT 1 FROM commerce_prices WHERE stripe_price_id = ?
           )
           AND ${authority.sql}`,
      )
      .bind(
        priceId,
        productId,
        input.price.amountMinor,
        input.price.currency,
        input.price.billingInterval,
        input.price.intervalCount,
        input.price.stripePriceId,
        mutation.namespacedKey,
        productId,
        mutation.namespacedKey,
        input.price.stripePriceId,
        ...authority.bindings,
      ),
  ];
  const auditCondition: SqlCondition = {
    sql: `EXISTS (
      SELECT 1 FROM commerce_products
      JOIN commerce_prices
        ON commerce_prices.id = ?
       AND commerce_prices.commerce_product_id = commerce_products.id
      WHERE commerce_products.id = ?
        AND commerce_products.state = 'draft'
        AND commerce_products.revision = 1
        AND commerce_products.last_operation_key = ?
        AND commerce_prices.revision = 1
        AND commerce_prices.active = 1
        AND commerce_prices.stripe_environment = 'test'
        AND commerce_prices.livemode = 0
        AND commerce_prices.last_operation_key = ?
    ) AND ${references.sql} AND ${authority.sql}`,
    bindings: [
      priceId,
      productId,
      mutation.namespacedKey,
      mutation.namespacedKey,
      ...references.bindings,
      ...authority.bindings,
    ],
  };
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectId: productId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          definition: input,
          commercePriceId: priceId,
          stripeEnvironment: "test",
          livemode: false,
        },
        result: { ...result },
      },
      auditCondition,
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[1]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("commerce product");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "commerce product");
  }
}

export async function activateCommerceProduct(
  binding: D1Database,
  rawProductId: string,
  rawExpectedRevision: number,
  rawLicenseOffer: unknown,
  context: MutationContext,
): Promise<MutationResult<CommerceProductMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const productId = safeId(rawProductId, "commerceProductId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const validatedOffer = validateCommerceLicenseOfferReference(rawLicenseOffer);
  if (!validatedOffer.ok) throw invalidInput(validatedOffer.issues);
  const operation = "commerce.product.activate";
  const mutation = await prepareMutation<CommerceProductMutationReceipt>(
    binding,
    operation,
    context,
    {
      commerceProductId: productId,
      expectedRevision,
      licenseOffer: validatedOffer.value,
    },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const row = await readProduct(binding, productId);
  if (!row) throw productNotFound();
  if (row.state !== "draft") {
    throw invalidState("Only a draft commerce product can be activated.");
  }
  if (row.revision !== expectedRevision)
    throw staleMutation("commerce product");
  const definition = await readCreationDefinition(binding, productId);
  assertStoredDefinition(row, definition);
  await requireAvailableReferences(binding, definition);
  if (
    (definition.productType === "license") !==
    (validatedOffer.value !== null)
  ) {
    throw invalidInput([
      Object.freeze({
        field: "licenseOffer",
        message:
          definition.productType === "license"
            ? "A license product requires an exact license-offer revision."
            : "Only a license product can reference a license offer.",
      }),
    ]);
  }
  const offerCondition =
    definition.productType === "license" && validatedOffer.value
      ? licenseOfferSql(row, definition, validatedOffer.value)
      : null;
  if (offerCondition) {
    const available = await binding
      .prepare(`SELECT COUNT(*) AS count WHERE ${offerCondition.sql}`)
      .bind(...offerCondition.bindings)
      .first<CountRow>();
    if (available?.count !== 1) {
      throw definitionUnavailable(
        "The license product requires the exact current license-offer revision.",
      );
    }
  }
  const result: CommerceProductMutationReceipt = Object.freeze({
    commerceProductId: row.id,
    commercePriceId: row.price_id,
    slug: row.slug,
    productType: row.product_type,
    state: "active",
    revision: expectedRevision + 1,
    stripePriceId: row.stripe_price_id,
    stripeEnvironment: "test",
    livemode: false,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const references = referenceSql(definition);
  const creation = creationAuditSql(productId, row.price_id, definition);
  const stored = exactStoredProductSql(row, expectedRevision, "draft");
  const update = binding
    .prepare(
      `UPDATE commerce_products
       SET state = 'active', revision = revision + 1,
           last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND state = 'draft' AND revision = ?
         AND ${stored.sql}
         AND ${creation.sql}
         AND ${references.sql}
         ${offerCondition ? `AND ${offerCondition.sql}` : ""}
         AND ${authority.sql}`,
    )
    .bind(
      mutation.namespacedKey,
      productId,
      expectedRevision,
      ...stored.bindings,
      ...creation.bindings,
      ...references.bindings,
      ...(offerCondition?.bindings ?? []),
      ...authority.bindings,
    );
  const exact: SqlCondition = {
    sql: `EXISTS (
      SELECT 1 FROM commerce_products
      WHERE id = ? AND state = 'active' AND revision = ?
        AND last_operation_key = ?
    ) AND ${creation.sql} AND ${references.sql}
      ${offerCondition ? `AND ${offerCondition.sql}` : ""}
      AND ${authority.sql}`,
    bindings: [
      productId,
      result.revision,
      mutation.namespacedKey,
      ...creation.bindings,
      ...references.bindings,
      ...(offerCondition?.bindings ?? []),
      ...authority.bindings,
    ],
  };
  const audit = prepareRequiredAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectId: productId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        expectedRevision,
        licenseOffer: validatedOffer.value,
        orderCountAtActivation: row.order_count,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...result },
    },
    exact,
  );
  try {
    const results = await runAtomicBatch(binding, [update, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("commerce product");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "commerce product");
  }
}

export async function archiveCommerceProduct(
  binding: D1Database,
  rawProductId: string,
  rawExpectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<CommerceProductMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  const productId = safeId(rawProductId, "commerceProductId");
  const expectedRevision = positiveRevision(
    rawExpectedRevision,
    "expectedRevision",
  );
  const operation = "commerce.product.archive";
  const mutation = await prepareMutation<CommerceProductMutationReceipt>(
    binding,
    operation,
    context,
    { commerceProductId: productId, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const row = await readProduct(binding, productId);
  if (!row) throw productNotFound();
  if (row.state !== "draft" && row.state !== "active") {
    throw invalidState("An archived commerce product is terminal.");
  }
  if (row.revision !== expectedRevision)
    throw staleMutation("commerce product");
  const definition = await readCreationDefinition(binding, productId);
  assertStoredDefinition(row, definition);
  await requireAvailableReferences(binding, definition);
  const result: CommerceProductMutationReceipt = Object.freeze({
    commerceProductId: row.id,
    commercePriceId: row.price_id,
    slug: row.slug,
    productType: row.product_type,
    state: "archived",
    revision: expectedRevision + 1,
    stripePriceId: row.stripe_price_id,
    stripeEnvironment: "test",
    livemode: false,
    created: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const references = referenceSql(definition);
  const creation = creationAuditSql(productId, row.price_id, definition);
  const stored = exactStoredProductSql(row, expectedRevision, row.state);
  const update = binding
    .prepare(
      `UPDATE commerce_products
       SET state = 'archived', revision = revision + 1,
           last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND state = ? AND revision = ?
         AND ${stored.sql}
         AND ${creation.sql}
         AND ${references.sql}
         AND ${authority.sql}`,
    )
    .bind(
      mutation.namespacedKey,
      productId,
      row.state,
      expectedRevision,
      ...stored.bindings,
      ...creation.bindings,
      ...references.bindings,
      ...authority.bindings,
    );
  const exact: SqlCondition = {
    sql: `EXISTS (
      SELECT 1 FROM commerce_products
      WHERE id = ? AND state = 'archived' AND revision = ?
        AND last_operation_key = ?
    ) AND ${creation.sql} AND ${references.sql} AND ${authority.sql}`,
    bindings: [
      productId,
      result.revision,
      mutation.namespacedKey,
      ...creation.bindings,
      ...references.bindings,
      ...authority.bindings,
    ],
  };
  const audit = prepareRequiredAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectId: productId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        expectedRevision,
        priorState: row.state,
        orderCount: row.order_count,
        definitionAndPriceChanged: false,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...result },
    },
    exact,
  );
  try {
    const results = await runAtomicBatch(binding, [update, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("commerce product");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "commerce product");
  }
}
