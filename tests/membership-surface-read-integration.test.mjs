import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  activateMembership,
  activateSubscription,
  createMembershipPlan,
  createSubscriptionPlan,
  renewSubscription,
  reviseMembershipPlan,
} = await import("../db/membership-write.ts");
const { readAdminMembershipSurface, readCustomerMembershipSurface } =
  await import("../components/memberships/server.ts");

const OWNER_ID = "membership_surface_owner";
const DIRECT_CUSTOMER_ID = "membership_surface_direct";
const SUBSCRIPTION_CUSTOMER_ID = "membership_surface_subscriber";

let sequence = 0;
function context(idempotencyKey) {
  sequence += 1;
  return {
    actorUserId: OWNER_ID,
    idempotencyKey,
    requestId: `membership_surface_request_${sequence}`,
  };
}

function seedPrincipalsAndAccess(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'owner-membership-surface@example.invalid',
       'owner-membership-surface@example.invalid', 'active'),
      ('${DIRECT_CUSTOMER_ID}', 'direct-membership@example.invalid',
       'direct-membership@example.invalid', 'active'),
      ('${SUBSCRIPTION_CUSTOMER_ID}', 'subscriber-membership@example.invalid',
       'subscriber-membership@example.invalid', 'active');

    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('${OWNER_ID}', 'Fictional membership owner'),
      ('${DIRECT_CUSTOMER_ID}', 'Fictional direct member'),
      ('${SUBSCRIPTION_CUSTOMER_ID}', 'Fictional subscriber');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('membership_surface_owner_role', '${OWNER_ID}', 'owner',
       '${OWNER_ID}', NULL),
      ('membership_surface_direct_role', '${DIRECT_CUSTOMER_ID}', 'customer',
       '${OWNER_ID}', NULL),
      ('membership_surface_subscriber_role', '${SUBSCRIPTION_CUSTOMER_ID}',
       'customer', '${OWNER_ID}', NULL);

    INSERT INTO access_plans
      (id, slug, name, description, state, revision, created_by_user_id)
    VALUES
      ('membership_surface_access', 'membership-surface-access',
       'Fictional member catalog', 'Protected fictional catalog.', 'active', 1,
       '${OWNER_ID}');

    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, remaining_uses, download_disposition)
    VALUES
      ('membership_surface_access_item', 'membership_surface_access', 1,
       'track', 'membership_surface_track', '["view","stream"]', NULL, NULL);
  `);
}

test("customer and owner membership surfaces preserve pinned benefits, relationship separation, credits, and history", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipalsAndAccess(memory.database);

  const membershipPlan = await createMembershipPlan(
    memory.binding,
    {
      slug: "fictional-circle",
      name: "Fictional circle",
      description: "Fictional member access.",
      benefits: ["Protected catalog", "Monthly notes"],
      accessPlanId: "membership_surface_access",
      accessPlanRevision: 1,
      downloadCredits: 2,
      licenseCredits: 1,
      durationDays: 31,
      state: "active",
    },
    context("create-membership-plan"),
  );
  const subscriptionPlan = await createSubscriptionPlan(
    memory.binding,
    {
      slug: "fictional-circle-monthly",
      name: "Fictional monthly circle",
      description: "Fictional recurring access.",
      membershipPlanId: membershipPlan.value.membershipPlanId,
      membershipPlanRevision: 1,
      billingInterval: "month",
      intervalCount: 1,
      state: "active",
    },
    context("create-subscription-plan"),
  );
  await activateMembership(
    memory.binding,
    {
      membershipPlanId: membershipPlan.value.membershipPlanId,
      membershipPlanRevision: 1,
      customerUserId: DIRECT_CUSTOMER_ID,
      startsAt: "2026-01-01T12:00:00.000Z",
    },
    context("activate-direct-membership"),
  );
  const subscription = await activateSubscription(
    memory.binding,
    {
      subscriptionPlanId: subscriptionPlan.value.subscriptionPlanId,
      subscriptionPlanRevision: 1,
      customerUserId: SUBSCRIPTION_CUSTOMER_ID,
      startsAt: "2026-01-15T12:00:00.000Z",
    },
    context("activate-subscription"),
  );
  await renewSubscription(
    memory.binding,
    subscription.value.subscriptionId,
    subscription.value.revision,
    context("renew-subscription"),
  );
  await reviseMembershipPlan(
    memory.binding,
    membershipPlan.value.membershipPlanId,
    {
      name: "Fictional circle revised",
      description: "A later definition.",
      benefits: ["Later benefit"],
      accessPlanId: "membership_surface_access",
      accessPlanRevision: 1,
      downloadCredits: 9,
      licenseCredits: 8,
      durationDays: 45,
    },
    1,
    context("revise-membership-plan"),
  );

  const direct = await readCustomerMembershipSurface(
    memory.binding,
    DIRECT_CUSTOMER_ID,
  );
  assert.equal(direct.directMemberships.length, 1);
  assert.equal(direct.subscriptions.length, 0);
  assert.equal(direct.directMemberships[0].plan.revision, 1);
  assert.deepEqual(direct.directMemberships[0].plan.benefits, [
    "Protected catalog",
    "Monthly notes",
  ]);
  assert.deepEqual(
    direct.credits.map(({ creditKind, available }) => ({
      creditKind,
      available,
    })),
    [
      { creditKind: "download", available: 2 },
      { creditKind: "license", available: 1 },
    ],
  );

  const subscriber = await readCustomerMembershipSurface(
    memory.binding,
    SUBSCRIPTION_CUSTOMER_ID,
  );
  assert.equal(subscriber.directMemberships.length, 0);
  assert.equal(subscriber.subscriptions.length, 1);
  assert.equal(subscriber.subscriptions[0].membershipPlan.revision, 1);
  assert.equal(subscriber.subscriptions[0].history.length, 2);
  assert.deepEqual(
    subscriber.subscriptions[0].history.map(({ eventType }) => eventType),
    ["activated", "renewed"],
  );
  assert.deepEqual(
    subscriber.credits.map(({ creditKind, available }) => ({
      creditKind,
      available,
    })),
    [
      { creditKind: "download", available: 4 },
      { creditKind: "license", available: 2 },
    ],
  );

  const admin = await readAdminMembershipSurface(memory.binding, OWNER_ID);
  assert.equal(admin.membershipPlans.length, 1);
  assert.equal(admin.membershipPlans[0].plan.revision, 2);
  assert.equal(admin.membershipPlans[0].relationshipCount, 2);
  assert.equal(admin.subscriptionPlans[0].relationshipCount, 1);
  assert.equal(admin.directMemberships.length, 1);
  assert.equal(admin.subscriptions.length, 1);
  assert.equal(admin.subscriptions[0].history.length, 2);
  assert.equal(
    admin.directMemberships[0].customer.displayName,
    "Fictional direct member",
  );
  assert.equal(
    admin.subscriptions[0].customer.displayName,
    "Fictional subscriber",
  );
  assert.equal(admin.credits.length, 4);
  assert.deepEqual(admin.accessPlans, [
    {
      id: "membership_surface_access",
      name: "Fictional member catalog",
      revision: 1,
    },
  ]);

  await assert.rejects(
    readAdminMembershipSurface(memory.binding, DIRECT_CUSTOMER_ID),
    (error) => {
      assert.equal(error?.name, "RuntimeError");
      assert.equal(error?.code, "MEMBERSHIP_OWNER_REQUIRED");
      return true;
    },
  );
});
