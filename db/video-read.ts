import type {
  AdminVideoDraftDTO,
  AdminVideoSummaryDTO,
  ExternalVideoProvider,
  PublicVideoDetailDTO,
  PublicVideoSummaryDTO,
  VideoCredit,
  VideoDeliveryKind,
  VideoTranscriptDTO,
} from "@/lib/video/types.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface VideoRow {
  id: unknown;
  slug: unknown;
  publication_state: unknown;
  aggregate_revision: unknown;
  published_revision_id: unknown;
  published_at: unknown;
  updated_at: unknown;
  revision_id: unknown;
  revision: unknown;
  title: unknown;
  summary: unknown;
  artist_context: unknown;
  credits_json: unknown;
  delivery_kind: unknown;
  poster_derivative_id: unknown;
  hosted_derivative_id: unknown;
  external_provider: unknown;
  external_embed_url: unknown;
}

interface TranscriptRow {
  id: unknown;
  language: unknown;
  transcript_text: unknown;
  captions_derivative_id: unknown;
  revision: unknown;
}

export class VideoReadIntegrityError extends Error {
  override readonly name = "VideoReadIntegrityError";
}

function integrity(message: string): never {
  throw new VideoReadIntegrityError(message);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned invalid ${label}.`);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.trim().length === 0) integrity(`D1 returned blank ${label}.`);
  return result;
}

function slug(value: unknown): string {
  const result = nonBlank(value, "video slug");
  if (!SAFE_SLUG.test(result)) integrity("D1 returned an unsafe video slug.");
  return result;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function state(value: unknown): "draft" | "published" | "archived" {
  if (value !== "draft" && value !== "published" && value !== "archived") {
    integrity("D1 returned invalid video publication state.");
  }
  return value;
}

function deliveryKind(value: unknown): VideoDeliveryKind {
  if (value !== "artist_hosted" && value !== "external") {
    integrity("D1 returned invalid video delivery kind.");
  }
  return value;
}

function provider(value: unknown): ExternalVideoProvider | null {
  if (value === null) return null;
  if (value !== "youtube" && value !== "vimeo" && value !== "other") {
    integrity("D1 returned invalid external video provider.");
  }
  return value;
}

function credits(value: unknown): readonly VideoCredit[] {
  if (typeof value !== "string")
    integrity("D1 returned invalid video credits.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid video credits JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length > 64) {
    integrity("D1 returned invalid video credits.");
  }
  const result = parsed.map((candidate) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return integrity("D1 returned invalid video credit entry.");
    }
    const entry = candidate as Record<string, unknown>;
    return Object.freeze({
      name: nonBlank(entry.name, "video credit name"),
      role: nonBlank(entry.role, "video credit role"),
      details: string(entry.details, "video credit details"),
    });
  });
  return Object.freeze(result);
}

async function readTranscripts(
  binding: D1Database,
  revisionId: string,
  allowEmpty = false,
): Promise<readonly VideoTranscriptDTO[]> {
  const result = await binding
    .prepare(
      `SELECT id, language, transcript_text, captions_derivative_id, revision
       FROM video_transcripts
       WHERE video_revision_id = ?1
       ORDER BY language, id`,
    )
    .bind(revisionId)
    .all<TranscriptRow>();
  if (!result.success || (!allowEmpty && result.results.length < 1)) {
    integrity("D1 returned a video revision without a transcript.");
  }
  return Object.freeze(
    result.results.map((row) =>
      Object.freeze({
        id: id(row.id, "video transcript ID"),
        language: nonBlank(row.language, "video transcript language"),
        transcriptText: nonBlank(row.transcript_text, "video transcript text"),
        captionsDerivativeId: nullableId(
          row.captions_derivative_id,
          "caption derivative ID",
        ),
        revision: integer(row.revision, "video transcript revision"),
      }),
    ),
  );
}

function basePublicSummary(
  row: VideoRow,
  transcripts: readonly VideoTranscriptDTO[],
): PublicVideoSummaryDTO {
  return Object.freeze({
    id: id(row.id, "video ID"),
    slug: slug(row.slug),
    title: nonBlank(row.title, "video title"),
    summary: string(row.summary, "video summary"),
    deliveryKind: deliveryKind(row.delivery_kind),
    hasPoster: row.poster_derivative_id !== null,
    transcriptLanguages: Object.freeze(
      transcripts.map(({ language }) => language),
    ),
    publishedAt: timestamp(row.published_at, "video publication time"),
  });
}

const PUBLIC_VIDEO_SELECT = `
  SELECT v.id, v.slug, v.publication_state,
         v.revision AS aggregate_revision,
         v.published_revision_id, v.published_at, v.updated_at,
         vr.id AS revision_id, vr.revision, vr.title, vr.summary,
         vr.artist_context, vr.credits_json, vr.delivery_kind,
         vr.poster_derivative_id, vr.hosted_derivative_id,
         vr.external_provider, vr.external_embed_url
  FROM videos AS v
  JOIN video_revisions AS vr
    ON vr.id = v.published_revision_id
   AND vr.video_id = v.id`;

export async function listPublishedVideos(
  binding: D1Database,
): Promise<readonly PublicVideoSummaryDTO[]> {
  const result = await binding
    .prepare(
      `${PUBLIC_VIDEO_SELECT}
       WHERE v.publication_state = 'published'
       ORDER BY v.published_at DESC, v.id
       LIMIT 200`,
    )
    .all<VideoRow>();
  if (!result.success) integrity("D1 did not return the public video index.");
  return Object.freeze(
    await Promise.all(
      result.results.map(async (row) => {
        const transcripts = await readTranscripts(
          binding,
          id(row.revision_id, "video revision ID"),
          row.delivery_kind === "external",
        );
        return basePublicSummary(row, transcripts);
      }),
    ),
  );
}

export async function readPublishedVideoBySlug(
  binding: D1Database,
  rawSlug: string,
): Promise<PublicVideoDetailDTO | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  const row = await binding
    .prepare(
      `${PUBLIC_VIDEO_SELECT}
       WHERE v.slug = ?1 AND v.publication_state = 'published'
       LIMIT 1`,
    )
    .bind(rawSlug)
    .first<VideoRow>();
  if (!row) return null;
  const videoId = id(row.id, "video ID");
  const transcripts = await readTranscripts(
    binding,
    id(row.revision_id, "video revision ID"),
    row.delivery_kind === "external",
  );
  const kind = deliveryKind(row.delivery_kind);
  const externalProvider = provider(row.external_provider);
  const posterHref =
    row.poster_derivative_id !== null ||
    (kind === "external" &&
      (externalProvider === "youtube" || externalProvider === "vimeo"))
      ? `/api/videos/${encodeURIComponent(videoId)}/poster`
      : null;
  const delivery =
    kind === "artist_hosted"
      ? Object.freeze({
          kind: "artist_hosted" as const,
          mediaHref: `/api/videos/${encodeURIComponent(videoId)}/media`,
          posterHref,
        })
      : Object.freeze({
          kind: "external" as const,
          provider:
            externalProvider ??
            integrity("D1 returned external video without a provider."),
          embedUrl:
            row.external_embed_url === null
              ? integrity("D1 returned external video without an embed URL.")
              : nonBlank(row.external_embed_url, "external video URL"),
          posterHref,
        });
  return Object.freeze({
    ...basePublicSummary(row, transcripts),
    artistContext: nonBlank(row.artist_context, "video artist context"),
    credits: credits(row.credits_json),
    transcripts,
    delivery,
  });
}

const ADMIN_VIDEO_SELECT = `
  SELECT v.id, v.slug, v.publication_state,
         v.revision AS aggregate_revision,
         v.published_revision_id, v.published_at, v.updated_at,
         vr.id AS revision_id, vr.revision, vr.title, vr.summary,
         vr.artist_context, vr.credits_json, vr.delivery_kind,
         vr.poster_derivative_id, vr.hosted_derivative_id,
         vr.external_provider, vr.external_embed_url
  FROM videos AS v
  JOIN video_revisions AS vr
    ON vr.id = v.draft_revision_id
   AND vr.video_id = v.id`;

export async function listAdminVideos(
  binding: D1Database,
): Promise<readonly AdminVideoSummaryDTO[]> {
  const result = await binding
    .prepare(
      `${ADMIN_VIDEO_SELECT}
       ORDER BY v.updated_at DESC, v.id
       LIMIT 200`,
    )
    .all<VideoRow>();
  if (!result.success) integrity("D1 did not return video administration.");
  return Object.freeze(
    result.results.map((row) =>
      Object.freeze({
        id: id(row.id, "video ID"),
        slug: slug(row.slug),
        title: nonBlank(row.title, "video title"),
        publicationState: state(row.publication_state),
        revision: integer(row.aggregate_revision, "video aggregate revision"),
        draftRevision: integer(row.revision, "video draft revision"),
        publishedRevisionId: nullableId(
          row.published_revision_id,
          "published video revision ID",
        ),
        updatedAt: timestamp(row.updated_at, "video update time"),
      }),
    ),
  );
}

export async function readAdminVideoBySlug(
  binding: D1Database,
  rawSlug: string,
): Promise<AdminVideoDraftDTO | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  const row = await binding
    .prepare(`${ADMIN_VIDEO_SELECT} WHERE v.slug = ?1 LIMIT 1`)
    .bind(rawSlug)
    .first<VideoRow>();
  if (!row) return null;
  const revisionId = id(row.revision_id, "video revision ID");
  const transcripts = await readTranscripts(
    binding,
    revisionId,
    row.delivery_kind === "external",
  );
  return Object.freeze({
    id: id(row.id, "video ID"),
    slug: slug(row.slug),
    publicationState: state(row.publication_state),
    revision: integer(row.aggregate_revision, "video aggregate revision"),
    publishedRevisionId: nullableId(
      row.published_revision_id,
      "published video revision ID",
    ),
    draft: Object.freeze({
      id: revisionId,
      revision: integer(row.revision, "video draft revision"),
      slug: slug(row.slug),
      title: nonBlank(row.title, "video title"),
      summary: string(row.summary, "video summary"),
      artistContext: nonBlank(row.artist_context, "video artist context"),
      credits: credits(row.credits_json),
      deliveryKind: deliveryKind(row.delivery_kind),
      posterDerivativeId: nullableId(
        row.poster_derivative_id,
        "poster derivative ID",
      ),
      hostedDerivativeId: nullableId(
        row.hosted_derivative_id,
        "hosted derivative ID",
      ),
      externalProvider: provider(row.external_provider),
      externalEmbedUrl:
        row.external_embed_url === null
          ? null
          : nonBlank(row.external_embed_url, "external video URL"),
      transcripts,
    }),
  });
}

export async function readVideoPublicationTime(
  binding: D1Database,
  rawSlug: string,
): Promise<string | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  const row = await binding
    .prepare("SELECT published_at FROM videos WHERE slug = ?1 LIMIT 1")
    .bind(rawSlug)
    .first<{ published_at: unknown }>();
  return row
    ? nullableTimestamp(row.published_at, "video publication time")
    : null;
}
