import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import {
  publicationObjectKey,
  type MediaPublication,
} from "@/lib/media-preparation/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export interface FinalizeMediaPublicationObject {
  readonly privateObjectKey: string;
  readonly etag: string | null;
  readonly byteLength: number;
}

export interface MediaPublicationResult {
  readonly mediaId: string;
  readonly role: "source" | "derivative";
  readonly status: "ready";
  readonly approvalState: "approved";
  readonly revision: 1;
  readonly mediaSha256: string;
}

interface ApprovalRow {
  allowed: number;
}

const SAFE_LOGICAL_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CANONICAL_SHA256 = /^sha256:[a-f0-9]{64}$/;

function requireExternalActionShape(publication: MediaPublication): void {
  const validMediaKey =
    typeof publication.mediaKey === "string" &&
    publication.mediaKey.length <= 100 &&
    SAFE_LOGICAL_KEY.test(publication.mediaKey);
  const validProtected =
    publication.visibility === "protected" &&
    publication.externalActionId === null &&
    publication.externalActionSha256 === null;
  const validPublic =
    publication.visibility === "public" &&
    typeof publication.externalActionId === "string" &&
    publication.externalActionId.length <= 100 &&
    SAFE_LOGICAL_KEY.test(publication.externalActionId) &&
    typeof publication.externalActionSha256 === "string" &&
    CANONICAL_SHA256.test(publication.externalActionSha256);
  if (!validMediaKey || (!validProtected && !validPublic)) {
    throw approvalRequired();
  }
}

function approvalCondition(publication: MediaPublication) {
  const externalReceipt =
    publication.visibility === "public"
      ? `AND json_valid(media_setup_application.result_json)
        AND json_type(
          media_setup_application.result_json,
          '$.externalActionApprovals'
        ) = 'array'
        AND EXISTS (
          SELECT 1
          FROM json_each(
            media_setup_application.result_json,
            '$.externalActionApprovals'
          ) AS external_receipt
          WHERE json_type(external_receipt.value) = 'object'
            AND json_extract(external_receipt.value, '$.actionId') = ?
            AND json_extract(external_receipt.value, '$.actionHash') = ?
            AND json_extract(external_receipt.value, '$.kind') = 'public-media-upload'
            AND json_extract(external_receipt.value, '$.target') = ?
            AND json_extract(external_receipt.value, '$.approvedBy') = 'michael'
        )`
      : "";
  return {
    sql: `EXISTS (
      SELECT 1
      FROM setup_applications AS media_setup_application
      WHERE media_setup_application.id = ?
        AND media_setup_application.proposal_hash = ?
        AND media_setup_application.proposal_schema_version = 1
        AND media_setup_application.approval_hash = ?
        AND media_setup_application.status IN ('applying', 'applied')
        AND media_setup_application.approved_by_user_id IS NOT NULL
        AND media_setup_application.approved_at IS NOT NULL
        ${externalReceipt}
    )`,
    bindings: [
      publication.applicationId,
      publication.proposalSha256,
      publication.approvalSha256,
      ...(publication.visibility === "public"
        ? [
            publication.externalActionId,
            publication.externalActionSha256,
            publication.mediaKey,
          ]
        : []),
    ],
  } as const;
}

function approvalRequired(): RuntimeError {
  return new RuntimeError(
    "MEDIA_APPROVAL_REQUIRED",
    "Media publication requires the exact applied setup proposal and owner approval.",
    {
      status: 409,
      publicMessage:
        "Apply the exact approved setup proposal before publishing its media.",
    },
  );
}

/**
 * Performs the pre-R2 approval check. Finalization repeats both this check and
 * active owner authority in its guarded D1 statements.
 */
export async function requireAppliedMediaPublicationApproval(
  binding: D1Database,
  publication: MediaPublication,
  actorUserId: string,
): Promise<void> {
  requireExternalActionShape(publication);
  const authority = activeOwnerCondition(actorUserId);
  const approval = approvalCondition(publication);
  const row = await binding
    .prepare(
      `SELECT 1 AS allowed
       WHERE ${authority.sql}
         AND ${approval.sql}`,
    )
    .bind(...authority.bindings, ...approval.bindings)
    .first<ApprovalRow>();
  if (row?.allowed !== 1) throw approvalRequired();
}

function requireVerifiedObject(
  publication: MediaPublication,
  object: FinalizeMediaPublicationObject,
): void {
  if (object.privateObjectKey !== publicationObjectKey(publication)) {
    throw new TypeError(
      "Verified media object key does not match the approved publication.",
    );
  }
  if (!Number.isSafeInteger(object.byteLength) || object.byteLength <= 0) {
    throw new TypeError("Verified media byte length is invalid.");
  }
  if (object.etag !== null && !/^[\x21-\x7e]{1,256}$/.test(object.etag)) {
    throw new TypeError("Verified media ETag is invalid.");
  }
}

function publicationResult(
  publication: MediaPublication,
): MediaPublicationResult {
  return {
    mediaId: publication.mediaId,
    role: publication.role,
    status: "ready",
    approvalState: "approved",
    revision: 1,
    mediaSha256: publication.mediaSha256,
  };
}

function sourceExactCondition(): string {
  return `EXISTS (
    SELECT 1 FROM media_objects AS published_media
    WHERE published_media.id = ?
      AND published_media.object_key = ?
      AND published_media.kind = ?
      AND published_media.visibility = ?
      AND published_media.owner_user_id = ?
      AND published_media.content_type = ?
      AND published_media.byte_length = ?
      AND published_media.source_version = ?
      AND published_media.status = 'ready'
      AND published_media.approval_state = 'approved'
      AND published_media.content_sha256 = ?
      AND published_media.revision = 1
  )`;
}

function derivativeExactCondition(): string {
  return `EXISTS (
    SELECT 1 FROM media_derivatives AS published_derivative
    WHERE published_derivative.id = ?
      AND published_derivative.source_media_id = ?
      AND published_derivative.kind = ?
      AND published_derivative.processing_profile = ?
      AND published_derivative.processing_version = ?
      AND published_derivative.object_key = ?
      AND published_derivative.status = 'ready'
      AND published_derivative.approval_state = 'approved'
      AND published_derivative.content_type = ?
      AND published_derivative.format = ?
      AND published_derivative.bitrate_kbps IS ?
      AND published_derivative.byte_length = ?
      AND published_derivative.content_sha256 = ?
      AND published_derivative.revision = 1
  )`;
}

export async function finalizeMediaPublication(
  binding: D1Database,
  publication: MediaPublication,
  object: FinalizeMediaPublicationObject,
  context: MutationContext,
): Promise<MutationResult<MediaPublicationResult>> {
  requireExternalActionShape(publication);
  requireVerifiedObject(publication, object);
  await requireAppliedMediaPublicationApproval(
    binding,
    publication,
    context.actorUserId,
  );

  const operation = `media.publication.${publication.role}`;
  const fingerprintInput = {
    publication,
    byteLength: object.byteLength,
  };
  const mutation = await prepareMutation<MediaPublicationResult>(
    binding,
    operation,
    context,
    fingerprintInput,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const result = publicationResult(publication);
  const authority = activeOwnerCondition(context.actorUserId);
  const approval = approvalCondition(publication);
  const sharedAudit = {
    actorUserId: context.actorUserId,
    action: operation,
    subjectType:
      publication.role === "source" ? "media-source" : "media-derivative",
    subjectId: publication.mediaId,
    idempotencyKey: mutation.namespacedKey,
    requestFingerprint: mutation.fingerprint,
    requestId: context.requestId,
    details: {
      alias: publication.alias,
      mediaSha256: publication.mediaSha256,
      mediaKey: publication.mediaKey,
      manifestSha256: publication.manifestSha256,
      applicationId: publication.applicationId,
      intendedUse: publication.intendedUse,
      visibility: publication.visibility,
    },
    result: { ...result },
  } as const;

  let statements: readonly D1PreparedStatement[];
  if (publication.role === "source") {
    const exactBindings = [
      publication.mediaId,
      object.privateObjectKey,
      publication.kind,
      publication.visibility,
      context.actorUserId,
      publication.contentType,
      object.byteLength,
      publication.sourceVersion,
      publication.mediaSha256,
    ] as const;
    const inspection = publication.inspection;
    statements = [
      binding
        .prepare(
          `INSERT INTO media_objects
            (id, object_key, kind, visibility, owner_user_id, content_type,
             byte_length, etag, source_version, status, approval_state,
             content_sha256, duration_ms, channels, sample_rate, revision,
             approved_by_user_id, approved_at, last_operation_key)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'approved', ?, ?, ?, ?, 1,
                  ?, CURRENT_TIMESTAMP, ?
           WHERE ${authority.sql}
             AND ${approval.sql}
             AND NOT EXISTS (
               SELECT 1 FROM media_objects WHERE id = ? OR object_key = ?
             )`,
        )
        .bind(
          publication.mediaId,
          object.privateObjectKey,
          publication.kind,
          publication.visibility,
          context.actorUserId,
          publication.contentType,
          object.byteLength,
          object.etag,
          publication.sourceVersion,
          publication.mediaSha256,
          inspection.durationMs,
          inspection.channels,
          inspection.sampleRate,
          context.actorUserId,
          mutation.namespacedKey,
          ...authority.bindings,
          ...approval.bindings,
          publication.mediaId,
          object.privateObjectKey,
        ),
      prepareConditionalAuditEvent(
        binding,
        sharedAudit,
        `${sourceExactCondition()} AND ${authority.sql} AND ${approval.sql}`,
        [...exactBindings, ...authority.bindings, ...approval.bindings],
      ),
    ];
  } else {
    const exactBindings = [
      publication.mediaId,
      publication.sourceMediaId,
      publication.derivativeKind,
      publication.profileId,
      publication.processingVersion,
      object.privateObjectKey,
      publication.contentType,
      publication.format,
      publication.bitrateKbps,
      object.byteLength,
      publication.mediaSha256,
    ] as const;
    const inspection = publication.inspection;
    statements = [
      binding
        .prepare(
          `INSERT INTO media_derivatives
            (id, source_media_id, kind, processing_profile, processing_version,
             object_key, status, approval_state, content_type, format,
             bitrate_kbps, duration_ms, channels, sample_rate, byte_length,
             content_sha256, revision, approved_by_user_id, approved_at,
             last_operation_key)
           SELECT ?, ?, ?, ?, ?, ?, 'ready', 'approved', ?, ?, ?, ?, ?, ?, ?, ?, 1,
                  ?, CURRENT_TIMESTAMP, ?
           WHERE ${authority.sql}
             AND ${approval.sql}
             AND EXISTS (
               SELECT 1 FROM media_objects AS approved_source
               WHERE approved_source.id = ?
                 AND approved_source.owner_user_id = ?
                 AND approved_source.status = 'ready'
                 AND approved_source.approval_state = 'approved'
             )
             AND NOT EXISTS (
               SELECT 1 FROM media_derivatives
               WHERE id = ? OR object_key = ? OR (
                 source_media_id = ? AND kind = ?
                 AND processing_profile = ? AND processing_version = ?
               )
             )`,
        )
        .bind(
          publication.mediaId,
          publication.sourceMediaId,
          publication.derivativeKind,
          publication.profileId,
          publication.processingVersion,
          object.privateObjectKey,
          publication.contentType,
          publication.format,
          publication.bitrateKbps,
          inspection.durationMs,
          inspection.channels,
          inspection.sampleRate,
          object.byteLength,
          publication.mediaSha256,
          context.actorUserId,
          mutation.namespacedKey,
          ...authority.bindings,
          ...approval.bindings,
          publication.sourceMediaId,
          context.actorUserId,
          publication.mediaId,
          object.privateObjectKey,
          publication.sourceMediaId,
          publication.derivativeKind,
          publication.profileId,
          publication.processingVersion,
        ),
      prepareConditionalAuditEvent(
        binding,
        sharedAudit,
        `${derivativeExactCondition()} AND ${authority.sql} AND ${approval.sql}`,
        [...exactBindings, ...authority.bindings, ...approval.bindings],
      ),
    ];
  }

  try {
    const batch = await runAtomicBatch(binding, statements);
    if (changedRows(batch[0]) > 1 || changedRows(batch[1]) !== 1) {
      throw new RuntimeError(
        "MEDIA_PUBLICATION_CONFLICT",
        "The D1 ready pointer differs from the approved immutable media object.",
        {
          status: 409,
          publicMessage:
            "The media record changed before publication completed.",
        },
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
