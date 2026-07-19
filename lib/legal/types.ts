export const LEGAL_DOCUMENT_IDS = ["privacy", "terms"] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENT_IDS)[number];
export type LegalTelemetryMode = "disabled" | "consent_required" | "anonymous";

/**
 * The exact guided-setup record stored with every legal draft. Fixed literals
 * keep the Build Week Sites boundary factual and impossible to reinterpret as
 * live commerce or a geographic residency promise.
 */
export interface LegalSetupAnswers {
  readonly customerAccounts: boolean;
  readonly identityProvider: "Sign in with ChatGPT";
  readonly publicContactEmail: string;
  readonly contactSubmissions: boolean;
  readonly telemetryMode: LegalTelemetryMode;
  readonly telemetryRetentionDays: number;
  readonly retentionStatement: string;
  readonly downloads: boolean;
  readonly protectedAccess: boolean;
  readonly memberships: boolean;
  readonly subscriptions: boolean;
  readonly licensing: boolean;
  readonly stripeEnvironment: "test";
  readonly stripeCheckout: "Stripe-hosted Test Checkout";
  readonly realPaymentsAccepted: false;
  readonly paymentCardDataHandledByAop: false;
  readonly structuredDataStorage: "Sites-provided D1";
  readonly fileStorage: "Sites-provided R2";
  readonly sitesResidencyAtLaunch: "not_supported";
  readonly services: readonly string[];
}

export interface LegalDraftInput {
  readonly documentId: LegalDocumentId;
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
  readonly setupAnswers: LegalSetupAnswers;
}

export interface LegalDocumentVersionDTO {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
  readonly setupAnswers: LegalSetupAnswers | null;
  readonly createdByUserId: string | null;
  readonly approvedByUserId: string | null;
  readonly approvedAt: string | null;
  readonly createdAt: string;
}

export interface AdminLegalDocumentDTO {
  readonly id: LegalDocumentId;
  readonly title: string;
  readonly revision: number;
  readonly currentVersion: number;
  readonly draft: LegalDocumentVersionDTO;
  readonly approved: LegalDocumentVersionDTO | null;
  readonly published: LegalDocumentVersionDTO | null;
  readonly publishedAt: string | null;
  readonly history: readonly LegalDocumentVersionDTO[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LegalAdminWorkspaceDTO {
  readonly documents: readonly AdminLegalDocumentDTO[];
}

export interface PublishedLegalDocumentDTO {
  readonly id: LegalDocumentId;
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
  readonly version: number;
  readonly approvedAt: string;
  readonly publishedAt: string;
}

export function createDefaultLegalSetupAnswers(): LegalSetupAnswers {
  return Object.freeze({
    customerAccounts: true,
    identityProvider: "Sign in with ChatGPT",
    publicContactEmail: "",
    contactSubmissions: false,
    telemetryMode: "consent_required",
    telemetryRetentionDays: 30,
    retentionStatement:
      "The artist reviews retention periods for account, contact, access, commerce, and operational records.",
    downloads: false,
    protectedAccess: true,
    memberships: false,
    subscriptions: false,
    licensing: false,
    stripeEnvironment: "test",
    stripeCheckout: "Stripe-hosted Test Checkout",
    realPaymentsAccepted: false,
    paymentCardDataHandledByAop: false,
    structuredDataStorage: "Sites-provided D1",
    fileStorage: "Sites-provided R2",
    sitesResidencyAtLaunch: "not_supported",
    services: Object.freeze(["OpenAI Sites", "Stripe"]),
  });
}
