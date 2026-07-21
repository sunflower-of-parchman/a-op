import { runAtomicBatch } from "../../db/d1.ts";

export const FICTIONAL_RUNTIME_IDENTITIES = {
  owner: {
    id: "user_runtime_owner",
    email: "owner@a-op.invalid",
    displayName: "Fictional Owner",
  },
  editor: {
    id: "user_runtime_editor",
    email: "editor@a-op.invalid",
    displayName: "Fictional Editor",
  },
  customer: {
    id: "user_runtime_customer",
    email: "customer@a-op.invalid",
    displayName: "Fictional Customer",
  },
} as const;

export async function bootstrapFictionalRuntimeIdentities(
  binding: D1Database,
  requestId: string,
): Promise<D1Result<unknown>[]> {
  const owner = FICTIONAL_RUNTIME_IDENTITIES.owner;
  const records = Object.entries(FICTIONAL_RUNTIME_IDENTITIES);
  const statements: D1PreparedStatement[] = [];

  for (const [, identity] of records) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO users (id, email, normalized_email, status)
           VALUES (?1, ?2, ?3, 'active')
           ON CONFLICT(id) DO UPDATE SET
             email = excluded.email,
             normalized_email = excluded.normalized_email,
             status = 'active',
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(identity.id, identity.email, identity.email),
    );
    statements.push(
      binding
        .prepare(
          `INSERT INTO profiles (user_id, display_name)
           VALUES (?1, ?2)
           ON CONFLICT(user_id) DO UPDATE SET
             display_name = excluded.display_name,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(identity.id, identity.displayName),
    );
  }

  for (const [role, identity] of records) {
    statements.push(
      binding
        .prepare(
          `UPDATE role_assignments
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE user_id = ?1
             AND role_key <> ?2
             AND revoked_at IS NULL`,
        )
        .bind(identity.id, role),
    );
    statements.push(
      binding
        .prepare(
          `INSERT INTO role_assignments
            (id, user_id, role_key, assigned_by_user_id, revoked_at)
           VALUES (?1, ?2, ?3, ?4, NULL)
           ON CONFLICT(id) DO UPDATE SET
             user_id = excluded.user_id,
             role_key = excluded.role_key,
             assigned_by_user_id = excluded.assigned_by_user_id,
             revoked_at = NULL`,
        )
        .bind(
          `role_runtime_${role}`,
          identity.id,
          role,
          role === "owner" ? null : owner.id,
        ),
    );
  }

  statements.push(
    binding
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, action, subject_type, subject_id, idempotency_key, request_id, details_json)
         VALUES (?1, ?2, 'runtime.fixtures_bootstrapped', 'runtime_lab', 'identity', ?3, ?4, '{"fictional":true}')
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        "audit_runtime_identity_bootstrap",
        owner.id,
        "runtime-fixtures-bootstrap-v1",
        requestId,
      ),
  );

  return runAtomicBatch(binding, statements);
}
