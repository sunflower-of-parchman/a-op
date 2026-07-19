import {
  COMMERCE_PRODUCT_TYPES,
  type CommerceBillingInterval,
  type CommerceProductType,
} from "@/lib/commerce/domain.ts";
import type {
  CommerceCatalogProductSubjectInput,
  CommerceCreditProductSubjectInput,
  CommerceLicenseProductSubjectInput,
  CommerceLicenseOfferReferenceInput,
  CommerceMembershipProductSubjectInput,
  CommerceProductCreateInput,
  CommerceSubscriptionProductSubjectInput,
  CommerceTestPriceInput,
} from "./types.ts";

export interface CommerceProductValidationIssue {
  readonly field: string;
  readonly message: string;
}

export function validateCommerceLicenseOfferReference(
  value: unknown,
): CommerceProductValidationResult<CommerceLicenseOfferReferenceInput | null> {
  if (value === null) return Object.freeze({ ok: true, value: null });
  const issues: CommerceProductValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(
      issues,
      "licenseOffer",
      "licenseOffer must be null or an exact offer reference.",
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  exactKeys(
    value,
    ["licenseOfferId", "licenseOfferRevision"],
    "licenseOffer",
    issues,
  );
  const licenseOfferId = safeId(
    value.licenseOfferId,
    "licenseOffer.licenseOfferId",
    issues,
  );
  const licenseOfferRevision = positiveInteger(
    value.licenseOfferRevision,
    "licenseOffer.licenseOfferRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  if (
    issues.length > 0 ||
    licenseOfferId === null ||
    licenseOfferRevision === null
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([...issues]),
    });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ licenseOfferId, licenseOfferRevision }),
  });
}

export type CommerceProductValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly CommerceProductValidationIssue[];
    };

export const COMMERCE_PRODUCT_INPUT_LIMITS = Object.freeze({
  slug: 80,
  name: 160,
  description: 4_000,
  amountMinor: 999_999_999,
  intervalCount: 120,
  creditQuantity: 100_000,
} as const);

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRIPE_PRICE_ID = /^price_[A-Za-z0-9]{6,255}$/;
const PRODUCT_TYPES = new Set<CommerceProductType>(COMMERCE_PRODUCT_TYPES);
const ROOT_KEYS = Object.freeze([
  "slug",
  "name",
  "description",
  "productType",
  "subject",
  "price",
] as const);
const PRICE_KEYS = Object.freeze([
  "stripePriceId",
  "amountMinor",
  "currency",
  "billingInterval",
  "intervalCount",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: CommerceProductValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function exactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  prefix: string,
  issues: CommerceProductValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(
        issues,
        prefix ? `${prefix}.${key}` : key,
        `${key} is not supported.`,
      );
    }
  }
}

function text(
  value: unknown,
  field: string,
  limit: number,
  issues: CommerceProductValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issue(issues, field, `${field} must be a string.`);
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > limit) {
    issue(issues, field, `${field} must contain at most ${limit} characters.`);
    return null;
  }
  return normalized;
}

function safeId(
  value: unknown,
  field: string,
  issues: CommerceProductValidationIssue[],
): string | null {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issue(issues, field, `${field} must be a safe application identifier.`);
    return null;
  }
  return value;
}

function positiveInteger(
  value: unknown,
  field: string,
  maximum: number,
  issues: CommerceProductValidationIssue[],
): number | null {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  ) {
    issue(
      issues,
      field,
      `${field} must be an integer between 1 and ${maximum}.`,
    );
    return null;
  }
  return value as number;
}

function slug(
  value: unknown,
  issues: CommerceProductValidationIssue[],
): string | null {
  if (typeof value !== "string") {
    issue(issues, "slug", "slug must be a normalized route segment.");
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > COMMERCE_PRODUCT_INPUT_LIMITS.slug ||
    !SAFE_SLUG.test(normalized)
  ) {
    issue(issues, "slug", "slug must be a normalized route segment.");
    return null;
  }
  return normalized;
}

function parseProductType(
  value: unknown,
  issues: CommerceProductValidationIssue[],
): CommerceProductType | null {
  if (
    typeof value !== "string" ||
    !PRODUCT_TYPES.has(value as CommerceProductType)
  ) {
    issue(issues, "productType", "productType is not supported.");
    return null;
  }
  return value as CommerceProductType;
}

function parsePrice(
  value: unknown,
  productType: CommerceProductType | null,
  issues: CommerceProductValidationIssue[],
): CommerceTestPriceInput | null {
  if (!isRecord(value)) {
    issue(issues, "price", "price must be an object.");
    return null;
  }
  exactKeys(value, PRICE_KEYS, "price", issues);
  const stripePriceId =
    typeof value.stripePriceId === "string" &&
    STRIPE_PRICE_ID.test(value.stripePriceId)
      ? value.stripePriceId
      : null;
  if (stripePriceId === null) {
    issue(
      issues,
      "price.stripePriceId",
      "stripePriceId must be a Stripe price_ identifier.",
    );
  }
  const amountMinor = positiveInteger(
    value.amountMinor,
    "price.amountMinor",
    COMMERCE_PRODUCT_INPUT_LIMITS.amountMinor,
    issues,
  );
  const currency =
    typeof value.currency === "string"
      ? value.currency.trim().toUpperCase()
      : null;
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    issue(
      issues,
      "price.currency",
      "currency must be a three-letter currency code.",
    );
  }
  const billingInterval =
    value.billingInterval === "one_time" ||
    value.billingInterval === "month" ||
    value.billingInterval === "year"
      ? value.billingInterval
      : null;
  if (billingInterval === null) {
    issue(
      issues,
      "price.billingInterval",
      "billingInterval must be one_time, month, or year.",
    );
  }
  const intervalCount = positiveInteger(
    value.intervalCount,
    "price.intervalCount",
    COMMERCE_PRODUCT_INPUT_LIMITS.intervalCount,
    issues,
  );
  if (
    productType !== null &&
    billingInterval !== null &&
    ((productType === "subscription" && billingInterval === "one_time") ||
      (productType !== "subscription" && billingInterval !== "one_time"))
  ) {
    issue(
      issues,
      "price.billingInterval",
      productType === "subscription"
        ? "A subscription requires a recurring month or year interval."
        : "This product requires a one_time interval.",
    );
  }
  if (
    stripePriceId === null ||
    amountMinor === null ||
    currency === null ||
    billingInterval === null ||
    intervalCount === null
  ) {
    return null;
  }
  return Object.freeze({
    stripePriceId,
    amountMinor,
    currency,
    billingInterval: billingInterval as CommerceBillingInterval,
    intervalCount,
  });
}

function parseCatalogSubject(
  value: Record<string, unknown>,
  issues: CommerceProductValidationIssue[],
): CommerceCatalogProductSubjectInput | null {
  exactKeys(
    value,
    [
      "resourceId",
      "resourceRevisionId",
      "resourceVersion",
      "accessPlanId",
      "accessPlanRevision",
    ],
    "subject",
    issues,
  );
  const resourceId = safeId(value.resourceId, "subject.resourceId", issues);
  const resourceRevisionId = safeId(
    value.resourceRevisionId,
    "subject.resourceRevisionId",
    issues,
  );
  const resourceVersion = positiveInteger(
    value.resourceVersion,
    "subject.resourceVersion",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  const accessPlanId = safeId(
    value.accessPlanId,
    "subject.accessPlanId",
    issues,
  );
  const accessPlanRevision = positiveInteger(
    value.accessPlanRevision,
    "subject.accessPlanRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  return resourceId === null ||
    resourceRevisionId === null ||
    resourceVersion === null ||
    accessPlanId === null ||
    accessPlanRevision === null
    ? null
    : Object.freeze({
        resourceId,
        resourceRevisionId,
        resourceVersion,
        accessPlanId,
        accessPlanRevision,
      });
}

function parseMembershipSubject(
  value: Record<string, unknown>,
  issues: CommerceProductValidationIssue[],
): CommerceMembershipProductSubjectInput | null {
  exactKeys(
    value,
    ["membershipPlanId", "membershipPlanRevision"],
    "subject",
    issues,
  );
  const membershipPlanId = safeId(
    value.membershipPlanId,
    "subject.membershipPlanId",
    issues,
  );
  const membershipPlanRevision = positiveInteger(
    value.membershipPlanRevision,
    "subject.membershipPlanRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  return membershipPlanId === null || membershipPlanRevision === null
    ? null
    : Object.freeze({ membershipPlanId, membershipPlanRevision });
}

function parseSubscriptionSubject(
  value: Record<string, unknown>,
  issues: CommerceProductValidationIssue[],
): CommerceSubscriptionProductSubjectInput | null {
  exactKeys(
    value,
    ["subscriptionPlanId", "subscriptionPlanRevision"],
    "subject",
    issues,
  );
  const subscriptionPlanId = safeId(
    value.subscriptionPlanId,
    "subject.subscriptionPlanId",
    issues,
  );
  const subscriptionPlanRevision = positiveInteger(
    value.subscriptionPlanRevision,
    "subject.subscriptionPlanRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  return subscriptionPlanId === null || subscriptionPlanRevision === null
    ? null
    : Object.freeze({ subscriptionPlanId, subscriptionPlanRevision });
}

function parseLicenseSubject(
  value: Record<string, unknown>,
  issues: CommerceProductValidationIssue[],
): CommerceLicenseProductSubjectInput | null {
  exactKeys(
    value,
    ["trackId", "trackRevisionId", "trackVersion"],
    "subject",
    issues,
  );
  const trackId = safeId(value.trackId, "subject.trackId", issues);
  const trackRevisionId = safeId(
    value.trackRevisionId,
    "subject.trackRevisionId",
    issues,
  );
  const trackVersion = positiveInteger(
    value.trackVersion,
    "subject.trackVersion",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  return trackId === null || trackRevisionId === null || trackVersion === null
    ? null
    : Object.freeze({ trackId, trackRevisionId, trackVersion });
}

function parseCreditSubject(
  value: Record<string, unknown>,
  issues: CommerceProductValidationIssue[],
): CommerceCreditProductSubjectInput | null {
  exactKeys(value, ["quantity"], "subject", issues);
  const quantity = positiveInteger(
    value.quantity,
    "subject.quantity",
    COMMERCE_PRODUCT_INPUT_LIMITS.creditQuantity,
    issues,
  );
  return quantity === null ? null : Object.freeze({ quantity });
}

export function validateCommerceProductCreateInput(
  value: unknown,
): CommerceProductValidationResult<CommerceProductCreateInput> {
  const issues: CommerceProductValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "product", "Commerce product must be an object.");
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  exactKeys(value, ROOT_KEYS, "", issues);
  const parsedSlug = slug(value.slug, issues);
  const name = text(
    value.name,
    "name",
    COMMERCE_PRODUCT_INPUT_LIMITS.name,
    issues,
  );
  const description = text(
    value.description,
    "description",
    COMMERCE_PRODUCT_INPUT_LIMITS.description,
    issues,
    true,
  );
  const productType = parseProductType(value.productType, issues);
  const price = parsePrice(value.price, productType, issues);
  let subject:
    | CommerceCatalogProductSubjectInput
    | CommerceMembershipProductSubjectInput
    | CommerceSubscriptionProductSubjectInput
    | CommerceLicenseProductSubjectInput
    | CommerceCreditProductSubjectInput
    | null = null;
  if (!isRecord(value.subject)) {
    issue(issues, "subject", "subject must be an object.");
  } else if (
    productType === "track" ||
    productType === "release" ||
    productType === "collection"
  ) {
    subject = parseCatalogSubject(value.subject, issues);
  } else if (productType === "membership") {
    subject = parseMembershipSubject(value.subject, issues);
  } else if (productType === "subscription") {
    subject = parseSubscriptionSubject(value.subject, issues);
  } else if (productType === "license") {
    subject = parseLicenseSubject(value.subject, issues);
  } else if (
    productType === "download-credits" ||
    productType === "license-credits"
  ) {
    subject = parseCreditSubject(value.subject, issues);
  }
  if (
    issues.length > 0 ||
    parsedSlug === null ||
    name === null ||
    description === null ||
    productType === null ||
    subject === null ||
    price === null
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([...issues]),
    });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      slug: parsedSlug,
      name,
      description,
      productType,
      subject,
      price,
    } as CommerceProductCreateInput),
  });
}
