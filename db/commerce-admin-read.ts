import { activeOwnerCondition } from "./authority-guards.ts";
import type { CommerceProductState } from "@/lib/commerce-admin/types.ts";
import type {
  CommerceBillingInterval,
  CommerceProductType,
} from "@/lib/commerce/domain.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export interface AdminCommerceLicenseOfferDTO {
  readonly id: string;
  readonly slug: string;
  readonly state: "draft" | "active" | "archived";
  readonly revision: number;
  readonly trackRevisionId: string;
}

export interface AdminCommerceProductSubjectDTO {
  readonly resourceType: "track" | "release" | "collection" | null;
  readonly resourceId: string | null;
  readonly accessPlanId: string | null;
  readonly accessPlanRevision: number | null;
  readonly membershipPlanId: string | null;
  readonly membershipPlanRevision: number | null;
  readonly subscriptionPlanId: string | null;
  readonly creditKind: "download" | "license" | null;
  readonly creditQuantity: number | null;
}

export interface AdminCommerceProductDTO {
  readonly id: string;
  readonly priceId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly productType: CommerceProductType;
  readonly state: CommerceProductState;
  readonly revision: number;
  readonly stripePriceId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingInterval: CommerceBillingInterval;
  readonly intervalCount: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly subject: AdminCommerceProductSubjectDTO;
  readonly licenseOffers: readonly AdminCommerceLicenseOfferDTO[];
}

interface ProductRow {
  id: unknown;
  price_id: unknown;
  slug: unknown;
  name: unknown;
  description: unknown;
  product_type: unknown;
  state: unknown;
  revision: unknown;
  stripe_price_id: unknown;
  amount_minor: unknown;
  currency: unknown;
  billing_interval: unknown;
  interval_count: unknown;
  stripe_environment: unknown;
  livemode: unknown;
  resource_type: unknown;
  resource_id: unknown;
  access_plan_id: unknown;
  access_plan_revision: unknown;
  membership_plan_id: unknown;
  membership_plan_revision: unknown;
  subscription_plan_id: unknown;
  credit_kind: unknown;
  credit_quantity: unknown;
}

interface OfferRow {
  id: unknown;
  slug: unknown;
  state: unknown;
  revision: unknown;
  track_revision_id: unknown;
  commerce_product_id: unknown;
}

interface CountRow {
  count: number;
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
const PRODUCT_STATES = new Set<CommerceProductState>([
  "draft",
  "active",
  "archived",
]);
const BILLING_INTERVALS = new Set<CommerceBillingInterval>([
  "one_time",
  "month",
  "year",
]);

function integrity(message: string): never {
  throw new RuntimeError("COMMERCE_PRODUCT_INTEGRITY", message, {
    status: 500,
    publicMessage: "The test product catalog could not be read safely.",
  });
}

function id(value: unknown, label: string): string {
  return typeof value === "string" && SAFE_ID.test(value)
    ? value
    : integrity(`D1 returned an invalid ${label}.`);
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : integrity(`D1 returned an invalid ${label}.`);
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  return value === null ? null : positiveInteger(value, label);
}

function parseOffer(row: OfferRow): AdminCommerceLicenseOfferDTO {
  if (
    typeof row.slug !== "string" ||
    !SAFE_SLUG.test(row.slug) ||
    (row.state !== "draft" &&
      row.state !== "active" &&
      row.state !== "archived")
  ) {
    return integrity("D1 returned an invalid license-offer reference.");
  }
  return Object.freeze({
    id: id(row.id, "license-offer ID"),
    slug: row.slug,
    state: row.state,
    revision: positiveInteger(row.revision, "license-offer revision"),
    trackRevisionId: id(row.track_revision_id, "license track revision ID"),
  });
}

function parseProduct(
  row: ProductRow,
  offers: readonly AdminCommerceLicenseOfferDTO[],
): AdminCommerceProductDTO {
  if (
    typeof row.slug !== "string" ||
    !SAFE_SLUG.test(row.slug) ||
    typeof row.name !== "string" ||
    row.name.trim().length === 0 ||
    row.name.length > 160 ||
    typeof row.description !== "string" ||
    row.description.length > 4_000 ||
    typeof row.product_type !== "string" ||
    !PRODUCT_TYPES.has(row.product_type as CommerceProductType) ||
    typeof row.state !== "string" ||
    !PRODUCT_STATES.has(row.state as CommerceProductState) ||
    typeof row.stripe_price_id !== "string" ||
    !STRIPE_PRICE_ID.test(row.stripe_price_id) ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    typeof row.billing_interval !== "string" ||
    !BILLING_INTERVALS.has(row.billing_interval as CommerceBillingInterval) ||
    row.stripe_environment !== "test" ||
    row.livemode !== 0
  ) {
    return integrity("D1 returned an invalid commerce product projection.");
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
  return Object.freeze({
    id: id(row.id, "commerce product ID"),
    priceId: id(row.price_id, "commerce price ID"),
    slug: row.slug,
    name: row.name,
    description: row.description,
    productType: row.product_type as CommerceProductType,
    state: row.state as CommerceProductState,
    revision: positiveInteger(row.revision, "commerce product revision"),
    stripePriceId: row.stripe_price_id,
    amountMinor: positiveInteger(row.amount_minor, "test price amount"),
    currency: row.currency,
    billingInterval: row.billing_interval as CommerceBillingInterval,
    intervalCount: positiveInteger(row.interval_count, "billing interval"),
    stripeEnvironment: "test",
    livemode: false,
    subject: Object.freeze({
      resourceType,
      resourceId: nullableId(row.resource_id, "product resource ID"),
      accessPlanId: nullableId(row.access_plan_id, "access-plan ID"),
      accessPlanRevision: nullablePositiveInteger(
        row.access_plan_revision,
        "access-plan revision",
      ),
      membershipPlanId: nullableId(
        row.membership_plan_id,
        "membership-plan ID",
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
    }),
    licenseOffers: Object.freeze([...offers]),
  });
}

export async function readAdminCommerceProducts(
  binding: D1Database,
  ownerUserId: string,
): Promise<readonly AdminCommerceProductDTO[]> {
  const authority = activeOwnerCondition(ownerUserId);
  const authorized = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (authorized?.count !== 1) {
    throw new RuntimeError(
      "COMMERCE_OWNER_REQUIRED",
      "Commerce product administration requires live owner authority.",
      {
        status: 403,
        publicMessage: "Owner access is required to view test products.",
      },
    );
  }

  const [products, offerRows] = await Promise.all([
    binding
      .prepare(
        `SELECT
           commerce_products.id, commerce_products.slug,
           commerce_products.name, commerce_products.description,
           commerce_products.product_type, commerce_products.state,
           commerce_products.revision, commerce_products.resource_type,
           commerce_products.resource_id, commerce_products.access_plan_id,
           commerce_products.access_plan_revision,
           commerce_products.membership_plan_id,
           commerce_products.membership_plan_revision,
           commerce_products.subscription_plan_id,
           commerce_products.credit_kind, commerce_products.credit_quantity,
           commerce_prices.id AS price_id,
           commerce_prices.stripe_price_id, commerce_prices.amount_minor,
           commerce_prices.currency, commerce_prices.billing_interval,
           commerce_prices.interval_count, commerce_prices.stripe_environment,
           commerce_prices.livemode
         FROM commerce_products
         JOIN commerce_prices
           ON commerce_prices.commerce_product_id = commerce_products.id
          AND commerce_prices.revision = 1
          AND commerce_prices.stripe_environment = 'test'
          AND commerce_prices.livemode = 0
         WHERE ${authority.sql}
         ORDER BY commerce_products.created_at DESC, commerce_products.slug`,
      )
      .bind(...authority.bindings)
      .all<ProductRow>(),
    binding
      .prepare(
        `SELECT id, slug, state, revision, track_revision_id,
                commerce_product_id
         FROM license_offers
         WHERE ${authority.sql}
         ORDER BY commerce_product_id, created_at DESC`,
      )
      .bind(...authority.bindings)
      .all<OfferRow>(),
  ]);
  const offersByProduct = new Map<string, AdminCommerceLicenseOfferDTO[]>();
  for (const row of offerRows.results) {
    const productId = id(row.commerce_product_id, "offer product ID");
    const offers = offersByProduct.get(productId) ?? [];
    offers.push(parseOffer(row));
    offersByProduct.set(productId, offers);
  }
  const counts = new Map<string, number>();
  for (const row of products.results) {
    const productId = id(row.id, "commerce product ID");
    counts.set(productId, (counts.get(productId) ?? 0) + 1);
  }
  return Object.freeze(
    products.results.map((row) => {
      const productId = id(row.id, "commerce product ID");
      if (counts.get(productId) !== 1) {
        return integrity(
          "A commerce product does not have exactly one immutable test price.",
        );
      }
      return parseProduct(row, offersByProduct.get(productId) ?? []);
    }),
  );
}
