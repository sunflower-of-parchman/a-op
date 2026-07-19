import { getChatGPTUser } from "@/app/chatgpt-auth";
import { RuntimeError } from "@/lib/runtime/index.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
  type ApplicationIdentity,
  type ApplicationRole,
} from "./application-identity.ts";
import type { EditorPermissionKey } from "./editor-permissions.ts";

export {
  readJsonMutation,
  requireIdempotencyKey,
  requireSameOrigin,
} from "./mutation-boundary.ts";

export type { EditorPermissionKey } from "./editor-permissions.ts";

export interface EditorPermissionRequest {
  readonly permissionKey: EditorPermissionKey;
  readonly scopeId: string;
}

interface PermissionRow {
  allowed: number;
}

export async function hasEditorPermission(
  binding: D1Database,
  userId: string,
  request: EditorPermissionRequest,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT 1 AS allowed
       FROM editor_permissions
       WHERE user_id = ?1
         AND permission_key = ?2
         AND revoked_at IS NULL
         AND (scope_id = '*' OR scope_id = ?3)
       LIMIT 1`,
    )
    .bind(userId, request.permissionKey, request.scopeId)
    .first<PermissionRow>();

  return row?.allowed === 1;
}

export async function requireApplicationAuthority(
  binding: D1Database,
  roles: readonly ApplicationRole[],
  permission?: EditorPermissionRequest,
): Promise<ApplicationIdentity> {
  const authenticatedUser = await getChatGPTUser();
  if (!authenticatedUser) {
    throw new RuntimeError(
      "AUTHENTICATION_REQUIRED",
      "An authenticated ChatGPT identity is required.",
      { status: 401, publicMessage: "Sign in to continue." },
    );
  }

  const identity = await resolveApplicationIdentity(binding, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, ...roles)) {
    throw new RuntimeError(
      "ROLE_REQUIRED",
      "The authenticated identity does not have the required application role.",
      {
        status: 403,
        publicMessage: "This account cannot perform that action.",
      },
    );
  }

  if (
    permission &&
    !hasApplicationRole(identity, "owner") &&
    !(await hasEditorPermission(binding, identity.userId, permission))
  ) {
    throw new RuntimeError(
      "CONTENT_SCOPE_REQUIRED",
      "The editor does not have the required content permission.",
      {
        status: 403,
        publicMessage: "This editor is not assigned to that content.",
      },
    );
  }

  return identity;
}
