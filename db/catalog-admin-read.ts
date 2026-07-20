import type {
  AdminCatalogIndex,
  AdminCatalogSummary,
  AdminCollectionDraft,
  AdminCollectionTrack,
  AdminDerivativeSummary,
  AdminMediaOption,
  AdminMediaSummary,
  AdminReleaseDraft,
  AdminReleaseTrack,
  AdminTrackDraft,
  AdminTrackOption,
  CatalogAccessMode,
  CatalogCreditInput,
  MediaDerivativeKind,
  PublicationState,
  ReleaseType,
} from "@/lib/catalog/types.ts";

export class CatalogAdminReadIntegrityError extends Error {
  override readonly name = "CatalogAdminReadIntegrityError";
}

interface AggregateDraftRow {
  id: unknown;
  slug: unknown;
  publication_state: unknown;
  version: unknown;
  draft_revision_id: unknown;
  published_revision_id: unknown;
  revision: unknown;
  title: unknown;
  updated_at: unknown;
  published_at: unknown;
}

interface TrackDraftRow extends AggregateDraftRow {
  subtitle: unknown;
  description: unknown;
  duration_ms: unknown;
  meter: unknown;
  tempo_bpm: unknown;
  musical_key: unknown;
  isrc: unknown;
  copyright_notice: unknown;
  explicit: unknown;
  view_mode: unknown;
  stream_mode: unknown;
  download_mode: unknown;
  original_media_id: unknown;
  streaming_derivative_id: unknown;
  download_derivative_id: unknown;
  tags_json: unknown;
}

interface ReleaseDraftRow extends AggregateDraftRow {
  release_type: unknown;
  subtitle: unknown;
  description: unknown;
  release_date: unknown;
  catalog_number: unknown;
  copyright_notice: unknown;
  view_mode: unknown;
  artwork_derivative_id: unknown;
  tags_json: unknown;
}

interface CollectionDraftRow extends AggregateDraftRow {
  description: unknown;
  view_mode: unknown;
  artwork_derivative_id: unknown;
  tags_json: unknown;
}

interface CreditRow {
  name: unknown;
  role: unknown;
  details: unknown;
  position: unknown;
}

interface AdminReleaseTrackRow {
  track_id: unknown;
  track_revision_id: unknown;
  slug: unknown;
  title: unknown;
  position: unknown;
  disc_number: unknown;
  track_number: unknown;
}

interface AdminCollectionTrackRow {
  track_id: unknown;
  track_revision_id: unknown;
  slug: unknown;
  title: unknown;
  position: unknown;
}

interface MediaRow {
  id: unknown;
  kind: unknown;
  status: unknown;
  approval_state: unknown;
  content_type: unknown;
  byte_length: unknown;
  source_version: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface DerivativeRow {
  id: unknown;
  source_media_id: unknown;
  kind: unknown;
  status: unknown;
  approval_state: unknown;
  content_type: unknown;
  byte_length: unknown;
  processing_profile: unknown;
  processing_version: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLICATION_STATES = new Set<PublicationState>([
  "draft",
  "published",
  "archived",
]);
const ACCESS_MODES = new Set<CatalogAccessMode>([
  "public",
  "account",
  "protected",
  "unavailable",
]);
const RELEASE_TYPE_SET = new Set<ReleaseType>([
  "single",
  "ep",
  "album",
  "compilation",
  "live",
  "other",
]);
const DERIVATIVE_KIND_SET = new Set<MediaDerivativeKind>([
  "streaming",
  "download",
  "waveform",
  "artwork",
  "poster",
  "thumbnail",
  "transcript",
  "document",
  "other",
]);

function integrity(message: string): never {
  throw new CatalogAdminReadIntegrityError(message);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned an invalid ${label}.`);
  return value as string;
}

function nonBlank(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.length === 0 || result.trim() !== result) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return result;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function id(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  if (!SAFE_ID.test(result)) integrity(`D1 returned an unsafe ${label}.`);
  return result;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function slug(value: unknown): string {
  const result = nonBlank(value, "catalog slug");
  if (!SAFE_SLUG.test(result)) integrity("D1 returned an unsafe catalog slug.");
  return result;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) integrity(`D1 returned an invalid ${label}.`);
  return value === 1;
}

function publicationState(value: unknown): PublicationState {
  if (!PUBLICATION_STATES.has(value as PublicationState)) {
    integrity("D1 returned an invalid publication state.");
  }
  return value as PublicationState;
}

function accessMode(value: unknown, label: string): CatalogAccessMode {
  if (!ACCESS_MODES.has(value as CatalogAccessMode)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as CatalogAccessMode;
}

function tags(value: unknown): readonly string[] {
  if (typeof value !== "string") integrity("D1 returned invalid catalog tags.");
  try {
    const parsed: unknown = JSON.parse(value as string);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((tag) => typeof tag === "string")
    ) {
      integrity("D1 returned invalid catalog tags.");
    }
    return Object.freeze([...(parsed as string[])]);
  } catch (error) {
    if (error instanceof CatalogAdminReadIntegrityError) throw error;
    return integrity("D1 returned invalid catalog tags JSON.");
  }
}

function root(row: AggregateDraftRow) {
  const aggregateId = id(row.id, "catalog aggregate ID");
  const draftRevisionId = id(row.draft_revision_id, "draft revision ID");
  return {
    id: aggregateId,
    slug: slug(row.slug),
    publicationState: publicationState(row.publication_state),
    version: integer(row.version, "aggregate version", 1),
    revisionId: draftRevisionId,
    revision: integer(row.revision, "draft revision number", 1),
    publishedRevisionId: nullableId(
      row.published_revision_id,
      "published revision ID",
    ),
    updatedAt: nonBlank(row.updated_at, "aggregate update timestamp"),
    publishedAt: nullableString(row.published_at, "publication timestamp"),
  } as const;
}

async function readCredits(
  binding: D1Database,
  column:
    "track_revision_id" | "release_revision_id" | "collection_revision_id",
  revisionId: string,
): Promise<readonly CatalogCreditInput[]> {
  const result = await binding
    .prepare(
      `SELECT name, role, details, position
       FROM credits WHERE ${column} = ?1 ORDER BY position`,
    )
    .bind(revisionId)
    .all<CreditRow>();
  return Object.freeze(
    result.results.map((row, index) => {
      if (integer(row.position, "credit position", 1) !== index + 1) {
        integrity("D1 returned a non-contiguous credit sequence.");
      }
      return Object.freeze({
        name: nonBlank(row.name, "credit name"),
        role: nonBlank(row.role, "credit role"),
        details: string(row.details, "credit details"),
      });
    }),
  );
}

export async function readAdminTrackDraft(
  binding: D1Database,
  requestedSlug: string,
): Promise<AdminTrackDraft | null> {
  if (!SAFE_SLUG.test(requestedSlug)) return null;
  const row = await binding
    .prepare(
      `SELECT tracks.id, tracks.slug, tracks.publication_state, tracks.version,
              tracks.draft_revision_id, tracks.published_revision_id,
              tracks.updated_at, tracks.published_at,
              draft.revision, draft.title, draft.subtitle, draft.description,
              draft.duration_ms, draft.meter, draft.tempo_bpm,
              draft.musical_key, draft.isrc, draft.copyright_notice,
              draft.explicit, draft.view_mode, draft.stream_mode,
              draft.download_mode, draft.original_media_id,
              draft.streaming_derivative_id, draft.download_derivative_id,
              draft.tags_json
       FROM tracks
       JOIN track_revisions AS draft
         ON draft.id = tracks.draft_revision_id
        AND draft.track_id = tracks.id
       WHERE tracks.slug = ?1 LIMIT 1`,
    )
    .bind(requestedSlug)
    .first<TrackDraftRow>();
  if (!row) return null;
  const base = root(row);
  return Object.freeze({
    ...base,
    title: nonBlank(row.title, "track title"),
    subtitle: nullableString(row.subtitle, "track subtitle"),
    description: string(row.description, "track description"),
    durationMs: nullableInteger(row.duration_ms, "track duration"),
    meter: nullableString(row.meter, "track meter"),
    tempoBpm: nullableInteger(row.tempo_bpm, "track tempo"),
    musicalKey: nullableString(row.musical_key, "track key"),
    isrc: nullableString(row.isrc, "track ISRC"),
    copyrightNotice: string(row.copyright_notice, "copyright notice"),
    explicit: boolean(row.explicit, "explicit flag"),
    viewMode: accessMode(row.view_mode, "view mode"),
    streamMode: accessMode(row.stream_mode, "stream mode"),
    downloadMode: accessMode(row.download_mode, "download mode"),
    originalMediaId: nullableId(row.original_media_id, "source media ID"),
    streamingDerivativeId: nullableId(
      row.streaming_derivative_id,
      "streaming derivative ID",
    ),
    downloadDerivativeId: nullableId(
      row.download_derivative_id,
      "download derivative ID",
    ),
    tags: tags(row.tags_json),
    credits: await readCredits(binding, "track_revision_id", base.revisionId),
  });
}

async function readReleaseTracks(
  binding: D1Database,
  revisionId: string,
): Promise<readonly AdminReleaseTrack[]> {
  const result = await binding
    .prepare(
      `SELECT release_tracks.track_id, release_tracks.track_revision_id,
              tracks.slug, track_revisions.title, release_tracks.position,
              release_tracks.disc_number, release_tracks.track_number
       FROM release_tracks
       JOIN tracks ON tracks.id = release_tracks.track_id
       JOIN track_revisions
         ON track_revisions.id = release_tracks.track_revision_id
        AND track_revisions.track_id = release_tracks.track_id
       WHERE release_tracks.release_revision_id = ?1
       ORDER BY release_tracks.position`,
    )
    .bind(revisionId)
    .all<AdminReleaseTrackRow>();
  return Object.freeze(
    result.results.map((row, index) => {
      const position = integer(row.position, "release track position", 1);
      if (position !== index + 1) {
        integrity("D1 returned a non-contiguous release sequence.");
      }
      return Object.freeze({
        trackId: id(row.track_id, "track ID"),
        trackRevisionId: id(row.track_revision_id, "track revision ID"),
        slug: slug(row.slug),
        title: nonBlank(row.title, "track title"),
        position,
        discNumber: integer(row.disc_number, "disc number", 1),
        trackNumber: integer(row.track_number, "track number", 1),
      });
    }),
  );
}

export async function readAdminReleaseDraft(
  binding: D1Database,
  requestedSlug: string,
): Promise<AdminReleaseDraft | null> {
  if (!SAFE_SLUG.test(requestedSlug)) return null;
  const row = await binding
    .prepare(
      `SELECT releases.id, releases.slug, releases.publication_state,
              releases.version, releases.draft_revision_id,
              releases.published_revision_id, releases.updated_at,
              releases.published_at, draft.revision, draft.release_type,
              draft.title, draft.subtitle, draft.description,
              draft.release_date, draft.catalog_number, draft.copyright_notice,
              draft.view_mode, draft.artwork_derivative_id, draft.tags_json
       FROM releases
       JOIN release_revisions AS draft
         ON draft.id = releases.draft_revision_id
        AND draft.release_id = releases.id
       WHERE releases.slug = ?1 LIMIT 1`,
    )
    .bind(requestedSlug)
    .first<ReleaseDraftRow>();
  if (!row) return null;
  const base = root(row);
  if (!RELEASE_TYPE_SET.has(row.release_type as ReleaseType)) {
    integrity("D1 returned an invalid release type.");
  }
  const tracks = await readReleaseTracks(binding, base.revisionId);
  return Object.freeze({
    ...base,
    releaseType: row.release_type as ReleaseType,
    title: nonBlank(row.title, "release title"),
    subtitle: nullableString(row.subtitle, "release subtitle"),
    description: string(row.description, "release description"),
    releaseDate: nullableString(row.release_date, "release date"),
    catalogNumber: nullableString(row.catalog_number, "catalog number"),
    copyrightNotice: string(row.copyright_notice, "copyright notice"),
    viewMode: accessMode(row.view_mode, "view mode"),
    artworkDerivativeId: nullableId(
      row.artwork_derivative_id,
      "artwork derivative ID",
    ),
    tags: tags(row.tags_json),
    tracks,
    credits: await readCredits(binding, "release_revision_id", base.revisionId),
  });
}

async function readCollectionTracks(
  binding: D1Database,
  revisionId: string,
): Promise<readonly AdminCollectionTrack[]> {
  const result = await binding
    .prepare(
      `SELECT collection_tracks.track_id,
              collection_tracks.track_revision_id, tracks.slug,
              track_revisions.title, collection_tracks.position
       FROM collection_tracks
       JOIN tracks ON tracks.id = collection_tracks.track_id
       JOIN track_revisions
         ON track_revisions.id = collection_tracks.track_revision_id
        AND track_revisions.track_id = collection_tracks.track_id
       WHERE collection_tracks.collection_revision_id = ?1
       ORDER BY collection_tracks.position`,
    )
    .bind(revisionId)
    .all<AdminCollectionTrackRow>();
  return Object.freeze(
    result.results.map((row, index) => {
      const position = integer(row.position, "collection track position", 1);
      if (position !== index + 1) {
        integrity("D1 returned a non-contiguous collection sequence.");
      }
      return Object.freeze({
        trackId: id(row.track_id, "track ID"),
        trackRevisionId: id(row.track_revision_id, "track revision ID"),
        slug: slug(row.slug),
        title: nonBlank(row.title, "track title"),
        position,
      });
    }),
  );
}

export async function readAdminCollectionDraft(
  binding: D1Database,
  requestedSlug: string,
): Promise<AdminCollectionDraft | null> {
  if (!SAFE_SLUG.test(requestedSlug)) return null;
  const row = await binding
    .prepare(
      `SELECT collections.id, collections.slug,
              collections.publication_state, collections.version,
              collections.draft_revision_id,
              collections.published_revision_id, collections.updated_at,
              collections.published_at, draft.revision, draft.title,
              draft.description, draft.view_mode,
              draft.artwork_derivative_id, draft.tags_json
       FROM collections
       JOIN collection_revisions AS draft
         ON draft.id = collections.draft_revision_id
        AND draft.collection_id = collections.id
       WHERE collections.slug = ?1 LIMIT 1`,
    )
    .bind(requestedSlug)
    .first<CollectionDraftRow>();
  if (!row) return null;
  const base = root(row);
  const tracks = await readCollectionTracks(binding, base.revisionId);
  return Object.freeze({
    ...base,
    title: nonBlank(row.title, "collection title"),
    description: string(row.description, "collection description"),
    viewMode: accessMode(row.view_mode, "view mode"),
    artworkDerivativeId: nullableId(
      row.artwork_derivative_id,
      "artwork derivative ID",
    ),
    tags: tags(row.tags_json),
    trackIds: Object.freeze(tracks.map(({ trackId }) => trackId)),
    tracks,
    credits: await readCredits(
      binding,
      "collection_revision_id",
      base.revisionId,
    ),
  });
}

function summary(row: AggregateDraftRow): AdminCatalogSummary {
  return Object.freeze({
    id: id(row.id, "catalog aggregate ID"),
    slug: slug(row.slug),
    title: nonBlank(row.title, "catalog title"),
    publicationState: publicationState(row.publication_state),
    version: integer(row.version, "aggregate version", 1),
    updatedAt: nonBlank(row.updated_at, "aggregate update timestamp"),
    publishedAt: nullableString(row.published_at, "publication timestamp"),
  });
}

function inScopes(
  item: { readonly slug: string },
  scopes: readonly string[] | null,
) {
  return scopes === null || scopes.includes("*") || scopes.includes(item.slug);
}

export async function readAdminCatalogIndex(
  binding: D1Database,
  catalogScopes: readonly string[] | null = null,
  mediaScopes: readonly string[] | null = null,
): Promise<AdminCatalogIndex> {
  const summaryQuery = (
    table: string,
    revisions: string,
    ownerColumn: string,
  ) =>
    binding.prepare(
      `SELECT root.id, root.slug, root.publication_state, root.version,
              root.draft_revision_id, root.published_revision_id,
              root.updated_at, root.published_at, draft.revision, draft.title
       FROM ${table} AS root
       JOIN ${revisions} AS draft
         ON draft.id = root.draft_revision_id
        AND draft.${ownerColumn} = root.id
       ORDER BY draft.title, root.id`,
    );
  const [releaseRows, trackRows, collectionRows, mediaRows, derivativeRows] =
    await Promise.all([
      summaryQuery(
        "releases",
        "release_revisions",
        "release_id",
      ).all<AggregateDraftRow>(),
      summaryQuery(
        "tracks",
        "track_revisions",
        "track_id",
      ).all<AggregateDraftRow>(),
      summaryQuery(
        "collections",
        "collection_revisions",
        "collection_id",
      ).all<AggregateDraftRow>(),
      binding
        .prepare(
          `SELECT id, kind, status, approval_state, content_type, byte_length,
                  source_version, created_at, updated_at
           FROM media_objects ORDER BY created_at, id`,
        )
        .all<MediaRow>(),
      binding
        .prepare(
          `SELECT id, source_media_id, kind, status, approval_state,
                  content_type, byte_length, processing_profile,
                  processing_version
           FROM media_derivatives ORDER BY source_media_id, created_at, id`,
        )
        .all<DerivativeRow>(),
    ]);
  const derivatives = new Map<string, AdminDerivativeSummary[]>();
  for (const row of derivativeRows.results) {
    const sourceMediaId = id(row.source_media_id, "source media ID");
    if (!DERIVATIVE_KIND_SET.has(row.kind as MediaDerivativeKind)) {
      integrity("D1 returned an invalid derivative kind.");
    }
    if (
      row.status !== "pending" &&
      row.status !== "processing" &&
      row.status !== "ready" &&
      row.status !== "failed"
    ) {
      integrity("D1 returned an invalid derivative status.");
    }
    if (
      row.approval_state !== "pending" &&
      row.approval_state !== "approved" &&
      row.approval_state !== "rejected"
    ) {
      integrity("D1 returned an invalid derivative approval state.");
    }
    const item: AdminDerivativeSummary = Object.freeze({
      id: id(row.id, "derivative ID"),
      kind: row.kind as MediaDerivativeKind,
      status: row.status,
      approvalState: row.approval_state,
      contentType: nullableString(row.content_type, "derivative content type"),
      byteLength: nullableInteger(row.byte_length, "derivative byte length"),
      processingProfile: nonBlank(row.processing_profile, "processing profile"),
      processingVersion: nonBlank(row.processing_version, "processing version"),
    });
    derivatives.set(sourceMediaId, [
      ...(derivatives.get(sourceMediaId) ?? []),
      item,
    ]);
  }
  const media: AdminMediaSummary[] = mediaRows.results
    .filter(
      (row) =>
        mediaScopes === null ||
        mediaScopes.includes("*") ||
        mediaScopes.includes(String(row.id)),
    )
    .map((row) => {
      const mediaId = id(row.id, "media ID");
      return Object.freeze({
        id: mediaId,
        kind: nonBlank(row.kind, "media kind"),
        status: nonBlank(row.status, "media status"),
        approvalState: nonBlank(row.approval_state, "media approval state"),
        contentType: nonBlank(row.content_type, "media content type"),
        byteLength: integer(row.byte_length, "media byte length"),
        sourceVersion: integer(row.source_version, "source version", 1),
        derivatives: Object.freeze(derivatives.get(mediaId) ?? []),
        createdAt: nonBlank(row.created_at, "media creation timestamp"),
        updatedAt: nonBlank(row.updated_at, "media update timestamp"),
      });
    });
  return Object.freeze({
    releases: Object.freeze(
      releaseRows.results
        .map(summary)
        .filter((item) => inScopes(item, catalogScopes)),
    ),
    tracks: Object.freeze(
      trackRows.results
        .map(summary)
        .filter((item) => inScopes(item, catalogScopes)),
    ),
    collections: Object.freeze(
      collectionRows.results
        .map(summary)
        .filter((item) => inScopes(item, catalogScopes)),
    ),
    media: Object.freeze(media),
  });
}

export async function readAdminTrackOptions(
  binding: D1Database,
): Promise<readonly AdminTrackOption[]> {
  const result = await binding
    .prepare(
      `SELECT tracks.id, tracks.slug, tracks.published_revision_id,
              published.title
       FROM tracks
       JOIN track_revisions AS published
         ON published.id = tracks.published_revision_id
        AND published.track_id = tracks.id
       WHERE tracks.publication_state = 'published'
       ORDER BY published.title, tracks.id`,
    )
    .all<{
      id: unknown;
      slug: unknown;
      published_revision_id: unknown;
      title: unknown;
    }>();
  return Object.freeze(
    result.results.map((row) =>
      Object.freeze({
        id: id(row.id, "track ID"),
        slug: slug(row.slug),
        title: nonBlank(row.title, "track title"),
        publishedRevisionId: id(
          row.published_revision_id,
          "published track revision ID",
        ),
      }),
    ),
  );
}

export async function readAdminMediaOptions(
  binding: D1Database,
): Promise<readonly AdminMediaOption[]> {
  const [sourceResult, derivativeResult] = await Promise.all([
    binding
      .prepare(
        `SELECT id, kind, content_type
         FROM media_objects
         WHERE status = 'ready' AND approval_state = 'approved'
         ORDER BY created_at, id`,
      )
      .all<{ id: unknown; kind: unknown; content_type: unknown }>(),
    binding
      .prepare(
        `SELECT id, source_media_id, kind, content_type,
                processing_profile, processing_version
         FROM media_derivatives
         WHERE status = 'ready' AND approval_state = 'approved'
         ORDER BY created_at, id`,
      )
      .all<{
        id: unknown;
        source_media_id: unknown;
        kind: unknown;
        content_type: unknown;
        processing_profile: unknown;
        processing_version: unknown;
      }>(),
  ]);
  const sources: AdminMediaOption[] = sourceResult.results.map((row) => {
    const mediaId = id(row.id, "media ID");
    return Object.freeze({
      id: mediaId,
      label: `${nonBlank(row.kind, "media kind")} source ${mediaId}`,
      kind: "source" as const,
      sourceMediaId: mediaId,
      contentType: nullableString(row.content_type, "media content type"),
    });
  });
  const derivativeOptions: AdminMediaOption[] = derivativeResult.results.map(
    (row) => {
      if (!DERIVATIVE_KIND_SET.has(row.kind as MediaDerivativeKind)) {
        integrity("D1 returned an invalid derivative kind.");
      }
      const derivativeId = id(row.id, "derivative ID");
      return Object.freeze({
        id: derivativeId,
        label: `${nonBlank(row.processing_profile, "processing profile")} ${nonBlank(row.processing_version, "processing version")}`,
        kind: row.kind as MediaDerivativeKind,
        sourceMediaId: id(row.source_media_id, "source media ID"),
        contentType: nullableString(
          row.content_type,
          "derivative content type",
        ),
      });
    },
  );
  return Object.freeze([...sources, ...derivativeOptions]);
}
