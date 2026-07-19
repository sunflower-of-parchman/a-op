export const MEDIA_PREPARATION_SCHEMA_VERSION = 1 as const;

export const MEDIA_KINDS = Object.freeze([
  "audio",
  "image",
  "video",
  "document",
  "other",
] as const);

export type PreparedMediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_INTENDED_USES = Object.freeze([
  "streaming",
  "download",
  "artwork",
  "video",
  "course",
  "license-document",
  "public-site",
  "protected-delivery",
  "private-archive",
] as const);

export type MediaIntendedUse = (typeof MEDIA_INTENDED_USES)[number];

export interface ApprovedMediaSourceInput {
  readonly alias: string;
  readonly expectedSourceSha256: string;
  readonly kind: PreparedMediaKind;
  readonly contentType: string;
  readonly rightsConfirmed: true;
  readonly intendedUse: readonly MediaIntendedUse[];
}

export interface MediaInspection {
  readonly durationMs: number | null;
  readonly channels: number | null;
  readonly sampleRate: number | null;
  readonly format: string | null;
  readonly bitrateKbps: number | null;
}

export interface FixedDerivativeProfile {
  readonly id: string;
  readonly version: string;
  readonly sourceKind: PreparedMediaKind;
  readonly sourceContentTypes: readonly string[];
  readonly intendedUses: readonly MediaIntendedUse[];
  readonly processor: "ffmpeg" | "copy";
  readonly derivativeKind:
    | "streaming"
    | "download"
    | "waveform"
    | "artwork"
    | "poster"
    | "thumbnail"
    | "transcript"
    | "document"
    | "other";
  readonly outputExtension: string;
  readonly contentType: string;
  readonly format: string;
  readonly bitrateKbps: number | null;
  readonly ffmpegArguments: readonly string[];
}

export interface RequestedDerivative {
  readonly profileId: string;
  readonly outputAlias: string;
}

export interface MediaManifestSource {
  readonly role: "source";
  readonly alias: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly kind: PreparedMediaKind;
  readonly contentType: string;
  readonly rightsConfirmed: true;
  readonly intendedUse: readonly MediaIntendedUse[];
  readonly inspection: MediaInspection;
}

export interface MediaManifestDerivative {
  readonly role: "derivative";
  readonly alias: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly sourceSha256: string;
  readonly profileId: string;
  readonly processingVersion: string;
  readonly derivativeKind: FixedDerivativeProfile["derivativeKind"];
  readonly contentType: string;
  readonly format: string;
  readonly bitrateKbps: number | null;
  readonly inspection: MediaInspection;
}

export interface ApprovedMediaManifest {
  readonly schemaVersion: typeof MEDIA_PREPARATION_SCHEMA_VERSION;
  readonly proposalSha256: string;
  readonly approvalSha256: string;
  readonly source: MediaManifestSource;
  readonly derivatives: readonly MediaManifestDerivative[];
  readonly manifestSha256: string;
}

export interface DerivativeResult {
  readonly bytes: Uint8Array;
  readonly inspection: MediaInspection;
}

export interface MediaPreparationDependencies {
  readAliasBytes(alias: string): Promise<Uint8Array>;
  inspectAlias(alias: string): Promise<MediaInspection>;
  createScratch(): Promise<string>;
  removeScratch(scratch: string): Promise<void>;
  createDerivative(
    scratch: string,
    sourceAlias: string,
    profile: FixedDerivativeProfile,
  ): Promise<DerivativeResult>;
  writeAliasBytes(alias: string, bytes: Uint8Array): Promise<void>;
  preflightTools?(): Promise<void>;
}

export interface PrepareApprovedMediaInput {
  readonly setupProposalSha256: `sha256:${string}`;
  readonly setupApprovalSha256: `sha256:${string}`;
  readonly source: ApprovedMediaSourceInput;
  readonly derivatives: readonly RequestedDerivative[];
  readonly checkTools?: boolean;
}
