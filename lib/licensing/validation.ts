import type {
  IssuedLicenseTerminalInput,
  LicenseDefinitionStateChangeInput,
  LicenseIssuanceInput,
  LicenseOfferCreateInput,
  LicenseOptionDefinitionInput,
  LicenseRequestDecisionInput,
  LicenseRequestSubmitInput,
  StripeTestLicenseFulfillmentInput,
  LicenseTermsCreateInput,
  LicenseTermsDefinitionInput,
} from "./types.ts";

export interface LicenseValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type LicenseValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly LicenseValidationIssue[];
    };

export const LICENSE_INPUT_LIMITS = Object.freeze({
  slug: 80,
  name: 120,
  title: 240,
  introduction: 12_000,
  generalTerms: 100_000,
  disclaimer: 12_000,
  options: 32,
  optionKey: 80,
  optionLabel: 160,
  optionDescription: 4_000,
  usageCategory: 120,
  allowedMedia: 32,
  mediaLabel: 120,
  audienceLabel: 160,
  distributionLabel: 200,
  territory: 160,
  attributionText: 1_000,
  projectTitle: 240,
  licenseeName: 160,
  intendedUse: 2_000,
  projectDescription: 12_000,
  reason: 2_000,
  positiveInteger: 1_000_000_000,
} as const);

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;
const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;
const STRIPE_EVENT_ID = /^evt_[A-Za-z0-9]{6,255}$/;
const STRIPE_OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,254}$/;

const STRIPE_TEST_LICENSE_FULFILLMENT_KEYS = Object.freeze([
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
  "requestId",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: LicenseValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  issues: LicenseValidationIssue[],
): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) issue(issues, key, `${key} is not supported.`);
  }
}

function valid<T>(value: T): LicenseValidationResult<T> {
  return Object.freeze({ ok: true, value: deepFreeze(value) });
}

function invalid<T>(
  issues: readonly LicenseValidationIssue[],
): LicenseValidationResult<T> {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function text(
  value: unknown,
  field: string,
  limit: number,
  issues: LicenseValidationIssue[],
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

function nullableText(
  value: unknown,
  field: string,
  limit: number,
  issues: LicenseValidationIssue[],
): string | null {
  if (value === null) return null;
  return text(value, field, limit, issues);
}

function safeId(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
): string | null {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    issue(issues, field, `${field} must be a safe application identifier.`);
    return null;
  }
  return value;
}

function slug(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
): string | null {
  const normalized = text(
    value,
    field,
    LICENSE_INPUT_LIMITS.slug,
    issues,
  )?.toLowerCase();
  if (normalized !== undefined && !SAFE_SLUG.test(normalized)) {
    issue(issues, field, `${field} must be a normalized route segment.`);
    return null;
  }
  return normalized ?? null;
}

function positiveInteger(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
  limit = LICENSE_INPUT_LIMITS.positiveInteger,
): number | null {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > limit
  ) {
    issue(issues, field, `${field} must be a positive integer.`);
    return null;
  }
  return value as number;
}

function nullablePositiveInteger(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
): number | null {
  if (value === null) return null;
  return positiveInteger(value, field, issues);
}

function boolean(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
): boolean | null {
  if (typeof value !== "boolean") {
    issue(issues, field, `${field} must be a boolean.`);
    return null;
  }
  return value;
}

function timestamp(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
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
  issues: LicenseValidationIssue[],
): string | null {
  if (typeof value !== "string" || !pattern.test(value)) {
    issue(issues, field, `${field} is not a valid Stripe Test identifier.`);
    return null;
  }
  return value;
}

function allowedMedia(
  value: unknown,
  field: string,
  issues: LicenseValidationIssue[],
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > LICENSE_INPUT_LIMITS.allowedMedia
  ) {
    issue(
      issues,
      field,
      `${field} must contain 1-${LICENSE_INPUT_LIMITS.allowedMedia} labels.`,
    );
    return Object.freeze([]);
  }
  const parsed = value.flatMap((candidate, index) => {
    const normalized = text(
      candidate,
      `${field}.${index}`,
      LICENSE_INPUT_LIMITS.mediaLabel,
      issues,
    );
    return normalized === null ? [] : [normalized];
  });
  if (new Set(parsed).size !== parsed.length) {
    issue(issues, field, `${field} labels must be unique.`);
  }
  return Object.freeze(parsed);
}

function option(
  value: unknown,
  index: number,
  issues: LicenseValidationIssue[],
): LicenseOptionDefinitionInput | null {
  const prefix = `options.${index}`;
  if (!isRecord(value)) {
    issue(issues, prefix, `${prefix} must be an object.`);
    return null;
  }
  exactKeys(
    value,
    [
      "optionKey",
      "label",
      "description",
      "usageCategory",
      "allowedMedia",
      "audienceLabel",
      "maxAudience",
      "distributionLabel",
      "maxCopies",
      "termMonths",
      "territory",
      "attributionRequired",
      "attributionText",
      "exclusive",
      "requiresApproval",
      "licenseCreditCost",
      "includesTrackDownload",
    ],
    issues,
  );
  const optionKey = slug(value.optionKey, `${prefix}.optionKey`, issues);
  const label = text(
    value.label,
    `${prefix}.label`,
    LICENSE_INPUT_LIMITS.optionLabel,
    issues,
  );
  const description = text(
    value.description,
    `${prefix}.description`,
    LICENSE_INPUT_LIMITS.optionDescription,
    issues,
    true,
  );
  const usageCategory = text(
    value.usageCategory,
    `${prefix}.usageCategory`,
    LICENSE_INPUT_LIMITS.usageCategory,
    issues,
  );
  const parsedAllowedMedia = allowedMedia(
    value.allowedMedia,
    `${prefix}.allowedMedia`,
    issues,
  );
  const audienceLabel = nullableText(
    value.audienceLabel,
    `${prefix}.audienceLabel`,
    LICENSE_INPUT_LIMITS.audienceLabel,
    issues,
  );
  const maxAudience = nullablePositiveInteger(
    value.maxAudience,
    `${prefix}.maxAudience`,
    issues,
  );
  const distributionLabel = nullableText(
    value.distributionLabel,
    `${prefix}.distributionLabel`,
    LICENSE_INPUT_LIMITS.distributionLabel,
    issues,
  );
  const maxCopies = nullablePositiveInteger(
    value.maxCopies,
    `${prefix}.maxCopies`,
    issues,
  );
  const termMonths = nullablePositiveInteger(
    value.termMonths,
    `${prefix}.termMonths`,
    issues,
  );
  const territory = text(
    value.territory,
    `${prefix}.territory`,
    LICENSE_INPUT_LIMITS.territory,
    issues,
  );
  const attributionRequired = boolean(
    value.attributionRequired,
    `${prefix}.attributionRequired`,
    issues,
  );
  const attributionText = nullableText(
    value.attributionText,
    `${prefix}.attributionText`,
    LICENSE_INPUT_LIMITS.attributionText,
    issues,
  );
  const exclusive = boolean(value.exclusive, `${prefix}.exclusive`, issues);
  const requiresApproval = boolean(
    value.requiresApproval,
    `${prefix}.requiresApproval`,
    issues,
  );
  const licenseCreditCost = positiveInteger(
    value.licenseCreditCost,
    `${prefix}.licenseCreditCost`,
    issues,
  );
  const includesTrackDownload = boolean(
    value.includesTrackDownload,
    `${prefix}.includesTrackDownload`,
    issues,
  );
  if (attributionRequired === true && attributionText === null) {
    issue(
      issues,
      `${prefix}.attributionText`,
      "attributionText is required when attribution is required.",
    );
  }
  if (
    optionKey === null ||
    label === null ||
    description === null ||
    usageCategory === null ||
    territory === null ||
    attributionRequired === null ||
    exclusive === null ||
    requiresApproval === null ||
    licenseCreditCost === null ||
    includesTrackDownload === null
  ) {
    return null;
  }
  return {
    optionKey,
    label,
    description,
    usageCategory,
    allowedMedia: parsedAllowedMedia,
    audienceLabel,
    maxAudience,
    distributionLabel,
    maxCopies,
    termMonths,
    territory,
    attributionRequired,
    attributionText,
    exclusive,
    requiresApproval,
    licenseCreditCost,
    includesTrackDownload,
  };
}

function definition(
  value: Record<string, unknown>,
  issues: LicenseValidationIssue[],
): LicenseTermsDefinitionInput | null {
  const name = text(value.name, "name", LICENSE_INPUT_LIMITS.name, issues);
  const title = text(value.title, "title", LICENSE_INPUT_LIMITS.title, issues);
  const introduction = text(
    value.introduction,
    "introduction",
    LICENSE_INPUT_LIMITS.introduction,
    issues,
    true,
  );
  const generalTerms = text(
    value.generalTerms,
    "generalTerms",
    LICENSE_INPUT_LIMITS.generalTerms,
    issues,
  );
  const disclaimer = text(
    value.disclaimer,
    "disclaimer",
    LICENSE_INPUT_LIMITS.disclaimer,
    issues,
    true,
  );
  if (
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > LICENSE_INPUT_LIMITS.options
  ) {
    issue(
      issues,
      "options",
      `options must contain 1-${LICENSE_INPUT_LIMITS.options} definitions.`,
    );
  }
  const options = Array.isArray(value.options)
    ? value.options.flatMap((candidate, index) => {
        const parsed = option(candidate, index, issues);
        return parsed === null ? [] : [parsed];
      })
    : [];
  const keys = options.map(({ optionKey }) => optionKey);
  if (new Set(keys).size !== keys.length) {
    issue(issues, "options", "Option keys must be unique within a version.");
  }
  if (
    name === null ||
    title === null ||
    introduction === null ||
    generalTerms === null ||
    disclaimer === null ||
    options.length < 1
  ) {
    return null;
  }
  return {
    name,
    title,
    introduction,
    generalTerms,
    disclaimer,
    options: Object.freeze(options),
  };
}

export function validateLicenseTermsCreateInput(
  value: unknown,
): LicenseValidationResult<LicenseTermsCreateInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "terms", "License terms must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "slug",
      "state",
      "name",
      "title",
      "introduction",
      "generalTerms",
      "disclaimer",
      "options",
    ],
    issues,
  );
  const parsedSlug = slug(value.slug, "slug", issues);
  if (value.state !== "draft" && value.state !== "active") {
    issue(issues, "state", "state must be draft or active.");
  }
  const parsedDefinition = definition(value, issues);
  if (issues.length > 0 || parsedSlug === null || parsedDefinition === null) {
    return invalid(issues);
  }
  return valid({
    slug: parsedSlug,
    state: value.state as "draft" | "active",
    ...parsedDefinition,
  });
}

export function validateLicenseTermsRevisionInput(
  value: unknown,
): LicenseValidationResult<LicenseTermsDefinitionInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "terms", "License terms must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    ["name", "title", "introduction", "generalTerms", "disclaimer", "options"],
    issues,
  );
  const parsed = definition(value, issues);
  return parsed === null || issues.length > 0 ? invalid(issues) : valid(parsed);
}

export function validateLicenseOfferCreateInput(
  value: unknown,
): LicenseValidationResult<LicenseOfferCreateInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "offer", "License offer must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "slug",
      "trackId",
      "trackRevisionId",
      "licenseTermsId",
      "licenseTermsVersion",
      "licenseOptionId",
      "commerceProductId",
      "commercePriceId",
      "state",
    ],
    issues,
  );
  const parsedSlug = slug(value.slug, "slug", issues);
  const trackId = safeId(value.trackId, "trackId", issues);
  const trackRevisionId = safeId(
    value.trackRevisionId,
    "trackRevisionId",
    issues,
  );
  const licenseTermsId = safeId(value.licenseTermsId, "licenseTermsId", issues);
  const licenseTermsVersion = positiveInteger(
    value.licenseTermsVersion,
    "licenseTermsVersion",
    issues,
  );
  const licenseOptionId = safeId(
    value.licenseOptionId,
    "licenseOptionId",
    issues,
  );
  const commerceProductId = safeId(
    value.commerceProductId,
    "commerceProductId",
    issues,
  );
  const commercePriceId = safeId(
    value.commercePriceId,
    "commercePriceId",
    issues,
  );
  if (value.state !== "draft" && value.state !== "active") {
    issue(issues, "state", "state must be draft or active.");
  }
  if (
    issues.length > 0 ||
    parsedSlug === null ||
    trackId === null ||
    trackRevisionId === null ||
    licenseTermsId === null ||
    licenseTermsVersion === null ||
    licenseOptionId === null ||
    commerceProductId === null ||
    commercePriceId === null
  ) {
    return invalid(issues);
  }
  return valid({
    slug: parsedSlug,
    trackId,
    trackRevisionId,
    licenseTermsId,
    licenseTermsVersion,
    licenseOptionId,
    commerceProductId,
    commercePriceId,
    state: value.state as "draft" | "active",
  });
}

export function validateLicenseRequestSubmitInput(
  value: unknown,
): LicenseValidationResult<LicenseRequestSubmitInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "request", "License request must be an object.");
    return invalid(issues);
  }
  exactKeys(
    value,
    [
      "licenseOfferId",
      "licenseeName",
      "projectTitle",
      "intendedUse",
      "projectDescription",
    ],
    issues,
  );
  const licenseOfferId = safeId(value.licenseOfferId, "licenseOfferId", issues);
  const licenseeName = text(
    value.licenseeName,
    "licenseeName",
    LICENSE_INPUT_LIMITS.licenseeName,
    issues,
  );
  const projectTitle = text(
    value.projectTitle,
    "projectTitle",
    LICENSE_INPUT_LIMITS.projectTitle,
    issues,
  );
  const intendedUse = text(
    value.intendedUse,
    "intendedUse",
    LICENSE_INPUT_LIMITS.intendedUse,
    issues,
  );
  const projectDescription = text(
    value.projectDescription,
    "projectDescription",
    LICENSE_INPUT_LIMITS.projectDescription,
    issues,
  );
  if (
    issues.length > 0 ||
    licenseOfferId === null ||
    licenseeName === null ||
    projectTitle === null ||
    intendedUse === null ||
    projectDescription === null
  ) {
    return invalid(issues);
  }
  return valid({
    licenseOfferId,
    licenseeName,
    projectTitle,
    intendedUse,
    projectDescription,
  });
}

export function validateLicenseRequestDecisionInput(
  value: unknown,
): LicenseValidationResult<LicenseRequestDecisionInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "decision", "License decision must be an object.");
    return invalid(issues);
  }
  exactKeys(value, ["expectedRevision", "decidedAt", "reason"], issues);
  const expectedRevision = positiveInteger(
    value.expectedRevision,
    "expectedRevision",
    issues,
  );
  const decidedAt = timestamp(value.decidedAt, "decidedAt", issues);
  const reason = text(
    value.reason,
    "reason",
    LICENSE_INPUT_LIMITS.reason,
    issues,
  );
  if (
    issues.length > 0 ||
    expectedRevision === null ||
    decidedAt === null ||
    reason === null
  ) {
    return invalid(issues);
  }
  return valid({ expectedRevision, decidedAt, reason });
}

export function validateLicenseDefinitionStateChangeInput(
  value: unknown,
): LicenseValidationResult<LicenseDefinitionStateChangeInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "state", "License state change must be an object.");
    return invalid(issues);
  }
  exactKeys(value, ["expectedState", "nextState"], issues);
  if (value.expectedState !== "draft" && value.expectedState !== "active") {
    issue(issues, "expectedState", "expectedState must be draft or active.");
  }
  if (value.nextState !== "active" && value.nextState !== "archived") {
    issue(issues, "nextState", "nextState must be active or archived.");
  }
  if (value.expectedState === "active" && value.nextState === "active") {
    issue(issues, "nextState", "The requested license state is unchanged.");
  }
  if (issues.length > 0) return invalid(issues);
  return valid({
    expectedState: value.expectedState as "draft" | "active",
    nextState: value.nextState as "active" | "archived",
  });
}

export function validateLicenseIssuanceInput(
  value: unknown,
): LicenseValidationResult<LicenseIssuanceInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "issuance", "License issuance must be an object.");
    return invalid(issues);
  }
  const source = value.source;
  const allowed = [
    "source",
    "licenseRequestId",
    "expectedRevision",
    "issuedAt",
  ];
  if (source === "stripe_test_order") {
    allowed.push("orderId", "fulfillmentEventId");
  } else if (source === "credit_redemption") {
    allowed.push("creditLedgerEntryId");
  } else if (source !== "owner_approval") {
    issue(issues, "source", "Choose a supported license issuance source.");
  }
  exactKeys(value, allowed, issues);
  const licenseRequestId = safeId(
    value.licenseRequestId,
    "licenseRequestId",
    issues,
  );
  const expectedRevision = positiveInteger(
    value.expectedRevision,
    "expectedRevision",
    issues,
  );
  const issuedAt = timestamp(value.issuedAt, "issuedAt", issues);
  if (source === "stripe_test_order") {
    const orderId = safeId(value.orderId, "orderId", issues);
    const fulfillmentEventId = safeId(
      value.fulfillmentEventId,
      "fulfillmentEventId",
      issues,
    );
    if (
      issues.length > 0 ||
      licenseRequestId === null ||
      expectedRevision === null ||
      issuedAt === null ||
      orderId === null ||
      fulfillmentEventId === null
    ) {
      return invalid(issues);
    }
    return valid({
      source,
      licenseRequestId,
      expectedRevision,
      issuedAt,
      orderId,
      fulfillmentEventId,
    });
  }
  if (source === "credit_redemption") {
    const creditLedgerEntryId = safeId(
      value.creditLedgerEntryId,
      "creditLedgerEntryId",
      issues,
    );
    if (
      issues.length > 0 ||
      licenseRequestId === null ||
      expectedRevision === null ||
      issuedAt === null ||
      creditLedgerEntryId === null
    ) {
      return invalid(issues);
    }
    return valid({
      source,
      licenseRequestId,
      expectedRevision,
      issuedAt,
      creditLedgerEntryId,
    });
  }
  if (
    source !== "owner_approval" ||
    issues.length > 0 ||
    licenseRequestId === null ||
    expectedRevision === null ||
    issuedAt === null
  ) {
    return invalid(issues);
  }
  return valid({ source, licenseRequestId, expectedRevision, issuedAt });
}

export function validateStripeTestLicenseFulfillmentInput(
  value: unknown,
): LicenseValidationResult<StripeTestLicenseFulfillmentInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(
      issues,
      "fulfillment",
      "Stripe Test license fulfillment must be an object.",
    );
    return invalid(issues);
  }
  exactKeys(value, STRIPE_TEST_LICENSE_FULFILLMENT_KEYS, issues);
  const customerUserId = safeId(value.customerUserId, "customerUserId", issues);
  const commerceProductId = safeId(
    value.commerceProductId,
    "commerceProductId",
    issues,
  );
  const commercePriceId = safeId(
    value.commercePriceId,
    "commercePriceId",
    issues,
  );
  const commerceEventId = safeId(
    value.commerceEventId,
    "commerceEventId",
    issues,
  );
  const orderId = safeId(value.orderId, "orderId", issues);
  const fulfillmentEventId = safeId(
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
  const requestId =
    typeof value.requestId === "string" && REQUEST_ID.test(value.requestId)
      ? value.requestId
      : null;
  if (requestId === null) {
    issue(issues, "requestId", "requestId must be a safe request identifier.");
  }
  if (
    issues.length > 0 ||
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
    providerEventCreatedAt === null ||
    requestId === null
  ) {
    return invalid(issues);
  }
  return valid({
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
    requestId,
  });
}

export function validateIssuedLicenseTerminalInput(
  value: unknown,
): LicenseValidationResult<IssuedLicenseTerminalInput> {
  const issues: LicenseValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "transition", "License transition must be an object.");
    return invalid(issues);
  }
  exactKeys(value, ["expectedRevision", "effectiveAt", "reason"], issues);
  const expectedRevision = positiveInteger(
    value.expectedRevision,
    "expectedRevision",
    issues,
  );
  const effectiveAt = timestamp(value.effectiveAt, "effectiveAt", issues);
  const reason = text(
    value.reason,
    "reason",
    LICENSE_INPUT_LIMITS.reason,
    issues,
  );
  if (
    issues.length > 0 ||
    expectedRevision === null ||
    effectiveAt === null ||
    reason === null
  ) {
    return invalid(issues);
  }
  return valid({ expectedRevision, effectiveAt, reason });
}

export function isSafeLicenseId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}
