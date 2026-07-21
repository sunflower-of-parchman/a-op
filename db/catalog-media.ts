export type StreamAvailability = "public" | "account" | "protected";

export interface TrackStreamDeliveryRecord {
  readonly trackId: string;
  readonly trackSlug: string;
  readonly revisionId: string;
  readonly streamMode: StreamAvailability;
  readonly derivativeId: string;
  readonly sourceMediaId: string;
  /** Server-only R2 identifier. */
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteLength: number;
}

export interface TrackDownloadDeliveryRecord {
  readonly trackId: string;
  readonly trackSlug: string;
  readonly revisionId: string;
  readonly downloadMode: StreamAvailability;
  readonly derivativeId: string;
  readonly sourceMediaId: string;
  /** Server-only R2 identifier. */
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteLength: number;
  /** A safe public filename assembled only from the track slug and format. */
  readonly filename: string;
}

export interface ArtworkDeliveryRecord {
  readonly derivativeId: string;
  /** Server-only R2 identifier. */
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteLength: number;
}

interface StreamRow {
  track_id: string;
  track_slug: string;
  revision_id: string;
  stream_mode: string;
  derivative_id: string;
  source_media_id: string;
  object_key: string;
  content_type: string;
  byte_length: number;
}

interface DownloadRow {
  track_id: string;
  track_slug: string;
  revision_id: string;
  download_mode: string;
  derivative_id: string;
  source_media_id: string;
  object_key: string;
  content_type: string;
  format: string;
  byte_length: number;
}

interface ArtworkRow {
  derivative_id: string;
  object_key: string;
  content_type: string;
  byte_length: number;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRIVATE_DERIVATIVE_KEY = /^derivatives\/[a-z0-9][a-z0-9._/-]{0,499}$/i;

function safeId(value: string, label: string): string {
  if (!SAFE_ID.test(value)) throw new Error(`D1 returned an unsafe ${label}.`);
  return value;
}

function privateKey(value: string): string {
  if (!PRIVATE_DERIVATIVE_KEY.test(value) || value.includes("..")) {
    throw new Error("D1 returned an unsafe private derivative key.");
  }
  return value;
}

function byteLength(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("D1 returned an invalid derivative byte length.");
  }
  return value;
}

function contentType(value: string, prefix: "audio/" | "image/"): string {
  if (typeof value !== "string" || !value.toLowerCase().startsWith(prefix)) {
    throw new Error("D1 returned an invalid derivative content type.");
  }
  return value;
}

function streamMode(value: string): StreamAvailability {
  if (value !== "public" && value !== "account" && value !== "protected") {
    throw new Error("D1 returned an invalid stream availability mode.");
  }
  return value;
}

function downloadFormat(value: string): string {
  if (typeof value !== "string" || !/^[a-z0-9]{1,10}$/.test(value)) {
    throw new Error("D1 returned an unsafe download format.");
  }
  return value;
}

export async function readTrackStreamDelivery(
  binding: D1Database,
  trackId: string,
  requestedRevisionId: string | null,
): Promise<TrackStreamDeliveryRecord | null> {
  if (!SAFE_ID.test(trackId)) return null;
  if (requestedRevisionId !== null && !SAFE_ID.test(requestedRevisionId)) {
    return null;
  }
  const row = await binding
    .prepare(
      `SELECT
         tracks.id AS track_id,
         tracks.slug AS track_slug,
         track_revisions.id AS revision_id,
         track_revisions.stream_mode AS stream_mode,
         derivative.id AS derivative_id,
         source.id AS source_media_id,
         derivative.object_key AS object_key,
         derivative.content_type AS content_type,
         derivative.byte_length AS byte_length
       FROM tracks
       JOIN track_revisions
         ON track_revisions.id = COALESCE(?2, tracks.published_revision_id)
        AND track_revisions.track_id = tracks.id
       JOIN media_derivatives AS derivative
         ON derivative.id = track_revisions.streaming_derivative_id
        AND derivative.source_media_id = track_revisions.original_media_id
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE tracks.id = ?1
         AND tracks.publication_state = 'published'
         AND track_revisions.stream_mode != 'unavailable'
         AND (
           track_revisions.id = tracks.published_revision_id
           OR EXISTS (
             SELECT 1 FROM releases
             JOIN release_revisions
               ON release_revisions.id = releases.published_revision_id
              AND release_revisions.release_id = releases.id
             JOIN release_tracks
               ON release_tracks.release_revision_id = release_revisions.id
             WHERE releases.publication_state = 'published'
               AND release_tracks.track_id = tracks.id
               AND release_tracks.track_revision_id = track_revisions.id
           )
           OR EXISTS (
             SELECT 1 FROM collections
             JOIN collection_revisions
               ON collection_revisions.id = collections.published_revision_id
              AND collection_revisions.collection_id = collections.id
             JOIN collection_tracks
               ON collection_tracks.collection_revision_id = collection_revisions.id
             WHERE collections.publication_state = 'published'
               AND collection_tracks.track_id = tracks.id
               AND collection_tracks.track_revision_id = track_revisions.id
           )
         )
         AND derivative.kind = 'streaming'
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type LIKE 'audio/%'
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.kind = 'audio'
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_type LIKE 'audio/%'
         AND source.content_sha256 IS NOT NULL
       LIMIT 1`,
    )
    .bind(trackId, requestedRevisionId)
    .first<StreamRow>();
  if (!row) return null;
  if (!SAFE_SLUG.test(row.track_slug)) {
    throw new Error("D1 returned an unsafe track slug.");
  }
  return {
    trackId: safeId(row.track_id, "track ID"),
    trackSlug: row.track_slug,
    revisionId: safeId(row.revision_id, "track revision ID"),
    streamMode: streamMode(row.stream_mode),
    derivativeId: safeId(row.derivative_id, "derivative ID"),
    sourceMediaId: safeId(row.source_media_id, "source media ID"),
    objectKey: privateKey(row.object_key),
    contentType: contentType(row.content_type, "audio/"),
    byteLength: byteLength(row.byte_length),
  };
}

export async function readTrackDownloadDelivery(
  binding: D1Database,
  trackId: string,
  requestedRevisionId: string | null,
): Promise<TrackDownloadDeliveryRecord | null> {
  if (!SAFE_ID.test(trackId)) return null;
  if (requestedRevisionId !== null && !SAFE_ID.test(requestedRevisionId)) {
    return null;
  }
  const row = await binding
    .prepare(
      `SELECT
         tracks.id AS track_id,
         tracks.slug AS track_slug,
         track_revisions.id AS revision_id,
         track_revisions.download_mode AS download_mode,
         derivative.id AS derivative_id,
         source.id AS source_media_id,
         derivative.object_key AS object_key,
         derivative.content_type AS content_type,
         derivative.format AS format,
         derivative.byte_length AS byte_length
       FROM tracks
       JOIN track_revisions
         ON track_revisions.id = COALESCE(?2, tracks.published_revision_id)
        AND track_revisions.track_id = tracks.id
       JOIN media_derivatives AS derivative
         ON derivative.id = track_revisions.download_derivative_id
        AND derivative.source_media_id = track_revisions.original_media_id
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE tracks.id = ?1
         AND tracks.publication_state = 'published'
         AND track_revisions.download_mode != 'unavailable'
         AND (
           track_revisions.id = tracks.published_revision_id
           OR EXISTS (
             SELECT 1 FROM releases
             JOIN release_revisions
               ON release_revisions.id = releases.published_revision_id
              AND release_revisions.release_id = releases.id
             JOIN release_tracks
               ON release_tracks.release_revision_id = release_revisions.id
             WHERE releases.publication_state = 'published'
               AND release_tracks.track_id = tracks.id
               AND release_tracks.track_revision_id = track_revisions.id
           )
           OR EXISTS (
             SELECT 1 FROM collections
             JOIN collection_revisions
               ON collection_revisions.id = collections.published_revision_id
              AND collection_revisions.collection_id = collections.id
             JOIN collection_tracks
               ON collection_tracks.collection_revision_id = collection_revisions.id
             WHERE collections.publication_state = 'published'
               AND collection_tracks.track_id = tracks.id
               AND collection_tracks.track_revision_id = track_revisions.id
           )
         )
         AND derivative.kind = 'download'
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type LIKE 'audio/%'
         AND derivative.format IS NOT NULL
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.kind = 'audio'
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_type LIKE 'audio/%'
         AND source.content_sha256 IS NOT NULL
       LIMIT 1`,
    )
    .bind(trackId, requestedRevisionId)
    .first<DownloadRow>();
  if (!row) return null;
  if (!SAFE_SLUG.test(row.track_slug)) {
    throw new Error("D1 returned an unsafe track slug.");
  }
  const format = downloadFormat(row.format);
  return {
    trackId: safeId(row.track_id, "track ID"),
    trackSlug: row.track_slug,
    revisionId: safeId(row.revision_id, "track revision ID"),
    downloadMode: streamMode(row.download_mode),
    derivativeId: safeId(row.derivative_id, "derivative ID"),
    sourceMediaId: safeId(row.source_media_id, "source media ID"),
    objectKey: privateKey(row.object_key),
    contentType: contentType(row.content_type, "audio/"),
    byteLength: byteLength(row.byte_length),
    filename: `${row.track_slug}.${format}`,
  };
}

export async function readArtworkDelivery(
  binding: D1Database,
  derivativeId: string,
): Promise<ArtworkDeliveryRecord | null> {
  if (!SAFE_ID.test(derivativeId)) return null;
  const row = await binding
    .prepare(
      `SELECT derivative.id AS derivative_id,
              derivative.object_key AS object_key,
              derivative.content_type AS content_type,
              derivative.byte_length AS byte_length
       FROM media_derivatives AS derivative
       JOIN media_objects AS source ON source.id = derivative.source_media_id
       WHERE derivative.id = ?1
         AND derivative.kind = 'artwork'
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type LIKE 'image/%'
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.kind = 'image'
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_type LIKE 'image/%'
         AND source.content_sha256 IS NOT NULL
         AND (
           EXISTS (
             SELECT 1 FROM releases
             JOIN release_revisions
               ON release_revisions.id = releases.published_revision_id
              AND release_revisions.release_id = releases.id
             WHERE releases.publication_state = 'published'
               AND release_revisions.view_mode = 'public'
               AND release_revisions.artwork_derivative_id = derivative.id
           )
           OR EXISTS (
             SELECT 1 FROM collections
             JOIN collection_revisions
               ON collection_revisions.id = collections.published_revision_id
              AND collection_revisions.collection_id = collections.id
             WHERE collections.publication_state = 'published'
               AND collection_revisions.view_mode = 'public'
               AND collection_revisions.artwork_derivative_id = derivative.id
           )
           OR EXISTS (
             SELECT 1 FROM courses
             WHERE courses.publication_state = 'published'
               AND courses.published_revision_id IS NOT NULL
               AND derivative.id = 'media-course-' || courses.slug || '-artwork'
           )
           OR EXISTS (
             SELECT 1 FROM pages
             WHERE pages.slug = 'about'
               AND pages.publication_state = 'published'
               AND pages.published_revision_id IS NOT NULL
               AND derivative.id = 'media-about-profile-artwork'
           )
         )
       LIMIT 1`,
    )
    .bind(derivativeId)
    .first<ArtworkRow>();
  return row
    ? {
        derivativeId: safeId(row.derivative_id, "artwork derivative ID"),
        objectKey: privateKey(row.object_key),
        contentType: contentType(row.content_type, "image/"),
        byteLength: byteLength(row.byte_length),
      }
    : null;
}
