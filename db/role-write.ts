import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeApplicationIdentityCondition,
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
import { normalizeIdentityEmail } from "@/lib/auth/application-identity.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { createMutationFingerprint } from "@/lib/runtime/idempotency.ts";
import type { EditorPermissionKey } from "@/lib/auth/editor-permissions.ts";

interface UserRow {
  id: string;
  status: "active" | "disabled";
}

interface InstallationRow {
  status: "pending" | "active";
  owner_user_id: string | null;
}

interface ProfileRow {
  revision: number;
}

export interface EditorGrantInput {
  readonly email: string;
  readonly displayName: string;
  readonly permissionKey: EditorPermissionKey;
  readonly scopeId: string;
}

export interface EditorGrantResult {
  readonly userId: string;
  readonly role: "editor";
  readonly permissionKey: EditorPermissionKey;
  readonly scopeId: string;
}

export interface EditorRevokeResult {
  readonly userId: string;
  readonly role: "editor";
  readonly revoked: true;
}

export interface OwnerBootstrapInput {
  readonly email: string;
  readonly displayName: string;
}

export interface OwnerBootstrapResult {
  readonly userId: string;
  readonly role: "owner";
  readonly installationStatus: "active";
}

export interface ProfileUpdateResult {
  readonly userId: string;
  readonly displayName: string;
  readonly revision: number;
}

async function deterministicUserId(email: string): Promise<string> {
  const digest = await createMutationFingerprint({ email });
  return `user_${digest.slice(0, 24)}`;
}

async function findUserByEmail(
  binding: D1Database,
  normalizedEmail: string,
): Promise<UserRow | null> {
  return binding
    .prepare(
      `SELECT id, status
       FROM users
       WHERE normalized_email = ?1
       LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<UserRow>();
}

function rejectDisabledIdentity(user: UserRow | null): void {
  if (user?.status !== "disabled") return;

  throw new RuntimeError(
    "ACCOUNT_DISABLED",
    "A disabled application identity cannot be reactivated by a role operation.",
    {
      status: 403,
      publicMessage: "This account is disabled.",
    },
  );
}

export async function grantEditor(
  binding: D1Database,
  input: EditorGrantInput,
  context: MutationContext,
): Promise<MutationResult<EditorGrantResult>> {
  const operation = "editor.grant";
  const mutation = await prepareMutation<EditorGrantResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const email = normalizeIdentityEmail(input.email);
  const existing = await findUserByEmail(binding, email);
  rejectDisabledIdentity(existing);
  const userId = existing?.id ?? (await deterministicUserId(email));
  const roleAssignmentId = `role_editor_${crypto.randomUUID()}`;
  const permissionId = `permission_${input.permissionKey.replace(".write", "")}_${crypto.randomUUID()}`;
  const result: EditorGrantResult = {
    userId,
    role: "editor",
    permissionKey: input.permissionKey,
    scopeId: input.scopeId,
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `INSERT INTO users (id, email, normalized_email, status)
         SELECT ?1, ?2, ?3, 'active'
         WHERE ${authority.sql}
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           normalized_email = excluded.normalized_email,
           updated_at = CURRENT_TIMESTAMP
         WHERE users.status = 'active'
           AND ${authority.sql}`,
      )
      .bind(
        userId,
        input.email,
        email,
        ...authority.bindings,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO profiles
          (user_id, display_name, revision, last_operation_key)
         SELECT ?1, ?2, 1, ?3
         FROM users
         WHERE id = ?1 AND status = 'active'
           AND ${authority.sql}
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           revision = profiles.revision + 1,
           last_operation_key = excluded.last_operation_key,
           updated_at = CURRENT_TIMESTAMP
         WHERE EXISTS (
           SELECT 1 FROM users
           WHERE id = ?1 AND status = 'active'
         ) AND ${authority.sql}`,
      )
      .bind(
        userId,
        input.displayName,
        mutation.namespacedKey,
        ...authority.bindings,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO role_assignments
          (id, user_id, role_key, assigned_by_user_id, last_operation_key)
         SELECT ?1, ?2, 'editor', ?3, ?4
         WHERE EXISTS (
           SELECT 1 FROM users WHERE id = ?2 AND status = 'active'
         ) AND ${authority.sql}
         AND NOT EXISTS (
           SELECT 1 FROM role_assignments
           WHERE user_id = ?2 AND role_key = 'editor' AND revoked_at IS NULL
         )`,
      )
      .bind(
        roleAssignmentId,
        userId,
        context.actorUserId,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO editor_permissions
          (id, user_id, permission_key, scope_id, assigned_by_user_id,
           last_operation_key)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6
         WHERE EXISTS (
           SELECT 1 FROM users WHERE id = ?2 AND status = 'active'
         ) AND ${authority.sql}
         AND NOT EXISTS (
           SELECT 1 FROM editor_permissions
           WHERE user_id = ?2
             AND permission_key = ?3
             AND scope_id = ?4
             AND revoked_at IS NULL
         )`,
      )
      .bind(
        permissionId,
        userId,
        input.permissionKey,
        input.scopeId,
        context.actorUserId,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "user",
        subjectId: userId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          role: "editor",
          permissionKey: input.permissionKey,
          scopeId: input.scopeId,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = ? AND last_operation_key = ?
      ) AND EXISTS (
        SELECT 1 FROM role_assignments
        WHERE user_id = ? AND role_key = 'editor' AND revoked_at IS NULL
      ) AND EXISTS (
        SELECT 1 FROM editor_permissions
        WHERE user_id = ? AND permission_key = ?
          AND scope_id = ? AND revoked_at IS NULL
      ) AND ${authority.sql}`,
      [
        userId,
        mutation.namespacedKey,
        userId,
        userId,
        input.permissionKey,
        input.scopeId,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[1]) !== 1) throw staleMutation("editor grant");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function revokeEditor(
  binding: D1Database,
  userId: string,
  context: MutationContext,
): Promise<MutationResult<EditorRevokeResult>> {
  const operation = "editor.revoke";
  const mutation = await prepareMutation<EditorRevokeResult>(
    binding,
    operation,
    context,
    { userId },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const result: EditorRevokeResult = { userId, role: "editor", revoked: true };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE role_assignments
         SET revoked_at = CURRENT_TIMESTAMP,
             revoked_by_user_id = ?1,
             last_operation_key = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?3 AND role_key = 'editor' AND revoked_at IS NULL
           AND ${authority.sql}`,
      )
      .bind(
        context.actorUserId,
        mutation.namespacedKey,
        userId,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `UPDATE editor_permissions
         SET revoked_at = CURRENT_TIMESTAMP,
             revoked_by_user_id = ?1,
             last_operation_key = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?3 AND revoked_at IS NULL
           AND ${authority.sql}
           AND EXISTS (
             SELECT 1 FROM role_assignments
             WHERE user_id = ?3 AND role_key = 'editor'
               AND revoked_at IS NOT NULL
               AND revoked_by_user_id = ?1
               AND last_operation_key = ?2
           )`,
      )
      .bind(
        context.actorUserId,
        mutation.namespacedKey,
        userId,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "user",
        subjectId: userId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { role: "editor", customerStatePreserved: true },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM role_assignments
        WHERE user_id = ? AND role_key = 'editor'
          AND revoked_at IS NOT NULL
          AND revoked_by_user_id = ?
          AND last_operation_key = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM role_assignments
        WHERE user_id = ? AND role_key = 'editor' AND revoked_at IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM editor_permissions
        WHERE user_id = ? AND revoked_at IS NULL
      ) AND ${authority.sql}`,
      [
        userId,
        context.actorUserId,
        mutation.namespacedKey,
        userId,
        userId,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("editor role");
    if (changedRows(results[2]) !== 1) {
      throw staleMutation("editor revocation receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function bootstrapOwner(
  binding: D1Database,
  input: OwnerBootstrapInput,
  context: MutationContext,
): Promise<MutationResult<OwnerBootstrapResult>> {
  const operation = "installation.owner.bootstrap";
  const mutation = await prepareMutation<OwnerBootstrapResult>(
    binding,
    operation,
    context,
    input,
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const installation = await binding
    .prepare(
      `SELECT status, owner_user_id
       FROM installation_state
       WHERE id = 'installation'
       LIMIT 1`,
    )
    .first<InstallationRow>();
  if (!installation) {
    throw new RuntimeError(
      "INSTALLATION_STATE_MISSING",
      "Installation state is missing.",
      { status: 500, publicMessage: "Installation setup is not available." },
    );
  }
  if (installation.status === "active") {
    throw new RuntimeError(
      "OWNER_ALREADY_BOOTSTRAPPED",
      "The owner has already been bootstrapped.",
      { status: 409, publicMessage: "This installation already has an owner." },
    );
  }

  const email = normalizeIdentityEmail(input.email);
  const existing = await findUserByEmail(binding, email);
  rejectDisabledIdentity(existing);
  const userId = existing?.id ?? (await deterministicUserId(email));
  const result: OwnerBootstrapResult = {
    userId,
    role: "owner",
    installationStatus: "active",
  };
  const bootstrapAvailable = `EXISTS (
    SELECT 1 FROM installation_state
    WHERE id = 'installation' AND status = 'pending'
  ) AND NOT EXISTS (
    SELECT 1 FROM role_assignments
    WHERE role_key = 'owner' AND revoked_at IS NULL
  )`;
  const statements = [
    binding
      .prepare(
        `INSERT INTO users (id, email, normalized_email, status)
         SELECT ?1, ?2, ?3, 'active'
         WHERE ${bootstrapAvailable}
           AND NOT EXISTS (
             SELECT 1 FROM users
             WHERE (id = ?1 OR normalized_email = ?3) AND status = 'disabled'
           )
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           normalized_email = excluded.normalized_email,
           updated_at = CURRENT_TIMESTAMP
         WHERE users.status = 'active'
           AND ${bootstrapAvailable}`,
      )
      .bind(userId, input.email, email),
    binding
      .prepare(
        `INSERT INTO profiles
          (user_id, display_name, revision, last_operation_key)
         SELECT ?1, ?2, 1, ?3
         FROM users
         WHERE id = ?1 AND status = 'active'
           AND ${bootstrapAvailable}
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           revision = profiles.revision + 1,
           last_operation_key = excluded.last_operation_key,
           updated_at = CURRENT_TIMESTAMP
         WHERE EXISTS (
           SELECT 1 FROM users
           WHERE id = ?1 AND status = 'active'
         ) AND ${bootstrapAvailable}`,
      )
      .bind(userId, input.displayName, mutation.namespacedKey),
    binding
      .prepare(
        `UPDATE installation_state
         SET status = 'active', owner_user_id = ?1,
             last_operation_key = ?2,
             bootstrap_completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 'installation' AND status = 'pending'
           AND ${bootstrapAvailable}
           AND EXISTS (
             SELECT 1 FROM users
             WHERE id = ?1 AND status = 'active'
           )
           AND EXISTS (
             SELECT 1 FROM profiles
             WHERE user_id = ?1 AND last_operation_key = ?2
           )`,
      )
      .bind(userId, mutation.namespacedKey),
    binding
      .prepare(
        `INSERT INTO role_assignments
          (id, user_id, role_key, assigned_by_user_id, last_operation_key)
         SELECT ?1, ?2, 'owner', NULL, ?3
         FROM installation_state
         WHERE id = 'installation'
           AND status = 'active'
           AND owner_user_id = ?2
           AND last_operation_key = ?3
           AND EXISTS (
             SELECT 1 FROM users
             WHERE id = ?2 AND status = 'active'
           )
           AND NOT EXISTS (
             SELECT 1 FROM role_assignments
             WHERE user_id = ?2 AND role_key = 'owner' AND revoked_at IS NULL
           )`,
      )
      .bind(
        `role_owner_${crypto.randomUUID()}`,
        userId,
        mutation.namespacedKey,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        id: "audit_owner_bootstrap",
        actorUserId: userId,
        action: operation,
        subjectType: "installation",
        subjectId: "installation",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { explicit: true },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM installation_state
        WHERE id = 'installation' AND status = 'active' AND owner_user_id = ?
          AND last_operation_key = ?
      ) AND EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = ? AND last_operation_key = ?
      ) AND EXISTS (
        SELECT 1 FROM role_assignments
        WHERE user_id = ? AND role_key = 'owner' AND revoked_at IS NULL
          AND last_operation_key = ?
      ) AND EXISTS (
        SELECT 1 FROM users
        WHERE id = ? AND status = 'active'
      )`,
      [
        userId,
        mutation.namespacedKey,
        userId,
        mutation.namespacedKey,
        userId,
        mutation.namespacedKey,
        userId,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[2]) !== 1) {
      throw staleMutation("owner bootstrap");
    }
    if (changedRows(results[3]) !== 1 || changedRows(results[4]) !== 1) {
      throw staleMutation("owner bootstrap receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function updateProfile(
  binding: D1Database,
  displayName: string,
  expectedRevision: number,
  context: MutationContext,
): Promise<MutationResult<ProfileUpdateResult>> {
  const operation = "profile.update";
  const mutation = await prepareMutation<ProfileUpdateResult>(
    binding,
    operation,
    context,
    { displayName, expectedRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const profile = await binding
    .prepare(`SELECT revision FROM profiles WHERE user_id = ?1 LIMIT 1`)
    .bind(context.actorUserId)
    .first<ProfileRow>();
  if (!profile || profile.revision !== expectedRevision) {
    throw staleMutation("profile");
  }
  const result: ProfileUpdateResult = {
    userId: context.actorUserId,
    displayName,
    revision: expectedRevision + 1,
  };
  const authority = activeApplicationIdentityCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE profiles
         SET display_name = ?1,
             revision = revision + 1,
             last_operation_key = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?3 AND revision = ?4
           AND ${authority.sql}`,
      )
      .bind(
        displayName,
        mutation.namespacedKey,
        context.actorUserId,
        expectedRevision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "profile",
        subjectId: context.actorUserId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {},
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = ? AND revision = ?
          AND display_name = ? AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        context.actorUserId,
        expectedRevision + 1,
        displayName,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("profile");
    if (changedRows(results[1]) !== 1) {
      throw staleMutation("profile receipt");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
