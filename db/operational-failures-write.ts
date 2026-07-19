import { changedRows } from "./audit-events.ts";
import { containsSensitiveValue, isRequestId } from "@/lib/runtime/index.ts";

const SAFE_SUBJECT_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

const FAILURE_POLICIES = Object.freeze({
  MEDIA_METADATA_MISMATCH: Object.freeze({
    component: "media",
    severity: "error",
  }),
  MEDIA_OBJECT_MISSING: Object.freeze({
    component: "media",
    severity: "error",
  }),
  MEDIA_STORAGE_READ_FAILED: Object.freeze({
    component: "media",
    severity: "error",
  }),
} as const);

export type MediaOperationalFailureCode = keyof typeof FAILURE_POLICIES;
export type MediaOperationalFailureSubject = "media-derivative";

export interface MediaOperationalFailureInput {
  readonly code: MediaOperationalFailureCode;
  readonly requestId: string;
  readonly subjectType: MediaOperationalFailureSubject;
  /** A server-resolved D1 identifier. Object keys and provider IDs are forbidden. */
  readonly subjectId: string;
  readonly occurredAt?: Date;
}

export interface OperationalFailureWriteResult {
  readonly id: string;
  readonly recorded: boolean;
}

function requireFailurePolicy(code: unknown) {
  if (typeof code !== "string" || !Object.hasOwn(FAILURE_POLICIES, code)) {
    throw new TypeError("An allowlisted operational-failure code is required.");
  }

  return FAILURE_POLICIES[code as MediaOperationalFailureCode];
}

function requireSubject(
  subjectType: unknown,
  subjectId: unknown,
): asserts subjectType is MediaOperationalFailureSubject {
  if (
    subjectType !== "media-derivative" ||
    typeof subjectId !== "string" ||
    !SAFE_SUBJECT_ID.test(subjectId) ||
    containsSensitiveValue(subjectId)
  ) {
    throw new TypeError(
      "A safe internal operational-failure subject is required.",
    );
  }
}

async function failureIdentity(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `failure_${hex.slice(0, 40)}`;
}

/**
 * Records one sanitized media-runtime failure per server-owned request.
 *
 * The deterministic primary key makes an arbitrary replay of the same failure
 * idempotent without storing raw errors, object keys, URLs, or provider data.
 */
export async function recordMediaOperationalFailure(
  binding: D1Database,
  input: MediaOperationalFailureInput,
): Promise<OperationalFailureWriteResult> {
  const policy = requireFailurePolicy(input.code);
  if (
    !isRequestId(input.requestId) ||
    containsSensitiveValue(input.requestId)
  ) {
    throw new TypeError("A safe server request ID is required.");
  }
  requireSubject(input.subjectType, input.subjectId);

  const occurredAtValue = new Date(input.occurredAt ?? Date.now());
  if (!Number.isFinite(occurredAtValue.valueOf())) {
    throw new TypeError("A valid operational-failure time is required.");
  }
  const occurredAt = occurredAtValue.toISOString();

  const id = await failureIdentity(
    [
      policy.component,
      input.code,
      input.subjectType,
      input.subjectId,
      input.requestId,
    ].join(":"),
  );
  const operationKey = `operational.failure:${id}`;
  const result = await binding
    .prepare(
      `INSERT INTO operational_failures
        (id, component, code, severity, request_id, subject_type, subject_id,
         occurrence_count, first_occurred_at, last_occurred_at,
         last_operation_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8, ?9, ?8, ?8)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      id,
      policy.component,
      input.code,
      policy.severity,
      input.requestId,
      input.subjectType,
      input.subjectId,
      occurredAt,
      operationKey,
    )
    .run();

  return Object.freeze({ id, recorded: changedRows(result) === 1 });
}
