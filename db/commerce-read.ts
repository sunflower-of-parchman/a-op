import {
  commerceTestStatus,
  type CommerceBillingInterval,
  type CommerceCheckoutMode,
  type CommerceCheckoutStatus,
  type CommerceProductDTO,
  type CommerceProductType,
} from "@/lib/commerce/domain.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export interface ActiveCommerceProduct extends CommerceProductDTO {
  readonly revision: number;
  readonly priceId: string;
  readonly stripePriceId: string;
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
  readonly mode: CommerceCheckoutMode;
}

export interface StoredCheckoutSession {
  readonly id: string;
  readonly customerUserId: string;
  readonly commerceProductId: string;
  readonly commercePriceId: string;
  readonly licenseRequestId: string | null;
  readonly mode: CommerceCheckoutMode;
  readonly status: CommerceCheckoutStatus;
  readonly returnPath: string;
  readonly stripeCheckoutSessionId: string | null;
  readonly stripeCheckoutUrl: string | null;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly expiresAt: string | null;
  readonly completedAt: string | null;
}

interface ProductRow {
  id: unknown;
  slug: unknown;
  membership_plan_slug: unknown;
  subscription_plan_slug: unknown;
  name: unknown;
  description: unknown;
  product_type: unknown;
  resource_type: unknown;
  resource_id: unknown;
  access_plan_id: unknown;
  access_plan_revision: unknown;
  membership_plan_id: unknown;
  membership_plan_revision_id: unknown;
  membership_plan_revision: unknown;
  subscription_plan_id: unknown;
  credit_kind: unknown;
  credit_quantity: unknown;
  revision: unknown;
  price_id: unknown;
  stripe_price_id: unknown;
  amount_minor: unknown;
  currency: unknown;
  billing_interval: unknown;
  interval_count: unknown;
}

interface CheckoutRow {
  id: unknown;
  customer_user_id: unknown;
  commerce_product_id: unknown;
  commerce_price_id: unknown;
  license_request_id: unknown;
  mode: unknown;
  status: unknown;
  return_path: unknown;
  stripe_checkout_session_id: unknown;
  stripe_checkout_url: unknown;
  stripe_customer_id: unknown;
  stripe_subscription_id: unknown;
  amount_minor: unknown;
  currency: unknown;
  idempotency_key: unknown;
  request_fingerprint: unknown;
  stripe_environment: unknown;
  livemode: unknown;
  expires_at: unknown;
  completed_at: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRIPE_PRICE_ID = /^price_[A-Za-z0-9]{6,255}$/;
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
const BILLING_INTERVALS = new Set<CommerceBillingInterval>([
  "one_time",
  "month",
  "year",
]);
const CHECKOUT_STATUSES = new Set<CommerceCheckoutStatus>([
  "creating",
  "open",
  "completed",
  "expired",
  "canceled",
  "failed",
]);

function integrity(message: string): never {
  throw new RuntimeError("COMMERCE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Commerce is temporarily unavailable.",
  });
}

function unavailable(): never {
  throw new RuntimeError(
    "COMMERCE_PRODUCT_UNAVAILABLE",
    "The requested test product is not active and uniquely priced.",
    {
      status: 404,
      publicMessage: "That test product is unavailable.",
    },
  );
}

function id(value: unknown, label: string): string {
  return typeof value === "string" && SAFE_ID.test(value)
    ? value
    : integrity(`D1 returned an invalid ${label}.`);
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function text(value: unknown, label: string, max: number): string {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= max
    ? value
    : integrity(`D1 returned invalid ${label}.`);
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label, 4_096);
}

function nullableSlug(value: unknown, label: string): string | null {
  if (value === null) return null;
  return typeof value === "string" && SAFE_SLUG.test(value)
    ? value
    : integrity(`D1 returned an invalid ${label}.`);
}

function positiveInteger(value: unknown, label: string): number {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : integrity(`D1 returned invalid ${label}.`);
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  return value === null ? null : positiveInteger(value, label);
}

function productType(value: unknown): CommerceProductType {
  return typeof value === "string" &&
    PRODUCT_TYPES.has(value as CommerceProductType)
    ? (value as CommerceProductType)
    : integrity("D1 returned an invalid commerce product type.");
}

function activeModuleForProduct(
  value: CommerceProductType,
): "downloads" | "licensing" | "memberships" | "subscriptions" | null {
  if (value === "download-credits") return "downloads";
  if (value === "license" || value === "license-credits") return "licensing";
  if (value === "membership") return "memberships";
  if (value === "subscription") return "subscriptions";
  return null;
}

async function requireProductModule(
  binding: D1Database,
  value: CommerceProductType,
): Promise<void> {
  const moduleKey = activeModuleForProduct(value);
  if (moduleKey === null) return;
  const row = await binding
    .prepare(
      `SELECT active FROM artist_modules
       WHERE module_key = ?1
       LIMIT 1`,
    )
    .bind(moduleKey)
    .first<{ active: unknown }>();
  if (row?.active !== 1) unavailable();
}

function parseProduct(row: ProductRow): ActiveCommerceProduct {
  const type = productType(row.product_type);
  const billingInterval =
    typeof row.billing_interval === "string" &&
    BILLING_INTERVALS.has(row.billing_interval as CommerceBillingInterval)
      ? (row.billing_interval as CommerceBillingInterval)
      : integrity("D1 returned an invalid commerce billing interval.");
  const mode: CommerceCheckoutMode =
    type === "subscription" ? "subscription" : "payment";
  if (
    (mode === "subscription" && billingInterval === "one_time") ||
    (mode === "payment" && billingInterval !== "one_time")
  ) {
    integrity(
      "The product and billing interval do not form one checkout mode.",
    );
  }
  if (
    typeof row.slug !== "string" ||
    !SAFE_SLUG.test(row.slug) ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    typeof row.stripe_price_id !== "string" ||
    !STRIPE_PRICE_ID.test(row.stripe_price_id)
  ) {
    integrity("D1 returned malformed commerce product identity or pricing.");
  }

  const resourceType =
    row.resource_type === null
      ? null
      : row.resource_type === "track" ||
          row.resource_type === "release" ||
          row.resource_type === "collection"
        ? row.resource_type
        : integrity("D1 returned an invalid product resource type.");
  const creditKind =
    row.credit_kind === null
      ? null
      : row.credit_kind === "download" || row.credit_kind === "license"
        ? row.credit_kind
        : integrity("D1 returned an invalid product credit kind.");
  const membershipPlanSlug = nullableSlug(
    row.membership_plan_slug,
    "membership-plan slug",
  );
  const subscriptionPlanSlug = nullableSlug(
    row.subscription_plan_slug,
    "subscription-plan slug",
  );
  if (
    (type === "membership" &&
      (membershipPlanSlug === null || subscriptionPlanSlug !== null)) ||
    (type === "subscription" &&
      (subscriptionPlanSlug === null || membershipPlanSlug !== null)) ||
    (type !== "membership" &&
      type !== "subscription" &&
      (membershipPlanSlug !== null || subscriptionPlanSlug !== null))
  ) {
    integrity("D1 returned an invalid commerce offer target.");
  }
  const offerAnchorId =
    type === "membership"
      ? `membership-${membershipPlanSlug}`
      : type === "subscription"
        ? `subscription-${subscriptionPlanSlug}`
        : `product-${row.slug}`;

  return Object.freeze({
    ...commerceTestStatus(),
    id: id(row.id, "commerce product ID"),
    slug: row.slug,
    offerAnchorId,
    name: text(row.name, "commerce product name", 160),
    description:
      typeof row.description === "string" && row.description.length <= 4_000
        ? row.description
        : integrity("D1 returned an invalid commerce product description."),
    productType: type,
    amountMinor: positiveInteger(row.amount_minor, "commerce amount"),
    currency: row.currency,
    billingInterval,
    intervalCount: positiveInteger(row.interval_count, "billing interval"),
    revision: positiveInteger(row.revision, "commerce product revision"),
    priceId: id(row.price_id, "commerce price ID"),
    stripePriceId: row.stripe_price_id,
    resourceType,
    resourceId: nullableId(row.resource_id, "product resource ID"),
    accessPlanId: nullableId(row.access_plan_id, "access-plan ID"),
    accessPlanRevision: nullablePositiveInteger(
      row.access_plan_revision,
      "access-plan revision",
    ),
    membershipPlanId: nullableId(row.membership_plan_id, "membership-plan ID"),
    membershipPlanRevisionId: nullableId(
      row.membership_plan_revision_id,
      "membership-plan revision ID",
    ),
    membershipPlanRevision: nullablePositiveInteger(
      row.membership_plan_revision,
      "membership-plan revision",
    ),
    subscriptionPlanId: nullableId(
      row.subscription_plan_id,
      "subscription-plan ID",
    ),
    creditKind,
    creditQuantity: nullablePositiveInteger(
      row.credit_quantity,
      "credit quantity",
    ),
    mode,
  });
}

const PRODUCT_SELECT = `SELECT
  commerce_products.id, commerce_products.slug, commerce_products.name,
  commerce_products.description, commerce_products.product_type,
  membership_plan.slug AS membership_plan_slug,
  subscription_plan.slug AS subscription_plan_slug,
  commerce_products.resource_type, commerce_products.resource_id,
  commerce_products.access_plan_id, commerce_products.access_plan_revision,
  commerce_products.membership_plan_id,
  commerce_products.membership_plan_revision_id,
  commerce_products.membership_plan_revision,
  commerce_products.subscription_plan_id, commerce_products.credit_kind,
  commerce_products.credit_quantity, commerce_products.revision,
  commerce_prices.id AS price_id,
  commerce_prices.stripe_price_id AS stripe_price_id,
  commerce_prices.amount_minor, commerce_prices.currency,
  commerce_prices.billing_interval, commerce_prices.interval_count
FROM commerce_products
JOIN commerce_prices
  ON commerce_prices.commerce_product_id = commerce_products.id
 AND commerce_prices.stripe_environment = 'test'
 AND commerce_prices.livemode = 0
LEFT JOIN membership_plans AS membership_plan
  ON membership_plan.id = commerce_products.membership_plan_id
LEFT JOIN subscription_plans AS subscription_plan
  ON subscription_plan.id = commerce_products.subscription_plan_id`;
const PRODUCT_QUERY = `${PRODUCT_SELECT}
WHERE commerce_products.state = 'active' AND commerce_prices.active = 1`;

export async function readActiveCommerceProduct(
  binding: D1Database,
  productId: string,
): Promise<ActiveCommerceProduct> {
  if (!SAFE_ID.test(productId)) unavailable();
  const result = await binding
    .prepare(`${PRODUCT_QUERY} AND commerce_products.id = ?1 ORDER BY price_id`)
    .bind(productId)
    .all<ProductRow>();
  if (result.results.length !== 1) unavailable();
  const product = parseProduct(result.results[0]);
  await requireProductModule(binding, product.productType);
  return product;
}

export async function listActiveCommerceProducts(
  binding: D1Database,
): Promise<readonly CommerceProductDTO[]> {
  const result = await binding
    .prepare(`${PRODUCT_QUERY} ORDER BY commerce_products.slug, price_id`)
    .all<ProductRow>();
  const counts = new Map<string, number>();
  result.results.forEach((row) => {
    const productId = id(row.id, "commerce product ID");
    counts.set(productId, (counts.get(productId) ?? 0) + 1);
  });

  const products: CommerceProductDTO[] = [];
  for (const row of result.results) {
    const product = parseProduct(row);
    if (counts.get(product.id) !== 1) {
      integrity("An active product has an ambiguous active test price.");
    }
    try {
      await requireProductModule(binding, product.productType);
    } catch (error) {
      if (
        error instanceof RuntimeError &&
        error.code === "COMMERCE_PRODUCT_UNAVAILABLE"
      ) {
        continue;
      }
      throw error;
    }
    products.push(
      Object.freeze({
        adapter: product.adapter,
        stripeEnvironment: product.stripeEnvironment,
        livemode: product.livemode,
        label: product.label,
        statement: product.statement,
        id: product.id,
        slug: product.slug,
        offerAnchorId: product.offerAnchorId,
        name: product.name,
        description: product.description,
        productType: product.productType,
        amountMinor: product.amountMinor,
        currency: product.currency,
        billingInterval: product.billingInterval,
        intervalCount: product.intervalCount,
      }),
    );
  }
  return Object.freeze(products);
}

export async function readStoredCommerceProduct(
  binding: D1Database,
  productId: string,
  priceId: string,
): Promise<ActiveCommerceProduct | null> {
  if (!SAFE_ID.test(productId) || !SAFE_ID.test(priceId)) return null;
  const result = await binding
    .prepare(
      `${PRODUCT_SELECT}
       WHERE commerce_products.id = ?1 AND commerce_prices.id = ?2
       LIMIT 2`,
    )
    .bind(productId, priceId)
    .all<ProductRow>();
  if (result.results.length !== 1) return null;
  return parseProduct(result.results[0]);
}

function checkoutStatus(value: unknown): CommerceCheckoutStatus {
  return typeof value === "string" &&
    CHECKOUT_STATUSES.has(value as CommerceCheckoutStatus)
    ? (value as CommerceCheckoutStatus)
    : integrity("D1 returned an invalid checkout status.");
}

function checkoutMode(value: unknown): CommerceCheckoutMode {
  return value === "payment" || value === "subscription"
    ? value
    : integrity("D1 returned an invalid checkout mode.");
}

function parseCheckout(row: CheckoutRow): StoredCheckoutSession {
  if (row.stripe_environment !== "test" || row.livemode !== 0) {
    integrity("D1 returned a checkout outside Stripe Test Mode.");
  }
  return Object.freeze({
    id: id(row.id, "checkout ID"),
    customerUserId: id(row.customer_user_id, "checkout customer ID"),
    commerceProductId: id(row.commerce_product_id, "checkout product ID"),
    commercePriceId: id(row.commerce_price_id, "checkout price ID"),
    licenseRequestId: nullableId(row.license_request_id, "license request ID"),
    mode: checkoutMode(row.mode),
    status: checkoutStatus(row.status),
    returnPath: text(row.return_path, "checkout return path", 2_048),
    stripeCheckoutSessionId: nullableText(
      row.stripe_checkout_session_id,
      "Stripe checkout session ID",
    ),
    stripeCheckoutUrl: nullableText(
      row.stripe_checkout_url,
      "Stripe checkout URL",
    ),
    stripeCustomerId: nullableText(
      row.stripe_customer_id,
      "Stripe customer ID",
    ),
    stripeSubscriptionId: nullableText(
      row.stripe_subscription_id,
      "Stripe subscription ID",
    ),
    amountMinor: positiveInteger(row.amount_minor, "checkout amount"),
    currency: text(row.currency, "checkout currency", 3),
    idempotencyKey: text(row.idempotency_key, "checkout operation key", 1_024),
    requestFingerprint: text(
      row.request_fingerprint,
      "checkout request fingerprint",
      64,
    ),
    expiresAt: nullableText(row.expires_at, "checkout expiry"),
    completedAt: nullableText(row.completed_at, "checkout completion"),
  });
}

const CHECKOUT_QUERY = `SELECT id, customer_user_id, commerce_product_id,
  commerce_price_id, license_request_id, mode, status, return_path,
  stripe_checkout_session_id, stripe_checkout_url, stripe_customer_id,
  stripe_subscription_id, amount_minor, currency, idempotency_key,
  request_fingerprint, stripe_environment, livemode, expires_at, completed_at
FROM checkout_sessions`;

export async function readCheckoutSession(
  binding: D1Database,
  checkoutId: string,
): Promise<StoredCheckoutSession | null> {
  if (!SAFE_ID.test(checkoutId)) return null;
  const row = await binding
    .prepare(`${CHECKOUT_QUERY} WHERE id = ?1 LIMIT 1`)
    .bind(checkoutId)
    .first<CheckoutRow>();
  return row ? parseCheckout(row) : null;
}

export async function readCustomerCheckoutSession(
  binding: D1Database,
  checkoutId: string,
  customerUserId: string,
): Promise<StoredCheckoutSession | null> {
  if (!SAFE_ID.test(checkoutId) || !SAFE_ID.test(customerUserId)) return null;
  const row = await binding
    .prepare(
      `${CHECKOUT_QUERY} WHERE id = ?1 AND customer_user_id = ?2 LIMIT 1`,
    )
    .bind(checkoutId, customerUserId)
    .first<CheckoutRow>();
  return row ? parseCheckout(row) : null;
}

export async function readCommerceProductName(
  binding: D1Database,
  productId: string,
): Promise<string | null> {
  if (!SAFE_ID.test(productId)) return null;
  const row = await binding
    .prepare("SELECT name FROM commerce_products WHERE id = ?1 LIMIT 1")
    .bind(productId)
    .first<{ name: unknown }>();
  return row ? text(row.name, "commerce product name", 160) : null;
}
