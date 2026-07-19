import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { grantFulfillmentCredits } =
  await import("../db/credit-ledger-write.ts");

const CUSTOMER = "user_credit_fulfillment_customer";
const OTHER_CUSTOMER = "user_credit_fulfillment_other";
const COMMERCE_EVENT = "commerce_event_credit_fulfillment";
const FULFILLMENT_EVENT = "fulfillment_event_credit_fulfillment";
const FACTS_FINGERPRINT = "a".repeat(64);
const NOW = new Date("2026-07-18T12:00:00.000Z");

function seedVerifiedFulfillment(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${CUSTOMER}', 'fulfillment-customer@example.invalid',
       'fulfillment-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER}', 'fulfillment-other@example.invalid',
       'fulfillment-other@example.invalid', 'active');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_credit_fulfillment_customer', '${CUSTOMER}', 'customer',
       '${CUSTOMER}', NULL),
      ('role_credit_fulfillment_other', '${OTHER_CUSTOMER}', 'customer',
       '${OTHER_CUSTOMER}', NULL);

    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id, event_created_at,
       raw_body_digest, facts_fingerprint, status, stripe_environment, livemode)
    VALUES
      ('${COMMERCE_EVENT}', 'evt_credit_fulfillment_test',
       'checkout.session.completed', 'cs_test_credit_fulfillment',
       '2026-07-18T11:59:00.000Z', '${"b".repeat(64)}',
       '${FACTS_FINGERPRINT}', 'processing', 'test', 0);

    INSERT INTO fulfillment_events
      (id, commerce_event_id, customer_user_id, kind, provider_object_id,
       facts_fingerprint, status, result_json, stripe_environment, livemode)
    VALUES
      ('${FULFILLMENT_EVENT}', '${COMMERCE_EVENT}', '${CUSTOMER}',
       'one_time', 'cs_test_credit_fulfillment', '${FACTS_FINGERPRINT}',
       'processing', '{}', 'test', 0);
  `);
}

function grantInput(overrides = {}) {
  return {
    customerUserId: CUSTOMER,
    creditKind: "download",
    originType: "order",
    originId: "order_credit_fulfillment",
    quantity: 2,
    expiresAt: "2026-07-20T12:00:00.000Z",
    fulfillmentEventId: FULFILLMENT_EVENT,
    ...overrides,
  };
}

function fulfillmentContext(overrides = {}) {
  return {
    operationId: "project_credit_fulfillment_once",
    factsFingerprint: FACTS_FINGERPRINT,
    requestId: "request_credit_fulfillment_once",
    ...overrides,
  };
}

function fulfillmentGuard() {
  return {
    sql: `EXISTS (
      SELECT 1 FROM fulfillment_events AS caller_fulfillment
      WHERE caller_fulfillment.id = ?
        AND caller_fulfillment.commerce_event_id = ?
        AND caller_fulfillment.provider_object_id = ?
    )`,
    bindings: [FULFILLMENT_EVENT, COMMERCE_EVENT, "cs_test_credit_fulfillment"],
  };
}

async function assertRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("verified test fulfillment grants exact credits without owner authority and replays once", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedVerifiedFulfillment(memory.database);

  const context = fulfillmentContext();
  const granted = await grantFulfillmentCredits(
    memory.binding,
    grantInput(),
    0,
    context,
    fulfillmentGuard(),
    NOW,
  );
  assert.equal(granted.replayed, false);
  assert.deepEqual(granted.value.balances, {
    available: 2,
    reserved: 0,
    consumed: 0,
  });
  assert.equal(granted.value.stripeEnvironment, "test");
  assert.equal(granted.value.livemode, false);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_grant_lots
       WHERE id = ? AND fulfillment_event_id = ?
         AND origin_type = 'order' AND origin_id = ?
         AND stripe_environment = 'test' AND livemode = 0`,
      granted.value.creditGrantLotId,
      FULFILLMENT_EVENT,
      "order_credit_fulfillment",
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE id = ? AND fulfillment_event_id = ? AND entry_type = 'grant'
         AND available_delta = 2 AND stripe_environment = 'test' AND livemode = 0`,
      granted.value.creditLedgerEntryId,
      FULFILLMENT_EVENT,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'benefit-credit.fulfillment.grant'
         AND actor_user_id IS NULL AND request_id = ?`,
      context.requestId,
    ),
    1,
  );

  const replayed = await grantFulfillmentCredits(
    memory.binding,
    grantInput(),
    0,
    context,
    fulfillmentGuard(),
    NOW,
  );
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.value, granted.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
    1,
  );

  await assertRuntimeCode(
    grantFulfillmentCredits(
      memory.binding,
      grantInput({ quantity: 3 }),
      0,
      context,
      fulfillmentGuard(),
      NOW,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  const second = await grantFulfillmentCredits(
    memory.binding,
    grantInput({
      originType: "membership",
      originId: "membership_credit_fulfillment",
      quantity: 1,
    }),
    1,
    fulfillmentContext({
      operationId: "project_membership_credit_fulfillment",
      requestId: "request_membership_credit_fulfillment",
    }),
    fulfillmentGuard(),
    NOW,
  );
  assert.equal(second.value.accountRevision, 2);
  assert.deepEqual(second.value.balances, {
    available: 3,
    reserved: 0,
    consumed: 0,
  });
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    2,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
    2,
  );
});

test("wrong fingerprint, customer, origin, or caller guard cannot grant fulfillment credits", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedVerifiedFulfillment(memory.database);

  await assertRuntimeCode(
    grantFulfillmentCredits(
      memory.binding,
      grantInput(),
      0,
      fulfillmentContext({ factsFingerprint: "c".repeat(64) }),
      fulfillmentGuard(),
      NOW,
    ),
    "BENEFIT_CREDIT_FULFILLMENT_REQUIRED",
  );
  await assertRuntimeCode(
    grantFulfillmentCredits(
      memory.binding,
      grantInput({ customerUserId: OTHER_CUSTOMER }),
      0,
      fulfillmentContext({ operationId: "wrong_customer_projection" }),
      fulfillmentGuard(),
      NOW,
    ),
    "BENEFIT_CREDIT_FULFILLMENT_REQUIRED",
  );
  await assertRuntimeCode(
    grantFulfillmentCredits(
      memory.binding,
      grantInput({ originType: "owner" }),
      0,
      fulfillmentContext({ operationId: "wrong_origin_projection" }),
      fulfillmentGuard(),
      NOW,
    ),
    "BENEFIT_CREDIT_INPUT_INVALID",
  );
  await assertRuntimeCode(
    grantFulfillmentCredits(
      memory.binding,
      grantInput(),
      0,
      fulfillmentContext({ operationId: "false_guard_projection" }),
      {
        sql: "EXISTS (SELECT 1 FROM fulfillment_events WHERE id = ?)",
        bindings: ["fulfillment_event_missing"],
      },
      NOW,
    ),
    "BENEFIT_CREDIT_FULFILLMENT_REQUIRED",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_accounts"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
    0,
  );
});

test("fulfillment authority lost at the batch boundary rolls back every credit write", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedVerifiedFulfillment(memory.database);

  let invalidated = false;
  const invalidatingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      if (!invalidated) {
        invalidated = true;
        memory.database.exec(`
          UPDATE fulfillment_events
          SET status = 'failed', failure_category = 'simulated-boundary-loss'
          WHERE id = '${FULFILLMENT_EVENT}';
        `);
      }
      return memory.binding.batch(statements);
    },
  };

  await assertRuntimeCode(
    grantFulfillmentCredits(
      invalidatingBinding,
      grantInput(),
      0,
      fulfillmentContext({ operationId: "invalidated_at_batch" }),
      fulfillmentGuard(),
      NOW,
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_accounts"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_ledger_entries"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'benefit-credit.fulfillment.grant'`,
    ),
    0,
  );
});
