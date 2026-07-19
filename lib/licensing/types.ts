export const LICENSE_TERMS_STATES = Object.freeze([
  "draft",
  "active",
  "archived",
] as const);
export const LICENSE_OFFER_STATES = LICENSE_TERMS_STATES;
export const LICENSE_REQUEST_STATES = Object.freeze([
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "rejected",
  "canceled",
  "issued",
] as const);
export const ISSUED_LICENSE_STATES = Object.freeze([
  "active",
  "revoked",
  "expired",
] as const);
export const LICENSE_ISSUANCE_SOURCES = Object.freeze([
  "owner_approval",
  "credit_redemption",
  "stripe_test_order",
] as const);
export const LICENSE_EVENT_TYPES = Object.freeze([
  "submitted",
  "approved",
  "rejected",
  "canceled",
  "issued",
  "revoked",
  "expired",
  "document_ready",
  "document_failed",
] as const);

export type LicenseTermsState = (typeof LICENSE_TERMS_STATES)[number];
export type LicenseOfferState = (typeof LICENSE_OFFER_STATES)[number];
export type LicenseRequestState = (typeof LICENSE_REQUEST_STATES)[number];
export type IssuedLicenseState = (typeof ISSUED_LICENSE_STATES)[number];
export type LicenseIssuanceSource = (typeof LICENSE_ISSUANCE_SOURCES)[number];
export type LicenseEventType = (typeof LICENSE_EVENT_TYPES)[number];
export type LicenseEventSource =
  "customer" | "owner" | "credit" | "stripe_test" | "system";
export type LicenseDocumentState = "queued" | "processing" | "ready" | "failed";
export type LicenseDocumentJobStatus =
  "queued" | "processing" | "complete" | "failed";

export interface LicenseOptionDefinitionInput {
  readonly optionKey: string;
  readonly label: string;
  readonly description: string;
  readonly usageCategory: string;
  readonly allowedMedia: readonly string[];
  readonly audienceLabel: string | null;
  readonly maxAudience: number | null;
  readonly distributionLabel: string | null;
  readonly maxCopies: number | null;
  readonly termMonths: number | null;
  readonly territory: string;
  readonly attributionRequired: boolean;
  readonly attributionText: string | null;
  readonly exclusive: boolean;
  readonly requiresApproval: boolean;
  readonly licenseCreditCost: number;
  readonly includesTrackDownload: boolean;
}

export interface LicenseTermsDefinitionInput {
  readonly name: string;
  readonly title: string;
  readonly introduction: string;
  readonly generalTerms: string;
  readonly disclaimer: string;
  readonly options: readonly LicenseOptionDefinitionInput[];
}

export interface LicenseTermsCreateInput extends LicenseTermsDefinitionInput {
  readonly slug: string;
  readonly state: Exclude<LicenseTermsState, "archived">;
}

export interface LicenseOfferCreateInput {
  readonly slug: string;
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly licenseTermsId: string;
  readonly licenseTermsVersion: number;
  readonly licenseOptionId: string;
  readonly commerceProductId: string;
  readonly commercePriceId: string;
  readonly state: Exclude<LicenseOfferState, "archived">;
}

export interface LicenseRequestSubmitInput {
  readonly licenseOfferId: string;
  readonly licenseeName: string;
  readonly projectTitle: string;
  readonly intendedUse: string;
  readonly projectDescription: string;
}

export interface LicenseRequestDecisionInput {
  readonly expectedRevision: number;
  readonly decidedAt: string;
  readonly reason: string;
}

export interface LicenseDefinitionStateChangeInput {
  readonly expectedState: "draft" | "active";
  readonly nextState: "active" | "archived";
}

interface LicenseIssuanceBaseInput {
  readonly licenseRequestId: string;
  readonly expectedRevision: number;
  readonly issuedAt: string;
}

export interface OwnerApprovalLicenseIssuanceInput extends LicenseIssuanceBaseInput {
  readonly source: "owner_approval";
}

export interface StripeTestLicenseIssuanceInput extends LicenseIssuanceBaseInput {
  readonly source: "stripe_test_order";
  readonly orderId: string;
  readonly fulfillmentEventId: string;
}

export interface CreditLicenseIssuanceInput extends LicenseIssuanceBaseInput {
  readonly source: "credit_redemption";
  readonly creditLedgerEntryId: string;
}

export type LicenseIssuanceInput =
  | OwnerApprovalLicenseIssuanceInput
  | StripeTestLicenseIssuanceInput
  | CreditLicenseIssuanceInput;

/**
 * Minimal durable facts projected by the signature-verified Stripe Test
 * webhook path. The licensing repository matches every value against D1
 * again inside the same batch that issues the license and its access.
 */
export interface StripeTestLicenseFulfillmentInput {
  readonly customerUserId: string;
  readonly commerceProductId: string;
  readonly commercePriceId: string;
  readonly commerceEventId: string;
  readonly orderId: string;
  readonly fulfillmentEventId: string;
  readonly factsFingerprint: string;
  readonly stripeEventId: string;
  readonly stripeObjectId: string;
  readonly fulfillmentProviderObjectId: string;
  readonly providerEventCreatedAt: string;
  readonly requestId: string;
}

export interface IssuedLicenseTerminalInput {
  readonly expectedRevision: number;
  readonly effectiveAt: string;
  readonly reason: string;
}

export interface LicenseTermsMutationReceipt {
  readonly licenseTermsId: string;
  readonly slug: string;
  readonly state: LicenseTermsState;
  readonly versionId: string;
  readonly version: number;
  readonly optionIds: readonly string[];
  readonly created: boolean;
}

export interface LicenseOfferMutationReceipt {
  readonly licenseOfferId: string;
  readonly slug: string;
  readonly state: LicenseOfferState;
  readonly revision: number;
}

export interface LicenseTermsStateMutationReceipt {
  readonly licenseTermsId: string;
  readonly state: LicenseTermsState;
  readonly currentVersion: number;
}

export interface LicenseOfferStateMutationReceipt {
  readonly licenseOfferId: string;
  readonly state: LicenseOfferState;
  readonly revision: number;
}

export interface LicenseRequestMutationReceipt {
  readonly licenseRequestId: string;
  readonly state: LicenseRequestState;
  readonly revision: number;
  readonly requiresApproval: boolean;
}

export interface LicenseIssuanceReceipt {
  readonly issuedLicenseId: string;
  readonly licenseRequestId: string;
  readonly customerUserId: string;
  readonly source: LicenseIssuanceSource;
  readonly state: "active";
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly documentId: string;
  readonly documentJobId: string;
  readonly entitlementIds: readonly string[];
}

export interface LicenseCreditRedemptionReceipt {
  readonly licenseRequestId: string;
  readonly customerUserId: string;
  readonly licenseCreditCost: number;
  readonly creditReservationId: string;
  readonly creditLedgerEntryId: string;
  readonly issuedLicense: LicenseIssuanceReceipt;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface IssuedLicenseTerminalReceipt {
  readonly issuedLicenseId: string;
  readonly state: Extract<IssuedLicenseState, "revoked" | "expired">;
  readonly revision: number;
  readonly effectiveAt: string;
  readonly entitlementCount: number;
}

export interface LicenseTermsSnapshot {
  readonly schemaVersion: 1;
  readonly offer: {
    readonly id: string;
    readonly revision: number;
    readonly slug: string;
    readonly commerceProductId: string;
    readonly commercePriceId: string;
  };
  readonly track: {
    readonly id: string;
    readonly revisionId: string;
    readonly slug: string;
    readonly title: string;
  };
  readonly terms: {
    readonly id: string;
    readonly versionId: string;
    readonly version: number;
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly introduction: string;
    readonly generalTerms: string;
    readonly disclaimer: string;
  };
  readonly option: {
    readonly id: string;
    readonly optionKey: string;
    readonly label: string;
    readonly description: string;
    readonly usageCategory: string;
    readonly allowedMedia: readonly string[];
    readonly audienceLabel: string | null;
    readonly maxAudience: number | null;
    readonly distributionLabel: string | null;
    readonly maxCopies: number | null;
    readonly termMonths: number | null;
    readonly territory: string;
    readonly attributionRequired: boolean;
    readonly attributionText: string | null;
    readonly exclusive: boolean;
    readonly requiresApproval: boolean;
    readonly licenseCreditCost: number;
    readonly includesTrackDownload: boolean;
  };
  readonly testPrice: {
    readonly id: string;
    readonly amountMinor: number;
    readonly currency: string;
  };
}

export interface LicenseIntendedUseSnapshot {
  readonly schemaVersion: 1;
  readonly licenseeName: string;
  readonly projectTitle: string;
  readonly intendedUse: string;
  readonly projectDescription: string;
}

export interface LicenseTermsVersionDTO extends LicenseTermsDefinitionInput {
  readonly id: string;
  readonly licenseTermsId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly options: readonly (LicenseOptionDefinitionInput & {
    readonly id: string;
    readonly position: number;
  })[];
}

export interface LicenseTermsDTO {
  readonly id: string;
  readonly slug: string;
  readonly state: LicenseTermsState;
  readonly currentVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: LicenseTermsVersionDTO;
}

export interface LicenseOfferDTO {
  readonly id: string;
  readonly slug: string;
  readonly state: LicenseOfferState;
  readonly revision: number;
  readonly snapshot: LicenseTermsSnapshot;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LicenseRequestDTO {
  readonly id: string;
  readonly customerUserId: string;
  readonly licenseOfferId: string;
  readonly licenseOfferRevision: number;
  readonly trackId: string;
  readonly state: LicenseRequestState;
  readonly revision: number;
  readonly approvedAt: string | null;
  readonly rejectedAt: string | null;
  readonly canceledAt: string | null;
  readonly issuedAt: string | null;
  readonly termsSnapshot: LicenseTermsSnapshot;
  readonly intendedUseSnapshot: LicenseIntendedUseSnapshot;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IssuedLicenseDTO {
  readonly id: string;
  readonly customerUserId: string;
  readonly licenseRequestId: string;
  readonly trackId: string;
  readonly source: LicenseIssuanceSource;
  readonly orderId: string | null;
  readonly creditLedgerEntryId: string | null;
  readonly fulfillmentEventId: string | null;
  readonly state: IssuedLicenseState;
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly expiredAt: string | null;
  readonly revision: number;
  readonly termsSnapshot: LicenseTermsSnapshot;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LicenseDocumentDTO {
  readonly id: string;
  readonly issuedLicenseId: string;
  readonly customerUserId: string;
  readonly state: LicenseDocumentState;
  readonly contentDigest: string | null;
  readonly byteLength: number | null;
  readonly failureCategory: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Owner-safe operational projection. Worker leases and operation keys stay server-only. */
export interface LicenseDocumentJobDTO {
  readonly id: string;
  readonly licenseDocumentId: string;
  readonly status: LicenseDocumentJobStatus;
  readonly attempts: number;
  readonly failureCategory: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LicenseEventDTO {
  readonly id: string;
  readonly customerUserId: string;
  readonly licenseRequestId: string | null;
  readonly issuedLicenseId: string | null;
  readonly eventType: LicenseEventType;
  readonly actorUserId: string | null;
  readonly source: LicenseEventSource;
  readonly orderId: string | null;
  readonly creditLedgerEntryId: string | null;
  readonly fulfillmentEventId: string | null;
  readonly details: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface CustomerLicenseHistoryDTO {
  readonly requests: readonly LicenseRequestDTO[];
  readonly licenses: readonly IssuedLicenseDTO[];
  readonly documents: readonly LicenseDocumentDTO[];
  readonly events: readonly LicenseEventDTO[];
}

export interface LicenseAdministrationDTO extends CustomerLicenseHistoryDTO {
  readonly terms: readonly LicenseTermsDTO[];
  readonly offers: readonly LicenseOfferDTO[];
  readonly documentJobs: readonly LicenseDocumentJobDTO[];
}

export interface LicenseDocumentProjectionInput {
  readonly issuedLicenseId: string;
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly termsSnapshot: LicenseTermsSnapshot;
  readonly intendedUseSnapshot: LicenseIntendedUseSnapshot;
}
