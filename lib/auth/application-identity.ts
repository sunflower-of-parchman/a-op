import type { ChatGPTUser } from "@/app/chatgpt-auth";

export const APPLICATION_ROLES = ["owner", "editor", "customer"] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export interface ApplicationIdentity {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly ApplicationRole[];
}

interface IdentityRoleRow {
  user_id: string;
  email: string;
  display_name: string | null;
  role_key: string | null;
}

export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isApplicationRole(value: unknown): value is ApplicationRole {
  return (
    typeof value === "string" &&
    APPLICATION_ROLES.includes(value as ApplicationRole)
  );
}

export function hasApplicationRole(
  identity: ApplicationIdentity | null,
  ...roles: readonly ApplicationRole[]
): boolean {
  return (
    identity !== null && roles.some((role) => identity.roles.includes(role))
  );
}

/** Resolves application authority from server-owned D1 facts. */
export async function resolveApplicationIdentity(
  binding: D1Database,
  authenticatedUser: ChatGPTUser | null,
): Promise<ApplicationIdentity | null> {
  if (!authenticatedUser) return null;

  const email = normalizeIdentityEmail(authenticatedUser.email);
  const result = await binding
    .prepare(
      `SELECT
        users.id AS user_id,
        users.email AS email,
        profiles.display_name AS display_name,
        role_assignments.role_key AS role_key
      FROM users
      LEFT JOIN profiles
        ON profiles.user_id = users.id
      LEFT JOIN role_assignments
        ON role_assignments.user_id = users.id
        AND role_assignments.revoked_at IS NULL
      WHERE users.normalized_email = ?1
        AND users.status = 'active'
      ORDER BY
        CASE role_assignments.role_key
          WHEN 'owner' THEN 1
          WHEN 'editor' THEN 2
          WHEN 'customer' THEN 3
          ELSE 4
        END`,
    )
    .bind(email)
    .all<IdentityRoleRow>();

  const first = result.results[0];
  if (!first) return null;

  const roles = result.results
    .map(({ role_key }) => role_key)
    .filter(isApplicationRole);

  return {
    userId: first.user_id,
    email: first.email,
    displayName:
      first.display_name ??
      authenticatedUser.fullName ??
      authenticatedUser.email,
    roles: [...new Set(roles)],
  };
}
