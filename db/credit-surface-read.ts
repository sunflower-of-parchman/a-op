import { activeOwnerCondition } from "./authority-guards.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export interface CreditCustomerDTO {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
}

interface CustomerRow {
  user_id: unknown;
  email: unknown;
  display_name: unknown;
}

interface CountRow {
  count: unknown;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function integrity(message: string): never {
  throw new RuntimeError("CREDIT_SURFACE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Credit administration could not be read.",
  });
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function text(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum
  ) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

export async function readCreditCustomers(
  binding: D1Database,
  rawActorUserId: string,
): Promise<readonly CreditCustomerDTO[]> {
  const actorUserId = id(rawActorUserId, "owner user ID");
  const owner = activeOwnerCondition(actorUserId);
  const authority = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${owner.sql}`)
    .bind(...owner.bindings)
    .first<CountRow>();
  if (authority?.count !== 1) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_OWNER_REQUIRED",
      "Live owner authority is required to list credit customers.",
      {
        status: 403,
        publicMessage: "Owner access is required to view these credits.",
      },
    );
  }

  const result = await binding
    .prepare(
      `SELECT users.id AS user_id, users.email,
              COALESCE(profiles.display_name, users.email) AS display_name
       FROM users
       LEFT JOIN profiles ON profiles.user_id = users.id
       JOIN role_assignments AS customer_role
         ON customer_role.user_id = users.id
        AND customer_role.role_key = 'customer'
        AND customer_role.revoked_at IS NULL
       WHERE users.status = 'active'
         AND ${owner.sql}
       ORDER BY lower(COALESCE(profiles.display_name, users.email)), users.id
       LIMIT 200`,
    )
    .bind(...owner.bindings)
    .all<CustomerRow>();
  if (!result.success) integrity("D1 did not return active credit customers.");

  return Object.freeze(
    result.results.map((row) =>
      Object.freeze({
        userId: id(row.user_id, "customer user ID"),
        email: text(row.email, "customer email", 254),
        displayName: text(row.display_name, "customer display name", 254),
      }),
    ),
  );
}
