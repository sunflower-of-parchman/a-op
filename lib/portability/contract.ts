import type { PortableDocumentName, PortableEntityKind } from "./types.ts";

export type PortableFieldKind =
  | "string"
  | "nullable-string"
  | "number"
  | "nullable-number"
  | "boolean"
  | "string-array";

export interface PortableFieldContract {
  readonly kind: PortableFieldKind;
  readonly required?: true;
  readonly values?: readonly (string | number | boolean)[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface PortableRelationContract {
  readonly targets: readonly PortableEntityKind[];
  readonly required?: true;
}

export interface PortableEntityContract {
  readonly document: PortableDocumentName;
  readonly fields: Readonly<Record<string, PortableFieldContract>>;
  readonly relations: Readonly<Record<string, PortableRelationContract>>;
}

const string = (required = false): PortableFieldContract => ({
  kind: "string",
  ...(required ? { required: true as const } : {}),
});
const nullableString = (): PortableFieldContract => ({
  kind: "nullable-string",
});
const number = (
  required = false,
  minimum?: number,
  maximum?: number,
): PortableFieldContract => ({
  kind: "number",
  ...(required ? { required: true as const } : {}),
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const nullableNumber = (minimum?: number): PortableFieldContract => ({
  kind: "nullable-number",
  ...(minimum === undefined ? {} : { minimum }),
});
const boolean = (required = false): PortableFieldContract => ({
  kind: "boolean",
  ...(required ? { required: true as const } : {}),
});
const strings = (): PortableFieldContract => ({ kind: "string-array" });
const enumeration = (
  values: readonly (string | number | boolean)[],
  required = false,
): PortableFieldContract => ({
  kind:
    typeof values[0] === "number"
      ? "number"
      : typeof values[0] === "boolean"
        ? "boolean"
        : "string",
  values,
  ...(required ? { required: true as const } : {}),
});
const relation = (
  targets: readonly PortableEntityKind[],
  required = false,
): PortableRelationContract => ({
  targets,
  ...(required ? { required: true as const } : {}),
});

const publicationFields = {
  slug: string(true),
  publicationState: enumeration(["draft", "published", "archived"], true),
  revision: number(true, 1),
  publishedAt: nullableString(),
} as const;

const publicationRelations = (
  revisionEntity:
    | "page-revision"
    | "track-revision"
    | "release-revision"
    | "collection-revision"
    | "course-revision"
    | "video-revision",
) => ({
  draftRevision: relation([revisionEntity], true),
  publishedRevision: relation([revisionEntity]),
});

export const PORTABLE_ENTITY_CONTRACTS: Readonly<
  Record<PortableEntityKind, PortableEntityContract>
> = Object.freeze({
  "artist-config": {
    document: "artist",
    fields: {
      revision: number(true, 1),
      displayName: string(true),
      siteTitle: string(true),
      headline: string(true),
      introduction: string(true),
      footerText: string(true),
    },
    relations: {},
  },
  module: {
    document: "modules",
    fields: {
      key: string(true),
      active: boolean(true),
      revision: number(true, 1),
    },
    relations: {},
  },
  "navigation-set": {
    document: "navigation",
    fields: {
      key: enumeration(["primary", "footer"], true),
      label: string(true),
      revision: number(true, 1),
      publishedVersion: nullableNumber(1),
    },
    relations: {},
  },
  "navigation-item": {
    document: "navigation",
    fields: {
      key: string(true),
      label: string(true),
      href: string(true),
      position: number(true, 0),
      external: boolean(true),
      moduleKey: nullableString(),
      version: number(true, 1),
    },
    relations: { navigationSet: relation(["navigation-set"], true) },
  },
  page: {
    document: "pages",
    fields: {
      ...publicationFields,
      moduleKey: nullableString(),
      kind: enumeration(["standard", "legal", "system"], true),
    },
    relations: publicationRelations("page-revision"),
  },
  "page-revision": {
    document: "pages",
    fields: {
      revision: number(true, 1),
      moduleKey: nullableString(),
      kind: enumeration(["standard", "legal", "system"], true),
      title: string(true),
      introduction: string(true),
      bodyText: string(true),
    },
    relations: { page: relation(["page"], true) },
  },
  "page-section-placement": {
    document: "pages",
    fields: { position: number(true, 1) },
    relations: {
      pageRevision: relation(["page-revision"], true),
      contentSectionRevision: relation(["content-section-revision"], true),
    },
  },
  "content-section": {
    document: "sections",
    fields: {
      key: string(true),
      publicationState: enumeration(["draft", "published", "archived"], true),
      revision: number(true, 1),
      publishedAt: nullableString(),
    },
    relations: {
      draftRevision: relation(["content-section-revision"], true),
      publishedRevision: relation(["content-section-revision"]),
    },
  },
  "content-section-revision": {
    document: "sections",
    fields: {
      revision: number(true, 1),
      kind: enumeration(["prose", "quote", "callout"], true),
      heading: string(true),
      bodyText: string(true),
    },
    relations: { contentSection: relation(["content-section"], true) },
  },
  track: {
    document: "catalog",
    fields: publicationFields,
    relations: publicationRelations("track-revision"),
  },
  "track-revision": {
    document: "catalog",
    fields: {
      revision: number(true, 1),
      title: string(true),
      subtitle: nullableString(),
      description: string(true),
      durationMs: nullableNumber(0),
      isrc: nullableString(),
      copyrightNotice: string(true),
      explicit: boolean(true),
      viewMode: enumeration(
        ["public", "account", "protected", "unavailable"],
        true,
      ),
      streamMode: enumeration(
        ["public", "account", "protected", "unavailable"],
        true,
      ),
      downloadMode: enumeration(
        ["public", "account", "protected", "unavailable"],
        true,
      ),
      tags: strings(),
    },
    relations: {
      track: relation(["track"], true),
      originalMedia: relation(["media-object"]),
      streamingDerivative: relation(["media-derivative"]),
      downloadDerivative: relation(["media-derivative"]),
    },
  },
  release: {
    document: "catalog",
    fields: publicationFields,
    relations: publicationRelations("release-revision"),
  },
  "release-revision": {
    document: "catalog",
    fields: {
      revision: number(true, 1),
      releaseType: enumeration(
        ["single", "ep", "album", "compilation", "live", "other"],
        true,
      ),
      title: string(true),
      subtitle: nullableString(),
      description: string(true),
      releaseDate: nullableString(),
      catalogNumber: nullableString(),
      copyrightNotice: string(true),
      viewMode: enumeration(
        ["public", "account", "protected", "unavailable"],
        true,
      ),
      tags: strings(),
    },
    relations: {
      release: relation(["release"], true),
      artworkDerivative: relation(["media-derivative"]),
    },
  },
  "release-track": {
    document: "catalog",
    fields: {
      position: number(true, 1),
      discNumber: number(true, 1),
      trackNumber: number(true, 1),
    },
    relations: {
      releaseRevision: relation(["release-revision"], true),
      track: relation(["track"], true),
      trackRevision: relation(["track-revision"], true),
    },
  },
  collection: {
    document: "catalog",
    fields: publicationFields,
    relations: publicationRelations("collection-revision"),
  },
  "collection-revision": {
    document: "catalog",
    fields: {
      revision: number(true, 1),
      title: string(true),
      description: string(true),
      viewMode: enumeration(
        ["public", "account", "protected", "unavailable"],
        true,
      ),
      tags: strings(),
    },
    relations: {
      collection: relation(["collection"], true),
      artworkDerivative: relation(["media-derivative"]),
    },
  },
  "collection-track": {
    document: "catalog",
    fields: { position: number(true, 1) },
    relations: {
      collectionRevision: relation(["collection-revision"], true),
      track: relation(["track"], true),
      trackRevision: relation(["track-revision"], true),
    },
  },
  credit: {
    document: "catalog",
    fields: {
      name: string(true),
      role: string(true),
      details: string(true),
      position: number(true, 1),
    },
    relations: {
      subject: relation(
        ["release-revision", "track-revision", "collection-revision"],
        true,
      ),
    },
  },
  "access-plan": {
    document: "access",
    fields: {
      slug: string(true),
      name: string(true),
      description: string(true),
      state: enumeration(["active", "archived"], true),
      revision: number(true, 1),
    },
    relations: {},
  },
  "access-plan-item": {
    document: "access",
    fields: {
      position: number(true, 1),
      actions: strings(),
      remainingUses: nullableNumber(0),
      downloadDisposition: nullableString(),
    },
    relations: {
      accessPlan: relation(["access-plan"], true),
      resource: relation(
        ["track", "release", "collection", "course", "lesson"],
        true,
      ),
    },
  },
  "access-grant-template": {
    document: "access",
    fields: {
      key: string(true),
      label: string(true),
      accessPlanRevision: number(true, 1),
      defaultDurationDays: nullableNumber(1),
      state: enumeration(["active", "archived"], true),
      revision: number(true, 1),
    },
    relations: {
      accessPlan: relation(["access-plan"], true),
    },
  },
  "membership-plan": {
    document: "memberships",
    fields: {
      slug: string(true),
      state: enumeration(["draft", "active", "archived"], true),
      currentRevision: number(true, 1),
    },
    relations: {},
  },
  "membership-plan-revision": {
    document: "memberships",
    fields: {
      revision: number(true, 1),
      name: string(true),
      description: string(true),
      benefits: strings(),
      downloadCredits: number(true, 0),
      licenseCredits: number(true, 0),
      durationDays: nullableNumber(1),
    },
    relations: {
      membershipPlan: relation(["membership-plan"], true),
      accessPlan: relation(["access-plan"]),
    },
  },
  "subscription-plan": {
    document: "subscriptions",
    fields: {
      slug: string(true),
      name: string(true),
      description: string(true),
      billingInterval: enumeration(["month", "year"], true),
      intervalCount: number(true, 1),
      state: enumeration(["draft", "active", "archived"], true),
      revision: number(true, 1),
    },
    relations: {
      membershipPlan: relation(["membership-plan"], true),
      membershipPlanRevision: relation(["membership-plan-revision"], true),
    },
  },
  "membership-credit-rule": {
    document: "memberships",
    fields: {
      key: string(true),
      creditKind: enumeration(["download", "license"], true),
      subjectKind: enumeration(["membership", "subscription"], true),
      amount: number(true, 1),
      cadence: enumeration(["once", "month", "year"], true),
      state: enumeration(["active", "archived"], true),
      revision: number(true, 1),
    },
    relations: {
      membershipPlan: relation(["membership-plan"]),
      membershipPlanRevision: relation(["membership-plan-revision"]),
      subscriptionPlan: relation(["subscription-plan"]),
    },
  },
  "commerce-product": {
    document: "commerce",
    fields: {
      slug: string(true),
      name: string(true),
      description: string(true),
      productType: enumeration(
        [
          "track",
          "release",
          "collection",
          "membership",
          "subscription",
          "license",
          "download-credits",
          "license-credits",
        ],
        true,
      ),
      creditKind: nullableString(),
      creditQuantity: nullableNumber(1),
      state: enumeration(["draft", "active", "archived"], true),
      revision: number(true, 1),
    },
    relations: {
      resource: relation(["track", "release", "collection"]),
      accessPlan: relation(["access-plan"]),
      membershipPlan: relation(["membership-plan"]),
      membershipPlanRevision: relation(["membership-plan-revision"]),
      subscriptionPlan: relation(["subscription-plan"]),
      licenseOption: relation(["license-option"]),
    },
  },
  "commerce-price-definition": {
    document: "commerce",
    fields: {
      amountMinor: number(true, 1),
      currency: string(true),
      billingInterval: enumeration(["one_time", "month", "year"], true),
      intervalCount: number(true, 1),
      active: boolean(true),
      revision: number(true, 1),
      bindingState: enumeration(["pending"], true),
    },
    relations: { commerceProduct: relation(["commerce-product"], true) },
  },
  "commerce-binding-intent": {
    document: "commerce",
    fields: {
      key: string(true),
      intentKind: enumeration(["membership", "subscription", "license"], true),
      name: string(true),
      description: string(true),
      amountMinor: number(true, 1),
      currency: string(true),
      billingInterval: enumeration(["one_time", "month", "year"], true),
      intervalCount: number(true, 1),
      bindingState: enumeration(["pending"], true),
      revision: number(true, 1),
    },
    relations: {
      membershipPlan: relation(["membership-plan"]),
      membershipPlanRevision: relation(["membership-plan-revision"]),
      subscriptionPlan: relation(["subscription-plan"]),
      track: relation(["track"]),
      trackRevision: relation(["track-revision"]),
      licenseTermsVersion: relation(["license-terms-version"]),
      licenseOption: relation(["license-option"]),
    },
  },
  "license-terms": {
    document: "licensing",
    fields: {
      slug: string(true),
      state: enumeration(["draft", "active", "archived"], true),
      currentVersion: number(true, 1),
    },
    relations: {},
  },
  "license-terms-version": {
    document: "licensing",
    fields: {
      version: number(true, 1),
      name: string(true),
      title: string(true),
      introduction: string(true),
      generalTerms: string(true),
      disclaimer: string(true),
    },
    relations: { licenseTerms: relation(["license-terms"], true) },
  },
  "license-option": {
    document: "licensing",
    fields: {
      optionKey: string(true),
      label: string(true),
      description: string(true),
      usageCategory: string(true),
      allowedMedia: strings(),
      audienceLabel: nullableString(),
      maxAudience: nullableNumber(1),
      distributionLabel: nullableString(),
      maxCopies: nullableNumber(1),
      termMonths: nullableNumber(1),
      territory: string(true),
      attributionRequired: boolean(true),
      attributionText: nullableString(),
      exclusive: boolean(true),
      requiresApproval: boolean(true),
      licenseCreditCost: number(true, 1),
      includesTrackDownload: boolean(true),
      position: number(true, 1),
    },
    relations: {
      licenseTermsVersion: relation(["license-terms-version"], true),
    },
  },
  "license-offer": {
    document: "licensing",
    fields: {
      slug: string(true),
      state: enumeration(["draft", "active", "archived"], true),
      revision: number(true, 1),
    },
    relations: {
      track: relation(["track"], true),
      trackRevision: relation(["track-revision"], true),
      licenseTermsVersion: relation(["license-terms-version"], true),
      licenseOption: relation(["license-option"], true),
      commerceProduct: relation(["commerce-product"], true),
      priceDefinition: relation(["commerce-price-definition"], true),
    },
  },
  course: {
    document: "courses",
    fields: publicationFields,
    relations: publicationRelations("course-revision"),
  },
  "course-revision": {
    document: "courses",
    fields: {
      revision: number(true, 1),
      title: string(true),
      description: string(true),
      accessMode: enumeration(["public", "account", "protected"], true),
      estimatedMinutes: nullableNumber(1),
    },
    relations: {
      course: relation(["course"], true),
      accessPlan: relation(["access-plan"]),
    },
  },
  "course-section": {
    document: "courses",
    fields: {
      key: string(true),
      position: number(true, 1),
      title: string(true),
      description: string(true),
    },
    relations: { courseRevision: relation(["course-revision"], true) },
  },
  lesson: {
    document: "courses",
    fields: {
      key: string(true),
      slug: string(true),
      position: number(true, 1),
      title: string(true),
      summary: string(true),
      accessMode: enumeration(
        ["inherit", "public", "account", "protected"],
        true,
      ),
      estimatedMinutes: nullableNumber(1),
    },
    relations: {
      courseRevision: relation(["course-revision"], true),
      courseSection: relation(["course-section"], true),
    },
  },
  "lesson-item": {
    document: "courses",
    fields: {
      key: string(true),
      position: number(true, 1),
      itemType: enumeration(
        ["text", "prompt", "image", "audio", "video", "download"],
        true,
      ),
      bodyText: nullableString(),
      promptText: nullableString(),
      caption: nullableString(),
      altText: nullableString(),
      transcriptText: nullableString(),
    },
    relations: {
      lesson: relation(["lesson"], true),
      mediaDerivative: relation(["media-derivative"]),
    },
  },
  video: {
    document: "video",
    fields: publicationFields,
    relations: publicationRelations("video-revision"),
  },
  "video-revision": {
    document: "video",
    fields: {
      revision: number(true, 1),
      title: string(true),
      summary: string(true),
      artistContext: string(true),
      credits: strings(),
      deliveryKind: enumeration(["artist_hosted", "external"], true),
      bindingState: enumeration(["pending"], true),
    },
    relations: {
      video: relation(["video"], true),
      posterDerivative: relation(["media-derivative"]),
      hostedDerivative: relation(["media-derivative"]),
    },
  },
  "video-transcript": {
    document: "video",
    fields: {
      language: string(true),
      transcriptText: string(true),
      revision: number(true, 1),
    },
    relations: {
      videoRevision: relation(["video-revision"], true),
      captionsDerivative: relation(["media-derivative"]),
    },
  },
  "editorial-post": {
    document: "updates",
    fields: {
      slug: string(true),
      title: string(true),
      excerpt: string(true),
      bodyText: string(true),
      state: enumeration(["draft", "published", "archived"], true),
      publishedAt: nullableString(),
      revision: number(true, 1),
    },
    relations: {},
  },
  update: {
    document: "updates",
    fields: {
      slug: string(true),
      title: string(true),
      summary: string(true),
      bodyText: string(true),
      audience: enumeration(["public", "account"], true),
      state: enumeration(["draft", "published", "archived"], true),
      publishedAt: nullableString(),
      revision: number(true, 1),
    },
    relations: {
      resource: relation([
        "track",
        "release",
        "collection",
        "course",
        "video",
        "page",
        "license-offer",
        "membership-plan",
        "subscription-plan",
      ]),
    },
  },
  "contact-form": {
    document: "contact",
    fields: {
      key: string(true),
      title: string(true),
      description: string(true),
      bookingInformation: string(true),
      publicContactDetails: string(true),
      categories: strings(),
      state: enumeration(["active", "disabled"], true),
      currentConsentVersion: number(true, 1),
      deliveryAdapter: enumeration(["stored_only"], true),
      revision: number(true, 1),
    },
    relations: {},
  },
  "contact-consent-version": {
    document: "contact",
    fields: {
      version: number(true, 1),
      consentText: string(true),
      effectiveAt: string(true),
    },
    relations: { contactForm: relation(["contact-form"], true) },
  },
  "telemetry-settings": {
    document: "telemetry",
    fields: {
      collectionMode: enumeration(
        ["disabled", "consent_required", "anonymous"],
        true,
      ),
      retentionDays: number(true, 1, 365),
      meaningfulListenSeconds: number(true, 5, 300),
      revision: number(true, 1),
    },
    relations: {},
  },
  "legal-document": {
    document: "legal",
    fields: {
      documentKind: enumeration(["privacy", "terms"], true),
      title: string(true),
      currentVersion: number(true, 1),
      revision: number(true, 1),
      publishedAt: nullableString(),
    },
    relations: {
      draftVersion: relation(["legal-document-version"], true),
      approvedVersion: relation(["legal-document-version"]),
      publishedVersion: relation(["legal-document-version"]),
    },
  },
  "legal-document-version": {
    document: "legal",
    fields: {
      documentKind: enumeration(["privacy", "terms"], true),
      version: number(true, 1),
      title: string(true),
      introduction: string(true),
      bodyText: string(true),
      approved: boolean(true),
      approvedAt: nullableString(),
    },
    relations: { legalDocument: relation(["legal-document"], true) },
  },
  "media-object": {
    document: "media",
    fields: {
      kind: enumeration(["audio", "image", "video", "document", "other"], true),
      visibility: enumeration(["public", "protected"], true),
      contentType: string(true),
      byteLength: number(true, 0),
      sourceVersion: number(true, 1),
      status: enumeration(["pending", "ready", "failed", "archived"], true),
      approvalState: enumeration(["pending", "approved", "rejected"], true),
      contentSha256: nullableString(),
      durationMs: nullableNumber(0),
      channels: nullableNumber(1),
      sampleRate: nullableNumber(1),
      revision: number(true, 1),
    },
    relations: {},
  },
  "media-derivative": {
    document: "media",
    fields: {
      kind: enumeration(
        [
          "streaming",
          "download",
          "waveform",
          "artwork",
          "poster",
          "thumbnail",
          "transcript",
          "document",
          "other",
        ],
        true,
      ),
      processingProfile: string(true),
      processingVersion: string(true),
      status: enumeration(["pending", "processing", "ready", "failed"], true),
      approvalState: enumeration(["pending", "approved", "rejected"], true),
      contentType: nullableString(),
      format: nullableString(),
      bitrateKbps: nullableNumber(1),
      durationMs: nullableNumber(0),
      channels: nullableNumber(1),
      sampleRate: nullableNumber(1),
      byteLength: nullableNumber(0),
      contentSha256: nullableString(),
      revision: number(true, 1),
    },
    relations: { sourceMedia: relation(["media-object"], true) },
  },
});

const documentEntities: Record<PortableDocumentName, PortableEntityKind[]> = {
  artist: [],
  modules: [],
  navigation: [],
  pages: [],
  sections: [],
  catalog: [],
  access: [],
  memberships: [],
  subscriptions: [],
  commerce: [],
  licensing: [],
  courses: [],
  video: [],
  updates: [],
  contact: [],
  telemetry: [],
  legal: [],
  media: [],
};

for (const entity of Object.keys(PORTABLE_ENTITY_CONTRACTS)) {
  const kind = entity as PortableEntityKind;
  documentEntities[PORTABLE_ENTITY_CONTRACTS[kind].document].push(kind);
}

export const PORTABLE_DOCUMENT_ENTITIES: Readonly<
  Record<PortableDocumentName, readonly PortableEntityKind[]>
> = Object.freeze(documentEntities);
