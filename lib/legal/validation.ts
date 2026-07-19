import {
  LEGAL_DOCUMENT_IDS,
  type LegalDocumentId,
  type LegalDraftInput,
  type LegalSetupAnswers,
  type LegalTelemetryMode,
} from "./types.ts";

export interface LegalValidationIssue {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

export type LegalValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly LegalValidationIssue[];
    };

const DOCUMENT_IDS = new Set<LegalDocumentId>(LEGAL_DOCUMENT_IDS);
const TELEMETRY_MODES = new Set<LegalTelemetryMode>([
  "disabled",
  "consent_required",
  "anonymous",
]);
const SETUP_KEYS = [
  "customerAccounts",
  "identityProvider",
  "publicContactEmail",
  "contactSubmissions",
  "telemetryMode",
  "telemetryRetentionDays",
  "retentionStatement",
  "downloads",
  "protectedAccess",
  "memberships",
  "subscriptions",
  "licensing",
  "stripeEnvironment",
  "stripeCheckout",
  "realPaymentsAccepted",
  "paymentCardDataHandledByAop",
  "structuredDataStorage",
  "fileStorage",
  "sitesResidencyAtLaunch",
  "services",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  issues: LegalValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issues.push({
      code: "legal-text-required",
      field,
      message: `${field} must be text.`,
    });
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!allowEmpty && normalized.length === 0) {
    issues.push({
      code: "legal-text-required",
      field,
      message: `${field} is required.`,
    });
    return null;
  }
  if (normalized.length > maximum) {
    issues.push({
      code: "legal-text-too-long",
      field,
      message: `${field} must contain at most ${maximum} characters.`,
    });
    return null;
  }
  return normalized;
}

function boolean(
  value: unknown,
  field: string,
  issues: LegalValidationIssue[],
): boolean | null {
  if (typeof value !== "boolean") {
    issues.push({
      code: "legal-boolean-required",
      field,
      message: `${field} must be true or false.`,
    });
    return null;
  }
  return value;
}

function fixed(
  value: unknown,
  expected: string | false,
  field: string,
  issues: LegalValidationIssue[],
): void {
  if (value !== expected) {
    issues.push({
      code: "legal-fixed-boundary-invalid",
      field,
      message: `${field} must retain the Sites Build Week boundary.`,
    });
  }
}

export function validateLegalDocumentId(
  value: unknown,
): LegalValidationResult<LegalDocumentId> {
  if (typeof value === "string" && DOCUMENT_IDS.has(value as LegalDocumentId)) {
    return { ok: true, value: value as LegalDocumentId };
  }
  return {
    ok: false,
    issues: [
      {
        code: "legal-document-id-invalid",
        field: "documentId",
        message: "Legal document must be privacy or terms.",
      },
    ],
  };
}

export function validateLegalSetupAnswers(
  value: unknown,
): LegalValidationResult<LegalSetupAnswers> {
  if (!isRecord(value) || !hasExactKeys(value, SETUP_KEYS)) {
    return {
      ok: false,
      issues: [
        {
          code: "legal-setup-schema-invalid",
          field: "setupAnswers",
          message:
            "Legal setup answers must contain exactly the supported fields.",
        },
      ],
    };
  }

  const issues: LegalValidationIssue[] = [];
  const customerAccounts = boolean(
    value.customerAccounts,
    "setupAnswers.customerAccounts",
    issues,
  );
  const publicContactEmail = text(
    value.publicContactEmail,
    "setupAnswers.publicContactEmail",
    320,
    issues,
    true,
  );
  if (
    publicContactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicContactEmail)
  ) {
    issues.push({
      code: "legal-contact-email-invalid",
      field: "setupAnswers.publicContactEmail",
      message: "Public contact email must be blank or a valid email address.",
    });
  }
  const contactSubmissions = boolean(
    value.contactSubmissions,
    "setupAnswers.contactSubmissions",
    issues,
  );
  const telemetryMode =
    typeof value.telemetryMode === "string" &&
    TELEMETRY_MODES.has(value.telemetryMode as LegalTelemetryMode)
      ? (value.telemetryMode as LegalTelemetryMode)
      : null;
  if (telemetryMode === null) {
    issues.push({
      code: "legal-telemetry-mode-invalid",
      field: "setupAnswers.telemetryMode",
      message:
        "Telemetry mode must be disabled, consent_required, or anonymous.",
    });
  }
  const telemetryRetentionDays = value.telemetryRetentionDays;
  if (
    !Number.isSafeInteger(telemetryRetentionDays) ||
    (telemetryRetentionDays as number) < 1 ||
    (telemetryRetentionDays as number) > 365
  ) {
    issues.push({
      code: "legal-retention-days-invalid",
      field: "setupAnswers.telemetryRetentionDays",
      message: "Telemetry retention must be between 1 and 365 days.",
    });
  }
  const retentionStatement = text(
    value.retentionStatement,
    "setupAnswers.retentionStatement",
    2000,
    issues,
  );
  const downloads = boolean(value.downloads, "setupAnswers.downloads", issues);
  const protectedAccess = boolean(
    value.protectedAccess,
    "setupAnswers.protectedAccess",
    issues,
  );
  const memberships = boolean(
    value.memberships,
    "setupAnswers.memberships",
    issues,
  );
  const subscriptions = boolean(
    value.subscriptions,
    "setupAnswers.subscriptions",
    issues,
  );
  const licensing = boolean(value.licensing, "setupAnswers.licensing", issues);
  fixed(
    value.identityProvider,
    "Sign in with ChatGPT",
    "setupAnswers.identityProvider",
    issues,
  );
  fixed(
    value.stripeEnvironment,
    "test",
    "setupAnswers.stripeEnvironment",
    issues,
  );
  fixed(
    value.stripeCheckout,
    "Stripe-hosted Test Checkout",
    "setupAnswers.stripeCheckout",
    issues,
  );
  fixed(
    value.realPaymentsAccepted,
    false,
    "setupAnswers.realPaymentsAccepted",
    issues,
  );
  fixed(
    value.paymentCardDataHandledByAop,
    false,
    "setupAnswers.paymentCardDataHandledByAop",
    issues,
  );
  fixed(
    value.structuredDataStorage,
    "Sites-provided D1",
    "setupAnswers.structuredDataStorage",
    issues,
  );
  fixed(
    value.fileStorage,
    "Sites-provided R2",
    "setupAnswers.fileStorage",
    issues,
  );
  fixed(
    value.sitesResidencyAtLaunch,
    "not_supported",
    "setupAnswers.sitesResidencyAtLaunch",
    issues,
  );

  let services: string[] | null = null;
  if (!Array.isArray(value.services) || value.services.length > 20) {
    issues.push({
      code: "legal-services-invalid",
      field: "setupAnswers.services",
      message: "Services must contain at most 20 names.",
    });
  } else {
    services = value.services.flatMap((service, index) => {
      const normalized = text(
        service,
        `setupAnswers.services.${index}`,
        120,
        issues,
      );
      return normalized === null ? [] : [normalized];
    });
    if (
      new Set(services.map((service) => service.toLowerCase())).size !==
      services.length
    ) {
      issues.push({
        code: "legal-services-duplicate",
        field: "setupAnswers.services",
        message: "Service names must be unique.",
      });
    }
  }

  if (
    issues.length > 0 ||
    customerAccounts === null ||
    publicContactEmail === null ||
    contactSubmissions === null ||
    telemetryMode === null ||
    !Number.isSafeInteger(telemetryRetentionDays) ||
    retentionStatement === null ||
    downloads === null ||
    protectedAccess === null ||
    memberships === null ||
    subscriptions === null ||
    licensing === null ||
    services === null
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }

  return {
    ok: true,
    value: Object.freeze({
      customerAccounts,
      identityProvider: "Sign in with ChatGPT",
      publicContactEmail,
      contactSubmissions,
      telemetryMode,
      telemetryRetentionDays: telemetryRetentionDays as number,
      retentionStatement,
      downloads,
      protectedAccess,
      memberships,
      subscriptions,
      licensing,
      stripeEnvironment: "test",
      stripeCheckout: "Stripe-hosted Test Checkout",
      realPaymentsAccepted: false,
      paymentCardDataHandledByAop: false,
      structuredDataStorage: "Sites-provided D1",
      fileStorage: "Sites-provided R2",
      sitesResidencyAtLaunch: "not_supported",
      services: Object.freeze(services),
    }),
  };
}

export function validateLegalDraftInput(
  value: unknown,
): LegalValidationResult<LegalDraftInput> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "documentId",
      "title",
      "introduction",
      "bodyText",
      "setupAnswers",
    ])
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "legal-draft-schema-invalid",
          field: "document",
          message: "Legal draft must contain exactly the supported fields.",
        },
      ],
    };
  }

  const issues: LegalValidationIssue[] = [];
  const documentId = validateLegalDocumentId(value.documentId);
  if (!documentId.ok) issues.push(...documentId.issues);
  const title = text(value.title, "title", 160, issues);
  const introduction = text(
    value.introduction,
    "introduction",
    4000,
    issues,
    true,
  );
  const bodyText = text(value.bodyText, "bodyText", 40000, issues);
  const setupAnswers = validateLegalSetupAnswers(value.setupAnswers);
  if (!setupAnswers.ok) issues.push(...setupAnswers.issues);

  if (
    issues.length > 0 ||
    !documentId.ok ||
    title === null ||
    introduction === null ||
    bodyText === null ||
    !setupAnswers.ok
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return {
    ok: true,
    value: Object.freeze({
      documentId: documentId.value,
      title,
      introduction,
      bodyText,
      setupAnswers: setupAnswers.value,
    }),
  };
}

export function parseStoredLegalSetupAnswers(
  value: unknown,
): LegalSetupAnswers | null {
  if (typeof value !== "string") return null;
  try {
    const validated = validateLegalSetupAnswers(JSON.parse(value));
    return validated.ok ? validated.value : null;
  } catch {
    return null;
  }
}
