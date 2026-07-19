export type VideoDeliveryKind = "artist_hosted" | "external";
export type ExternalVideoProvider = "youtube" | "vimeo" | "other";

export interface VideoCredit {
  readonly name: string;
  readonly role: string;
  readonly details: string;
}

export interface VideoTranscriptInput {
  readonly language: string;
  readonly transcriptText: string;
  readonly captionsDerivativeId: string | null;
}

export interface VideoDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly artistContext: string;
  readonly credits: readonly VideoCredit[];
  readonly deliveryKind: VideoDeliveryKind;
  readonly posterDerivativeId: string | null;
  readonly hostedDerivativeId: string | null;
  readonly externalProvider: ExternalVideoProvider | null;
  readonly externalEmbedUrl: string | null;
  readonly transcripts: readonly VideoTranscriptInput[];
}

export interface VideoTranscriptDTO extends VideoTranscriptInput {
  readonly id: string;
  readonly revision: number;
}

export interface PublicVideoSummaryDTO {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly deliveryKind: VideoDeliveryKind;
  readonly hasPoster: boolean;
  readonly transcriptLanguages: readonly string[];
  readonly publishedAt: string;
}

export type PublicVideoDeliveryDTO =
  | {
      readonly kind: "artist_hosted";
      readonly mediaHref: string;
      readonly posterHref: string | null;
    }
  | {
      readonly kind: "external";
      readonly provider: ExternalVideoProvider;
      readonly embedUrl: string;
      readonly posterHref: string | null;
    };

export interface PublicVideoDetailDTO extends PublicVideoSummaryDTO {
  readonly artistContext: string;
  readonly credits: readonly VideoCredit[];
  readonly transcripts: readonly VideoTranscriptDTO[];
  readonly delivery: PublicVideoDeliveryDTO;
}

export interface AdminVideoSummaryDTO {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publicationState: "draft" | "published" | "archived";
  readonly revision: number;
  readonly draftRevision: number;
  readonly publishedRevisionId: string | null;
  readonly updatedAt: string;
}

export interface AdminVideoDraftDTO {
  readonly id: string;
  readonly slug: string;
  readonly publicationState: "draft" | "published" | "archived";
  readonly revision: number;
  readonly publishedRevisionId: string | null;
  readonly draft: VideoDraftInput & {
    readonly id: string;
    readonly revision: number;
    readonly transcripts: readonly VideoTranscriptDTO[];
  };
}
