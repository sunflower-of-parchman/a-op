import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeOwnerCondition,
  activePageEditorCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type { VideoDraftInput } from "@/lib/video/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface VideoAggregateRow {
  id: string;
  draft_revision_id: string;
  published_revision_id: string | null;
  publication_state: "draft" | "published" | "archived";
  revision: number;
}

interface RevisionNumberRow {
  revision: number;
}

interface PublicationRevisionRow {
  id: string;
  revision: number;
  title: string;
  summary: string;
  artist_context: string;
  credits_json: string;
  delivery_kind: "artist_hosted" | "external";
  poster_derivative_id: string | null;
  hosted_derivative_id: string | null;
  external_provider: "youtube" | "vimeo" | "other" | null;
  external_embed_url: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

interface PublicationTranscriptRow {
  id: string;
  language: string;
  transcript_text: string;
  captions_derivative_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface VideoPublicationSnapshot {
  readonly revision: PublicationRevisionRow;
  readonly transcripts: readonly PublicationTranscriptRow[];
}

interface SqlCondition {
  readonly sql: string;
  readonly bindings: readonly (null | number | string)[];
}

export interface VideoDraftResult {
  readonly id: string;
  readonly slug: string;
  readonly revisionId: string;
  readonly draftRevision: number;
  readonly revision: number;
  readonly created: boolean;
  readonly publishedRevisionId: string | null;
}

export interface VideoPublicationResult {
  readonly id: string;
  readonly slug: string;
  readonly publishedRevisionId: string;
  readonly revision: number;
  readonly publicationState: "published";
}

export interface VideoUnpublishResult {
  readonly id: string;
  readonly slug: string;
  readonly revision: number;
  readonly publicationState: "draft";
}

async function readAggregate(
  binding: D1Database,
  slug: string,
): Promise<VideoAggregateRow | null> {
  return binding
    .prepare(
      `SELECT id, draft_revision_id, published_revision_id,
              publication_state, revision
       FROM videos
       WHERE slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<VideoAggregateRow>();
}

async function nextRevision(
  binding: D1Database,
  videoId: string,
): Promise<number> {
  const row = await binding
    .prepare(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
       FROM video_revisions
       WHERE video_id = ?1`,
    )
    .bind(videoId)
    .first<RevisionNumberRow>();
  return row?.revision ?? 1;
}

function revisionInsert(
  binding: D1Database,
  input: VideoDraftInput,
  videoId: string,
  revisionId: string,
  revision: number,
  context: MutationContext,
  authority: ReturnType<typeof activePageEditorCondition>,
  expectedRevision: number,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO video_revisions
        (id, video_id, revision, title, summary, artist_context, credits_json,
         delivery_kind, poster_derivative_id, hosted_derivative_id,
         external_provider, external_embed_url, created_by_user_id)
       SELECT ?1, id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
       FROM videos
       WHERE id = ?13 AND revision = ?14
         AND ${authority.sql}`,
    )
    .bind(
      revisionId,
      revision,
      input.title,
      input.summary,
      input.artistContext,
      JSON.stringify(input.credits),
      input.deliveryKind,
      input.posterDerivativeId,
      input.hostedDerivativeId,
      input.externalProvider,
      input.externalEmbedUrl,
      context.actorUserId,
      videoId,
      expectedRevision,
      ...authority.bindings,
    );
}

function transcriptInserts(
  binding: D1Database,
  input: VideoDraftInput,
  revisionId: string,
): readonly D1PreparedStatement[] {
  return input.transcripts.map((transcript) =>
    binding
      .prepare(
        `INSERT INTO video_transcripts
          (id, video_revision_id, language, transcript_text,
           captions_derivative_id, revision)
         SELECT ?1, id, ?2, ?3, ?4, 1
         FROM video_revisions
         WHERE id = ?5`,
      )
      .bind(
        `video_transcript_${crypto.randomUUID()}`,
        transcript.language,
        transcript.transcriptText,
        transcript.captionsDerivativeId,
        revisionId,
      ),
  );
}

export async function saveVideoDraft(
  binding: D1Database,
  input: VideoDraftInput,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<VideoDraftResult>> {
  const operation = "video.draft.save";
  const mutation = await prepareMutation<VideoDraftResult>(
    binding,
    operation,
    context,
    { expectedRevision, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, input.slug);
  if (!aggregate && expectedRevision !== 0) throw staleMutation("video draft");
  if (aggregate && aggregate.revision !== expectedRevision) {
    throw staleMutation("video draft");
  }
  if (aggregate?.publication_state === "archived") {
    throw new RuntimeError(
      "VIDEO_ARCHIVED",
      "An archived video cannot be edited.",
      {
        status: 409,
        publicMessage: "This video is archived.",
      },
    );
  }

  const videoId = aggregate?.id ?? `video_${crypto.randomUUID()}`;
  const draftRevision = aggregate ? await nextRevision(binding, videoId) : 1;
  const revisionId = `video_revision_${crypto.randomUUID()}`;
  const result: VideoDraftResult = Object.freeze({
    id: videoId,
    slug: input.slug,
    revisionId,
    draftRevision,
    revision: aggregate ? expectedRevision + 1 : 1,
    created: aggregate === null,
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  });
  const authority = activePageEditorCondition(context.actorUserId, input.slug);
  const statements: D1PreparedStatement[] = [];
  let aggregateChangeIndex: number;

  if (!aggregate) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO videos
            (id, slug, draft_revision_id, publication_state, revision,
             last_operation_key)
           SELECT ?1, ?2, ?3, 'draft', 1, ?4
           WHERE NOT EXISTS (SELECT 1 FROM videos WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          videoId,
          input.slug,
          revisionId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
    aggregateChangeIndex = 0;
    statements.push(
      revisionInsert(
        binding,
        input,
        videoId,
        revisionId,
        draftRevision,
        context,
        authority,
        1,
      ),
      ...transcriptInserts(binding, input, revisionId),
    );
  } else {
    statements.push(
      revisionInsert(
        binding,
        input,
        videoId,
        revisionId,
        draftRevision,
        context,
        authority,
        expectedRevision,
      ),
      ...transcriptInserts(binding, input, revisionId),
      binding
        .prepare(
          `UPDATE videos
           SET draft_revision_id = ?1,
               revision = revision + 1,
               last_operation_key = ?2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?3 AND revision = ?4
             AND EXISTS (
               SELECT 1 FROM video_revisions
               WHERE id = ?1 AND video_id = ?3
             )
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          videoId,
          expectedRevision,
          ...authority.bindings,
        ),
    );
    aggregateChangeIndex = statements.length - 1;
  }

  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "video",
        subjectId: videoId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { draftRevision, created: aggregate === null },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM videos
        WHERE id = ? AND slug = ? AND revision = ?
          AND draft_revision_id = ? AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        videoId,
        input.slug,
        result.revision,
        revisionId,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[aggregateChangeIndex]) !== 1) {
      throw staleMutation("video draft");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function revisionReadinessCondition(revisionAlias: string): string {
  return `(
           ${revisionAlias}.delivery_kind = 'external'
           OR EXISTS (
             SELECT 1 FROM video_transcripts AS transcript
             WHERE transcript.video_revision_id = ${revisionAlias}.id
               AND length(trim(transcript.transcript_text)) > 0
           )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM video_transcripts AS transcript
           LEFT JOIN media_derivatives AS captions
             ON captions.id = transcript.captions_derivative_id
           LEFT JOIN media_objects AS captions_source
             ON captions_source.id = captions.source_media_id
           WHERE transcript.video_revision_id = ${revisionAlias}.id
             AND transcript.captions_derivative_id IS NOT NULL
             AND (
               captions.id IS NULL OR captions.kind != 'transcript'
               OR captions.status != 'ready'
               OR captions.approval_state != 'approved'
               OR captions.object_key NOT GLOB 'derivatives/*'
               OR captions.content_type NOT IN ('text/vtt', 'application/x-subrip')
               OR captions.byte_length IS NULL
               OR captions.content_sha256 IS NULL
               OR captions_source.status != 'ready'
               OR captions_source.approval_state != 'approved'
             )
         )
         AND (
           ${revisionAlias}.poster_derivative_id IS NULL
           OR EXISTS (
             SELECT 1
             FROM media_derivatives AS poster
             JOIN media_objects AS poster_source
               ON poster_source.id = poster.source_media_id
             WHERE poster.id = ${revisionAlias}.poster_derivative_id
               AND poster.kind = 'poster'
               AND poster.status = 'ready'
               AND poster.approval_state = 'approved'
               AND poster.object_key GLOB 'derivatives/*'
               AND poster.content_type LIKE 'image/%'
               AND poster.byte_length IS NOT NULL
               AND poster.content_sha256 IS NOT NULL
               AND poster_source.status = 'ready'
               AND poster_source.approval_state = 'approved'
           )
         )
         AND (
           (
             ${revisionAlias}.delivery_kind = 'external'
             AND ${revisionAlias}.hosted_derivative_id IS NULL
             AND ${revisionAlias}.external_provider IN ('youtube', 'vimeo', 'other')
             AND ${revisionAlias}.external_embed_url GLOB 'https://*'
           )
           OR (
             ${revisionAlias}.delivery_kind = 'artist_hosted'
             AND ${revisionAlias}.external_provider IS NULL
             AND ${revisionAlias}.external_embed_url IS NULL
             AND EXISTS (
               SELECT 1
               FROM media_derivatives AS hosted
               JOIN media_objects AS hosted_source
                 ON hosted_source.id = hosted.source_media_id
               WHERE hosted.id = ${revisionAlias}.hosted_derivative_id
                 AND hosted.kind = 'streaming'
                 AND hosted.status = 'ready'
                 AND hosted.approval_state = 'approved'
                 AND hosted.object_key GLOB 'derivatives/*'
                 AND hosted.content_type LIKE 'video/%'
                 AND hosted.byte_length IS NOT NULL
                 AND hosted.content_sha256 IS NOT NULL
                 AND hosted_source.kind = 'video'
                 AND hosted_source.status = 'ready'
                 AND hosted_source.approval_state = 'approved'
                 AND hosted_source.content_type LIKE 'video/%'
                 AND hosted_source.content_sha256 IS NOT NULL
             )
           )
         )`;
}

function externalConfigurationValid(row: PublicationRevisionRow): boolean {
  if (row.delivery_kind === "artist_hosted") {
    return (
      row.hosted_derivative_id !== null &&
      row.external_provider === null &&
      row.external_embed_url === null
    );
  }
  if (
    row.hosted_derivative_id !== null ||
    row.external_provider === null ||
    row.external_embed_url === null ||
    row.external_embed_url.length > 2_048
  ) {
    return false;
  }
  try {
    const url = new URL(row.external_embed_url);
    const hostname = url.hostname.toLowerCase();
    const baseValid =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (url.port === "" || url.port === "443");
    const providerValid =
      row.external_provider === "youtube"
        ? (hostname === "www.youtube-nocookie.com" ||
            hostname === "www.youtube.com") &&
          url.pathname.startsWith("/embed/")
        : row.external_provider === "vimeo"
          ? hostname === "player.vimeo.com" &&
            url.pathname.startsWith("/video/")
          : row.external_provider === "other";
    return (
      baseValid && providerValid && url.toString() === row.external_embed_url
    );
  } catch {
    return false;
  }
}

async function readPublicationSnapshot(
  binding: D1Database,
  videoId: string,
  revisionId: string,
): Promise<VideoPublicationSnapshot | null> {
  const revision = await binding
    .prepare(
      `SELECT id, revision, title, summary, artist_context, credits_json,
              delivery_kind, poster_derivative_id, hosted_derivative_id,
              external_provider, external_embed_url, created_by_user_id,
              created_at
       FROM video_revisions AS revision
       WHERE revision.id = ?1 AND revision.video_id = ?2
         AND ${revisionReadinessCondition("revision")}
       LIMIT 1`,
    )
    .bind(revisionId, videoId)
    .first<PublicationRevisionRow>();
  if (!revision || !externalConfigurationValid(revision)) return null;

  const transcriptResult = await binding
    .prepare(
      `SELECT id, language, transcript_text, captions_derivative_id, revision,
              created_at, updated_at
       FROM video_transcripts
       WHERE video_revision_id = ?1
       ORDER BY language, id`,
    )
    .bind(revisionId)
    .all<PublicationTranscriptRow>();
  if (
    !transcriptResult.success ||
    (revision.delivery_kind !== "external" &&
      transcriptResult.results.length < 1)
  ) {
    return null;
  }
  return Object.freeze({
    revision: Object.freeze(revision),
    transcripts: Object.freeze(
      transcriptResult.results.map((transcript) => Object.freeze(transcript)),
    ),
  });
}

function exactReadyDraftCondition(
  videoAlias: string,
  snapshot: VideoPublicationSnapshot,
): SqlCondition {
  const revision = snapshot.revision;
  const transcriptConditions = snapshot.transcripts
    .map(
      (_, index) => `AND EXISTS (
        SELECT 1
        FROM video_transcripts AS exact_transcript_${index}
        WHERE exact_transcript_${index}.video_revision_id = publication_revision.id
          AND exact_transcript_${index}.id = ?
          AND exact_transcript_${index}.language = ?
          AND exact_transcript_${index}.transcript_text = ?
          AND exact_transcript_${index}.captions_derivative_id IS ?
          AND exact_transcript_${index}.revision = ?
          AND exact_transcript_${index}.created_at = ?
          AND exact_transcript_${index}.updated_at = ?
      )`,
    )
    .join("\n");
  return {
    sql: `EXISTS (
      SELECT 1
      FROM video_revisions AS publication_revision
      WHERE publication_revision.id = ${videoAlias}.draft_revision_id
        AND publication_revision.video_id = ${videoAlias}.id
        AND publication_revision.id = ?
        AND publication_revision.revision = ?
        AND publication_revision.title = ?
        AND publication_revision.summary = ?
        AND publication_revision.artist_context = ?
        AND publication_revision.credits_json = ?
        AND publication_revision.delivery_kind = ?
        AND publication_revision.poster_derivative_id IS ?
        AND publication_revision.hosted_derivative_id IS ?
        AND publication_revision.external_provider IS ?
        AND publication_revision.external_embed_url IS ?
        AND publication_revision.created_by_user_id IS ?
        AND publication_revision.created_at = ?
        AND (
          SELECT COUNT(*) FROM video_transcripts AS exact_transcript_count
          WHERE exact_transcript_count.video_revision_id = publication_revision.id
        ) = ?
        ${transcriptConditions}
        AND ${revisionReadinessCondition("publication_revision")}
    )`,
    bindings: [
      revision.id,
      revision.revision,
      revision.title,
      revision.summary,
      revision.artist_context,
      revision.credits_json,
      revision.delivery_kind,
      revision.poster_derivative_id,
      revision.hosted_derivative_id,
      revision.external_provider,
      revision.external_embed_url,
      revision.created_by_user_id,
      revision.created_at,
      snapshot.transcripts.length,
      ...snapshot.transcripts.flatMap((transcript) => [
        transcript.id,
        transcript.language,
        transcript.transcript_text,
        transcript.captions_derivative_id,
        transcript.revision,
        transcript.created_at,
        transcript.updated_at,
      ]),
    ],
  };
}

export async function publishVideo(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<VideoPublicationResult>> {
  const operation = "video.publish";
  const mutation = await prepareMutation<VideoPublicationResult>(
    binding,
    operation,
    context,
    { slug, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readAggregate(binding, slug);
  if (!aggregate) {
    throw new RuntimeError("VIDEO_NOT_FOUND", "Video does not exist.", {
      status: 404,
      publicMessage: "That video was not found.",
    });
  }
  if (aggregate.revision !== expectedRevision) {
    throw staleMutation("video publication");
  }
  if (aggregate.publication_state === "archived") {
    throw new RuntimeError(
      "VIDEO_ARCHIVED",
      "An archived video cannot be published.",
      {
        status: 409,
        publicMessage: "This video is archived.",
      },
    );
  }
  const publicationSnapshot = await readPublicationSnapshot(
    binding,
    aggregate.id,
    aggregate.draft_revision_id,
  );
  if (!publicationSnapshot) {
    throw new RuntimeError(
      "VIDEO_NOT_READY",
      "Video media, transcript, or external delivery is not ready for publication.",
      {
        status: 409,
        publicMessage:
          "Approve the video media, poster, captions, transcript, and delivery source before publishing.",
      },
    );
  }

  const authority = activeOwnerCondition(context.actorUserId);
  const result: VideoPublicationResult = Object.freeze({
    id: aggregate.id,
    slug,
    publishedRevisionId: aggregate.draft_revision_id,
    revision: expectedRevision + 1,
    publicationState: "published",
  });
  const updateReadiness = exactReadyDraftCondition(
    "videos",
    publicationSnapshot,
  );
  const auditReadiness = exactReadyDraftCondition(
    "published_video",
    publicationSnapshot,
  );
  const statements = [
    binding
      .prepare(
        `UPDATE videos
         SET published_revision_id = draft_revision_id,
             publication_state = 'published',
             revision = revision + 1,
             last_operation_key = ?1,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3 AND publication_state != 'archived'
           AND draft_revision_id = ?4
           AND ${updateReadiness.sql}
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        expectedRevision,
        aggregate.draft_revision_id,
        ...updateReadiness.bindings,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "video",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { publishedRevisionId: aggregate.draft_revision_id },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM videos AS published_video
        WHERE published_video.id = ? AND published_video.revision = ?
          AND published_video.publication_state = 'published'
          AND published_video.published_revision_id = ?
          AND published_video.draft_revision_id = ?
          AND published_video.last_operation_key = ?
          AND ${auditReadiness.sql}
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.revision,
        aggregate.draft_revision_id,
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        ...auditReadiness.bindings,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("video publication");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function unpublishVideo(
  binding: D1Database,
  slug: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<VideoUnpublishResult>> {
  const operation = "video.unpublish";
  const mutation = await prepareMutation<VideoUnpublishResult>(
    binding,
    operation,
    context,
    { slug, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readAggregate(binding, slug);
  if (!aggregate) {
    throw new RuntimeError("VIDEO_NOT_FOUND", "Video does not exist.", {
      status: 404,
      publicMessage: "That video was not found.",
    });
  }
  if (
    aggregate.revision !== expectedRevision ||
    aggregate.publication_state !== "published"
  ) {
    throw staleMutation("video publication");
  }
  const authority = activeOwnerCondition(context.actorUserId);
  const result: VideoUnpublishResult = Object.freeze({
    id: aggregate.id,
    slug,
    revision: expectedRevision + 1,
    publicationState: "draft",
  });
  const statements = [
    binding
      .prepare(
        `UPDATE videos
         SET publication_state = 'draft', revision = revision + 1,
             last_operation_key = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3 AND publication_state = 'published'
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "video",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM videos
        WHERE id = ? AND revision = ? AND publication_state = 'draft'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("video publication");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
