import type { ModuleKey } from "@/lib/modules/registry";

export const SETUP_PROPOSAL_SCHEMA_VERSION = "aop.setup-proposal.v2" as const;
export const SETUP_APPROVAL_SCHEMA_VERSION = "aop.setup-approval.v1" as const;
export const EXTERNAL_ACTION_APPROVAL_SCHEMA_VERSION =
  "aop.external-action-approval.v1" as const;
export const SOURCE_STATE_SCHEMA_VERSION = "aop.setup-source-state.v1" as const;
export const SETUP_OPERATION_PLAN_SCHEMA_VERSION =
  "aop.setup-operation-plan.v1" as const;
export const SETUP_PREFLIGHT_SCHEMA_VERSION = "aop.setup-preflight.v1" as const;

export const SITES_SETUP_COMMERCE_ADAPTER = "stripe-test-simulation" as const;
export const NO_REAL_PAYMENT_STATEMENT =
  "No real payment will be accepted." as const;

export const SETUP_TOPIC_KEYS = Object.freeze([
  "artist",
  "capabilities-navigation",
  "rights-media",
  "catalog-releases",
  "streaming-downloads",
  "customer-access",
  "memberships-subscriptions",
  "credits",
  "licensing",
  "courses-video",
  "editorial-presentation",
  "contact-consent",
  "telemetry-retention",
  "privacy-terms",
  "accounts-publication",
] as const);

export type SetupTopicKey = (typeof SETUP_TOPIC_KEYS)[number];

export const SETUP_APPROVAL_SCOPES = Object.freeze([
  "configuration",
  "internal-publication",
  "media-preparation",
  "media-publication",
  "source-changes",
  "account-authority",
  "legal-drafts",
] as const);

export type SetupApprovalScope = (typeof SETUP_APPROVAL_SCOPES)[number];

export const EXTERNAL_ACTION_KINDS = Object.freeze([
  "sites-hosting",
  "custom-domain",
  "dns-change",
  "email-delivery",
  "public-media-upload",
  "repository-visibility",
] as const);

export type ExternalActionKind = (typeof EXTERNAL_ACTION_KINDS)[number];

export interface SetupCommerceContract {
  readonly adapter: typeof SITES_SETUP_COMMERCE_ADAPTER;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly journey: "inactive" | "active";
  readonly statement: typeof NO_REAL_PAYMENT_STATEMENT;
}

export interface ArtistTopic {
  readonly artistKey: string;
  readonly publicName: string;
  readonly shortName: string | null;
  readonly headline: string;
  readonly description: string;
  readonly biography: string;
  readonly publicContactEmail: string | null;
  readonly publicContactUrl: string | null;
}

export interface SetupNavigationItem {
  readonly navigationKey: string;
  readonly label: string;
  readonly href: string;
  readonly order: number;
  readonly module: ModuleKey | null;
}

export interface CapabilitiesNavigationTopic {
  readonly activeModules: readonly ModuleKey[];
  readonly primaryNavigation: readonly SetupNavigationItem[];
  readonly footerNavigation: readonly SetupNavigationItem[];
}

export type ApprovedMediaKind =
  "audio" | "artwork" | "image" | "video" | "document";

export interface ApprovedMediaReference {
  readonly mediaKey: string;
  readonly sourceAlias: string;
  readonly kind: ApprovedMediaKind;
  readonly rights: "pending" | "confirmed";
  readonly intendedUse: "public" | "protected";
  readonly attribution: string | null;
}

export interface RightsMediaTopic {
  readonly rightsStatement: string;
  readonly media: readonly ApprovedMediaReference[];
}

export interface CatalogTrackProposal {
  readonly trackKey: string;
  readonly title: string;
  readonly versionLabel: string | null;
  readonly durationMs: number | null;
  readonly meter: string | null;
  readonly tempoBpm: number | null;
  readonly musicalKey: string | null;
  readonly tags: readonly string[];
  readonly releaseKey: string | null;
  readonly sequence: number;
  readonly mediaKey: string | null;
}

export interface CatalogReleaseProposal {
  readonly releaseKey: string;
  readonly title: string;
  readonly releaseDate: string | null;
  readonly trackKeys: readonly string[];
  readonly artworkMediaKey: string | null;
}

export interface CatalogCollectionProposal {
  readonly collectionKey: string;
  readonly title: string;
  readonly trackKeys: readonly string[];
  readonly artworkMediaKey: string | null;
}

export interface CatalogReleasesTopic {
  readonly tracks: readonly CatalogTrackProposal[];
  readonly releases: readonly CatalogReleaseProposal[];
  readonly collections: readonly CatalogCollectionProposal[];
}

export interface TrackAvailabilityProposal {
  readonly trackKey: string;
  readonly streaming: "public" | "account" | "entitled" | "disabled";
  readonly download: "account" | "entitled" | "disabled";
}

export interface StreamingDownloadsTopic {
  readonly tracks: readonly TrackAvailabilityProposal[];
}

export type SetupResourceType =
  "track" | "course" | "lesson" | "video" | "document";

export interface AccessPlanProposal {
  readonly accessPlanKey: string;
  readonly label: string;
  readonly resourceType: SetupResourceType;
  readonly resourceKeys: readonly string[];
  readonly accessMode:
    "account" | "grant" | "membership" | "subscription" | "license";
}

export interface GrantTemplateProposal {
  readonly grantKey: string;
  readonly label: string;
  readonly accessPlanKey: string;
  readonly defaultDurationDays: number | null;
}

export interface CustomerAccessTopic {
  readonly customerLibraries: boolean;
  readonly protectedDelivery: boolean;
  readonly accessPlans: readonly AccessPlanProposal[];
  readonly grantTemplates: readonly GrantTemplateProposal[];
}

export interface MembershipPlanProposal {
  readonly planKey: string;
  readonly name: string;
  readonly description: string;
  readonly interval: "one-time" | "month" | "year";
  readonly displayAmountMinor: number;
  readonly currency: string;
  readonly accessPlanKeys: readonly string[];
  readonly benefitKeys: readonly string[];
  readonly durationDays: number | null;
}

export interface SubscriptionPlanProposal {
  readonly planKey: string;
  readonly membershipPlanKey: string;
  readonly name: string;
  readonly description: string;
  readonly billingInterval: "month" | "year";
  readonly displayAmountMinor: number;
  readonly currency: string;
  readonly accessPlanKeys: readonly string[];
  readonly benefitKeys: readonly string[];
}

export interface MembershipsSubscriptionsTopic {
  readonly membershipPlans: readonly MembershipPlanProposal[];
  readonly subscriptionPlans: readonly SubscriptionPlanProposal[];
}

export interface CreditRuleProposal {
  readonly ruleKey: string;
  readonly planKey: string;
  readonly amount: number;
  readonly cadence: "once" | "month" | "year";
}

export interface CreditsTopic {
  readonly downloadCreditRules: readonly CreditRuleProposal[];
  readonly licenseCreditRules: readonly CreditRuleProposal[];
}

export interface LicenseTermsProposal {
  readonly termsKey: string;
  readonly title: string;
  readonly body: string;
  readonly version: number;
}

export interface LicenseOptionProposal {
  readonly optionKey: string;
  readonly trackKey: string;
  readonly label: string;
  readonly termsKey: string;
  readonly uses: string;
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
  readonly displayAmountMinor: number;
  readonly currency: string;
}

export interface LicensingTopic {
  readonly terms: readonly LicenseTermsProposal[];
  readonly options: readonly LicenseOptionProposal[];
}

export interface CourseLessonProposal {
  readonly lessonKey: string;
  readonly title: string;
  readonly summary: string;
  readonly mediaKeys: readonly string[];
}

export interface CourseProposal {
  readonly courseKey: string;
  readonly title: string;
  readonly summary: string;
  readonly accessPlanKey: string | null;
  readonly lessons: readonly CourseLessonProposal[];
}

export interface VideoProposal {
  readonly videoKey: string;
  readonly title: string;
  readonly summary: string;
  readonly mediaKey: string | null;
  readonly transcript: string | null;
  readonly externalEmbedUrl: string | null;
  readonly consentRequired: boolean;
}

export interface CoursesVideoTopic {
  readonly courses: readonly CourseProposal[];
  readonly videos: readonly VideoProposal[];
}

export type SetupStructuredTextBlockType = "heading" | "paragraph" | "quote";

export interface SetupStructuredTextBlock {
  readonly type: SetupStructuredTextBlockType;
  readonly text: string;
}

export interface EditorialPostProposal {
  readonly postKey: string;
  readonly title: string;
  readonly excerpt: string;
  readonly body: readonly SetupStructuredTextBlock[];
  readonly publication: "draft" | "publish";
}

export interface UpdateEntryProposal {
  readonly updateKey: string;
  readonly title: string;
  readonly summary: string;
  readonly body: readonly SetupStructuredTextBlock[];
  readonly audience: "public" | "account";
  readonly publication: "draft" | "publish";
}

export interface AboutPageProposal {
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
  readonly publication: "draft" | "publish";
}

export const PAGE_HERO_KEYS = Object.freeze([
  "courses",
  "videos",
  "membership",
  "licensing",
] as const);

export type PageHeroKey = (typeof PAGE_HERO_KEYS)[number];

export interface PageHeroProposal {
  readonly pageKey: PageHeroKey;
  readonly mediaKey: string;
  readonly altText: string;
}

export interface EditorialPresentationTopic {
  readonly posts: readonly EditorialPostProposal[];
  readonly updates: readonly UpdateEntryProposal[];
  readonly about: AboutPageProposal;
  readonly pageHeroes: readonly PageHeroProposal[];
}

export interface ContactConsentTopic {
  readonly enabled: boolean;
  readonly publicEmail: string | null;
  readonly invitation: string;
  readonly consentText: string;
  readonly categories: readonly string[];
}

export interface TelemetryRetentionTopic {
  readonly enabled: boolean;
  readonly collectionMode: "disabled" | "consent-required";
  readonly retentionDays: number;
  readonly meaningfulListenSeconds: number;
  readonly firstPartyOnly: true;
}

export interface LegalDraftProposal {
  readonly title: string;
  readonly body: string;
  readonly action: "save-draft";
}

export interface PrivacyTermsTopic {
  readonly privacy: LegalDraftProposal;
  readonly terms: LegalDraftProposal;
  readonly artistReviewRequired: true;
}

export interface PublicationIntent {
  readonly artist: "draft" | "publish";
  readonly navigation: "draft" | "publish";
  readonly catalog: "draft" | "publish";
  readonly content: "draft" | "publish";
  readonly media: "prepare-only" | "publish-approved";
}

export interface AccountsPublicationTopic {
  readonly ownerStrategy: "authenticated-requester";
  readonly ownerAcknowledgement: "pending" | "artist-authorized";
  readonly editorAccountAliases: readonly EditorAccountProposal[];
  readonly publication: PublicationIntent;
  readonly externalPublication: "approval-required";
}

export interface EditorAccountProposal {
  readonly email: string;
  readonly displayName: string;
  readonly permissionKey: "pages.write" | "catalog.write" | "media.write";
  readonly scopeId: string;
}

export interface SetupTopics {
  readonly artist: ArtistTopic;
  readonly capabilitiesNavigation: CapabilitiesNavigationTopic;
  readonly rightsMedia: RightsMediaTopic;
  readonly catalogReleases: CatalogReleasesTopic;
  readonly streamingDownloads: StreamingDownloadsTopic;
  readonly customerAccess: CustomerAccessTopic;
  readonly membershipsSubscriptions: MembershipsSubscriptionsTopic;
  readonly credits: CreditsTopic;
  readonly licensing: LicensingTopic;
  readonly coursesVideo: CoursesVideoTopic;
  readonly editorialPresentation: EditorialPresentationTopic;
  readonly contactConsent: ContactConsentTopic;
  readonly telemetryRetention: TelemetryRetentionTopic;
  readonly privacyTerms: PrivacyTermsTopic;
  readonly accountsPublication: AccountsPublicationTopic;
}

export interface MediaActionProposal {
  readonly actionId: string;
  readonly mediaKey: string;
  readonly sourceAlias: string;
  readonly operation: "inspect-and-prepare" | "publish-approved";
  readonly derivatives: readonly (
    | "stream"
    | "download"
    | "waveform"
    | "artwork"
    | "poster"
    | "thumbnail"
    | "transcript"
  )[];
  readonly requiresArtistApproval: true;
}

export interface SourceChangeProposal {
  readonly changeId: string;
  readonly scope:
    | "visual-system"
    | "page-structure"
    | "navigation"
    | "nomenclature"
    | "module-code"
    | "new-capability";
  readonly summary: string;
  readonly requestedByArtist: true;
}

export interface ExternalActionProposal {
  readonly actionId: string;
  readonly kind: ExternalActionKind;
  readonly summary: string;
  readonly target: string;
  readonly approval: "michael-action-specific";
}

export interface SetupProposal {
  readonly schemaVersion: typeof SETUP_PROPOSAL_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly createdAt: string;
  readonly sourceStateFingerprint: string;
  readonly commerce: SetupCommerceContract;
  readonly topics: SetupTopics;
  readonly mediaActions: readonly MediaActionProposal[];
  readonly sourceChanges: readonly SourceChangeProposal[];
  readonly externalActions: readonly ExternalActionProposal[];
}

export interface SetupProposalArtifact {
  readonly proposal: SetupProposal;
  readonly proposalHash: string;
}

export interface SetupApproval {
  readonly schemaVersion: typeof SETUP_APPROVAL_SCHEMA_VERSION;
  readonly approvalId: string;
  readonly proposalId: string;
  readonly proposalHash: string;
  readonly sourceStateFingerprint: string;
  readonly approvedAt: string;
  readonly approvedBy: {
    readonly authority: "artist-owner";
    readonly accountAlias: string;
  };
  readonly approvedScopes: readonly SetupApprovalScope[];
  readonly statement: "I approve this exact proposal hash.";
}

export interface ExternalActionApproval {
  readonly schemaVersion: typeof EXTERNAL_ACTION_APPROVAL_SCHEMA_VERSION;
  readonly approvalId: string;
  readonly proposalId: string;
  readonly proposalHash: string;
  readonly sourceStateFingerprint: string;
  readonly actionId: string;
  readonly actionHash: string;
  readonly approvedAt: string;
  readonly approvedBy: "michael";
  readonly statement: "I approve this exact external action hash.";
}

export type SourceResourceKind = SetupTopicKey | "media" | "source";

export interface SourceStateResource {
  readonly kind: SourceResourceKind;
  readonly resourceKey: string;
  readonly revision: number;
  readonly contentHash: string | null;
}

export interface SourceStateSnapshot {
  readonly schemaVersion: typeof SOURCE_STATE_SCHEMA_VERSION;
  readonly installationId: string;
  readonly d1SchemaVersion: number;
  readonly setupRevision: number;
  readonly resources: readonly SourceStateResource[];
}

export type SetupMutationBoundary =
  "d1" | "r2-d1" | "local-workspace" | "git" | "external";

export interface SetupOperation {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly topic: SetupTopicKey | "media" | "source" | "external";
  readonly action: string;
  readonly target: string;
  readonly mutationBoundary: SetupMutationBoundary;
  readonly requiredApproval: SetupApprovalScope | "external-action";
  readonly state: "approval-required" | "ready";
}

export interface SetupOperationPlan {
  readonly schemaVersion: typeof SETUP_OPERATION_PLAN_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly proposalHash: string;
  readonly sourceStateFingerprint: string;
  readonly writesPerformed: 0;
  readonly readyForApply: boolean;
  readonly requiredScopes: readonly SetupApprovalScope[];
  readonly blockers: readonly string[];
  readonly operations: readonly SetupOperation[];
}

export interface SetupCheck {
  readonly id: string;
  readonly status: "pass" | "attention" | "blocked";
  readonly message: string;
}

export interface SetupPreflightReport {
  readonly schemaVersion: typeof SETUP_PREFLIGHT_SCHEMA_VERSION;
  readonly ok: boolean;
  readonly commerce: {
    readonly adapter: typeof SITES_SETUP_COMMERCE_ADAPTER;
    readonly journey: "inactive" | "active";
    readonly credentialState: "not-configured" | "partial" | "ready";
    readonly livemode: false;
  };
  readonly repository: {
    readonly requiredFilesPresent: boolean;
    readonly d1BindingReady: boolean;
    readonly r2BindingReady: boolean;
  };
  readonly localMedia: {
    readonly aliasFilePresent: boolean;
    readonly aliasCount: number;
    readonly ffprobeAvailable: boolean;
    readonly ffmpegAvailable: boolean;
  };
  readonly checks: readonly SetupCheck[];
}
