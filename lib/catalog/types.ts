export const CATALOG_ACCESS_MODES = Object.freeze([
  "public",
  "account",
  "protected",
  "unavailable",
] as const);
export type CatalogAccessMode = (typeof CATALOG_ACCESS_MODES)[number];

export const RELEASE_TYPES = Object.freeze([
  "single",
  "ep",
  "album",
  "compilation",
  "live",
  "other",
] as const);
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export const MEDIA_DERIVATIVE_KINDS = Object.freeze([
  "streaming",
  "download",
  "waveform",
  "artwork",
  "poster",
  "thumbnail",
  "transcript",
  "document",
  "other",
] as const);
export type MediaDerivativeKind = (typeof MEDIA_DERIVATIVE_KINDS)[number];

export type PublicationState = "draft" | "published" | "archived";

export interface CatalogCreditInput {
  readonly name: string;
  readonly role: string;
  readonly details: string;
}

export interface TrackDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly durationMs: number | null;
  readonly meter: string | null;
  readonly tempoBpm: number | null;
  readonly musicalKey: string | null;
  readonly isrc: string | null;
  readonly copyrightNotice: string;
  readonly explicit: boolean;
  readonly viewMode: CatalogAccessMode;
  readonly streamMode: CatalogAccessMode;
  readonly downloadMode: CatalogAccessMode;
  readonly originalMediaId: string | null;
  readonly streamingDerivativeId: string | null;
  readonly downloadDerivativeId: string | null;
  readonly tags: readonly string[];
  readonly credits: readonly CatalogCreditInput[];
}

export interface ReleaseTrackInput {
  readonly trackId: string;
  readonly discNumber: number;
  readonly trackNumber: number;
}

export interface ReleaseDraftInput {
  readonly slug: string;
  readonly releaseType: ReleaseType;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly releaseDate: string | null;
  readonly catalogNumber: string | null;
  readonly copyrightNotice: string;
  readonly viewMode: CatalogAccessMode;
  readonly artworkDerivativeId: string | null;
  readonly tags: readonly string[];
  readonly tracks: readonly ReleaseTrackInput[];
  readonly credits: readonly CatalogCreditInput[];
}

export interface CollectionDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly viewMode: CatalogAccessMode;
  readonly artworkDerivativeId: string | null;
  readonly tags: readonly string[];
  readonly trackIds: readonly string[];
  readonly credits: readonly CatalogCreditInput[];
}

export interface MediaObjectRegistrationInput {
  readonly id: string;
  readonly objectKey: string;
  readonly kind: "audio" | "image" | "video" | "document" | "export" | "other";
  readonly visibility: "public" | "protected";
  readonly contentType: string;
  readonly byteLength: number;
  readonly etag: string | null;
  readonly sourceVersion: number;
  readonly status: "pending" | "ready" | "failed";
  readonly contentSha256: string | null;
  readonly durationMs: number | null;
  readonly channels: number | null;
  readonly sampleRate: number | null;
}

export interface MediaDerivativeRegistrationInput {
  readonly id: string;
  readonly sourceMediaId: string;
  readonly kind: MediaDerivativeKind;
  readonly processingProfile: string;
  readonly processingVersion: string;
  readonly objectKey: string | null;
  readonly status: "pending" | "processing" | "ready" | "failed";
  readonly contentType: string | null;
  readonly format: string | null;
  readonly bitrateKbps: number | null;
  readonly durationMs: number | null;
  readonly channels: number | null;
  readonly sampleRate: number | null;
  readonly byteLength: number | null;
  readonly contentSha256: string | null;
}

export interface CatalogCreditView extends CatalogCreditInput {
  readonly id: string;
  readonly position: number;
}

export interface CatalogTrackView {
  readonly id: string;
  readonly slug: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly draftRevisionId: string;
  readonly publishedRevisionId: string | null;
  readonly revisionId: string;
  readonly revision: number;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly durationMs: number | null;
  readonly meter: string | null;
  readonly tempoBpm: number | null;
  readonly musicalKey: string | null;
  readonly isrc: string | null;
  readonly copyrightNotice: string;
  readonly explicit: boolean;
  readonly viewMode: CatalogAccessMode;
  readonly streamMode: CatalogAccessMode;
  readonly downloadMode: CatalogAccessMode;
  readonly originalMediaId: string | null;
  readonly streamingDerivativeId: string | null;
  readonly downloadDerivativeId: string | null;
  readonly streamReady: boolean;
  readonly streamUrl: string | null;
  readonly tags: readonly string[];
  readonly credits: readonly CatalogCreditView[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface CatalogTrackListItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly durationMs: number | null;
  readonly meter: string | null;
  readonly tempoBpm: number | null;
  readonly musicalKey: string | null;
  readonly explicit: boolean;
  readonly streamMode: CatalogAccessMode;
  readonly streamReady: boolean;
  readonly streamUrl: string | null;
  readonly tags: readonly string[];
}

export interface CatalogReleaseTrackView extends CatalogTrackListItem {
  readonly position: number;
  readonly discNumber: number;
  readonly trackNumber: number;
}

export interface CatalogReleaseView {
  readonly id: string;
  readonly slug: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly draftRevisionId: string;
  readonly publishedRevisionId: string | null;
  readonly revisionId: string;
  readonly revision: number;
  readonly releaseType: ReleaseType;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly releaseDate: string | null;
  readonly catalogNumber: string | null;
  readonly copyrightNotice: string;
  readonly viewMode: CatalogAccessMode;
  readonly artworkAvailable: boolean;
  readonly tags: readonly string[];
  readonly tracks: readonly CatalogReleaseTrackView[];
  readonly credits: readonly CatalogCreditView[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface CatalogCollectionView {
  readonly id: string;
  readonly slug: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly draftRevisionId: string;
  readonly publishedRevisionId: string | null;
  readonly revisionId: string;
  readonly revision: number;
  readonly title: string;
  readonly description: string;
  readonly viewMode: CatalogAccessMode;
  readonly artworkAvailable: boolean;
  readonly tags: readonly string[];
  readonly tracks: readonly (CatalogTrackListItem & {
    readonly position: number;
  })[];
  readonly credits: readonly CatalogCreditView[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface CatalogIndexView {
  readonly releases: readonly CatalogReleaseView[];
  readonly tracks: readonly CatalogTrackView[];
  readonly collections: readonly CatalogCollectionView[];
}

export interface AdminCatalogSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface AdminCatalogIndex {
  readonly releases: readonly AdminCatalogSummary[];
  readonly tracks: readonly AdminCatalogSummary[];
  readonly collections: readonly AdminCatalogSummary[];
  readonly media: readonly AdminMediaSummary[];
}

export interface AdminMediaSummary {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly approvalState: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly sourceVersion: number;
  readonly derivatives: readonly AdminDerivativeSummary[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminDerivativeSummary {
  readonly id: string;
  readonly kind: MediaDerivativeKind;
  readonly status: "pending" | "processing" | "ready" | "failed";
  readonly approvalState: "pending" | "approved" | "rejected";
  readonly contentType: string | null;
  readonly byteLength: number | null;
  readonly processingProfile: string;
  readonly processingVersion: string;
}

export interface AdminTrackDraft extends TrackDraftInput {
  readonly id: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly revisionId: string;
  readonly revision: number;
  readonly publishedRevisionId: string | null;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface AdminReleaseTrack {
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly slug: string;
  readonly title: string;
  readonly position: number;
  readonly discNumber: number;
  readonly trackNumber: number;
}

export interface AdminReleaseDraft extends Omit<ReleaseDraftInput, "tracks"> {
  readonly id: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly revisionId: string;
  readonly revision: number;
  readonly publishedRevisionId: string | null;
  readonly tracks: readonly AdminReleaseTrack[];
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface AdminCollectionTrack {
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly slug: string;
  readonly title: string;
  readonly position: number;
}

export interface AdminCollectionDraft extends Omit<
  CollectionDraftInput,
  "trackIds"
> {
  readonly id: string;
  readonly publicationState: PublicationState;
  readonly version: number;
  readonly revisionId: string;
  readonly revision: number;
  readonly publishedRevisionId: string | null;
  readonly trackIds: readonly string[];
  readonly tracks: readonly AdminCollectionTrack[];
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface AdminTrackOption {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publishedRevisionId: string;
}

export interface AdminMediaOption {
  readonly id: string;
  readonly label: string;
  readonly kind: "source" | MediaDerivativeKind;
  readonly sourceMediaId: string;
  readonly contentType: string | null;
}
