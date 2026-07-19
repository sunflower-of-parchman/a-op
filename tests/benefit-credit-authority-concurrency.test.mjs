import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  consumeCreditReservation,
  grantCustomerCredits,
  reserveCustomerCredits,
} = await import("../db/credit-ledger-write.ts");

const OWNER = "user_credit_concurrency_owner";
const CUSTOMER = "user_credit_concurrency_customer";
const OTHER_CUSTOMER = "user_credit_concurrency_other";
const NOW = new Date("2026-07-18T12:00:00.000Z");

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_credit_concurrency_${requestSequence}`,
  };
}

function seedPrincipals(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'concurrency-owner@example.invalid',
       'concurrency-owner@example.invalid', 'active'),
      ('${CUSTOMER}', 'concurrency-customer@example.invalid',
       'concurrency-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER}', 'concurrency-other@example.invalid',
       'concurrency-other@example.invalid', 'active'),
      ('user_credit_concurrency_disabled', 'concurrency-disabled@example.invalid',
       'concurrency-disabled@example.invalid', 'disabled');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_credit_concurrency_owner', '${OWNER}', 'owner', '${OWNER}', NULL),
      ('role_credit_concurrency_customer', '${CUSTOMER}', 'customer',
       '${OWNER}', NULL),
      ('role_credit_concurrency_other', '${OTHER_CUSTOMER}', 'customer',
       '${OWNER}', NULL),
      ('role_credit_concurrency_disabled', 'user_credit_concurrency_disabled',
       'customer', '${OWNER}', NULL);
  `);
}

function grantInput(customerUserId = CUSTOMER) {
  return {
    customerUserId,
    creditKind: "download",
    originType: "owner",
    originId: `owner_grant_${customerUserId}`,
    quantity: 1,
    expiresAt: "2026-07-20T12:00:00.000Z",
    fulfillmentEventId: null,
  };
}

function reservationInput(suffix) {
  return {
    creditKind: "download",
    purposeType: "download",
    purposeId: `download_concurrency_${suffix}`,
    requestId: `credit_request_concurrency_${suffix}`,
    quantity: 1,
    expiresAt: "2026-07-19T12:00:00.000Z",
  };
}

async function assertRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("two reservations competing for the final credit produce exactly one success", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  const granted = await grantCustomerCredits(
    memory.binding,
    grantInput(),
    0,
    context(OWNER, "grant-final-credit"),
    NOW,
  );
  const attempts = await Promise.allSettled([
    reserveCustomerCredits(
      memory.binding,
      reservationInput("first"),
      1,
      context(CUSTOMER, "reserve-final-first"),
      NOW,
    ),
    reserveCustomerCredits(
      memory.binding,
      reservationInput("second"),
      1,
      context(CUSTOMER, "reserve-final-second"),
      NOW,
    ),
  ]);

  const fulfilled = attempts.filter(({ status }) => status === "fulfilled");
  const rejected = attempts.filter(({ status }) => status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(
    ["STALE_STATE", "BENEFIT_CREDIT_INSUFFICIENT"].includes(
      rejected[0].reason?.code,
    ),
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance AS available,
                  reserved_balance AS reserved,
                  consumed_balance AS consumed, revision
           FROM credit_accounts WHERE id = ?`,
        )
        .get(granted.value.creditAccountId),
    },
    { available: 0, reserved: 1, consumed: 0, revision: 2 },
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM credit_reservation_allocations",
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM credit_ledger_entries WHERE entry_type = 'reservation'",
    ),
    1,
  );
});

test("customer authority revoked at the batch boundary rolls back every credit write", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);
  const granted = await grantCustomerCredits(
    memory.binding,
    grantInput(),
    0,
    context(OWNER, "grant-before-revocation"),
    NOW,
  );

  let revoked = false;
  const revokingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      if (!revoked) {
        revoked = true;
        memory.database.exec(`
          UPDATE role_assignments
          SET revoked_at = '2026-07-18T12:30:00.000Z',
              revoked_by_user_id = '${OWNER}'
          WHERE id = 'role_credit_concurrency_customer';
        `);
      }
      return memory.binding.batch(statements);
    },
  };

  await assertRuntimeCode(
    reserveCustomerCredits(
      revokingBinding,
      reservationInput("revoked-at-batch"),
      1,
      context(CUSTOMER, "reserve-revoked-at-batch"),
      NOW,
    ),
    "STALE_STATE",
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance AS available,
                  reserved_balance AS reserved, revision
           FROM credit_accounts WHERE id = ?`,
        )
        .get(granted.value.creditAccountId),
    },
    { available: 1, reserved: 0, revision: 1 },
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM credit_ledger_entries WHERE entry_type = 'reservation'",
    ),
    0,
  );
});

test("owner authority revoked at the batch boundary creates no account, lot, ledger, or audit receipt", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  let revoked = false;
  const revokingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      if (!revoked) {
        revoked = true;
        memory.database.exec(`
          UPDATE role_assignments
          SET revoked_at = '2026-07-18T12:30:00.000Z',
              revoked_by_user_id = '${OWNER}'
          WHERE id = 'role_credit_concurrency_owner';
        `);
      }
      return memory.binding.batch(statements);
    },
  };
  await assertRuntimeCode(
    grantCustomerCredits(
      revokingBinding,
      grantInput(),
      0,
      context(OWNER, "grant-owner-revoked-at-batch"),
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
       WHERE action = 'benefit-credit.grant'`,
    ),
    0,
  );
});

test("a customer cannot consume another customer's exact reservation", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);
  await grantCustomerCredits(
    memory.binding,
    grantInput(),
    0,
    context(OWNER, "grant-cross-customer"),
    NOW,
  );
  const reserved = await reserveCustomerCredits(
    memory.binding,
    reservationInput("cross-customer"),
    1,
    context(CUSTOMER, "reserve-cross-customer"),
    NOW,
  );

  await assertRuntimeCode(
    consumeCreditReservation(
      memory.binding,
      reserved.value.creditReservationId,
      1,
      2,
      context(OTHER_CUSTOMER, "consume-cross-customer"),
      NOW,
    ),
    "BENEFIT_CREDIT_CUSTOMER_REQUIRED",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM credit_reservations WHERE state = 'reserved'",
    ),
    1,
  );
});

test("inactive grant targets, request collisions, and ledger drift fail closed", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);
  await assertRuntimeCode(
    grantCustomerCredits(
      memory.binding,
      grantInput("user_credit_concurrency_disabled"),
      0,
      context(OWNER, "grant-disabled-target"),
      NOW,
    ),
    "BENEFIT_CREDIT_CUSTOMER_UNAVAILABLE",
  );

  const granted = await grantCustomerCredits(
    memory.binding,
    grantInput(),
    0,
    context(OWNER, "grant-collision"),
    NOW,
  );
  await reserveCustomerCredits(
    memory.binding,
    reservationInput("collision"),
    1,
    context(CUSTOMER, "reserve-collision"),
    NOW,
  );
  await assertRuntimeCode(
    reserveCustomerCredits(
      memory.binding,
      {
        ...reservationInput("collision-other"),
        requestId: "credit_request_concurrency_collision",
      },
      2,
      context(CUSTOMER, "reserve-request-collision"),
      NOW,
    ),
    "BENEFIT_CREDIT_RESERVATION_CONFLICT",
  );

  memory.database.exec(`
    UPDATE credit_accounts
    SET available_balance = available_balance + 1
    WHERE id = '${granted.value.creditAccountId}';
  `);
  await assertRuntimeCode(
    reserveCustomerCredits(
      memory.binding,
      reservationInput("drift"),
      2,
      context(CUSTOMER, "reserve-after-drift"),
      NOW,
    ),
    "BENEFIT_CREDIT_BALANCE_MISMATCH",
  );
});
