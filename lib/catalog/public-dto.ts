export type PublicCatalogKind = "release" | "track" | "collection";
export type PublicCatalogSort = "newest" | "oldest" | "title";

export interface PlayerTrackDTO {
  readonly id: string;
  readonly slug: string;
  readonly href: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly durationMs: number | null;
  readonly streamUrl: string | null;
  /** Server-projected customer resume state. It is never browser authority. */
  readonly resumePositionMs?: number | null;
  /** Current D1 listening-history revision used for compare-and-set writes. */
  readonly historyRevision?: number | null;
}

export interface CatalogArtworkDTO {
  readonly url: string;
  readonly alt: string;
}

export interface CatalogIndexItemDTO {
  readonly kind: PublicCatalogKind;
  readonly id: string;
  readonly slug: string;
  readonly href: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly publishedAt: string;
  readonly artwork: CatalogArtworkDTO | null;
  readonly trackCount: number | null;
  readonly playableTrack: PlayerTrackDTO | null;
  readonly tags: readonly string[];
}

export interface PublicMusicQuery {
  readonly q: string;
  readonly kind: "all" | PublicCatalogKind;
  readonly tag: string | null;
  readonly sort: PublicCatalogSort;
}

export interface PublicMusicIndexDTO {
  readonly items: readonly CatalogIndexItemDTO[];
  readonly availableTags: readonly string[];
  readonly catalogSize: number;
  readonly query: PublicMusicQuery;
}

export interface PublicMusicCreditDTO {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly details: string;
}

export interface PublicMusicDetailTrackDTO {
  readonly position: number;
  readonly discNumber: number | null;
  readonly trackNumber: number | null;
  readonly track: PlayerTrackDTO;
}

export interface PublicMusicDetailDTO {
  readonly kind: PublicCatalogKind;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string;
  readonly date: string | null;
  readonly artwork: CatalogArtworkDTO | null;
  readonly tracks: readonly PublicMusicDetailTrackDTO[];
  readonly credits: readonly PublicMusicCreditDTO[];
  readonly tags: readonly string[];
}
