import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  validateMembershipActivationInput,
  validateMembershipPlanCreateInput,
  validateMembershipPlanRevisionInput,
  validateStripeTestSubscriptionActivationInput,
  validateStripeTestSubscriptionReconciliationInput,
  validateStripeTestSubscriptionRenewalInput,
  validateSubscriptionActivationInput,
  validateSubscriptionPlanCreateInput,
  validateSubscriptionPlanRevisionInput,
} = await import("../lib/memberships/validation.ts");

function membershipPlan(overrides = {}) {
  return {
    slug: "listener-circle",
    name: "Listener circle",
    description: "Fictional membership benefits.",
    benefits: ["Protected releases", "One monthly download"],
    accessPlanId: "access_plan_listener",
    accessPlanRevision: 2,
    downloadCredits: 1,
    licenseCredits: 0,
    durationDays: 30,
    state: "active",
    ...overrides,
  };
}

test("membership inputs normalize exact server-owned definitions", () => {
  const result = validateMembershipPlanCreateInput(
    membershipPlan({ slug: " Listener-Circle ", description: "  Notes  " }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    slug: "listener-circle",
    state: "active",
    name: "Listener circle",
    description: "Notes",
    benefits: ["Protected releases", "One monthly download"],
    accessPlanId: "access_plan_listener",
    accessPlanRevision: 2,
    downloadCredits: 1,
    licenseCredits: 0,
    durationDays: 30,
  });
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.benefits), true);

  const revision = { ...membershipPlan() };
  delete revision.slug;
  delete revision.state;
  assert.equal(validateMembershipPlanRevisionInput(revision).ok, true);
});

test("membership definitions reject mismatched access revisions, duplicate benefits, and extra facts", () => {
  const result = validateMembershipPlanCreateInput(
    membershipPlan({
      accessPlanRevision: null,
      benefits: ["Same", "Same"],
      customerUserId: "browser_claim",
    }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map(({ field }) => field).sort(), [
    "accessPlanId",
    "benefits",
    "customerUserId",
  ]);
});

test("subscription plans freeze one membership revision and cadence", () => {
  const result = validateSubscriptionPlanCreateInput({
    slug: "monthly-listener",
    name: "Monthly listener",
    description: "Fictional recurring access.",
    membershipPlanId: "membership_plan_listener",
    membershipPlanRevision: 3,
    billingInterval: "month",
    intervalCount: 1,
    state: "active",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.membershipPlanRevision, 3);

  assert.equal(
    validateSubscriptionPlanCreateInput({
      ...result.value,
      billingInterval: "week",
    }).ok,
    false,
  );
  const revision = { ...result.value };
  delete revision.slug;
  delete revision.state;
  assert.equal(validateSubscriptionPlanRevisionInput(revision).ok, true);
});

test("activation contracts accept only customer, frozen plan, and normalized start time", () => {
  const membership = validateMembershipActivationInput({
    membershipPlanId: "membership_plan_listener",
    membershipPlanRevision: 2,
    customerUserId: "customer_listener",
    startsAt: "2026-07-18T12:00:00-06:00",
  });
  assert.equal(membership.ok, true);
  assert.equal(membership.value.startsAt, "2026-07-18T18:00:00.000Z");

  const subscription = validateSubscriptionActivationInput({
    subscriptionPlanId: "subscription_plan_monthly",
    subscriptionPlanRevision: 1,
    customerUserId: "customer_listener",
    startsAt: "2026-07-18T18:00:00.000Z",
  });
  assert.equal(subscription.ok, true);

  assert.equal(
    validateSubscriptionActivationInput({
      ...subscription.value,
      entitlementId: "browser_selected",
    }).ok,
    false,
  );
});

test("Stripe Test subscription contracts pin invoice reasons and no-order state events", () => {
  const providerFacts = {
    customerUserId: "customer_listener",
    commerceProductId: "commerce_product_monthly",
    commercePriceId: "commerce_price_monthly",
    commerceEventId: "commerce_event_invoice",
    orderId: "order_invoice",
    fulfillmentEventId: "fulfillment_invoice",
    factsFingerprint: "a".repeat(64),
    stripeEventId: "evt_InvoiceContract001",
    stripeObjectId: "in_InvoiceContract001",
    fulfillmentProviderObjectId: "in_InvoiceContract001",
    providerEventCreatedAt: "2026-07-20T00:05:00-06:00",
  };
  const activation = validateStripeTestSubscriptionActivationInput({
    ...providerFacts,
    billingReason: "subscription_create",
    stripeCustomerId: "cus_ContractCustomer001",
    stripeSubscriptionId: "sub_ContractSubscription001",
    periodStart: "2026-07-20T00:00:00.000Z",
    periodEnd: "2026-08-20T00:00:00.000Z",
  });
  assert.equal(activation.ok, true);
  assert.equal(
    activation.value.providerEventCreatedAt,
    "2026-07-20T06:05:00.000Z",
  );
  assert.equal(
    validateStripeTestSubscriptionActivationInput({
      ...activation.value,
      billingReason: "subscription_cycle",
    }).ok,
    false,
  );

  const renewal = validateStripeTestSubscriptionRenewalInput({
    ...providerFacts,
    billingReason: "subscription_cycle",
    subscriptionId: "subscription_contract",
    stripeCustomerId: "cus_ContractCustomer001",
    stripeSubscriptionId: "sub_ContractSubscription001",
    expectedRevision: 1,
    periodStart: "2026-08-20T00:00:00.000Z",
    periodEnd: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(renewal.ok, true);
  assert.equal(
    validateStripeTestSubscriptionRenewalInput({
      ...renewal.value,
      billingReason: "subscription_create",
    }).ok,
    false,
  );

  const reconciliation = validateStripeTestSubscriptionReconciliationInput({
    ...providerFacts,
    orderId: null,
    stripeObjectId: "sub_ContractSubscription001",
    fulfillmentProviderObjectId: "sub_ContractSubscription001",
    subscriptionId: "subscription_contract",
    stripeCustomerId: "cus_ContractCustomer001",
    stripeSubscriptionId: "sub_ContractSubscription001",
    expectedRevision: 2,
    targetState: "paused",
  });
  assert.equal(reconciliation.ok, true);
  assert.equal(
    validateStripeTestSubscriptionReconciliationInput({
      ...reconciliation.value,
      orderId: "order_browser_claim",
    }).ok,
    false,
  );
});
