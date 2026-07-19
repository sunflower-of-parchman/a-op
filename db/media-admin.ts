import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeMediaEditorCondition,
  activeOwnerCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  MediaDerivativeRegistrationInput,
  MediaObjectRegistrationInput,
} from "@/lib/catalog/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface MediaObjectRow {
  id: string;
  revision: number;
  status: "pending" | "ready" | "failed" | "archived";
  approval_state: "pending" | "approved" | "rejected";
}

interface MediaDerivativeRow {
  id: string;
  source_media_id: string;
  revision: number;
  status: "pending" | "processing" | "ready" | "failed";
  approval_state: "pending" | "approved" | "rejected";
}

export interface MediaRegistrationResult {
  readonly id: string;
  readonly revision: number;
  readonly status: string;
  readonly approvalState: "pending";
}

export interface MediaApprovalResult {
  readonly id: string;
  readonly revision: number;
  readonly approvalState: "approved" | "rejected";
}

function missing(subject: "source" | "derivative"): RuntimeError {
  return new RuntimeError(
    "MEDIA_NOT_FOUND",
    `The media ${subject} does not exist.`,
    { status: 404, publicMessage: "That media record was not found." },
  );
}

export async function registerMediaSource(
  binding: D1Database,
  input: MediaObjectRegistrationInput,
  context: MutationContext,
): Promise<MutationResult<MediaRegistrationResult>> {
  const operation = "media.source.register";
  const mutation = await prepareMutation<MediaRegistrationResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const result: MediaRegistrationResult = {
    id: input.id,
    revision: 1,
    status: input.status,
    approvalState: "pending",
  };
  const authority = activeMediaEditorCondition(context.actorUserId, "*");
  const statements = [
    binding
      .prepare(
        `INSERT INTO media_objects
          (id, object_key, kind, visibility, owner_user_id, content_type,
           byte_length, etag, source_version, status, approval_state,
           content_sha256, duration_ms, channels, sample_rate, revision,
           last_operation_key)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending',
                ?11, ?12, ?13, ?14, 1, ?15
         WHERE NOT EXISTS (
           SELECT 1 FROM media_objects WHERE id = ?1 OR object_key = ?2
         ) AND ${authority.sql}`,
      )
      .bind(
        input.id,
        input.objectKey,
        input.kind,
        input.visibility,
        context.actorUserId,
        input.contentType,
        input.byteLength,
        input.etag,
        input.sourceVersion,
        input.status,
        input.contentSha256,
        input.durationMs,
        input.channels,
        input.sampleRate,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "media-source",
        subjectId: input.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          kind: input.kind,
          contentType: input.contentType,
          byteLength: input.byteLength,
          sourceVersion: input.sourceVersion,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM media_objects
        WHERE id = ? AND revision = 1 AND approval_state = 'pending'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [input.id, mutation.namespacedKey, ...authority.bindings],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("media source registration");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function registerMediaDerivative(
  binding: D1Database,
  input: MediaDerivativeRegistrationInput,
  context: MutationContext,
): Promise<MutationResult<MediaRegistrationResult>> {
  const operation = "media.derivative.register";
  const mutation = await prepareMutation<MediaRegistrationResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const result: MediaRegistrationResult = {
    id: input.id,
    revision: 1,
    status: input.status,
    approvalState: "pending",
  };
  const authority = activeMediaEditorCondition(
    context.actorUserId,
    input.sourceMediaId,
  );
  const statements = [
    binding
      .prepare(
        `INSERT INTO media_derivatives
          (id, source_media_id, kind, processing_profile, processing_version,
           object_key, status, approval_state, content_type, format,
           bitrate_kbps, duration_ms, channels, sample_rate, byte_length,
           content_sha256, revision, last_operation_key)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, 1, ?16
         WHERE EXISTS (
           SELECT 1 FROM media_objects
           WHERE id = ?2 AND status != 'archived'
         ) AND NOT EXISTS (
           SELECT 1 FROM media_derivatives
           WHERE id = ?1 OR (
             source_media_id = ?2 AND kind = ?3
             AND processing_profile = ?4 AND processing_version = ?5
           ) OR object_key = ?6
         ) AND ${authority.sql}`,
      )
      .bind(
        input.id,
        input.sourceMediaId,
        input.kind,
        input.processingProfile,
        input.processingVersion,
        input.objectKey,
        input.status,
        input.contentType,
        input.format,
        input.bitrateKbps,
        input.durationMs,
        input.channels,
        input.sampleRate,
        input.byteLength,
        input.contentSha256,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "media-derivative",
        subjectId: input.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          sourceMediaId: input.sourceMediaId,
          kind: input.kind,
          processingProfile: input.processingProfile,
          processingVersion: input.processingVersion,
          contentType: input.contentType,
          byteLength: input.byteLength,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM media_derivatives
        WHERE id = ? AND source_media_id = ? AND revision = 1
          AND approval_state = 'pending' AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        input.id,
        input.sourceMediaId,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("media derivative registration");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function readSource(
  binding: D1Database,
  id: string,
): Promise<MediaObjectRow | null> {
  return binding
    .prepare(
      `SELECT id, revision, status, approval_state
       FROM media_objects WHERE id = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<MediaObjectRow>();
}

async function readDerivative(
  binding: D1Database,
  id: string,
): Promise<MediaDerivativeRow | null> {
  return binding
    .prepare(
      `SELECT id, source_media_id, revision, status, approval_state
       FROM media_derivatives WHERE id = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<MediaDerivativeRow>();
}

function sourceApprovalValiditySql(): string {
  return `media_objects.status = 'ready'
    AND media_objects.object_key GLOB 'originals/*'
    AND media_objects.content_sha256 IS NOT NULL
    AND (
      (media_objects.kind = 'audio' AND media_objects.content_type LIKE 'audio/%')
      OR (media_objects.kind = 'image' AND media_objects.content_type LIKE 'image/%')
      OR (media_objects.kind = 'video' AND media_objects.content_type LIKE 'video/%')
      OR media_objects.kind IN ('document', 'export', 'other')
    )`;
}

function derivativeApprovalValiditySql(): string {
  return `media_derivatives.status = 'ready'
    AND media_derivatives.object_key GLOB 'derivatives/*'
    AND media_derivatives.byte_length IS NOT NULL
    AND media_derivatives.content_sha256 IS NOT NULL
    AND media_derivatives.content_type IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM media_objects AS source
      WHERE source.id = media_derivatives.source_media_id
        AND source.status = 'ready'
        AND source.approval_state = 'approved'
        AND source.content_sha256 IS NOT NULL
        AND (
          (media_derivatives.kind IN ('streaming', 'download', 'waveform')
            AND source.kind = 'audio'
            AND source.content_type LIKE 'audio/%'
            AND media_derivatives.content_type LIKE 'audio/%')
          OR (media_derivatives.kind IN ('artwork', 'poster', 'thumbnail')
            AND source.kind = 'image'
            AND source.content_type LIKE 'image/%'
            AND media_derivatives.content_type LIKE 'image/%')
          OR media_derivatives.kind IN ('transcript', 'document', 'other')
        )
    )`;
}

function publishedSourceReferenceGuard(alias = "media_objects"): string {
  return `NOT EXISTS (
    SELECT 1
    FROM media_derivatives AS referenced_derivative
    JOIN track_revisions AS referenced_track_revision
      ON referenced_track_revision.original_media_id = ${alias}.id
      OR referenced_track_revision.streaming_derivative_id = referenced_derivative.id
      OR referenced_track_revision.download_derivative_id = referenced_derivative.id
    JOIN tracks AS referenced_track
      ON referenced_track.id = referenced_track_revision.track_id
    WHERE referenced_derivative.source_media_id = ${alias}.id
      AND (
        referenced_track.published_revision_id = referenced_track_revision.id
        OR EXISTS (
          SELECT 1 FROM releases
          JOIN release_tracks
            ON release_tracks.release_revision_id = releases.published_revision_id
          WHERE releases.publication_state = 'published'
            AND release_tracks.track_revision_id = referenced_track_revision.id
        )
        OR EXISTS (
          SELECT 1 FROM collections
          JOIN collection_tracks
            ON collection_tracks.collection_revision_id = collections.published_revision_id
          WHERE collections.publication_state = 'published'
            AND collection_tracks.track_revision_id = referenced_track_revision.id
        )
      )
  ) AND NOT EXISTS (
    SELECT 1
    FROM media_derivatives AS artwork_derivative
    JOIN release_revisions AS referenced_release_revision
      ON referenced_release_revision.artwork_derivative_id = artwork_derivative.id
    JOIN releases AS referenced_release
      ON referenced_release.published_revision_id = referenced_release_revision.id
     AND referenced_release.id = referenced_release_revision.release_id
    WHERE artwork_derivative.source_media_id = ${alias}.id
      AND referenced_release.publication_state = 'published'
  ) AND NOT EXISTS (
    SELECT 1
    FROM media_derivatives AS artwork_derivative
    JOIN collection_revisions AS referenced_collection_revision
      ON referenced_collection_revision.artwork_derivative_id = artwork_derivative.id
    JOIN collections AS referenced_collection
      ON referenced_collection.published_revision_id = referenced_collection_revision.id
     AND referenced_collection.id = referenced_collection_revision.collection_id
    WHERE artwork_derivative.source_media_id = ${alias}.id
      AND referenced_collection.publication_state = 'published'
  )`;
}

function publishedDerivativeReferenceGuard(
  alias = "media_derivatives",
): string {
  return `NOT EXISTS (
    SELECT 1
    FROM track_revisions AS referenced_track_revision
    JOIN tracks AS referenced_track
      ON referenced_track.id = referenced_track_revision.track_id
    WHERE (
      referenced_track_revision.streaming_derivative_id = ${alias}.id
      OR referenced_track_revision.download_derivative_id = ${alias}.id
    ) AND (
      referenced_track.published_revision_id = referenced_track_revision.id
      OR EXISTS (
        SELECT 1 FROM releases
        JOIN release_tracks
          ON release_tracks.release_revision_id = releases.published_revision_id
        WHERE releases.publication_state = 'published'
          AND release_tracks.track_revision_id = referenced_track_revision.id
      )
      OR EXISTS (
        SELECT 1 FROM collections
        JOIN collection_tracks
          ON collection_tracks.collection_revision_id = collections.published_revision_id
        WHERE collections.publication_state = 'published'
          AND collection_tracks.track_revision_id = referenced_track_revision.id
      )
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM releases
    JOIN release_revisions
      ON release_revisions.id = releases.published_revision_id
    WHERE releases.publication_state = 'published'
      AND release_revisions.artwork_derivative_id = ${alias}.id
  ) AND NOT EXISTS (
    SELECT 1 FROM collections
    JOIN collection_revisions
      ON collection_revisions.id = collections.published_revision_id
    WHERE collections.publication_state = 'published'
      AND collection_revisions.artwork_derivative_id = ${alias}.id
  )`;
}

export async function setMediaSourceApproval(
  binding: D1Database,
  id: string,
  expectedRevision: number,
  approvalState: "approved" | "rejected",
  context: MutationContext,
): Promise<MutationResult<MediaApprovalResult>> {
  const operation = `media.source.${approvalState === "approved" ? "approve" : "reject"}`;
  const mutation = await prepareMutation<MediaApprovalResult>(
    binding,
    operation,
    context,
    { id, expectedRevision, approvalState },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const source = await readSource(binding, id);
  if (!source) throw missing("source");
  if (source.revision !== expectedRevision) throw staleMutation("media source");
  const result: MediaApprovalResult = {
    id,
    revision: expectedRevision + 1,
    approvalState,
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const transitionGuard =
    approvalState === "approved"
      ? sourceApprovalValiditySql()
      : publishedSourceReferenceGuard();
  const statements = [
    binding
      .prepare(
        `UPDATE media_objects
         SET approval_state = ?1,
             approved_by_user_id = ?2,
             approved_at = CASE WHEN ?1 = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
             revision = revision + 1,
             last_operation_key = ?3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?4 AND revision = ?5
           AND ${transitionGuard}
           AND ${authority.sql}`,
      )
      .bind(
        approvalState,
        context.actorUserId,
        mutation.namespacedKey,
        id,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "media-source",
        subjectId: id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { approvalState },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM media_objects
        WHERE id = ? AND revision = ? AND approval_state = ?
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        id,
        result.revision,
        approvalState,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw new RuntimeError(
        "MEDIA_APPROVAL_BLOCKED",
        "The media source approval transition is not currently valid.",
        {
          status: 409,
          publicMessage:
            approvalState === "approved"
              ? "The source must be ready and complete before approval."
              : "Published music still depends on this source.",
        },
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function setMediaDerivativeApproval(
  binding: D1Database,
  id: string,
  expectedRevision: number,
  approvalState: "approved" | "rejected",
  context: MutationContext,
): Promise<MutationResult<MediaApprovalResult>> {
  const operation = `media.derivative.${approvalState === "approved" ? "approve" : "reject"}`;
  const mutation = await prepareMutation<MediaApprovalResult>(
    binding,
    operation,
    context,
    { id, expectedRevision, approvalState },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const derivative = await readDerivative(binding, id);
  if (!derivative) throw missing("derivative");
  if (derivative.revision !== expectedRevision) {
    throw staleMutation("media derivative");
  }
  const result: MediaApprovalResult = {
    id,
    revision: expectedRevision + 1,
    approvalState,
  };
  const authority = activeMediaEditorCondition(
    context.actorUserId,
    derivative.source_media_id,
  );
  const transitionGuard =
    approvalState === "approved"
      ? derivativeApprovalValiditySql()
      : publishedDerivativeReferenceGuard();
  const statements = [
    binding
      .prepare(
        `UPDATE media_derivatives
         SET approval_state = ?1,
             approved_by_user_id = ?2,
             approved_at = CASE WHEN ?1 = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
             revision = revision + 1,
             last_operation_key = ?3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?4 AND source_media_id = ?5 AND revision = ?6
           AND ${transitionGuard}
           AND ${authority.sql}`,
      )
      .bind(
        approvalState,
        context.actorUserId,
        mutation.namespacedKey,
        id,
        derivative.source_media_id,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "media-derivative",
        subjectId: id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { approvalState },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM media_derivatives
        WHERE id = ? AND source_media_id = ? AND revision = ?
          AND approval_state = ? AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        id,
        derivative.source_media_id,
        result.revision,
        approvalState,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw new RuntimeError(
        "MEDIA_APPROVAL_BLOCKED",
        "The derivative approval transition is not currently valid.",
        {
          status: 409,
          publicMessage:
            approvalState === "approved"
              ? "The derivative and its approved source must be ready and complete."
              : "Published music still depends on this derivative.",
        },
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export const MEDIA_APPROVAL_SQL = Object.freeze({
  sourceValidity: sourceApprovalValiditySql(),
  derivativeValidity: derivativeApprovalValiditySql(),
  sourceReferenceGuard: publishedSourceReferenceGuard(),
  derivativeReferenceGuard: publishedDerivativeReferenceGuard(),
});
