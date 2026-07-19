import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  activateMembership,
  activateSubscription,
  applyMembershipCancellation,
  applySubscriptionCancellation,
  clearSubscriptionCancellation,
  createMembershipPlan,
  createSubscriptionPlan,
  pauseSubscription,
  renewSubscription,
  resumeSubscription,
  reviseMembershipPlan,
  reviseSubscriptionPlan,
  scheduleMembershipCancellation,
  scheduleSubscriptionCancellation,
} = await import("../db/membership-write.ts");
const { readCustomerMembershipOverview, readMembershipPlan } =
  await import("../db/membership-read.ts");

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_membership_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function seedAuthorityAndAccess(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('membership_owner', 'owner@example.invalid',
       'owner@example.invalid', 'active'),
      ('membership_owner_disabled', 'owner-disabled@example.invalid',
       'owner-disabled@example.invalid', 'disabled'),
      ('membership_customer_subscription', 'subscriber@example.invalid',
       'subscriber@example.invalid', 'active'),
      ('membership_customer_direct', 'member@example.invalid',
       'member@example.invalid', 'active'),
      ('membership_customer_revoked', 'revoked@example.invalid',
       'revoked@example.invalid', 'active');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('membership_role_owner', 'membership_owner', 'owner',
       'membership_owner', NULL),
      ('membership_role_owner_disabled', 'membership_owner_disabled', 'owner',
       'membership_owner', NULL),
      ('membership_role_customer_subscription',
       'membership_customer_subscription', 'customer',
       'membership_owner', NULL),
      ('membership_role_customer_direct', 'membership_customer_direct',
       'customer', 'membership_owner', NULL),
      ('membership_role_customer_revoked', 'membership_customer_revoked',
       'customer', 'membership_owner', '2026-07-18T00:00:00.000Z');

    INSERT INTO access_plans
      (id, slug, name, description, state, revision,
       created_by_user_id)
    VALUES
      ('membership_access_plan', 'membership-access', 'Membership access',
       'Fictional protected catalog access.', 'active', 1,
       'membership_owner');

    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id,
       actions_json, remaining_uses, download_disposition)
    VALUES
      ('membership_access_item_track', 'membership_access_plan', 1,
       'track', 'membership_track', '["view","stream","download"]',
       NULL, 'attachment'),
      ('membership_access_item_release', 'membership_access_plan', 2,
       'release', 'membership_release', '["view"]', NULL, NULL);
  `);
}

function planInput(overrides = {}) {
  return {
    slug: "listener-circle",
    name: "Listener circle",
    description: "Fictional recurring benefits.",
    benefits: ["Protected catalog", "Credits"],
    accessPlanId: "membership_access_plan",
    accessPlanRevision: 1,
    downloadCredits: 2,
    licenseCredits: 1,
    durationDays: 30,
    state: "active",
    ...overrides,
  };
}

function revisionInput(overrides = {}) {
  const value = planInput(overrides);
  delete value.slug;
  delete value.state;
  return value;
}

test("owner creates immutable membership revisions and frozen subscription plans with exact replay", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndAccess(memory.database);

  const createContext = context("membership_owner", "plan-create");
  const created = await createMembershipPlan(
    memory.binding,
    planInput(),
    createContext,
  );
  assert.equal(created.replayed, false);
  assert.equal(created.value.revision, 1);
  assert.equal(created.value.state, "active");
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM membership_plan_revisions"),
    1,
  );
  const replay = await createMembershipPlan(
    memory.binding,
    planInput(),
    createContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, created.value);
  await assertRuntimeCode(
    createMembershipPlan(
      memory.binding,
      planInput({ name: "Different fingerprint" }),
      createContext,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  const revised = await reviseMembershipPlan(
    memory.binding,
    created.value.membershipPlanId,
    revisionInput({ downloadCredits: 3, licenseCredits: 0 }),
    1,
    context("membership_owner", "plan-revise"),
  );
  assert.equal(revised.value.revision, 2);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM membership_plan_revisions"),
    2,
  );
  assert.equal(
    (
      await readMembershipPlan(
        memory.binding,
        created.value.membershipPlanId,
        1,
      )
    )?.downloadCredits,
    2,
  );
  assert.equal(
    (await readMembershipPlan(memory.binding, created.value.membershipPlanId))
      ?.downloadCredits,
    3,
  );
  await assertRuntimeCode(
    reviseMembershipPlan(
      memory.binding,
      created.value.membershipPlanId,
      revisionInput(),
      1,
      context("membership_owner", "plan-revise-stale"),
    ),
    "STALE_STATE",
  );

  const subscriptionPlan = await createSubscriptionPlan(
    memory.binding,
    {
      slug: "monthly-listener",
      name: "Monthly listener",
      description: "Fictional monthly access.",
      membershipPlanId: created.value.membershipPlanId,
      membershipPlanRevision: 1,
      billingInterval: "month",
      intervalCount: 1,
      state: "active",
    },
    context("membership_owner", "subscription-plan-create"),
  );
  assert.equal(subscriptionPlan.value.revision, 1);
  assert.equal(
    memory.database
      .prepare(
        "SELECT membership_plan_revision FROM subscription_plans WHERE id = ?",
      )
      .get(subscriptionPlan.value.subscriptionPlanId).membership_plan_revision,
    1,
  );

  const revisedSubscriptionPlan = await reviseSubscriptionPlan(
    memory.binding,
    subscriptionPlan.value.subscriptionPlanId,
    {
      name: "Annual listener",
      description: "Fictional annual access.",
      membershipPlanId: created.value.membershipPlanId,
      membershipPlanRevision: 2,
      billingInterval: "year",
      intervalCount: 1,
    },
    1,
    context("membership_owner", "subscription-plan-revise"),
  );
  assert.equal(revisedSubscriptionPlan.value.revision, 2);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          "SELECT membership_plan_revision, billing_interval FROM subscription_plans WHERE id = ?",
        )
        .get(subscriptionPlan.value.subscriptionPlanId),
    },
    { membership_plan_revision: 2, billing_interval: "year" },
  );

  await assertRuntimeCode(
    createMembershipPlan(
      memory.binding,
      planInput({ slug: "disabled-owner-plan" }),
      context("membership_owner_disabled", "disabled-owner"),
    ),
    "MEMBERSHIP_OWNER_REQUIRED",
  );
});

test("manual subscription activation, renewal, pause, cancellation, credits, access, and history are atomic and replay-safe", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndAccess(memory.database);

  const membershipPlan = await createMembershipPlan(
    memory.binding,
    planInput(),
    context("membership_owner", "subscription-membership-plan"),
  );
  const subscriptionPlan = await createSubscriptionPlan(
    memory.binding,
    {
      slug: "monthly-listener",
      name: "Monthly listener",
      description: "Fictional monthly access.",
      membershipPlanId: membershipPlan.value.membershipPlanId,
      membershipPlanRevision: 1,
      billingInterval: "month",
      intervalCount: 1,
      state: "active",
    },
    context("membership_owner", "monthly-plan"),
  );

  const activationInput = {
    subscriptionPlanId: subscriptionPlan.value.subscriptionPlanId,
    subscriptionPlanRevision: 1,
    customerUserId: "membership_customer_subscription",
    startsAt: "2026-01-31T18:30:00.000Z",
  };
  const activationContext = context("membership_owner", "subscriber-activate");
  const activated = await activateSubscription(
    memory.binding,
    activationInput,
    activationContext,
  );
  assert.equal(activated.replayed, false);
  assert.deepEqual(
    {
      state: activated.value.state,
      periodStart: activated.value.currentPeriodStart,
      periodEnd: activated.value.currentPeriodEnd,
      entitlementCount: activated.value.entitlementCount,
      downloadCredits: activated.value.downloadCreditsGranted,
      licenseCredits: activated.value.licenseCreditsGranted,
    },
    {
      state: "active",
      periodStart: "2026-01-31T18:30:00.000Z",
      periodEnd: "2026-02-28T18:30:00.000Z",
      entitlementCount: 2,
      downloadCredits: 2,
      licenseCredits: 1,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM entitlements WHERE source_type = 'subscription' AND source_id = ? AND state = 'active' AND stripe_environment = 'test' AND livemode = 0 AND fulfillment_event_id IS NULL AND last_operation_key IS NOT NULL",
      activated.value.subscriptionId,
    ),
    2,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT SUM(available_balance) FROM credit_accounts WHERE customer_user_id = 'membership_customer_subscription'",
    ),
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM credit_ledger_entries WHERE customer_user_id = 'membership_customer_subscription' AND entry_type = 'grant'",
    ),
    2,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscription_events"),
    1,
  );

  const replay = await activateSubscription(
    memory.binding,
    activationInput,
    activationContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, activated.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM subscriptions"),
    1,
  );
  await assertRuntimeCode(
    reviseSubscriptionPlan(
      memory.binding,
      subscriptionPlan.value.subscriptionPlanId,
      {
        name: "Changed referenced plan",
        description: "",
        membershipPlanId: membershipPlan.value.membershipPlanId,
        membershipPlanRevision: 1,
        billingInterval: "year",
        intervalCount: 1,
      },
      1,
      context("membership_owner", "locked-subscription-plan"),
    ),
    "SUBSCRIPTION_PLAN_LOCKED",
  );
  await assertRuntimeCode(
    activateSubscription(
      memory.binding,
      { ...activationInput, startsAt: "2026-02-01T00:00:00.000Z" },
      activationContext,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  const renewalContext = context("membership_owner", "subscriber-renew");
  const renewed = await renewSubscription(
    memory.binding,
    activated.value.subscriptionId,
    1,
    renewalContext,
  );
  assert.equal(renewed.value.currentPeriodStart, "2026-02-28T18:30:00.000Z");
  assert.equal(renewed.value.currentPeriodEnd, "2026-03-28T18:30:00.000Z");
  assert.equal(renewed.value.revision, 2);
  assert.equal(
    scalar(
      memory.database,
      "SELECT SUM(available_balance) FROM credit_accounts WHERE customer_user_id = 'membership_customer_subscription'",
    ),
    6,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
    4,
  );
  assert.equal(
    (
      await renewSubscription(
        memory.binding,
        activated.value.subscriptionId,
        1,
        renewalContext,
      )
    ).replayed,
    true,
  );
  await assertRuntimeCode(
    renewSubscription(
      memory.binding,
      activated.value.subscriptionId,
      1,
      context("membership_owner", "subscriber-renew-stale"),
    ),
    "STALE_STATE",
  );

  const paused = await pauseSubscription(
    memory.binding,
    activated.value.subscriptionId,
    2,
    context("membership_owner", "subscriber-pause"),
  );
  assert.equal(paused.value.state, "paused");
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM entitlements WHERE source_id = ? AND state = 'revoked'",
      activated.value.subscriptionId,
    ),
    2,
  );
  const resumed = await resumeSubscription(
    memory.binding,
    activated.value.subscriptionId,
    3,
    context("membership_owner", "subscriber-resume"),
  );
  assert.equal(resumed.value.state, "active");

  const scheduled = await scheduleSubscriptionCancellation(
    memory.binding,
    activated.value.subscriptionId,
    4,
    context("membership_owner", "subscriber-schedule-one"),
  );
  assert.equal(scheduled.value.state, "cancellation_scheduled");
  assert.equal(scheduled.value.cancelAt, renewed.value.currentPeriodEnd);
  const cleared = await clearSubscriptionCancellation(
    memory.binding,
    activated.value.subscriptionId,
    5,
    context("membership_owner", "subscriber-clear"),
  );
  assert.equal(cleared.value.state, "active");
  const scheduledAgain = await scheduleSubscriptionCancellation(
    memory.binding,
    activated.value.subscriptionId,
    6,
    context("membership_owner", "subscriber-schedule-two"),
  );
  await assertRuntimeCode(
    applySubscriptionCancellation(
      memory.binding,
      activated.value.subscriptionId,
      7,
      "2026-03-28T18:29:59.999Z",
      context("membership_owner", "subscriber-cancel-early"),
    ),
    "CANCELLATION_BOUNDARY_NOT_REACHED",
  );
  const canceled = await applySubscriptionCancellation(
    memory.binding,
    activated.value.subscriptionId,
    7,
    scheduledAgain.value.cancelAt,
    context("membership_owner", "subscriber-cancel"),
  );
  assert.equal(canceled.value.state, "canceled");
  assert.equal(canceled.value.revision, 8);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM entitlements WHERE source_id = ? AND state = 'expired'",
      activated.value.subscriptionId,
    ),
    2,
  );
  await assertRuntimeCode(
    resumeSubscription(
      memory.binding,
      activated.value.subscriptionId,
      8,
      context("membership_owner", "subscriber-terminal-resume"),
    ),
    "MEMBERSHIP_TRANSITION_INVALID",
  );

  const overview = await readCustomerMembershipOverview(
    memory.binding,
    "membership_customer_subscription",
  );
  assert.equal(overview.memberships[0].state, "canceled");
  assert.equal(overview.subscriptions[0].state, "canceled");
  assert.deepEqual(
    overview.subscriptionEvents.map(({ eventType }) => eventType).sort(),
    [
      "activated",
      "canceled",
      "cancellation_cleared",
      "cancellation_scheduled",
      "cancellation_scheduled",
      "paused",
      "renewed",
      "resumed",
    ].sort(),
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE subject_type = 'subscription'",
    ),
    8,
  );
});

test("direct membership activation follows the current revision, cancellation boundary, and batch authority guards", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndAccess(memory.database);
  const membershipPlan = await createMembershipPlan(
    memory.binding,
    planInput(),
    context("membership_owner", "direct-plan"),
  );
  const revised = await reviseMembershipPlan(
    memory.binding,
    membershipPlan.value.membershipPlanId,
    revisionInput({ downloadCredits: 3, licenseCredits: 0 }),
    1,
    context("membership_owner", "direct-plan-revise"),
  );

  await assertRuntimeCode(
    activateMembership(
      memory.binding,
      {
        membershipPlanId: membershipPlan.value.membershipPlanId,
        membershipPlanRevision: 1,
        customerUserId: "membership_customer_direct",
        startsAt: "2026-07-18T18:00:00.000Z",
      },
      context("membership_owner", "direct-old-revision"),
    ),
    "MEMBERSHIP_PLAN_UNAVAILABLE",
  );
  const activation = await activateMembership(
    memory.binding,
    {
      membershipPlanId: membershipPlan.value.membershipPlanId,
      membershipPlanRevision: revised.value.revision,
      customerUserId: "membership_customer_direct",
      startsAt: "2026-07-18T18:00:00.000Z",
    },
    context("membership_owner", "direct-activate"),
  );
  assert.equal(activation.value.downloadCreditsGranted, 3);
  assert.equal(activation.value.licenseCreditsGranted, 0);
  assert.equal(
    scalar(
      memory.database,
      "SELECT available_balance FROM credit_accounts WHERE customer_user_id = 'membership_customer_direct' AND credit_kind = 'download'",
    ),
    3,
  );
  const scheduled = await scheduleMembershipCancellation(
    memory.binding,
    activation.value.membershipId,
    1,
    context("membership_owner", "direct-schedule"),
  );
  const canceled = await applyMembershipCancellation(
    memory.binding,
    activation.value.membershipId,
    2,
    scheduled.value.cancelAt,
    context("membership_owner", "direct-cancel"),
  );
  assert.equal(canceled.value.state, "canceled");
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM entitlements WHERE source_type = 'membership' AND source_id = ? AND state = 'expired'",
      activation.value.membershipId,
    ),
    2,
  );

  await assertRuntimeCode(
    activateMembership(
      memory.binding,
      {
        membershipPlanId: membershipPlan.value.membershipPlanId,
        membershipPlanRevision: revised.value.revision,
        customerUserId: "membership_customer_revoked",
        startsAt: "2026-07-18T18:00:00.000Z",
      },
      context("membership_owner", "revoked-customer"),
    ),
    "MEMBERSHIP_CUSTOMER_UNAVAILABLE",
  );

  const secondMemory = await createInMemoryD1();
  t.after(() => secondMemory.close());
  seedAuthorityAndAccess(secondMemory.database);
  const secondPlan = await createMembershipPlan(
    secondMemory.binding,
    planInput({ slug: "batch-guard" }),
    context("membership_owner", "batch-plan"),
  );
  const guardedBinding = {
    prepare: secondMemory.binding.prepare.bind(secondMemory.binding),
    batch(statements) {
      secondMemory.database.exec(
        "UPDATE role_assignments SET revoked_at = '2026-07-18T19:00:00.000Z' WHERE id = 'membership_role_customer_direct'",
      );
      return secondMemory.binding.batch(statements);
    },
  };
  await assertRuntimeCode(
    activateMembership(
      guardedBinding,
      {
        membershipPlanId: secondPlan.value.membershipPlanId,
        membershipPlanRevision: 1,
        customerUserId: "membership_customer_direct",
        startsAt: "2026-07-18T18:00:00.000Z",
      },
      context("membership_owner", "batch-customer-revoked"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(secondMemory.database, "SELECT COUNT(*) FROM memberships"),
    0,
  );
  assert.equal(
    scalar(secondMemory.database, "SELECT COUNT(*) FROM entitlements"),
    0,
  );
  assert.equal(
    scalar(secondMemory.database, "SELECT COUNT(*) FROM credit_accounts"),
    0,
  );
});
