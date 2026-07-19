import type { EditorPermissionKey } from "@/lib/auth/editor-permissions.ts";

export interface SqlAuthorityCondition {
  readonly sql: string;
  readonly bindings: readonly string[];
}

export function activeOwnerCondition(
  actorUserId: string,
): SqlAuthorityCondition {
  return {
    sql: `EXISTS (
      SELECT 1
      FROM users AS authority_user
      JOIN role_assignments AS authority_role
        ON authority_role.user_id = authority_user.id
       AND authority_role.role_key = 'owner'
       AND authority_role.revoked_at IS NULL
      WHERE authority_user.id = ?
        AND authority_user.status = 'active'
    )`,
    bindings: [actorUserId],
  };
}

export function activeEditorPermissionCondition(
  actorUserId: string,
  permissionKey: EditorPermissionKey,
  scopeId: string,
): SqlAuthorityCondition {
  return {
    sql: `(
      ${activeOwnerCondition(actorUserId).sql}
      OR (
        EXISTS (
          SELECT 1
          FROM users AS editor_user
          JOIN role_assignments AS editor_role
            ON editor_role.user_id = editor_user.id
           AND editor_role.role_key = 'editor'
           AND editor_role.revoked_at IS NULL
          WHERE editor_user.id = ?
            AND editor_user.status = 'active'
        )
        AND EXISTS (
          SELECT 1
          FROM editor_permissions AS editor_permission
          WHERE editor_permission.user_id = ?
            AND editor_permission.permission_key = ?
            AND editor_permission.revoked_at IS NULL
            AND (editor_permission.scope_id = '*' OR editor_permission.scope_id = ?)
        )
      )
    )`,
    bindings: [actorUserId, actorUserId, actorUserId, permissionKey, scopeId],
  };
}

export function activePageEditorCondition(
  actorUserId: string,
  scopeId: string,
): SqlAuthorityCondition {
  return activeEditorPermissionCondition(actorUserId, "pages.write", scopeId);
}

export function activeCatalogEditorCondition(
  actorUserId: string,
  scopeId: string,
): SqlAuthorityCondition {
  return activeEditorPermissionCondition(actorUserId, "catalog.write", scopeId);
}

export function activeMediaEditorCondition(
  actorUserId: string,
  scopeId: string,
): SqlAuthorityCondition {
  return activeEditorPermissionCondition(actorUserId, "media.write", scopeId);
}

export function activeCustomerCondition(
  actorUserId: string,
): SqlAuthorityCondition {
  return {
    sql: `EXISTS (
      SELECT 1
      FROM users AS customer_user
      JOIN role_assignments AS customer_role
        ON customer_role.user_id = customer_user.id
       AND customer_role.role_key = 'customer'
       AND customer_role.revoked_at IS NULL
      WHERE customer_user.id = ?
        AND customer_user.status = 'active'
    )`,
    bindings: [actorUserId],
  };
}

export function activeApplicationIdentityCondition(
  actorUserId: string,
): SqlAuthorityCondition {
  return {
    sql: `EXISTS (
      SELECT 1
      FROM users AS authority_user
      JOIN role_assignments AS authority_role
        ON authority_role.user_id = authority_user.id
       AND authority_role.revoked_at IS NULL
      WHERE authority_user.id = ?
        AND authority_user.status = 'active'
    )`,
    bindings: [actorUserId],
  };
}
