import { activeOwnerCondition } from "@/db/authority-guards.ts";
import {
  readCustomerCreditAccounts,
  readOwnerCreditAccounts,
} from "@/db/credit-ledger-read.ts";
import {
  readCustomerMembershipOverview,
  readMembership,
  readMembershipPlan,
  readSubscription,
  readSubscriptionHistory,
  readSubscriptionPlan,
} from "@/db/membership-read.ts";
import type {
  MembershipDTO,
  MembershipPlanDTO,
  SubscriptionPlanDTO,
} from "@/lib/memberships/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import type {
  AdminMembershipSurfaceDTO,
  CustomerMembershipSurfaceDTO,
  MembershipAccessPlanOptionDTO,
  MembershipCustomerDTO,
} from "./types.ts";

interface CountRow {
  readonly count: number;
}

interface IdRow {
  readonly id: string;
}

interface CustomerRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly email: string;
  readonly customer_active: number;
}

interface AccessPlanRow {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
}

function integrity(message: string): never {
  throw new RuntimeError("MEMBERSHIP_SURFACE_INTEGRITY", message, {
    status: 500,
    publicMessage: "Membership information could not be read safely.",
  });
}

function required<T>(value: T | null, message: string): T {
  return value ?? integrity(message);
}

function customer(row: CustomerRow): MembershipCustomerDTO {
  if (
    typeof row.user_id !== "string" ||
    typeof row.display_name !== "string" ||
    typeof row.email !== "string" ||
    (row.customer_active !== 0 && row.customer_active !== 1)
  ) {
    return integrity("D1 returned an invalid membership customer.");
  }
  return Object.freeze({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    active: row.customer_active === 1,
  });
}

function accessPlan(row: AccessPlanRow): MembershipAccessPlanOptionDTO {
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  ) {
    return integrity("D1 returned an invalid access-plan option.");
  }
  return Object.freeze({
    id: row.id,
    name: row.name,
    revision: row.revision,
  });
}

async function exactMembershipPlan(
  binding: D1Database,
  membership: MembershipDTO,
): Promise<MembershipPlanDTO> {
  return required(
    await readMembershipPlan(
      binding,
      membership.membershipPlanId,
      membership.membershipPlanRevision,
    ),
    `Membership ${membership.id} references a missing plan revision.`,
  );
}

export async function readCustomerMembershipSurface(
  binding: D1Database,
  customerUserId: string,
): Promise<CustomerMembershipSurfaceDTO> {
  const [overview, credits] = await Promise.all([
    readCustomerMembershipOverview(binding, customerUserId),
    readCustomerCreditAccounts(binding, customerUserId),
  ]);
  const membershipById = new Map(
    overview.memberships.map((membership) => [membership.id, membership]),
  );
  const subscriptionMembershipIds = new Set(
    overview.subscriptions.map(({ membershipId }) => membershipId),
  );
  const directMemberships = await Promise.all(
    overview.memberships
      .filter(({ id }) => !subscriptionMembershipIds.has(id))
      .map(async (membership) =>
        Object.freeze({
          membership,
          plan: await exactMembershipPlan(binding, membership),
        }),
      ),
  );
  const subscriptions = await Promise.all(
    overview.subscriptions.map(async (subscription) => {
      const membership = required(
        membershipById.get(subscription.membershipId) ?? null,
        `Subscription ${subscription.id} references a missing membership.`,
      );
      const subscriptionPlan = required(
        await readSubscriptionPlan(binding, subscription.subscriptionPlanId),
        `Subscription ${subscription.id} references a missing plan.`,
      );
      return Object.freeze({
        subscription,
        membership,
        subscriptionPlan,
        membershipPlan: await exactMembershipPlan(binding, membership),
        history: Object.freeze(
          overview.subscriptionEvents.filter(
            ({ subscriptionId }) => subscriptionId === subscription.id,
          ),
        ),
      });
    }),
  );
  return Object.freeze({
    directMemberships: Object.freeze(directMemberships),
    subscriptions: Object.freeze(subscriptions),
    credits,
  });
}

export async function readAdminMembershipSurface(
  binding: D1Database,
  ownerUserId: string,
): Promise<AdminMembershipSurfaceDTO> {
  const authority = activeOwnerCondition(ownerUserId);
  const authorized = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (authorized?.count !== 1) {
    throw new RuntimeError(
      "MEMBERSHIP_OWNER_REQUIRED",
      "Membership administration requires live owner authority.",
      { status: 403, publicMessage: "Owner access is required." },
    );
  }

  const [
    membershipPlanRows,
    subscriptionPlanRows,
    membershipRows,
    subscriptionRows,
    customerRows,
    accessPlanRows,
    credits,
  ] = await Promise.all([
    binding
      .prepare(
        `SELECT id FROM membership_plans
         WHERE ${authority.sql}
         ORDER BY created_at, id`,
      )
      .bind(...authority.bindings)
      .all<IdRow>(),
    binding
      .prepare(
        `SELECT id FROM subscription_plans
         WHERE ${authority.sql}
         ORDER BY created_at, id`,
      )
      .bind(...authority.bindings)
      .all<IdRow>(),
    binding
      .prepare(
        `SELECT id FROM memberships
         WHERE ${authority.sql}
         ORDER BY created_at DESC, id`,
      )
      .bind(...authority.bindings)
      .all<IdRow>(),
    binding
      .prepare(
        `SELECT id FROM subscriptions
         WHERE ${authority.sql}
         ORDER BY created_at DESC, id`,
      )
      .bind(...authority.bindings)
      .all<IdRow>(),
    binding
      .prepare(
        `SELECT users.id AS user_id,
                COALESCE(NULLIF(profiles.display_name, ''), users.email)
                  AS display_name,
                users.email,
                CASE WHEN users.status = 'active' AND EXISTS (
                  SELECT 1 FROM role_assignments AS customer_role
                  WHERE customer_role.user_id = users.id
                    AND customer_role.role_key = 'customer'
                    AND customer_role.revoked_at IS NULL
                ) THEN 1 ELSE 0 END AS customer_active
         FROM users
         LEFT JOIN profiles ON profiles.user_id = users.id
         WHERE (
           EXISTS (
             SELECT 1 FROM role_assignments AS any_customer_role
             WHERE any_customer_role.user_id = users.id
               AND any_customer_role.role_key = 'customer'
           ) OR EXISTS (
             SELECT 1 FROM memberships
             WHERE memberships.customer_user_id = users.id
           )
         )
           AND ${authority.sql}
         ORDER BY lower(display_name), users.id`,
      )
      .bind(...authority.bindings)
      .all<CustomerRow>(),
    binding
      .prepare(
        `SELECT id, name, revision FROM access_plans
         WHERE state = 'active' AND ${authority.sql}
         ORDER BY lower(name), id`,
      )
      .bind(...authority.bindings)
      .all<AccessPlanRow>(),
    readOwnerCreditAccounts(binding, ownerUserId),
  ]);

  const [membershipPlans, subscriptionPlans, memberships, subscriptions] =
    await Promise.all([
      Promise.all(
        membershipPlanRows.results.map(async ({ id }) =>
          required(
            await readMembershipPlan(binding, id),
            `Membership plan ${id} disappeared during the read.`,
          ),
        ),
      ),
      Promise.all(
        subscriptionPlanRows.results.map(async ({ id }) =>
          required(
            await readSubscriptionPlan(binding, id),
            `Subscription plan ${id} disappeared during the read.`,
          ),
        ),
      ),
      Promise.all(
        membershipRows.results.map(async ({ id }) =>
          required(
            await readMembership(binding, id),
            `Membership ${id} disappeared during the read.`,
          ),
        ),
      ),
      Promise.all(
        subscriptionRows.results.map(async ({ id }) =>
          required(
            await readSubscription(binding, id),
            `Subscription ${id} disappeared during the read.`,
          ),
        ),
      ),
    ]);
  const customerList = Object.freeze(customerRows.results.map(customer));
  const customerById = new Map(customerList.map((item) => [item.userId, item]));
  const membershipById = new Map(
    memberships.map((membership) => [membership.id, membership]),
  );
  const subscriptionMembershipIds = new Set(
    subscriptions.map(({ membershipId }) => membershipId),
  );
  const membershipPlanCache = new Map<string, Promise<MembershipPlanDTO>>();
  const cachedMembershipPlan = (
    membership: MembershipDTO,
  ): Promise<MembershipPlanDTO> => {
    const key = `${membership.membershipPlanId}:${membership.membershipPlanRevision}`;
    const cached = membershipPlanCache.get(key);
    if (cached) return cached;
    const pending = exactMembershipPlan(binding, membership);
    membershipPlanCache.set(key, pending);
    return pending;
  };
  const subscriptionPlanById = new Map<string, SubscriptionPlanDTO>(
    subscriptionPlans.map((plan) => [plan.id, plan]),
  );
  const directMemberships = await Promise.all(
    memberships
      .filter(({ id }) => !subscriptionMembershipIds.has(id))
      .map(async (membership) =>
        Object.freeze({
          membership,
          plan: await cachedMembershipPlan(membership),
          customer: customerById.get(membership.customerUserId),
        }),
      ),
  );
  const subscriptionSurfaces = await Promise.all(
    subscriptions.map(async (subscription) => {
      const membership = required(
        membershipById.get(subscription.membershipId) ?? null,
        `Subscription ${subscription.id} references a missing membership.`,
      );
      const subscriptionPlan = required(
        subscriptionPlanById.get(subscription.subscriptionPlanId) ?? null,
        `Subscription ${subscription.id} references a missing plan.`,
      );
      return Object.freeze({
        subscription,
        membership,
        subscriptionPlan,
        membershipPlan: await cachedMembershipPlan(membership),
        history: await readSubscriptionHistory(binding, subscription.id),
        customer: customerById.get(subscription.customerUserId),
      });
    }),
  );
  return Object.freeze({
    readAt: new Date().toISOString(),
    membershipPlans: Object.freeze(
      membershipPlans.map((plan) =>
        Object.freeze({
          plan,
          relationshipCount: memberships.filter(
            ({ membershipPlanId }) => membershipPlanId === plan.id,
          ).length,
        }),
      ),
    ),
    subscriptionPlans: Object.freeze(
      subscriptionPlans.map((plan) =>
        Object.freeze({
          plan,
          relationshipCount: subscriptions.filter(
            ({ subscriptionPlanId }) => subscriptionPlanId === plan.id,
          ).length,
        }),
      ),
    ),
    directMemberships: Object.freeze(directMemberships),
    subscriptions: Object.freeze(subscriptionSurfaces),
    customers: customerList,
    credits,
    accessPlans: Object.freeze(accessPlanRows.results.map(accessPlan)),
  });
}
