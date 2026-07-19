const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

interface DeliveryRow {
  video_id: unknown;
  derivative_id: unknown;
  source_media_id: unknown;
  object_key: unknown;
  content_type: unknown;
  byte_length: unknown;
}

export interface VideoMediaDeliveryRecord {
  readonly videoId: string;
  readonly derivativeId: string;
  readonly sourceMediaId: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteLength: number;
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new Error(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function objectKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("derivatives/") ||
    value.startsWith("/") ||
    value.includes("..")
  ) {
    throw new Error("D1 returned an unsafe private video key.");
  }
  return value;
}

function contentType(value: unknown, prefix: "video/" | "image/"): string {
  if (typeof value !== "string" || !value.toLowerCase().startsWith(prefix)) {
    throw new Error("D1 returned an invalid video delivery content type.");
  }
  return value;
}

function byteLength(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("D1 returned an invalid video delivery byte length.");
  }
  return value as number;
}

function map(
  row: DeliveryRow | null,
  prefix: "video/" | "image/",
): VideoMediaDeliveryRecord | null {
  return row
    ? Object.freeze({
        videoId: id(row.video_id, "video ID"),
        derivativeId: id(row.derivative_id, "video derivative ID"),
        sourceMediaId: id(row.source_media_id, "video source media ID"),
        objectKey: objectKey(row.object_key),
        contentType: contentType(row.content_type, prefix),
        byteLength: byteLength(row.byte_length),
      })
    : null;
}

export async function readPublishedHostedVideoDelivery(
  binding: D1Database,
  videoId: string,
): Promise<VideoMediaDeliveryRecord | null> {
  if (!SAFE_ID.test(videoId)) return null;
  const row = await binding
    .prepare(
      `SELECT video.id AS video_id,
              derivative.id AS derivative_id,
              source.id AS source_media_id,
              derivative.object_key,
              derivative.content_type,
              derivative.byte_length
       FROM videos AS video
       JOIN video_revisions AS revision
         ON revision.id = video.published_revision_id
        AND revision.video_id = video.id
       JOIN media_derivatives AS derivative
         ON derivative.id = revision.hosted_derivative_id
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE video.id = ?1
         AND video.publication_state = 'published'
         AND revision.delivery_kind = 'artist_hosted'
         AND derivative.kind = 'streaming'
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type LIKE 'video/%'
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.kind = 'video'
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_type LIKE 'video/%'
         AND source.content_sha256 IS NOT NULL
       LIMIT 1`,
    )
    .bind(videoId)
    .first<DeliveryRow>();
  return map(row, "video/");
}

export async function readPublishedVideoPosterDelivery(
  binding: D1Database,
  videoId: string,
): Promise<VideoMediaDeliveryRecord | null> {
  if (!SAFE_ID.test(videoId)) return null;
  const row = await binding
    .prepare(
      `SELECT video.id AS video_id,
              derivative.id AS derivative_id,
              source.id AS source_media_id,
              derivative.object_key,
              derivative.content_type,
              derivative.byte_length
       FROM videos AS video
       JOIN video_revisions AS revision
         ON revision.id = video.published_revision_id
        AND revision.video_id = video.id
       JOIN media_derivatives AS derivative
         ON derivative.id = revision.poster_derivative_id
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE video.id = ?1
         AND video.publication_state = 'published'
         AND derivative.kind = 'poster'
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type LIKE 'image/%'
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
       LIMIT 1`,
    )
    .bind(videoId)
    .first<DeliveryRow>();
  return map(row, "image/");
}
