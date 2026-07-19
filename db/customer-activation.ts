import { normalizeIdentityEmail } from "@/lib/auth/application-identity.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { createMutationFingerprint } from "@/lib/runtime/idempotency.ts";
import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationResult,
} from "./mutation.ts";

interface CustomerActivationStateRow {
  readonly id: string;
  readonly status: "active" | "disabled";
  readonly profile_revision: number | null;
  readonly active_customer: number;
  readonly revoked_customer: number;
}

export interface CustomerActivationInput {
  readonly email: string;
  readonly displayName: string;
}

export interface CustomerActivationContext {
  readonly idempotencyKey: string;
  readonly requestId: string;
}

export interface CustomerActivationResult {
  readonly userId: string;
  readonly role: "customer";
  readonly profileRevision: number;
}

async function deterministicUserId(normalizedEmail: string): Promise<string> {
  const digest = await createMutationFingerprint({ email: normalizedEmail });
  return `user_${digest.slice(0, 24)}`;
}

async function readCustomerActivationState(
  binding: D1Database,
  normalizedEmail: string,
): Promise<CustomerActivationStateRow | null> {
  return binding
    .prepare(
      `SELECT
        users.id AS id,
        users.status AS status,
        profiles.revision AS profile_revision,
        EXISTS (
          SELECT 1 FROM role_assignments AS active_customer_role
          WHERE active_customer_role.user_id = users.id
            AND active_customer_role.role_key = 'customer'
            AND active_customer_role.revoked_at IS NULL
        ) AS active_customer,
        EXISTS (
          SELECT 1 FROM role_assignments AS revoked_customer_role
          WHERE revoked_customer_role.user_id = users.id
            AND revoked_customer_role.role_key = 'customer'
            AND revoked_customer_role.revoked_at IS NOT NULL
        ) AS revoked_customer
       FROM users
       LEFT JOIN profiles ON profiles.user_id = users.id
       WHERE users.normalized_email = ?1
       LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<CustomerActivationStateRow>();
}

function rejectBlockedSelfActivation(
  state: CustomerActivationStateRow | null,
): void {
  if (state?.status === "disabled") {
    throw new RuntimeError(
      "ACCOUNT_DISABLED",
      "A disabled application identity cannot activate a customer account.",
      { status: 403, publicMessage: "This account is disabled." },
    );
  }

  if (state?.active_customer !== 1 && state?.revoked_customer === 1) {
    throw new RuntimeError(
      "CUSTOMER_REACTIVATION_REQUIRES_ARTIST",
      "A revoked customer role cannot be restored through self-activation.",
      {
        status: 403,
        publicMessage:
          "This customer account was revoked. The artist must restore it.",
      },
    );
  }
}

function requireUsableIdentityEmail(email: string): {
  readonly email: string;
  readonly normalizedEmail: string;
} {
  const trimmedEmail = email.trim();
  const normalizedEmail = normalizeIdentityEmail(trimmedEmail);
  if (
    trimmedEmail.length === 0 ||
    normalizedEmail.length > 320 ||
    !normalizedEmail.includes("@")
  ) {
    throw new RuntimeError(
      "AUTHENTICATED_IDENTITY_INVALID",
      "The authenticated ChatGPT identity did not include a usable email.",
      {
        status: 401,
        publicMessage: "The signed-in identity could not be used.",
      },
    );
  }
  return { email: trimmedEmail, normalizedEmail };
}

function initialDisplayName(displayName: string, email: string): string {
  const normalized = displayName.replace(/\r\n?/g, "\n").trim();
  return (normalized || email).slice(0, 120);
}

function activationAllowedSql(): string {
  return `NOT EXISTS (
    SELECT 1 FROM users AS blocked_activation_user
    WHERE blocked_activation_user.normalized_email = ?
      AND blocked_activation_user.status = 'disabled'
  ) AND (
    EXISTS (
      SELECT 1
      FROM users AS existing_customer_user
      JOIN role_assignments AS existing_customer_role
        ON existing_customer_role.user_id = existing_customer_user.id
       AND existing_customer_role.role_key = 'customer'
       AND existing_customer_role.revoked_at IS NULL
      WHERE existing_customer_user.normalized_email = ?
        AND existing_customer_user.status = 'active'
    ) OR NOT EXISTS (
      SELECT 1
      FROM users AS revoked_activation_user
      JOIN role_assignments AS revoked_activation_role
        ON revoked_activation_role.user_id = revoked_activation_user.id
       AND revoked_activation_role.role_key = 'customer'
       AND revoked_activation_role.revoked_at IS NOT NULL
      WHERE revoked_activation_user.normalized_email = ?
    )
  )`;
}

/**
 * Explicitly activates the current authenticated identity as a customer.
 *
 * The email-derived principal, profile, customer role, operation marker, and
 * audit receipt are committed in one D1 batch. Every statement repeats the
 * disabled and revoked-customer predicates so a concurrent authority change
 * cannot leave a partial activation behind.
 */
export async function activateCustomer(
  binding: D1Database,
  input: CustomerActivationInput,
  context: CustomerActivationContext,
): Promise<MutationResult<CustomerActivationResult>> {
  const identityEmail = requireUsableIdentityEmail(input.email);
  const displayName = initialDisplayName(
    input.displayName,
    identityEmail.email,
  );
  const initialState = await readCustomerActivationState(
    binding,
    identityEmail.normalizedEmail,
  );
  rejectBlockedSelfActivation(initialState);

  const userId =
    initialState?.id ??
    (await deterministicUserId(identityEmail.normalizedEmail));
  const mutationContext = {
    actorUserId: userId,
    idempotencyKey: context.idempotencyKey,
    requestId: context.requestId,
  };
  const operation = "customer.activate";
  const mutation = await prepareMutation<CustomerActivationResult>(
    binding,
    operation,
    mutationContext,
    {
      normalizedEmail: identityEmail.normalizedEmail,
      displayName,
    },
  );
  if (mutation.replayValue) {
    const currentState =
      initialState?.active_customer === 1 && initialState.profile_revision
        ? initialState
        : await readCustomerActivationState(
            binding,
            identityEmail.normalizedEmail,
          );
    rejectBlockedSelfActivation(currentState);
    if (currentState?.active_customer !== 1 || !currentState.profile_revision) {
      throw staleMutation("customer activation receipt");
    }
    return { value: mutation.replayValue, replayed: true };
  }

  const profileRevision = initialState?.profile_revision ?? 1;
  const result: CustomerActivationResult = {
    userId,
    role: "customer",
    profileRevision,
  };
  const allowed = activationAllowedSql();
  const allowedBindings = [
    identityEmail.normalizedEmail,
    identityEmail.normalizedEmail,
    identityEmail.normalizedEmail,
  ] as const;
  const statements = [
    binding
      .prepare(
        `INSERT INTO users (id, email, normalized_email, status)
         SELECT ?1, ?2, ?3, 'active'
         WHERE ${allowed}
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        userId,
        identityEmail.email,
        identityEmail.normalizedEmail,
        ...allowedBindings,
      ),
    binding
      .prepare(
        `INSERT INTO profiles
          (user_id, display_name, revision, last_operation_key)
         SELECT ?1, ?2, 1, ?3
         FROM users
         WHERE id = ?1
           AND normalized_email = ?4
           AND status = 'active'
           AND ${allowed}
         ON CONFLICT(user_id) DO NOTHING`,
      )
      .bind(
        userId,
        displayName,
        mutation.namespacedKey,
        identityEmail.normalizedEmail,
        ...allowedBindings,
      ),
    binding
      .prepare(
        `INSERT INTO role_assignments
          (id, user_id, role_key, assigned_by_user_id, last_operation_key)
         SELECT ?1, ?2, 'customer', ?2, ?3
         FROM users
         WHERE id = ?2
           AND normalized_email = ?4
           AND status = 'active'
           AND ${allowed}
           AND NOT EXISTS (
             SELECT 1 FROM role_assignments
             WHERE user_id = ?2 AND role_key = 'customer'
               AND revoked_at IS NULL
           )
           AND NOT EXISTS (
             SELECT 1 FROM role_assignments
             WHERE user_id = ?2 AND role_key = 'customer'
               AND revoked_at IS NOT NULL
           )`,
      )
      .bind(
        `role_customer_${userId.slice("user_".length)}`,
        userId,
        mutation.namespacedKey,
        identityEmail.normalizedEmail,
        ...allowedBindings,
      ),
    binding
      .prepare(
        `UPDATE role_assignments
         SET last_operation_key = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?2
           AND role_key = 'customer'
           AND revoked_at IS NULL
           AND EXISTS (
             SELECT 1 FROM users
             WHERE id = ?2 AND normalized_email = ?3 AND status = 'active'
           )
           AND ${allowed}`,
      )
      .bind(
        mutation.namespacedKey,
        userId,
        identityEmail.normalizedEmail,
        ...allowedBindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: userId,
        action: operation,
        subjectType: "user",
        subjectId: userId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { explicit: true, identitySource: "sign-in-with-chatgpt" },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM users
        JOIN profiles ON profiles.user_id = users.id
        JOIN role_assignments AS customer_role
          ON customer_role.user_id = users.id
         AND customer_role.role_key = 'customer'
         AND customer_role.revoked_at IS NULL
         AND customer_role.last_operation_key = ?
        WHERE users.id = ? AND users.normalized_email = ?
          AND users.status = 'active'
      ) AND ${allowed}`,
      [
        mutation.namespacedKey,
        userId,
        identityEmail.normalizedEmail,
        ...allowedBindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[3]) !== 1 || changedRows(results[4]) !== 1) {
      const currentState = await readCustomerActivationState(
        binding,
        identityEmail.normalizedEmail,
      );
      rejectBlockedSelfActivation(currentState);
      throw staleMutation("customer activation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    const replay = await replayAfterMutationFailure(binding, mutation, error);
    const currentState = await readCustomerActivationState(
      binding,
      identityEmail.normalizedEmail,
    );
    rejectBlockedSelfActivation(currentState);
    if (currentState?.active_customer !== 1 || !currentState.profile_revision) {
      throw staleMutation("customer activation receipt");
    }
    return replay;
  }
}
