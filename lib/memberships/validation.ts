import type {
  MembershipActivationInput,
  MembershipPlanCreateInput,
  MembershipPlanDefinitionInput,
  MembershipPlanRevisionInput,
  StripeTestFulfillmentReferenceInput,
  StripeTestMembershipActivationInput,
  StripeTestSubscriptionActivationInput,
  StripeTestSubscriptionReconciliationInput,
  StripeTestSubscriptionRenewalInput,
  StripeTestSubscriptionStateReferenceInput,
  SubscriptionActivationInput,
  SubscriptionPlanCreateInput,
  SubscriptionPlanRevisionInput,
} from "./types.ts";

export interface MembershipValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type MembershipValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly MembershipValidationIssue[];
    };

export const MEMBERSHIP_INPUT_LIMITS = Object.freeze({
  slug: 80,
  name: 120,
  description: 4_000,
  benefits: 32,
  benefit: 160,
  credits: 100_000,
  durationDays: 36_500,
  intervalCount: 120,
} as const);

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;
const STRIPE_EVENT_ID = /^evt_[A-Za-z0-9]{6,255}$/;
const STRIPE_OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,254}$/;
const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]{6,255}$/;
const STRIPE_SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{6,255}$/;

const STRIPE_TEST_FULFILLMENT_KEYS = Object.freeze([
  "customerUserId",
  "commerceProductId",
  "commercePriceId",
  "commerceEventId",
  "orderId",
  "fulfillmentEventId",
  "factsFingerprint",
  "stripeEventId",
  "stripeObjectId",
  "fulfillmentProviderObjectId",
  "providerEventCreatedAt",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: MembershipValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  issues: MembershipValidationIssue[],
): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) issue(issues, key, `${key} is not supported.`);
  }
}

function valid<T>(value: T): MembershipValidationResult<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) });
}

function invalid<T>(
  issues: readonly MembershipValidationIssue[],
): MembershipValidationResult<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function text(
  value: unknown,
  field: string,
  limit: number,
  issues: MembershipValidationIssue[],
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

function id(
  value: unknown,
  field: string,
  issues: MembershipValidationIssue[],
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
  limit: number,
  issues: MembershipValidationIssue[],
): number | null {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > limit
  ) {
    issue(issues, field, `${field} must be an integer between 1 and ${limit}.`);
    return null;
  }
  return value as number;
}

function nonnegativeInteger(
  value: unknown,
  field: string,
  limit: number,
  issues: MembershipValidationIssue[],
): number | null {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > limit
  ) {
    issue(issues, field, `${field} must be an integer between 0 and ${limit}.`);
    return null;
  }
  return value as number;
}

function timestamp(
  value: unknown,
  field: string,
  issues: MembershipValidationIssue[],
): string | null {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    issue(issues, field, `${field} must be an ISO-compatible timestamp.`);
    return null;
  }
  return new Date(Date.parse(value)).toISOString();
}

function providerId(
  value: unknown,
  field: string,
  pattern: RegExp,
  issues: MembershipValidationIssue[],
): string | null {
  if (typeof value !== "string" || !pattern.test(value)) {
    issue(issues, field, `${field} is not a valid Stripe Test identifier.`);
    return null;
  }
  return value;
}

function stripeTestFulfillmentReference(
  value: Record<string, unknown>,
  issues: MembershipValidationIssue[],
): StripeTestFulfillmentReferenceInput | null {
  const customerUserId = id(value.customerUserId, "customerUserId", issues);
  const commerceProductId = id(
    value.commerceProductId,
    "commerceProductId",
    issues,
  );
  const commercePriceId = id(value.commercePriceId, "commercePriceId", issues);
  const commerceEventId = id(value.commerceEventId, "commerceEventId", issues);
  const orderId = id(value.orderId, "orderId", issues);
  const fulfillmentEventId = id(
    value.fulfillmentEventId,
    "fulfillmentEventId",
    issues,
  );
  const stripeEventId = providerId(
    value.stripeEventId,
    "stripeEventId",
    STRIPE_EVENT_ID,
    issues,
  );
  const stripeObjectId = providerId(
    value.stripeObjectId,
    "stripeObjectId",
    STRIPE_OBJECT_ID,
    issues,
  );
  const fulfillmentProviderObjectId = providerId(
    value.fulfillmentProviderObjectId,
    "fulfillmentProviderObjectId",
    STRIPE_OBJECT_ID,
    issues,
  );
  const providerEventCreatedAt = timestamp(
    value.providerEventCreatedAt,
    "providerEventCreatedAt",
    issues,
  );
  const factsFingerprint =
    typeof value.factsFingerprint === "string" &&
    SHA256_FINGERPRINT.test(value.factsFingerprint)
      ? value.factsFingerprint
      : null;
  if (factsFingerprint === null) {
    issue(
      issues,
      "factsFingerprint",
      "factsFingerprint must be a lowercase SHA-256 digest.",
    );
  }
  if (
    customerUserId === null ||
    commerceProductId === null ||
    commercePriceId === null ||
    commerceEventId === null ||
    orderId === null ||
    fulfillmentEventId === null ||
    factsFingerprint === null ||
    stripeEventId === null ||
    stripeObjectId === null ||
    fulfillmentProviderObjectId === null ||
    providerEventCreatedAt === null
  ) {
    return null;
  }
  return Object.freeze({
    customerUserId,
    commerceProductId,
    commercePriceId,
    commerceEventId,
    orderId,
    fulfillmentEventId,
    factsFingerprint,
    stripeEventId,
    stripeObjectId,
    fulfillmentProviderObjectId,
    providerEventCreatedAt,
  });
}

function stripeTestSubscriptionStateReference(
  value: Record<string, unknown>,
  issues: MembershipValidationIssue[],
): StripeTestSubscriptionStateReferenceInput | null {
  if (value.orderId !== null) {
    issue(
      issues,
      "orderId",
      "orderId must be null for a subscription state event.",
    );
  }
  const reference = stripeTestFulfillmentReference(
    { ...value, orderId: "subscription-state-no-order" },
    issues,
  );
  return reference === null
    ? null
    : Object.freeze({ ...reference, orderId: null });
}

function benefits(
  value: unknown,
  issues: MembershipValidationIssue[],
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > MEMBERSHIP_INPUT_LIMITS.benefits
  ) {
    issue(
      issues,
      "benefits",
      `benefits must contain at most ${MEMBERSHIP_INPUT_LIMITS.benefits} labels.`,
    );
    return Object.freeze([]);
  }
  const parsed = value.flatMap((candidate, index) => {
    const normalized = text(
      candidate,
      `benefits.${index}`,
      MEMBERSHIP_INPUT_LIMITS.benefit,
      issues,
    );
    return normalized === null ? [] : [normalized];
  });
  if (new Set(parsed).size !== parsed.length) {
    issue(issues, "benefits", "Benefit labels must be unique.");
  }
  return Object.freeze(parsed);
}

function definition(
  value: Record<string, unknown>,
  issues: MembershipValidationIssue[],
): MembershipPlanDefinitionInput | null {
  const name = text(value.name, "name", MEMBERSHIP_INPUT_LIMITS.name, issues);
  const description = text(
    value.description,
    "description",
    MEMBERSHIP_INPUT_LIMITS.description,
    issues,
    true,
  );
  const parsedBenefits = benefits(value.benefits, issues);
  const accessPlanId =
    value.accessPlanId === null
      ? null
      : id(value.accessPlanId, "accessPlanId", issues);
  const accessPlanRevision =
    value.accessPlanRevision === null
      ? null
      : positiveInteger(
          value.accessPlanRevision,
          "accessPlanRevision",
          Number.MAX_SAFE_INTEGER,
          issues,
        );
  if ((accessPlanId === null) !== (accessPlanRevision === null)) {
    issue(
      issues,
      "accessPlanId",
      "accessPlanId and accessPlanRevision must both be set or both be null.",
    );
  }
  const downloadCredits = nonnegativeInteger(
    value.downloadCredits,
    "downloadCredits",
    MEMBERSHIP_INPUT_LIMITS.credits,
    issues,
  );
  const licenseCredits = nonnegativeInteger(
    value.licenseCredits,
    "licenseCredits",
    MEMBERSHIP_INPUT_LIMITS.credits,
    issues,
  );
  const durationDays =
    value.durationDays === null
      ? null
      : positiveInteger(
          value.durationDays,
          "durationDays",
          MEMBERSHIP_INPUT_LIMITS.durationDays,
          issues,
        );
  if (
    name === null ||
    description === null ||
    downloadCredits === null ||
    licenseCredits === null ||
    issues.length > 0
  ) {
    return null;
  }
  return Object.freeze({
    name,
    description,
    benefits: parsedBenefits,
    accessPlanId,
    accessPlanRevision,
    downloadCredits,
    licenseCredits,
    durationDays,
  });
}

export function validateMembershipPlanCreateInput(
  value: unknown,
): MembershipValidationResult<MembershipPlanCreateInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "plan", "Membership plan must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "slug",
      "name",
      "description",
      "benefits",
      "accessPlanId",
      "accessPlanRevision",
      "downloadCredits",
      "licenseCredits",
      "durationDays",
      "state",
    ],
    issues,
  );
  const rawSlug = text(
    value.slug,
    "slug",
    MEMBERSHIP_INPUT_LIMITS.slug,
    issues,
  );
  const slug = rawSlug?.toLowerCase() ?? null;
  if (slug !== null && !SAFE_SLUG.test(slug)) {
    issue(issues, "slug", "slug must be a normalized route segment.");
  }
  if (value.state !== "draft" && value.state !== "active") {
    issue(issues, "state", "state must be draft or active.");
  }
  const parsedDefinition = definition(value, issues);
  if (slug === null || parsedDefinition === null || issues.length > 0) {
    return invalid(issues);
  }
  return valid({
    slug,
    state: value.state as MembershipPlanCreateInput["state"],
    ...parsedDefinition,
  });
}

export function validateMembershipPlanRevisionInput(
  value: unknown,
): MembershipValidationResult<MembershipPlanRevisionInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "plan", "Membership plan revision must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "name",
      "description",
      "benefits",
      "accessPlanId",
      "accessPlanRevision",
      "downloadCredits",
      "licenseCredits",
      "durationDays",
    ],
    issues,
  );
  const parsed = definition(value, issues);
  return parsed === null || issues.length > 0 ? invalid(issues) : valid(parsed);
}

export function validateSubscriptionPlanCreateInput(
  value: unknown,
): MembershipValidationResult<SubscriptionPlanCreateInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "plan", "Subscription plan must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "slug",
      "name",
      "description",
      "membershipPlanId",
      "membershipPlanRevision",
      "billingInterval",
      "intervalCount",
      "state",
    ],
    issues,
  );
  const rawSlug = text(
    value.slug,
    "slug",
    MEMBERSHIP_INPUT_LIMITS.slug,
    issues,
  );
  const slug = rawSlug?.toLowerCase() ?? null;
  if (slug !== null && !SAFE_SLUG.test(slug)) {
    issue(issues, "slug", "slug must be a normalized route segment.");
  }
  const name = text(value.name, "name", MEMBERSHIP_INPUT_LIMITS.name, issues);
  const description = text(
    value.description,
    "description",
    MEMBERSHIP_INPUT_LIMITS.description,
    issues,
    true,
  );
  const membershipPlanId = id(
    value.membershipPlanId,
    "membershipPlanId",
    issues,
  );
  const membershipPlanRevision = positiveInteger(
    value.membershipPlanRevision,
    "membershipPlanRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  if (value.billingInterval !== "month" && value.billingInterval !== "year") {
    issue(issues, "billingInterval", "billingInterval must be month or year.");
  }
  const intervalCount = positiveInteger(
    value.intervalCount,
    "intervalCount",
    MEMBERSHIP_INPUT_LIMITS.intervalCount,
    issues,
  );
  if (value.state !== "draft" && value.state !== "active") {
    issue(issues, "state", "state must be draft or active.");
  }
  if (
    slug === null ||
    name === null ||
    description === null ||
    membershipPlanId === null ||
    membershipPlanRevision === null ||
    intervalCount === null ||
    issues.length > 0
  ) {
    return invalid(issues);
  }
  return valid({
    slug,
    name,
    description,
    membershipPlanId,
    membershipPlanRevision,
    billingInterval:
      value.billingInterval as SubscriptionPlanCreateInput["billingInterval"],
    intervalCount,
    state: value.state as SubscriptionPlanCreateInput["state"],
  });
}

export function validateSubscriptionPlanRevisionInput(
  value: unknown,
): MembershipValidationResult<SubscriptionPlanRevisionInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "plan", "Subscription plan revision must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "name",
      "description",
      "membershipPlanId",
      "membershipPlanRevision",
      "billingInterval",
      "intervalCount",
    ],
    issues,
  );
  if (issues.length > 0) return invalid(issues);
  const parsed = validateSubscriptionPlanCreateInput({
    ...value,
    slug: "revision",
    state: "draft",
  });
  if (!parsed.ok) {
    return invalid(
      parsed.issues.filter(
        ({ field }) => field !== "slug" && field !== "state",
      ),
    );
  }
  return valid({
    name: parsed.value.name,
    description: parsed.value.description,
    membershipPlanId: parsed.value.membershipPlanId,
    membershipPlanRevision: parsed.value.membershipPlanRevision,
    billingInterval: parsed.value.billingInterval,
    intervalCount: parsed.value.intervalCount,
  });
}

function activation<
  T extends MembershipActivationInput | SubscriptionActivationInput,
>(
  value: unknown,
  kind: "membership" | "subscription",
): MembershipValidationResult<T> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, kind, `${kind} activation must be an object.`);
    return invalid(issues);
  }
  const planIdField = `${kind}PlanId`;
  const planRevisionField = `${kind}PlanRevision`;
  exactKeys(
    value,
    [planIdField, planRevisionField, "customerUserId", "startsAt"],
    issues,
  );
  const planId = id(value[planIdField], planIdField, issues);
  const planRevision = positiveInteger(
    value[planRevisionField],
    planRevisionField,
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  const customerUserId = id(value.customerUserId, "customerUserId", issues);
  const startsAt = timestamp(value.startsAt, "startsAt", issues);
  if (
    planId === null ||
    planRevision === null ||
    customerUserId === null ||
    startsAt === null ||
    issues.length > 0
  ) {
    return invalid(issues);
  }
  return valid({
    [planIdField]: planId,
    [planRevisionField]: planRevision,
    customerUserId,
    startsAt,
  } as unknown as T);
}

export function validateMembershipActivationInput(
  value: unknown,
): MembershipValidationResult<MembershipActivationInput> {
  return activation(value, "membership");
}

export function validateSubscriptionActivationInput(
  value: unknown,
): MembershipValidationResult<SubscriptionActivationInput> {
  return activation(value, "subscription");
}

function stripeTestActivation<T extends StripeTestFulfillmentReferenceInput>(
  value: unknown,
  kind: "membership" | "subscription",
): MembershipValidationResult<T> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, kind, `Stripe Test ${kind} activation must be an object.`);
    return invalid(issues);
  }
  exactKeys(value, STRIPE_TEST_FULFILLMENT_KEYS, issues);
  const reference = stripeTestFulfillmentReference(value, issues);
  return reference === null || issues.length > 0
    ? invalid(issues)
    : valid(reference as T);
}

export function validateStripeTestMembershipActivationInput(
  value: unknown,
): MembershipValidationResult<StripeTestMembershipActivationInput> {
  return stripeTestActivation(value, "membership");
}

export function validateStripeTestSubscriptionActivationInput(
  value: unknown,
): MembershipValidationResult<StripeTestSubscriptionActivationInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(
      issues,
      "subscription",
      "Stripe Test subscription activation must be an object.",
    );
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      ...STRIPE_TEST_FULFILLMENT_KEYS,
      "billingReason",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "periodStart",
      "periodEnd",
    ],
    issues,
  );
  const reference = stripeTestFulfillmentReference(value, issues);
  if (value.billingReason !== "subscription_create") {
    issue(
      issues,
      "billingReason",
      "billingReason must be subscription_create for initial activation.",
    );
  }
  const stripeCustomerId = providerId(
    value.stripeCustomerId,
    "stripeCustomerId",
    STRIPE_CUSTOMER_ID,
    issues,
  );
  const stripeSubscriptionId = providerId(
    value.stripeSubscriptionId,
    "stripeSubscriptionId",
    STRIPE_SUBSCRIPTION_ID,
    issues,
  );
  const periodStart = timestamp(value.periodStart, "periodStart", issues);
  const periodEnd = timestamp(value.periodEnd, "periodEnd", issues);
  if (periodStart !== null && periodEnd !== null && periodStart >= periodEnd) {
    issue(issues, "periodEnd", "periodEnd must be later than periodStart.");
  }
  if (
    reference === null ||
    stripeCustomerId === null ||
    stripeSubscriptionId === null ||
    periodStart === null ||
    periodEnd === null ||
    issues.length > 0
  ) {
    return invalid(issues);
  }
  return valid({
    ...reference,
    billingReason: "subscription_create",
    stripeCustomerId,
    stripeSubscriptionId,
    periodStart,
    periodEnd,
  });
}

export function validateStripeTestSubscriptionRenewalInput(
  value: unknown,
): MembershipValidationResult<StripeTestSubscriptionRenewalInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(
      issues,
      "subscription",
      "Stripe Test subscription renewal must be an object.",
    );
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      ...STRIPE_TEST_FULFILLMENT_KEYS,
      "billingReason",
      "subscriptionId",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "expectedRevision",
      "periodStart",
      "periodEnd",
    ],
    issues,
  );
  const reference = stripeTestFulfillmentReference(value, issues);
  if (value.billingReason !== "subscription_cycle") {
    issue(
      issues,
      "billingReason",
      "billingReason must be subscription_cycle for renewal.",
    );
  }
  const subscriptionId = id(value.subscriptionId, "subscriptionId", issues);
  const stripeCustomerId = providerId(
    value.stripeCustomerId,
    "stripeCustomerId",
    STRIPE_CUSTOMER_ID,
    issues,
  );
  const stripeSubscriptionId = providerId(
    value.stripeSubscriptionId,
    "stripeSubscriptionId",
    STRIPE_SUBSCRIPTION_ID,
    issues,
  );
  const expectedRevision = positiveInteger(
    value.expectedRevision,
    "expectedRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  const periodStart = timestamp(value.periodStart, "periodStart", issues);
  const periodEnd = timestamp(value.periodEnd, "periodEnd", issues);
  if (periodStart !== null && periodEnd !== null && periodStart >= periodEnd) {
    issue(issues, "periodEnd", "periodEnd must be later than periodStart.");
  }
  if (
    reference === null ||
    subscriptionId === null ||
    stripeCustomerId === null ||
    stripeSubscriptionId === null ||
    expectedRevision === null ||
    periodStart === null ||
    periodEnd === null ||
    issues.length > 0
  ) {
    return invalid(issues);
  }
  return valid({
    ...reference,
    billingReason: "subscription_cycle",
    subscriptionId,
    stripeCustomerId,
    stripeSubscriptionId,
    expectedRevision,
    periodStart,
    periodEnd,
  });
}

export function validateStripeTestSubscriptionReconciliationInput(
  value: unknown,
): MembershipValidationResult<StripeTestSubscriptionReconciliationInput> {
  const issues: MembershipValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(
      issues,
      "subscription",
      "Stripe Test subscription reconciliation must be an object.",
    );
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      ...STRIPE_TEST_FULFILLMENT_KEYS,
      "subscriptionId",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "expectedRevision",
      "targetState",
    ],
    issues,
  );
  const reference = stripeTestSubscriptionStateReference(value, issues);
  const subscriptionId = id(value.subscriptionId, "subscriptionId", issues);
  const stripeCustomerId = providerId(
    value.stripeCustomerId,
    "stripeCustomerId",
    STRIPE_CUSTOMER_ID,
    issues,
  );
  const stripeSubscriptionId = providerId(
    value.stripeSubscriptionId,
    "stripeSubscriptionId",
    STRIPE_SUBSCRIPTION_ID,
    issues,
  );
  const expectedRevision = positiveInteger(
    value.expectedRevision,
    "expectedRevision",
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  if (
    value.targetState !== "active" &&
    value.targetState !== "paused" &&
    value.targetState !== "cancellation_scheduled" &&
    value.targetState !== "canceled" &&
    value.targetState !== "expired"
  ) {
    issue(
      issues,
      "targetState",
      "targetState must be active, paused, cancellation_scheduled, canceled, or expired.",
    );
  }
  if (
    reference === null ||
    subscriptionId === null ||
    stripeCustomerId === null ||
    stripeSubscriptionId === null ||
    expectedRevision === null ||
    issues.length > 0
  ) {
    return invalid(issues);
  }
  return valid({
    ...reference,
    subscriptionId,
    stripeCustomerId,
    stripeSubscriptionId,
    expectedRevision,
    targetState:
      value.targetState as StripeTestSubscriptionReconciliationInput["targetState"],
  });
}
