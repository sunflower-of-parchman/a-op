import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  validateCommerceLicenseOfferReference,
  validateCommerceProductCreateInput,
} = await import("../lib/commerce-admin/validation.ts");

function price(overrides = {}) {
  return {
    stripePriceId: "price_AopAdminTest001",
    amountMinor: 900,
    currency: "usd",
    billingInterval: "one_time",
    intervalCount: 1,
    ...overrides,
  };
}

function product(productType, subject, overrides = {}) {
  return {
    slug: `${productType}-offer`,
    name: `  Fictional ${productType} offer  `,
    description: "  A fictional test product.  ",
    productType,
    subject,
    price: price(),
    ...overrides,
  };
}

test("commerce product validation accepts every exact server-owned product shape", () => {
  const catalogSubject = {
    resourceId: "track_admin",
    resourceRevisionId: "track_admin_r1",
    resourceVersion: 1,
    accessPlanId: "access_plan_admin",
    accessPlanRevision: 2,
  };
  const candidates = [
    product("track", catalogSubject),
    product("release", {
      ...catalogSubject,
      resourceId: "release_admin",
      resourceRevisionId: "release_admin_r1",
    }),
    product("collection", {
      ...catalogSubject,
      resourceId: "collection_admin",
      resourceRevisionId: "collection_admin_r1",
    }),
    product("membership", {
      membershipPlanId: "membership_plan_admin",
      membershipPlanRevision: 3,
    }),
    product(
      "subscription",
      {
        subscriptionPlanId: "subscription_plan_admin",
        subscriptionPlanRevision: 4,
      },
      { price: price({ billingInterval: "month" }) },
    ),
    product("license", {
      trackId: "track_admin",
      trackRevisionId: "track_admin_r1",
      trackVersion: 1,
    }),
    product("download-credits", { quantity: 5 }),
    product("license-credits", { quantity: 2 }),
  ];

  for (const candidate of candidates) {
    const result = validateCommerceProductCreateInput(candidate);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(result.value.name.startsWith("Fictional"), true);
    assert.equal(result.value.description, "A fictional test product.");
    assert.equal(result.value.price.currency, "USD");
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.subject), true);
    assert.equal(Object.isFrozen(result.value.price), true);
  }
});

test("commerce product validation rejects browser authority and live or non-price identifiers", () => {
  const invalid = validateCommerceProductCreateInput({
    ...product("download-credits", {
      quantity: 2,
      customerUserId: "customer_browser_claim",
    }),
    state: "active",
    productId: "product_browser_claim",
    accessGrantId: "grant_browser_claim",
    entitlementId: "entitlement_browser_claim",
    livemode: true,
    stripeEnvironment: "live",
    price: {
      ...price(),
      stripePriceId: "pk_live_not_a_price",
      commercePriceId: "price_browser_claim",
      cardNumber: "4242424242424242",
    },
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.issues.map(({ field }) => field).sort(), [
    "accessGrantId",
    "entitlementId",
    "livemode",
    "price.cardNumber",
    "price.commercePriceId",
    "price.stripePriceId",
    "productId",
    "state",
    "stripeEnvironment",
    "subject.customerUserId",
  ]);

  const recurringMembership = validateCommerceProductCreateInput(
    product(
      "membership",
      {
        membershipPlanId: "membership_plan_admin",
        membershipPlanRevision: 1,
      },
      { price: price({ billingInterval: "month" }) },
    ),
  );
  assert.equal(recurringMembership.ok, false);
  assert.equal(
    recurringMembership.issues.some(
      ({ field }) => field === "price.billingInterval",
    ),
    true,
  );
  const oneTimeSubscription = validateCommerceProductCreateInput(
    product("subscription", {
      subscriptionPlanId: "subscription_plan_admin",
      subscriptionPlanRevision: 1,
    }),
  );
  assert.equal(oneTimeSubscription.ok, false);
});

test("license activation accepts only an exact offer revision or null", () => {
  const exact = validateCommerceLicenseOfferReference({
    licenseOfferId: "license_offer_admin",
    licenseOfferRevision: 2,
  });
  assert.equal(exact.ok, true);
  assert.equal(Object.isFrozen(exact.value), true);
  assert.equal(validateCommerceLicenseOfferReference(null).ok, true);

  const invalid = validateCommerceLicenseOfferReference({
    licenseOfferId: "license_offer_admin",
    licenseOfferRevision: 0,
    customerUserId: "customer_browser_claim",
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.issues.map(({ field }) => field).sort(), [
    "licenseOffer.customerUserId",
    "licenseOffer.licenseOfferRevision",
  ]);
});
