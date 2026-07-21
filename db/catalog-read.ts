import type {
  CatalogArtworkDTO,
  CatalogIndexItemDTO,
  PlayerTrackDTO,
  PublicCatalogKind,
  PublicCatalogSort,
  PublicMusicCreditDTO,
  PublicMusicDetailDTO,
  PublicMusicDetailTrackDTO,
  PublicMusicIndexDTO,
  PublicMusicQuery,
} from "@/lib/catalog/public-dto.ts";
import { readAccessFacts } from "@/db/access-read.ts";
import {
  decideAccess,
  type AccessIdentity,
} from "@/lib/access/decide-access.ts";

export class CatalogReadIntegrityError extends Error {
  override readonly name = "CatalogReadIntegrityError";
}

interface PublicQueryInput {
  readonly q?: unknown;
  readonly kind?: unknown;
  readonly tag?: unknown;
  readonly sort?: unknown;
  readonly meter?: unknown;
  readonly tempoMin?: unknown;
  readonly tempoMax?: unknown;
  readonly musicalKey?: unknown;
  readonly durationMinMs?: unknown;
  readonly durationMaxMs?: unknown;
}

export interface CatalogDetailAccessRequest {
  readonly identity: AccessIdentity | null;
  readonly now: string;
}

type CatalogViewMode = "public" | "account" | "protected" | "unavailable";
type CatalogDeliveryMode = "public" | "account" | "protected" | "unavailable";

interface PublicTrackRow {
  track_id: unknown;
  slug: unknown;
  revision_id: unknown;
  title: unknown;
  subtitle: unknown;
  description: unknown;
  duration_ms: unknown;
  meter: unknown;
  tempo_bpm: unknown;
  musical_key: unknown;
  explicit: unknown;
  view_mode: unknown;
  stream_mode: unknown;
  tags_json: unknown;
  publication_state: unknown;
  published_at: unknown;
  stream_ready: unknown;
  release_artwork_id: unknown;
}

interface PublicReleaseRow {
  release_id: unknown;
  slug: unknown;
  revision_id: unknown;
  title: unknown;
  subtitle: unknown;
  description: unknown;
  release_date: unknown;
  view_mode: unknown;
  tags_json: unknown;
  publication_state: unknown;
  published_at: unknown;
  artwork_id: unknown;
}

interface PublicCollectionRow {
  collection_id: unknown;
  slug: unknown;
  revision_id: unknown;
  title: unknown;
  description: unknown;
  view_mode: unknown;
  tags_json: unknown;
  publication_state: unknown;
  published_at: unknown;
  artwork_id: unknown;
}

interface ReleaseTrackRow extends PublicTrackRow {
  position: unknown;
  disc_number: unknown;
  track_number: unknown;
}

interface CollectionTrackRow extends PublicTrackRow {
  position: unknown;
}

interface CreditRow {
  id: unknown;
  name: unknown;
  role: unknown;
  details: unknown;
  position: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATALOG_KINDS = new Set<PublicCatalogKind>([
  "release",
  "track",
  "collection",
]);
const CATALOG_SORTS = new Set<PublicCatalogSort>(["newest", "oldest", "title"]);
const PUBLIC_VIEW_MODES = new Set<CatalogViewMode>(["public"]);
const AUTHORIZED_VIEW_MODES = new Set<CatalogViewMode>([
  "public",
  "account",
  "protected",
]);

function integrity(message: string): never {
  throw new CatalogReadIntegrityError(message);
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned an invalid ${label}.`);
  return value as string;
}

function readNonBlank(value: unknown, label: string): string {
  const result = readString(value, label);
  if (result.length === 0 || result.trim() !== result) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return result;
}

function readNullableString(value: unknown, label: string): string | null {
  return value === null ? null : readString(value, label);
}

function readId(value: unknown, label: string): string {
  const result = readNonBlank(value, label);
  if (!SAFE_ID.test(result)) integrity(`D1 returned an unsafe ${label}.`);
  return result;
}

function readSlug(value: unknown): string {
  const result = readNonBlank(value, "catalog slug");
  if (!SAFE_SLUG.test(result)) integrity("D1 returned an unsafe catalog slug.");
  return result;
}

function readInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function readNullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : readInteger(value, label);
}

function queryInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) integrity(`D1 returned an invalid ${label}.`);
  return value === 1;
}

function readViewMode(value: unknown): CatalogViewMode {
  if (
    value !== "public" &&
    value !== "account" &&
    value !== "protected" &&
    value !== "unavailable"
  ) {
    integrity("D1 returned an invalid catalog view mode.");
  }
  return value;
}

function readDeliveryMode(value: unknown): CatalogDeliveryMode {
  if (
    value !== "public" &&
    value !== "account" &&
    value !== "protected" &&
    value !== "unavailable"
  ) {
    integrity("D1 returned an invalid catalog delivery mode.");
  }
  return value;
}

function readTags(value: unknown): readonly string[] {
  if (typeof value !== "string") integrity("D1 returned invalid catalog tags.");
  try {
    const parsed: unknown = JSON.parse(value as string);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 32 ||
      !parsed.every(
        (tag) =>
          typeof tag === "string" &&
          tag.trim() === tag &&
          tag.length > 0 &&
          tag.length <= 64,
      )
    ) {
      integrity("D1 returned invalid catalog tags.");
    }
    return Object.freeze([...(parsed as string[])]);
  } catch (error) {
    if (error instanceof CatalogReadIntegrityError) throw error;
    return integrity("D1 returned invalid catalog tags JSON.");
  }
}

function readPublishedAt(value: unknown): string {
  const result = readNonBlank(value, "publication timestamp");
  if (!Number.isFinite(Date.parse(result))) {
    integrity("D1 returned an invalid publication timestamp.");
  }
  return result;
}

function normalizePublicMusicQuery(
  input: PublicQueryInput = {},
): PublicMusicQuery {
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 160) : "";
  const kind =
    input.kind === "all" || CATALOG_KINDS.has(input.kind as PublicCatalogKind)
      ? (input.kind as PublicMusicQuery["kind"])
      : "all";
  const normalizedTag =
    typeof input.tag === "string" ? input.tag.trim().slice(0, 64) : "";
  const sort = CATALOG_SORTS.has(input.sort as PublicCatalogSort)
    ? (input.sort as PublicCatalogSort)
    : "newest";
  const meter =
    typeof input.meter === "string" ? input.meter.trim().slice(0, 16) : "";
  const musicalKey =
    typeof input.musicalKey === "string"
      ? input.musicalKey.trim().slice(0, 32)
      : "";
  return Object.freeze({
    q,
    kind,
    tag: normalizedTag.length > 0 ? normalizedTag : null,
    sort,
    meter: meter || null,
    tempoMin: queryInteger(input.tempoMin),
    tempoMax: queryInteger(input.tempoMax),
    musicalKey: musicalKey || null,
    durationMinMs: queryInteger(input.durationMinMs),
    durationMaxMs: queryInteger(input.durationMaxMs),
  });
}

function playerTrack(
  row: PublicTrackRow,
  allowedViewModes: ReadonlySet<CatalogViewMode> = PUBLIC_VIEW_MODES,
  streamAllowed = readDeliveryMode(row.stream_mode) === "public",
): PlayerTrackDTO {
  const id = readId(row.track_id, "track ID");
  const slug = readSlug(row.slug);
  const revisionId = readId(row.revision_id, "track revision ID");
  const streamReady = readBoolean(row.stream_ready, "stream readiness");
  const viewMode = readViewMode(row.view_mode);
  if (
    row.publication_state !== "published" ||
    !allowedViewModes.has(viewMode)
  ) {
    integrity("A catalog projection included an unauthorized track.");
  }
  const streamMode = readDeliveryMode(row.stream_mode);
  return Object.freeze({
    id,
    slug,
    href: `/music/tracks/${slug}`,
    title: readNonBlank(row.title, "track title"),
    subtitle: readNullableString(row.subtitle, "track subtitle"),
    durationMs: readNullableInteger(row.duration_ms, "track duration"),
    meter: readNullableString(row.meter, "track meter"),
    tempoBpm: readNullableInteger(row.tempo_bpm, "track tempo"),
    musicalKey: readNullableString(row.musical_key, "track key"),
    streamUrl:
      streamReady && streamMode !== "unavailable" && streamAllowed
        ? `/api/media/tracks/${encodeURIComponent(id)}/stream?revision=${encodeURIComponent(revisionId)}`
        : null,
  });
}

function artwork(idValue: unknown, title: string): CatalogArtworkDTO | null {
  if (idValue === null) return null;
  const id = readId(idValue, "artwork derivative ID");
  return Object.freeze({
    url: `/api/media/artwork/${encodeURIComponent(id)}`,
    alt: `${title} artwork`,
  });
}

function releaseTrack(
  row: ReleaseTrackRow,
  allowedViewModes: ReadonlySet<CatalogViewMode> = PUBLIC_VIEW_MODES,
  streamAllowed = readDeliveryMode(row.stream_mode) === "public",
): PublicMusicDetailTrackDTO {
  return Object.freeze({
    position: readInteger(row.position, "release track position", 1),
    discNumber: readInteger(row.disc_number, "release disc number", 1),
    trackNumber: readInteger(row.track_number, "release track number", 1),
    track: playerTrack(row, allowedViewModes, streamAllowed),
  });
}

function collectionTrack(
  row: CollectionTrackRow,
  allowedViewModes: ReadonlySet<CatalogViewMode> = PUBLIC_VIEW_MODES,
  streamAllowed = readDeliveryMode(row.stream_mode) === "public",
): PublicMusicDetailTrackDTO {
  return Object.freeze({
    position: readInteger(row.position, "collection track position", 1),
    discNumber: null,
    trackNumber: null,
    track: playerTrack(row, allowedViewModes, streamAllowed),
  });
}

function readCredit(row: CreditRow): PublicMusicCreditDTO {
  readInteger(row.position, "credit position", 1);
  return Object.freeze({
    id: readId(row.id, "credit ID"),
    name: readNonBlank(row.name, "credit name"),
    role: readNonBlank(row.role, "credit role"),
    details: readString(row.details, "credit details"),
  });
}

const TRACK_PROJECTION_SQL = `
  tracks.id AS track_id,
  tracks.slug AS slug,
  track_revisions.id AS revision_id,
  track_revisions.title AS title,
  track_revisions.subtitle AS subtitle,
  track_revisions.description AS description,
  track_revisions.duration_ms AS duration_ms,
  track_revisions.meter AS meter,
  track_revisions.tempo_bpm AS tempo_bpm,
  track_revisions.musical_key AS musical_key,
  track_revisions.explicit AS explicit,
  track_revisions.view_mode AS view_mode,
  track_revisions.stream_mode AS stream_mode,
  track_revisions.tags_json AS tags_json,
  tracks.publication_state AS publication_state,
  tracks.published_at AS published_at,
  CASE WHEN
    track_revisions.stream_mode != 'unavailable'
    AND track_revisions.original_media_id IS NOT NULL
    AND track_revisions.streaming_derivative_id IS NOT NULL
    AND streaming_derivative.id = track_revisions.streaming_derivative_id
    AND streaming_derivative.source_media_id = track_revisions.original_media_id
    AND streaming_derivative.kind = 'streaming'
    AND streaming_derivative.status = 'ready'
    AND streaming_derivative.approval_state = 'approved'
    AND streaming_derivative.object_key IS NOT NULL
    AND streaming_derivative.content_type LIKE 'audio/%'
    AND streaming_derivative.byte_length IS NOT NULL
    AND streaming_derivative.content_sha256 IS NOT NULL
    AND source_media.id = track_revisions.original_media_id
    AND source_media.kind = 'audio'
    AND source_media.status = 'ready'
    AND source_media.approval_state = 'approved'
    AND source_media.content_type LIKE 'audio/%'
    AND source_media.content_sha256 IS NOT NULL
  THEN 1 ELSE 0 END AS stream_ready,
  (SELECT artwork_derivative.id
     FROM release_tracks AS artwork_release_track
     JOIN release_revisions AS artwork_release_revision
       ON artwork_release_revision.id = artwork_release_track.release_revision_id
     JOIN releases AS artwork_release
       ON artwork_release.published_revision_id = artwork_release_revision.id
      AND artwork_release.id = artwork_release_revision.release_id
     JOIN media_derivatives AS artwork_derivative
       ON artwork_derivative.id = artwork_release_revision.artwork_derivative_id
     JOIN media_objects AS artwork_source
       ON artwork_source.id = artwork_derivative.source_media_id
    WHERE artwork_release_track.track_id = tracks.id
      AND artwork_release.publication_state = 'published'
      AND artwork_release_revision.view_mode = 'public'
      AND artwork_derivative.kind = 'artwork'
      AND artwork_derivative.status = 'ready'
      AND artwork_derivative.approval_state = 'approved'
      AND artwork_derivative.object_key IS NOT NULL
      AND artwork_derivative.content_type LIKE 'image/%'
      AND artwork_derivative.byte_length IS NOT NULL
      AND artwork_derivative.content_sha256 IS NOT NULL
      AND artwork_source.kind = 'image'
      AND artwork_source.status = 'ready'
      AND artwork_source.approval_state = 'approved'
      AND artwork_source.content_type LIKE 'image/%'
      AND artwork_source.content_sha256 IS NOT NULL
    ORDER BY artwork_release.published_at DESC, artwork_release.id
    LIMIT 1) AS release_artwork_id`;

const TRACK_MEDIA_JOINS_SQL = `
  LEFT JOIN media_derivatives AS streaming_derivative
    ON streaming_derivative.id = track_revisions.streaming_derivative_id
  LEFT JOIN media_objects AS source_media
    ON source_media.id = streaming_derivative.source_media_id`;

const ARTWORK_PROJECTION_SQL = `CASE WHEN
  artwork_derivative.id IS NOT NULL
  AND artwork_derivative.kind = 'artwork'
  AND artwork_derivative.status = 'ready'
  AND artwork_derivative.approval_state = 'approved'
  AND artwork_derivative.object_key IS NOT NULL
  AND artwork_derivative.content_type LIKE 'image/%'
  AND artwork_derivative.byte_length IS NOT NULL
  AND artwork_derivative.content_sha256 IS NOT NULL
  AND artwork_source.kind = 'image'
  AND artwork_source.status = 'ready'
  AND artwork_source.approval_state = 'approved'
  AND artwork_source.content_type LIKE 'image/%'
  AND artwork_source.content_sha256 IS NOT NULL
THEN artwork_derivative.id ELSE NULL END AS artwork_id`;

async function readPublicTrackRows(
  binding: D1Database,
): Promise<readonly PublicTrackRow[]> {
  const result = await binding
    .prepare(
      `SELECT ${TRACK_PROJECTION_SQL}
       FROM tracks
       JOIN track_revisions
         ON track_revisions.id = tracks.published_revision_id
        AND track_revisions.track_id = tracks.id
       ${TRACK_MEDIA_JOINS_SQL}
       WHERE tracks.publication_state = 'published'
         AND track_revisions.view_mode = 'public'
       ORDER BY tracks.published_at DESC, track_revisions.title, tracks.id`,
    )
    .all<PublicTrackRow>();
  return result.results;
}

async function readPublicReleaseRows(
  binding: D1Database,
): Promise<readonly PublicReleaseRow[]> {
  const result = await binding
    .prepare(
      `SELECT
         releases.id AS release_id,
         releases.slug AS slug,
         release_revisions.id AS revision_id,
         release_revisions.title AS title,
         release_revisions.subtitle AS subtitle,
         release_revisions.description AS description,
         release_revisions.release_date AS release_date,
         release_revisions.view_mode AS view_mode,
         release_revisions.tags_json AS tags_json,
         releases.publication_state AS publication_state,
         releases.published_at AS published_at,
         ${ARTWORK_PROJECTION_SQL}
       FROM releases
       JOIN release_revisions
         ON release_revisions.id = releases.published_revision_id
        AND release_revisions.release_id = releases.id
       LEFT JOIN media_derivatives AS artwork_derivative
         ON artwork_derivative.id = release_revisions.artwork_derivative_id
       LEFT JOIN media_objects AS artwork_source
         ON artwork_source.id = artwork_derivative.source_media_id
       WHERE releases.publication_state = 'published'
         AND release_revisions.view_mode = 'public'
       ORDER BY releases.published_at DESC, release_revisions.title, releases.id`,
    )
    .all<PublicReleaseRow>();
  return result.results;
}

async function readPublicCollectionRows(
  binding: D1Database,
): Promise<readonly PublicCollectionRow[]> {
  const result = await binding
    .prepare(
      `SELECT
         collections.id AS collection_id,
         collections.slug AS slug,
         collection_revisions.id AS revision_id,
         collection_revisions.title AS title,
         collection_revisions.description AS description,
         collection_revisions.view_mode AS view_mode,
         collection_revisions.tags_json AS tags_json,
         collections.publication_state AS publication_state,
         collections.published_at AS published_at,
         ${ARTWORK_PROJECTION_SQL}
       FROM collections
       JOIN collection_revisions
         ON collection_revisions.id = collections.published_revision_id
        AND collection_revisions.collection_id = collections.id
       LEFT JOIN media_derivatives AS artwork_derivative
         ON artwork_derivative.id = collection_revisions.artwork_derivative_id
       LEFT JOIN media_objects AS artwork_source
         ON artwork_source.id = artwork_derivative.source_media_id
       WHERE collections.publication_state = 'published'
         AND collection_revisions.view_mode = 'public'
       ORDER BY collections.published_at DESC, collection_revisions.title,
                collections.id`,
    )
    .all<PublicCollectionRow>();
  return result.results;
}

async function readPublishedTrackRowBySlug(
  binding: D1Database,
  slug: string,
): Promise<PublicTrackRow | null> {
  return binding
    .prepare(
      `SELECT ${TRACK_PROJECTION_SQL}
       FROM tracks
       JOIN track_revisions
         ON track_revisions.id = tracks.published_revision_id
        AND track_revisions.track_id = tracks.id
       ${TRACK_MEDIA_JOINS_SQL}
       WHERE tracks.publication_state = 'published'
         AND tracks.slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<PublicTrackRow>();
}

async function readPublishedReleaseRowBySlug(
  binding: D1Database,
  slug: string,
): Promise<PublicReleaseRow | null> {
  return binding
    .prepare(
      `SELECT
         releases.id AS release_id,
         releases.slug AS slug,
         release_revisions.id AS revision_id,
         release_revisions.title AS title,
         release_revisions.subtitle AS subtitle,
         release_revisions.description AS description,
         release_revisions.release_date AS release_date,
         release_revisions.view_mode AS view_mode,
         release_revisions.tags_json AS tags_json,
         releases.publication_state AS publication_state,
         releases.published_at AS published_at,
         ${ARTWORK_PROJECTION_SQL}
       FROM releases
       JOIN release_revisions
         ON release_revisions.id = releases.published_revision_id
        AND release_revisions.release_id = releases.id
       LEFT JOIN media_derivatives AS artwork_derivative
         ON artwork_derivative.id = release_revisions.artwork_derivative_id
       LEFT JOIN media_objects AS artwork_source
         ON artwork_source.id = artwork_derivative.source_media_id
       WHERE releases.publication_state = 'published'
         AND releases.slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<PublicReleaseRow>();
}

async function readPublishedCollectionRowBySlug(
  binding: D1Database,
  slug: string,
): Promise<PublicCollectionRow | null> {
  return binding
    .prepare(
      `SELECT
         collections.id AS collection_id,
         collections.slug AS slug,
         collection_revisions.id AS revision_id,
         collection_revisions.title AS title,
         collection_revisions.description AS description,
         collection_revisions.view_mode AS view_mode,
         collection_revisions.tags_json AS tags_json,
         collections.publication_state AS publication_state,
         collections.published_at AS published_at,
         ${ARTWORK_PROJECTION_SQL}
       FROM collections
       JOIN collection_revisions
         ON collection_revisions.id = collections.published_revision_id
        AND collection_revisions.collection_id = collections.id
       LEFT JOIN media_derivatives AS artwork_derivative
         ON artwork_derivative.id = collection_revisions.artwork_derivative_id
       LEFT JOIN media_objects AS artwork_source
         ON artwork_source.id = artwork_derivative.source_media_id
       WHERE collections.publication_state = 'published'
         AND collections.slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<PublicCollectionRow>();
}

async function readReleaseTrackRows(
  binding: D1Database,
  releaseRevisionId: string,
): Promise<readonly ReleaseTrackRow[]> {
  const result = await binding
    .prepare(
      `SELECT
         release_tracks.position AS position,
         release_tracks.disc_number AS disc_number,
         release_tracks.track_number AS track_number,
         ${TRACK_PROJECTION_SQL}
       FROM release_tracks
       JOIN tracks ON tracks.id = release_tracks.track_id
       JOIN track_revisions
         ON track_revisions.id = release_tracks.track_revision_id
        AND track_revisions.track_id = release_tracks.track_id
       ${TRACK_MEDIA_JOINS_SQL}
       WHERE release_tracks.release_revision_id = ?1
       ORDER BY release_tracks.position`,
    )
    .bind(readId(releaseRevisionId, "release revision ID"))
    .all<ReleaseTrackRow>();
  return result.results;
}

async function readReleaseTracks(
  binding: D1Database,
  releaseRevisionId: string,
): Promise<readonly PublicMusicDetailTrackDTO[]> {
  const rows = await readReleaseTrackRows(binding, releaseRevisionId);
  return Object.freeze(rows.map((row) => releaseTrack(row)));
}

async function readCollectionTrackRows(
  binding: D1Database,
  collectionRevisionId: string,
): Promise<readonly CollectionTrackRow[]> {
  const result = await binding
    .prepare(
      `SELECT
         collection_tracks.position AS position,
         ${TRACK_PROJECTION_SQL}
       FROM collection_tracks
       JOIN tracks ON tracks.id = collection_tracks.track_id
       JOIN track_revisions
         ON track_revisions.id = collection_tracks.track_revision_id
        AND track_revisions.track_id = collection_tracks.track_id
       ${TRACK_MEDIA_JOINS_SQL}
       WHERE collection_tracks.collection_revision_id = ?1
       ORDER BY collection_tracks.position`,
    )
    .bind(readId(collectionRevisionId, "collection revision ID"))
    .all<CollectionTrackRow>();
  return result.results;
}

async function readCollectionTracks(
  binding: D1Database,
  collectionRevisionId: string,
): Promise<readonly PublicMusicDetailTrackDTO[]> {
  const rows = await readCollectionTrackRows(binding, collectionRevisionId);
  return Object.freeze(rows.map((row) => collectionTrack(row)));
}

async function readCredits(
  binding: D1Database,
  subject:
    | { readonly releaseRevisionId: string }
    | { readonly trackRevisionId: string }
    | { readonly collectionRevisionId: string },
): Promise<readonly PublicMusicCreditDTO[]> {
  const [column, id] =
    "releaseRevisionId" in subject
      ? ["release_revision_id", subject.releaseRevisionId]
      : "trackRevisionId" in subject
        ? ["track_revision_id", subject.trackRevisionId]
        : ["collection_revision_id", subject.collectionRevisionId];
  const result = await binding
    .prepare(
      `SELECT id, name, role, details, position
       FROM credits
       WHERE ${column} = ?1
       ORDER BY position`,
    )
    .bind(readId(id, "credit subject revision ID"))
    .all<CreditRow>();
  return Object.freeze(result.results.map(readCredit));
}

function releaseBase(
  row: PublicReleaseRow,
  allowedViewModes: ReadonlySet<CatalogViewMode> = PUBLIC_VIEW_MODES,
) {
  const viewMode = readViewMode(row.view_mode);
  if (
    row.publication_state !== "published" ||
    !allowedViewModes.has(viewMode)
  ) {
    integrity("A catalog projection included an unauthorized release.");
  }
  const id = readId(row.release_id, "release ID");
  const slug = readSlug(row.slug);
  const title = readNonBlank(row.title, "release title");
  return {
    id,
    slug,
    revisionId: readId(row.revision_id, "release revision ID"),
    title,
    subtitle: readNullableString(row.subtitle, "release subtitle"),
    description: readString(row.description, "release description"),
    date: readNullableString(row.release_date, "release date"),
    artwork: artwork(row.artwork_id, title),
    tags: readTags(row.tags_json),
    publishedAt: readPublishedAt(row.published_at),
  } as const;
}

function collectionBase(
  row: PublicCollectionRow,
  allowedViewModes: ReadonlySet<CatalogViewMode> = PUBLIC_VIEW_MODES,
) {
  const viewMode = readViewMode(row.view_mode);
  if (
    row.publication_state !== "published" ||
    !allowedViewModes.has(viewMode)
  ) {
    integrity("A catalog projection included an unauthorized collection.");
  }
  const id = readId(row.collection_id, "collection ID");
  const slug = readSlug(row.slug);
  const title = readNonBlank(row.title, "collection title");
  return {
    id,
    slug,
    revisionId: readId(row.revision_id, "collection revision ID"),
    title,
    description: readString(row.description, "collection description"),
    artwork: artwork(row.artwork_id, title),
    tags: readTags(row.tags_json),
    publishedAt: readPublishedAt(row.published_at),
  } as const;
}

export async function readPublicRelease(
  binding: D1Database,
  slug: string,
): Promise<PublicMusicDetailDTO | null> {
  const normalizedSlug = SAFE_SLUG.test(slug) ? slug : "";
  if (!normalizedSlug) return null;
  const rows = await readPublicReleaseRows(binding);
  const row = rows.find((candidate) => candidate.slug === normalizedSlug);
  if (!row) return null;
  const base = releaseBase(row);
  const [tracks, credits] = await Promise.all([
    readReleaseTracks(binding, base.revisionId),
    readCredits(binding, { releaseRevisionId: base.revisionId }),
  ]);
  return Object.freeze({
    kind: "release",
    id: base.id,
    slug: base.slug,
    title: base.title,
    subtitle: base.subtitle,
    description: base.description,
    date: base.date,
    artwork: base.artwork,
    tracks,
    credits,
    tags: base.tags,
  });
}

export async function readPublicTrack(
  binding: D1Database,
  slug: string,
): Promise<PublicMusicDetailDTO | null> {
  const normalizedSlug = SAFE_SLUG.test(slug) ? slug : "";
  if (!normalizedSlug) return null;
  const rows = await readPublicTrackRows(binding);
  const row = rows.find((candidate) => candidate.slug === normalizedSlug);
  if (!row) return null;
  const track = playerTrack(row);
  const revisionId = readId(row.revision_id, "track revision ID");
  const credits = await readCredits(binding, { trackRevisionId: revisionId });
  const releaseArtwork = artwork(row.release_artwork_id, track.title);
  return Object.freeze({
    kind: "track",
    id: track.id,
    slug: track.slug,
    title: track.title,
    subtitle: track.subtitle,
    description: readString(row.description, "track description"),
    date: null,
    artwork: releaseArtwork,
    tracks: Object.freeze([
      Object.freeze({
        position: 1,
        discNumber: null,
        trackNumber: null,
        track,
      }),
    ]),
    credits,
    tags: readTags(row.tags_json),
  });
}

export async function readPublicCollection(
  binding: D1Database,
  slug: string,
): Promise<PublicMusicDetailDTO | null> {
  const normalizedSlug = SAFE_SLUG.test(slug) ? slug : "";
  if (!normalizedSlug) return null;
  const rows = await readPublicCollectionRows(binding);
  const row = rows.find((candidate) => candidate.slug === normalizedSlug);
  if (!row) return null;
  const base = collectionBase(row);
  const [tracks, credits] = await Promise.all([
    readCollectionTracks(binding, base.revisionId),
    readCredits(binding, { collectionRevisionId: base.revisionId }),
  ]);
  return Object.freeze({
    kind: "collection",
    id: base.id,
    slug: base.slug,
    title: base.title,
    subtitle: null,
    description: base.description,
    date: null,
    artwork: base.artwork,
    tracks,
    credits,
    tags: base.tags,
  });
}

async function catalogViewAllowed(
  binding: D1Database,
  input: {
    readonly publicationState: unknown;
    readonly viewMode: unknown;
    readonly resourceType: PublicCatalogKind;
    readonly resourceId: unknown;
  },
  request: CatalogDetailAccessRequest,
): Promise<boolean> {
  if (input.publicationState !== "published") return false;
  const viewMode = readViewMode(input.viewMode);
  if (viewMode === "unavailable") return false;

  const resourceId = readId(input.resourceId, `${input.resourceType} ID`);
  const projection =
    viewMode === "protected"
      ? await readAccessFacts(binding, {
          identity: request.identity,
          resourceType: input.resourceType,
          resourceId,
          action: "view",
          now: request.now,
        })
      : null;
  const decision = await decideAccess({
    identity: request.identity,
    resourceType: input.resourceType,
    resourceId,
    action: "view",
    now: request.now,
    facts: {
      publicActions: viewMode === "public" ? ["view"] : [],
      accountActions: viewMode === "account" ? ["view"] : [],
      grants: projection?.facts.grants ?? [],
    },
  });
  return decision.allowed;
}

async function catalogStreamAllowed(
  binding: D1Database,
  row: PublicTrackRow,
  request: CatalogDetailAccessRequest,
): Promise<boolean> {
  if (!readBoolean(row.stream_ready, "stream readiness")) return false;

  const streamMode = readDeliveryMode(row.stream_mode);
  if (streamMode === "unavailable") return false;

  const resourceId = readId(row.track_id, "track ID");
  const projection =
    streamMode === "protected"
      ? await readAccessFacts(binding, {
          identity: request.identity,
          resourceType: "track",
          resourceId,
          action: "stream",
          now: request.now,
        })
      : null;
  const decision = await decideAccess({
    identity: request.identity,
    resourceType: "track",
    resourceId,
    action: "stream",
    now: request.now,
    facts: {
      publicActions: streamMode === "public" ? ["stream"] : [],
      accountActions: streamMode === "account" ? ["stream"] : [],
      grants: projection?.facts.grants ?? [],
    },
  });
  return decision.allowed;
}

async function readAccessibleReleaseTracks(
  binding: D1Database,
  revisionId: string,
  request: CatalogDetailAccessRequest,
): Promise<readonly PublicMusicDetailTrackDTO[]> {
  const rows = await readReleaseTrackRows(binding, revisionId);
  const visibleRows = await Promise.all(
    rows.map(async (row) => {
      const viewAllowed = await catalogViewAllowed(
        binding,
        {
          publicationState: row.publication_state,
          viewMode: row.view_mode,
          resourceType: "track",
          resourceId: row.track_id,
        },
        request,
      );
      return viewAllowed
        ? releaseTrack(
            row,
            AUTHORIZED_VIEW_MODES,
            await catalogStreamAllowed(binding, row, request),
          )
        : null;
    }),
  );
  return Object.freeze(
    visibleRows.filter((row): row is PublicMusicDetailTrackDTO => row !== null),
  );
}

async function readAccessibleCollectionTracks(
  binding: D1Database,
  revisionId: string,
  request: CatalogDetailAccessRequest,
): Promise<readonly PublicMusicDetailTrackDTO[]> {
  const rows = await readCollectionTrackRows(binding, revisionId);
  const visibleRows = await Promise.all(
    rows.map(async (row) => {
      const viewAllowed = await catalogViewAllowed(
        binding,
        {
          publicationState: row.publication_state,
          viewMode: row.view_mode,
          resourceType: "track",
          resourceId: row.track_id,
        },
        request,
      );
      return viewAllowed
        ? collectionTrack(
            row,
            AUTHORIZED_VIEW_MODES,
            await catalogStreamAllowed(binding, row, request),
          )
        : null;
    }),
  );
  return Object.freeze(
    visibleRows.filter((row): row is PublicMusicDetailTrackDTO => row !== null),
  );
}

/** Reads one published release after a server-owned exact-resource view decision. */
export async function readCatalogRelease(
  binding: D1Database,
  slug: string,
  request: CatalogDetailAccessRequest,
): Promise<PublicMusicDetailDTO | null> {
  const normalizedSlug = SAFE_SLUG.test(slug) ? slug : "";
  if (!normalizedSlug) return null;
  const row = await readPublishedReleaseRowBySlug(binding, normalizedSlug);
  if (
    !row ||
    !(await catalogViewAllowed(
      binding,
      {
        publicationState: row.publication_state,
        viewMode: row.view_mode,
        resourceType: "release",
        resourceId: row.release_id,
      },
      request,
    ))
  ) {
    return null;
  }

  const base = releaseBase(row, AUTHORIZED_VIEW_MODES);
  const [tracks, credits] = await Promise.all([
    readAccessibleReleaseTracks(binding, base.revisionId, request),
    readCredits(binding, { releaseRevisionId: base.revisionId }),
  ]);
  return Object.freeze({
    kind: "release",
    id: base.id,
    slug: base.slug,
    title: base.title,
    subtitle: base.subtitle,
    description: base.description,
    date: base.date,
    artwork: base.artwork,
    tracks,
    credits,
    tags: base.tags,
  });
}

/** Reads one published track after a server-owned exact-resource view decision. */
export async function readCatalogTrack(
  binding: D1Database,
  slug: string,
  request: CatalogDetailAccessRequest,
): Promise<PublicMusicDetailDTO | null> {
  const normalizedSlug = SAFE_SLUG.test(slug) ? slug : "";
  if (!normalizedSlug) return null;
  const row = await readPublishedTrackRowBySlug(binding, normalizedSlug);
  if (
    !row ||
    !(await catalogViewAllowed(
      binding,
      {
        publicationState: row.publication_state,
        viewMode: row.view_mode,
        resourceType: "track",
        resourceId: row.track_id,
      },
      request,
    ))
  ) {
    return null;
  }

  const track = playerTrack(
    row,
    AUTHORIZED_VIEW_MODES,
    await catalogStreamAllowed(binding, row, request),
  );
  const revisionId = readId(row.revision_id, "track revision ID");
  return Object.freeze({
    kind: "track",
    id: track.id,
    slug: track.slug,
    title: track.title,
    subtitle: track.subtitle,
    description: readString(row.description, "track description"),
    date: null,
    artwork: artwork(row.release_artwork_id, track.title),
    tracks: Object.freeze([
      Object.freeze({
        position: 1,
        discNumber: null,
        trackNumber: null,
        track,
      }),
    ]),
    credits: await readCredits(binding, { trackRevisionId: revisionId }),
    tags: readTags(row.tags_json),
  });
}

/** Reads one published collection after a server-owned exact-resource view decision. */
export async function readCatalogCollection(
  binding: D1Database,
  slug: string,
  request: CatalogDetailAccessRequest,
): Promise<PublicMusicDetailDTO | null> {
  const normalizedSlug = SAFE_SLUG.test(slug) ? slug : "";
  if (!normalizedSlug) return null;
  const row = await readPublishedCollectionRowBySlug(binding, normalizedSlug);
  if (
    !row ||
    !(await catalogViewAllowed(
      binding,
      {
        publicationState: row.publication_state,
        viewMode: row.view_mode,
        resourceType: "collection",
        resourceId: row.collection_id,
      },
      request,
    ))
  ) {
    return null;
  }

  const base = collectionBase(row, AUTHORIZED_VIEW_MODES);
  const [tracks, credits] = await Promise.all([
    readAccessibleCollectionTracks(binding, base.revisionId, request),
    readCredits(binding, { collectionRevisionId: base.revisionId }),
  ]);
  return Object.freeze({
    kind: "collection",
    id: base.id,
    slug: base.slug,
    title: base.title,
    subtitle: null,
    description: base.description,
    date: null,
    artwork: base.artwork,
    tracks,
    credits,
    tags: base.tags,
  });
}

function matchesQuery(item: CatalogIndexItemDTO, query: PublicMusicQuery) {
  if (query.kind !== "all" && item.kind !== query.kind) return false;
  if (
    query.tag &&
    !item.tags.some((tag) => tag.toLowerCase() === query.tag!.toLowerCase())
  ) {
    return false;
  }
  const hasMusicalFilter =
    query.meter !== null ||
    query.tempoMin !== null ||
    query.tempoMax !== null ||
    query.musicalKey !== null ||
    query.durationMinMs !== null ||
    query.durationMaxMs !== null;
  if (hasMusicalFilter && item.kind !== "track") return false;
  if (query.meter && item.meter !== query.meter) return false;
  if (query.musicalKey && item.musicalKey !== query.musicalKey) return false;
  if (
    query.tempoMin !== null &&
    (item.tempoBpm === null || item.tempoBpm < query.tempoMin)
  ) {
    return false;
  }
  if (
    query.tempoMax !== null &&
    (item.tempoBpm === null || item.tempoBpm > query.tempoMax)
  ) {
    return false;
  }
  if (
    query.durationMinMs !== null &&
    (item.durationMs === null || item.durationMs < query.durationMinMs)
  ) {
    return false;
  }
  if (
    query.durationMaxMs !== null &&
    (item.durationMs === null || item.durationMs > query.durationMaxMs)
  ) {
    return false;
  }
  if (!query.q) return true;
  const needle = query.q.toLocaleLowerCase();
  return [item.title, item.subtitle ?? "", item.description, ...item.tags]
    .join("\n")
    .toLocaleLowerCase()
    .includes(needle);
}

function sortItems(
  items: readonly CatalogIndexItemDTO[],
  sort: PublicCatalogSort,
): readonly CatalogIndexItemDTO[] {
  return Object.freeze(
    [...items].sort((left, right) => {
      if (sort === "title") {
        return (
          left.title.localeCompare(right.title, undefined, {
            sensitivity: "base",
          }) || left.id.localeCompare(right.id)
        );
      }
      const comparison = left.publishedAt.localeCompare(right.publishedAt);
      return (
        (sort === "oldest" ? comparison : -comparison) ||
        left.id.localeCompare(right.id)
      );
    }),
  );
}

export async function readPublicMusicIndex(
  binding: D1Database,
  input: PublicQueryInput = {},
): Promise<PublicMusicIndexDTO> {
  const query = normalizePublicMusicQuery(input);
  const [releaseRows, trackRows, collectionRows] = await Promise.all([
    readPublicReleaseRows(binding),
    readPublicTrackRows(binding),
    readPublicCollectionRows(binding),
  ]);

  const releaseProjections = await Promise.all(
    releaseRows.map(async (row) => {
      const base = releaseBase(row);
      const tracks = await readReleaseTracks(binding, base.revisionId);
      return Object.freeze({ base, tracks });
    }),
  );
  const releaseArtworkByTrackId = new Map<string, CatalogArtworkDTO>();
  for (const { base, tracks } of releaseProjections) {
    if (!base.artwork) continue;
    for (const { track } of tracks) {
      if (!releaseArtworkByTrackId.has(track.id)) {
        releaseArtworkByTrackId.set(track.id, base.artwork);
      }
    }
  }

  const trackItems: CatalogIndexItemDTO[] = trackRows.map((row) => {
    const track = playerTrack(row);
    return Object.freeze({
      kind: "track" as const,
      id: track.id,
      slug: track.slug,
      href: track.href,
      title: track.title,
      subtitle: track.subtitle,
      description: readString(row.description, "track description"),
      publishedAt: readPublishedAt(row.published_at),
      artwork: releaseArtworkByTrackId.get(track.id) ?? null,
      trackCount: null,
      playableTrack: track.streamUrl ? track : null,
      durationMs: track.durationMs,
      meter: track.meter,
      tempoBpm: track.tempoBpm,
      musicalKey: track.musicalKey,
      tags: readTags(row.tags_json),
    });
  });

  const releaseItems: readonly CatalogIndexItemDTO[] = releaseProjections.map(
    ({ base, tracks }) =>
      Object.freeze({
        kind: "release" as const,
        id: base.id,
        slug: base.slug,
        href: `/music/releases/${base.slug}`,
        title: base.title,
        subtitle: base.subtitle,
        description: base.description,
        publishedAt: base.publishedAt,
        artwork: base.artwork,
        trackCount: tracks.length,
        playableTrack:
          tracks.find(({ track }) => track.streamUrl !== null)?.track ?? null,
        durationMs: null,
        meter: null,
        tempoBpm: null,
        musicalKey: null,
        tags: base.tags,
      }),
  );

  const collectionItems = await Promise.all(
    collectionRows.map(async (row): Promise<CatalogIndexItemDTO> => {
      const base = collectionBase(row);
      const tracks = await readCollectionTracks(binding, base.revisionId);
      return Object.freeze({
        kind: "collection",
        id: base.id,
        slug: base.slug,
        href: `/music/collections/${base.slug}`,
        title: base.title,
        subtitle: null,
        description: base.description,
        publishedAt: base.publishedAt,
        artwork: base.artwork,
        trackCount: tracks.length,
        playableTrack:
          tracks.find(({ track }) => track.streamUrl !== null)?.track ?? null,
        durationMs: null,
        meter: null,
        tempoBpm: null,
        musicalKey: null,
        tags: base.tags,
      });
    }),
  );

  const allItems = Object.freeze([
    ...releaseItems,
    ...trackItems,
    ...collectionItems,
  ]);
  const availableTags = Object.freeze(
    [...new Set(allItems.flatMap(({ tags }) => tags))].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    ),
  );
  const availableMeters = Object.freeze(
    [
      ...new Set(trackItems.flatMap(({ meter }) => (meter ? [meter] : []))),
    ].sort(),
  );
  const availableKeys = Object.freeze(
    [
      ...new Set(
        trackItems.flatMap(({ musicalKey }) =>
          musicalKey ? [musicalKey] : [],
        ),
      ),
    ].sort(),
  );

  return Object.freeze({
    items: sortItems(
      allItems.filter((item) => matchesQuery(item, query)),
      query.sort,
    ),
    availableTags,
    availableMeters,
    availableKeys,
    catalogSize: allItems.length,
    query,
  });
}
