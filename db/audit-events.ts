export interface AuditEventInput {
  readonly id?: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;
  readonly result: Record<string, unknown>;
}

export function prepareAuditEvent(
  binding: D1Database,
  input: AuditEventInput,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json, result_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      input.id ?? `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
    );
}

export function prepareConditionalAuditEvent(
  binding: D1Database,
  input: AuditEventInput,
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json, result_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${conditionSql}`,
    )
    .bind(
      input.id ?? `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
      ...conditionBindings,
    );
}

export function changedRows(result: D1Result<unknown> | undefined): number {
  if (!result) return 0;
  const changes = result.meta?.changes;
  return typeof changes === "number" ? changes : 0;
}
