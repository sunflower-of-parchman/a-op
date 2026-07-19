import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  MediaJobRetryInput,
  MediaJobRetryReceipt,
} from "@/lib/operations/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface RetryableMediaJobRow {
  status: unknown;
  attempt_count: unknown;
  lease_token: unknown;
  lease_expires_at: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function retryBlocked(): RuntimeError {
  return new RuntimeError(
    "MEDIA_JOB_RETRY_BLOCKED",
    "The media job is not a failed job or a processing job with an expired lease.",
    {
      status: 409,
      publicMessage: "That media job is not ready for retry.",
    },
  );
}

function requireAttemptCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("D1 returned an invalid media-job attempt count.");
  }
  return value as number;
}

export async function retryMediaJob(
  binding: D1Database,
  input: MediaJobRetryInput,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<MediaJobRetryReceipt>> {
  if (
    !SAFE_ID.test(input.jobId) ||
    !Number.isSafeInteger(input.expectedAttemptCount) ||
    input.expectedAttemptCount < 0
  ) {
    throw new TypeError("A safe media-job retry input is required.");
  }
  const retriedAt = new Date(now).toISOString();
  if (!Number.isFinite(Date.parse(retriedAt))) {
    throw new TypeError("A valid media-job retry time is required.");
  }
  const operation = "operations.media_job.retry";
  const mutation = await prepareMutation<MediaJobRetryReceipt>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const authority = activeOwnerCondition(context.actorUserId);
  const job = await binding
    .prepare(
      `SELECT status, attempt_count, lease_token, lease_expires_at
       FROM media_jobs
       WHERE id = ?1 AND ${authority.sql}
       LIMIT 1`,
    )
    .bind(input.jobId, ...authority.bindings)
    .first<RetryableMediaJobRow>();
  if (!job) {
    throw new RuntimeError(
      "MEDIA_JOB_NOT_FOUND",
      "The media job was not found.",
      {
        status: 404,
        publicMessage: "That media job was not found.",
      },
    );
  }
  const attemptCount = requireAttemptCount(job.attempt_count);
  if (attemptCount !== input.expectedAttemptCount) {
    throw staleMutation("media job");
  }
  const failed = job.status === "failed";
  const stale =
    job.status === "processing" &&
    typeof job.lease_token === "string" &&
    job.lease_token.length > 0 &&
    job.lease_token.length <= 512 &&
    typeof job.lease_expires_at === "string" &&
    Number.isFinite(Date.parse(job.lease_expires_at)) &&
    Date.parse(job.lease_expires_at) <= Date.parse(retriedAt);
  if (!failed && !stale) throw retryBlocked();
  const previousStatus = failed ? "failed" : "stale";
  const receipt: MediaJobRetryReceipt = Object.freeze({
    jobId: input.jobId,
    previousStatus,
    status: "pending",
    attemptCount,
    retriedAt,
  });
  const staleAttemptGuard = stale
    ? `AND EXISTS (
         SELECT 1 FROM media_job_attempts
         WHERE media_job_attempts.job_id = media_jobs.id
           AND media_job_attempts.attempt = ?
           AND media_job_attempts.status = 'processing'
           AND media_job_attempts.lease_token = ?
       )`
    : "";
  const transitionGuard = failed
    ? "status = 'failed'"
    : `(status = 'processing' AND lease_expires_at IS NOT NULL
        AND julianday(lease_expires_at) <= julianday(?))`;
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE media_jobs
         SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
             finished_at = NULL, last_operation_key = ?, updated_at = ?
         WHERE id = ? AND attempt_count = ?
           AND ${transitionGuard}
           ${staleAttemptGuard}
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        retriedAt,
        input.jobId,
        attemptCount,
        ...(stale ? [retriedAt] : []),
        ...(stale ? [attemptCount, job.lease_token as string] : []),
        ...authority.bindings,
      ),
  ];
  if (stale) {
    statements.push(
      binding
        .prepare(
          `UPDATE media_job_attempts
           SET status = 'stale', finished_at = ?
           WHERE job_id = ? AND attempt = ? AND status = 'processing'
             AND lease_token = ?
             AND EXISTS (
               SELECT 1 FROM media_jobs
               WHERE media_jobs.id = media_job_attempts.job_id
                 AND media_jobs.status = 'pending'
                 AND media_jobs.attempt_count = ?
                 AND media_jobs.last_operation_key = ?
             )
             AND ${authority.sql}`,
        )
        .bind(
          retriedAt,
          input.jobId,
          attemptCount,
          job.lease_token as string,
          attemptCount,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
  }
  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "media-job",
        subjectId: input.jobId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { previousStatus, attemptCount },
        result: { ...receipt },
      },
      `EXISTS (
         SELECT 1 FROM media_jobs
         WHERE id = ? AND status = 'pending' AND attempt_count = ?
           AND last_operation_key = ?
       ) AND ${authority.sql}`,
      [
        input.jobId,
        attemptCount,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    const jobChanged = changedRows(results[0]) === 1;
    const attemptChanged = !stale || changedRows(results[1]) === 1;
    const auditIndex = stale ? 2 : 1;
    if (
      !jobChanged ||
      !attemptChanged ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("media job");
    }
    return { value: receipt, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
