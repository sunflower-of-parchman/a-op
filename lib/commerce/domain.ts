export const STRIPE_TEST_MODE_LABEL = "Stripe Test Mode" as const;
export const NO_REAL_PAYMENT_STATEMENT =
  "No real payment will be accepted." as const;

export const COMMERCE_PRODUCT_TYPES = Object.freeze([
  "track",
  "release",
  "collection",
  "membership",
  "subscription",
  "license",
  "download-credits",
  "license-credits",
] as const);

export type CommerceProductType = (typeof COMMERCE_PRODUCT_TYPES)[number];
export type CommerceBillingInterval = "one_time" | "month" | "year";
export type CommerceCheckoutMode = "payment" | "subscription";
export type CommerceCheckoutStatus =
  "creating" | "open" | "completed" | "expired" | "canceled" | "failed";

export interface CommerceTestStatusDTO {
  readonly adapter: "stripe-test-simulation";
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly label: typeof STRIPE_TEST_MODE_LABEL;
  readonly statement: typeof NO_REAL_PAYMENT_STATEMENT;
}

export interface CommerceProductDTO extends CommerceTestStatusDTO {
  readonly id: string;
  readonly slug: string;
  /**
   * Stable, provider-neutral fragment rendered on the public offer row. For
   * membership and subscription products this follows the linked plan slug so
   * What's New can target the exact domain record.
   */
  readonly offerAnchorId: string;
  readonly name: string;
  readonly description: string;
  readonly productType: CommerceProductType;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingInterval: CommerceBillingInterval;
  readonly intervalCount: number;
  readonly resourceType: "track" | "release" | "collection" | null;
  readonly resourceId: string | null;
}

export interface CommerceCheckoutSelection {
  readonly productId: string;
  readonly licenseRequestId: string | null;
}

export interface CommerceCheckoutReceipt extends CommerceTestStatusDTO {
  readonly checkoutId: string;
  readonly productId: string;
  readonly productName: string;
  readonly mode: CommerceCheckoutMode;
  readonly status: CommerceCheckoutStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly checkoutUrl: string | null;
  readonly returnPath: string;
  readonly replayed: boolean;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseCommerceCheckoutSelection(
  value: unknown,
): CommerceCheckoutSelection {
  if (!isRecord(value)) {
    throw new TypeError("A checkout selection object is required.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length < 1 ||
    keys.length > 2 ||
    !keys.includes("productId") ||
    keys.some((key) => key !== "productId" && key !== "licenseRequestId") ||
    typeof value.productId !== "string" ||
    !SAFE_ID.test(value.productId) ||
    (value.licenseRequestId !== undefined &&
      (typeof value.licenseRequestId !== "string" ||
        !SAFE_ID.test(value.licenseRequestId)))
  ) {
    throw new TypeError("The checkout selection is invalid.");
  }

  return Object.freeze({
    productId: value.productId,
    licenseRequestId:
      typeof value.licenseRequestId === "string"
        ? value.licenseRequestId
        : null,
  });
}

export function commerceTestStatus(): CommerceTestStatusDTO {
  return Object.freeze({
    adapter: "stripe-test-simulation",
    stripeEnvironment: "test",
    livemode: false,
    label: STRIPE_TEST_MODE_LABEL,
    statement: NO_REAL_PAYMENT_STATEMENT,
  });
}
