export const FAVORITE_TARGET_TYPES = Object.freeze([
  "track",
  "release",
] as const);

export type FavoriteTargetType = (typeof FAVORITE_TARGET_TYPES)[number];

export interface FavoriteDesiredStateInput {
  readonly targetType: FavoriteTargetType;
  readonly targetId: string;
  readonly active: boolean;
  readonly expectedRevision: number | null;
}

export interface PlaylistCreateInput {
  readonly name: string;
  readonly description: string;
  readonly trackIds: readonly string[];
}

export interface PlaylistReplacementInput extends PlaylistCreateInput {
  readonly expectedRevision: number;
}

export interface PlaylistArchiveInput {
  readonly expectedRevision: number;
}

export interface ListeningCheckpointInput {
  readonly trackId: string;
  readonly positionMs: number;
  readonly meaningful: boolean;
  readonly expectedRevision: number | null;
}

export interface CustomerTrackDTO {
  readonly kind: "track";
  readonly id: string;
  readonly available: boolean;
  readonly slug: string | null;
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly durationMs: number | null;
  readonly href: string | null;
  readonly streamUrl: string | null;
}

export interface CustomerReleaseDTO {
  readonly kind: "release";
  readonly id: string;
  readonly available: boolean;
  readonly slug: string | null;
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly durationMs: null;
  readonly href: string | null;
  readonly streamUrl: null;
}

export type CustomerLibraryResourceDTO = CustomerTrackDTO | CustomerReleaseDTO;

export interface CustomerFavoriteDTO {
  readonly id: string;
  readonly targetType: FavoriteTargetType;
  readonly targetId: string;
  readonly active: true;
  readonly revision: number;
  readonly resource: CustomerLibraryResourceDTO;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerFavoriteStateDTO {
  readonly targetType: FavoriteTargetType;
  readonly targetId: string;
  readonly active: boolean;
  readonly revision: number;
}

export interface CustomerPlaylistTrackDTO {
  readonly id: string;
  readonly position: number;
  readonly track: CustomerTrackDTO;
}

export interface CustomerPlaylistDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: "active";
  readonly revision: number;
  readonly tracks: readonly CustomerPlaylistTrackDTO[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FrozenListenedRevisionDTO {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly durationMs: number | null;
}

export interface ListeningHistoryDTO {
  readonly id: string;
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly track: CustomerTrackDTO;
  readonly listenedRevision: FrozenListenedRevisionDTO;
  readonly positionMs: number;
  readonly resumePositionMs: number | null;
  readonly meaningfulListenCount: number;
  readonly revision: number;
  readonly firstListenedAt: string;
  readonly lastListenedAt: string;
}

export interface ResumePositionDTO {
  readonly trackId: string;
  readonly positionMs: number;
  readonly revision: number;
}

export interface CustomerLibraryDTO {
  readonly favorites: readonly CustomerFavoriteDTO[];
  readonly playlists: readonly CustomerPlaylistDTO[];
  readonly listeningHistory: readonly ListeningHistoryDTO[];
}

export interface FavoriteMutationResult {
  readonly targetType: FavoriteTargetType;
  readonly targetId: string;
  readonly active: boolean;
  readonly revision: number;
}

export interface PlaylistMutationResult {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: "active" | "archived";
  readonly revision: number;
  readonly trackIds: readonly string[];
}

export interface ListeningCheckpointResult {
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly positionMs: number;
  readonly meaningfulListenCount: number;
  readonly revision: number;
}
