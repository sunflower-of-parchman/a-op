export const ARTIST_EXPORT_FORMAT = "a-op.artist-installation-export" as const;
export const ARTIST_EXPORT_FORMAT_VERSION = 1 as const;
export const ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const PORTABLE_DOCUMENT_NAMES = [
  "artist",
  "modules",
  "navigation",
  "pages",
  "sections",
  "catalog",
  "access",
  "memberships",
  "subscriptions",
  "commerce",
  "licensing",
  "courses",
  "video",
  "updates",
  "contact",
  "telemetry",
  "legal",
  "media",
] as const;

export type PortableDocumentName = (typeof PORTABLE_DOCUMENT_NAMES)[number];

export const PORTABLE_ENTITY_KINDS = [
  "artist-config",
  "module",
  "navigation-set",
  "navigation-item",
  "page",
  "page-revision",
  "page-section-placement",
  "content-section",
  "content-section-revision",
  "track",
  "track-revision",
  "release",
  "release-revision",
  "release-track",
  "collection",
  "collection-revision",
  "collection-track",
  "credit",
  "access-plan",
  "access-plan-item",
  "access-grant-template",
  "membership-plan",
  "membership-plan-revision",
  "subscription-plan",
  "membership-credit-rule",
  "commerce-product",
  "commerce-price-definition",
  "commerce-binding-intent",
  "license-terms",
  "license-terms-version",
  "license-option",
  "license-offer",
  "course",
  "course-revision",
  "course-section",
  "lesson",
  "lesson-item",
  "video",
  "video-revision",
  "video-transcript",
  "editorial-post",
  "update",
  "contact-form",
  "contact-consent-version",
  "telemetry-settings",
  "legal-document",
  "legal-document-version",
  "media-object",
  "media-derivative",
] as const;

export type PortableEntityKind = (typeof PORTABLE_ENTITY_KINDS)[number];

export type PortableScalar = string | number | boolean | null;
export type PortableValue = PortableScalar | readonly string[];

export interface PortableField {
  readonly name: string;
  readonly value: PortableValue;
}

export interface PortableRelation {
  readonly name: string;
  readonly targetEntity: PortableEntityKind;
  readonly targetId: string;
}

export interface PortableRecord {
  readonly entity: PortableEntityKind;
  readonly id: string;
  readonly fields: readonly PortableField[];
  readonly relations: readonly PortableRelation[];
}

export type ArtistInstallationSnapshot = Readonly<
  Record<PortableDocumentName, readonly PortableRecord[]>
>;

export interface ArtistExportDocument {
  readonly schemaVersion: typeof ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION;
  readonly records: readonly PortableRecord[];
}

export interface ArtistExportRecoveryDocument {
  readonly schemaVersion: typeof ARTIST_EXPORT_DOCUMENT_SCHEMA_VERSION;
  readonly restoreMode: "disposable-local-rehearsal";
  readonly commerceBindingState: "pending";
  readonly externalVideoBindingState: "pending";
  readonly installationDefinitionsOnly: true;
  readonly mediaBytesIncluded: false;
  readonly instructions: readonly [
    "Verify every manifest checksum before restore.",
    "Restore only into an exact disposable local target.",
    "Review and bind commerce prices after restore; no provider identifier is portable.",
    "Review and bind external video after restore; no provider identifier is portable.",
    "Publish media bytes separately from artist-approved sources.",
  ];
}

export interface ArtistExportManifestEntry {
  readonly path: string;
  readonly mediaType: "application/json";
  readonly byteLength: number;
  readonly sha256: string;
}

export interface ArtistExportManifest {
  readonly format: typeof ARTIST_EXPORT_FORMAT;
  readonly formatVersion: typeof ARTIST_EXPORT_FORMAT_VERSION;
  readonly applicationSchemaVersion: number;
  readonly createdAt: string;
  readonly semanticFingerprint: string;
  readonly entries: readonly ArtistExportManifestEntry[];
}

export interface ArtistExportArchiveEntry {
  readonly path: string;
  readonly kind: string;
  readonly mediaType: string;
  readonly text: string;
}

export interface ArtistExportArchive {
  readonly manifest: ArtistExportManifest;
  readonly files: readonly ArtistExportArchiveEntry[];
}

export interface VerifiedArtistExportArchive {
  readonly archive: ArtistExportArchive;
  readonly snapshot: ArtistInstallationSnapshot;
  readonly semanticFingerprint: string;
  readonly archiveSha256: string;
}

export interface RestorePassResult {
  readonly pass: 1 | 2;
  readonly inserted: number;
  readonly reused: number;
  readonly total: number;
  readonly foreignKeyViolationCount: 0;
  readonly semanticFingerprint: string;
}

export interface DisposableRestoreReport {
  readonly semanticFingerprint: string;
  readonly restoredSemanticFingerprint: string;
  readonly recordCount: number;
  readonly firstPass: RestorePassResult;
  readonly secondPass: RestorePassResult;
  readonly duplicateCount: 0;
  readonly commerceBindingState: "pending";
  readonly externalVideoBindingState: "pending";
  readonly applicationSchemaRestored: true;
  readonly migrationCount: number;
  readonly foreignKeyViolationCount: 0;
  readonly sourceObjectKeysRestored: 0;
  readonly mediaBytesRestored: 0;
}

export interface D1ArtistExportSourceAdapter {
  readPortableRecords(
    document: PortableDocumentName,
  ): Promise<readonly PortableRecord[]>;
}

export interface D1ArtistRestoreTransaction {
  putPortableRecord(
    document: PortableDocumentName,
    record: PortableRecord,
    options: {
      readonly semanticFingerprint: string;
      readonly commerceBindingState: "pending";
      readonly externalVideoBindingState: "pending";
    },
  ): Promise<"inserted" | "reused">;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface D1ArtistRestoreAdapter {
  beginDisposableRestore(): Promise<D1ArtistRestoreTransaction>;
  readRestoredSnapshot(): Promise<ArtistInstallationSnapshot>;
}

export interface R2ArtistExportArchiveAdapter {
  putArtistArchive(input: {
    readonly exportId: string;
    readonly contentType: "application/vnd.a-op.artist-export+json";
    readonly byteLength: number;
    readonly sha256: string;
    readonly bytes: Uint8Array;
  }): Promise<{ readonly exportId: string }>;
  getArtistArchive(exportId: string): Promise<Uint8Array | null>;
}
