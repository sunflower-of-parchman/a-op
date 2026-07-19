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
  expireCreditGrantLot,
  expireCreditReservation,
  grantCustomerCredits,
  releaseCreditReservation,
  reserveCustomerCredits,
  reverseConsumedCreditReservation,
  reverseCreditGrantLot,
} = await import("../db/credit-ledger-write.ts");
const {
  readCustomerCreditAccountDetail,
  readCustomerCreditAccounts,
  readOwnerCreditAccountDetail,
  readOwnerCreditAccounts,
} = await import("../db/credit-ledger-read.ts");
const { readCreditCustomers } = await import("../db/credit-surface-read.ts");

const OWNER = "user_credit_owner";
const CUSTOMER = "user_credit_customer";
const OTHER_CUSTOMER = "user_credit_customer_other";
const NOW = new Date("2026-07-18T12:00:00.000Z");

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_benefit_credit_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

function seedPrincipals(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'credit-owner@example.invalid',
       'credit-owner@example.invalid', 'active'),
      ('user_credit_owner_disabled', 'credit-owner-disabled@example.invalid',
       'credit-owner-disabled@example.invalid', 'disabled'),
      ('user_credit_owner_revoked', 'credit-owner-revoked@example.invalid',
       'credit-owner-revoked@example.invalid', 'active'),
      ('${CUSTOMER}', 'credit-customer@example.invalid',
       'credit-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER}', 'credit-other@example.invalid',
       'credit-other@example.invalid', 'active'),
      ('user_credit_customer_disabled', 'credit-disabled@example.invalid',
       'credit-disabled@example.invalid', 'disabled'),
      ('user_credit_customer_revoked', 'credit-revoked@example.invalid',
       'credit-revoked@example.invalid', 'active');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_credit_owner', '${OWNER}', 'owner', '${OWNER}', NULL),
      ('role_credit_owner_disabled', 'user_credit_owner_disabled', 'owner',
       '${OWNER}', NULL),
      ('role_credit_owner_revoked', 'user_credit_owner_revoked', 'owner',
       '${OWNER}', '2026-07-18T00:00:00.000Z'),
      ('role_credit_customer', '${CUSTOMER}', 'customer', '${OWNER}', NULL),
      ('role_credit_customer_other', '${OTHER_CUSTOMER}', 'customer',
       '${OWNER}', NULL),
      ('role_credit_customer_disabled', 'user_credit_customer_disabled',
       'customer', '${OWNER}', NULL),
      ('role_credit_customer_revoked', 'user_credit_customer_revoked',
       'customer', '${OWNER}', '2026-07-18T00:00:00.000Z');
  `);
}

function grantInput({
  creditKind = "download",
  originId = "membership_credit_origin_001",
  quantity = 2,
  expiresAt = "2026-07-20T12:00:00.000Z",
  customerUserId = CUSTOMER,
} = {}) {
  return {
    customerUserId,
    creditKind,
    originType: "membership",
    originId,
    quantity,
    expiresAt,
    fulfillmentEventId: null,
  };
}

function reservationInput({
  creditKind = "download",
  purposeType = creditKind === "download" ? "download" : "license_request",
  purposeId = "download_fictional_001",
  requestId = "credit_request_fictional_001",
  quantity = 1,
  expiresAt = "2026-07-19T12:00:00.000Z",
} = {}) {
  return {
    creditKind,
    purposeType,
    purposeId,
    requestId,
    quantity,
    expiresAt,
  };
}

function ledgerSums(database, accountId) {
  return database
    .prepare(
      `SELECT COALESCE(SUM(available_delta), 0) AS available,
              COALESCE(SUM(reserved_delta), 0) AS reserved,
              COALESCE(SUM(consumed_delta), 0) AS consumed
       FROM credit_ledger_entries WHERE credit_account_id = ?`,
    )
    .get(accountId);
}

function assertTestOnlyRecords(database) {
  for (const table of [
    "credit_accounts",
    "credit_grant_lots",
    "credit_reservations",
    "credit_ledger_entries",
  ]) {
    assert.equal(
      scalar(
        database,
        `SELECT COUNT(*) FROM ${table}
         WHERE stripe_environment <> 'test' OR livemode <> 0`,
      ),
      0,
      `${table} must contain only Stripe Test mode records`,
    );
  }
}

test("owner credit customer selection includes only active customer authority", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  const customers = await readCreditCustomers(memory.binding, OWNER);
  assert.deepEqual(
    customers.map(({ userId, displayName }) => ({ userId, displayName })),
    [
      {
        userId: CUSTOMER,
        displayName: "credit-customer@example.invalid",
      },
      {
        userId: OTHER_CUSTOMER,
        displayName: "credit-other@example.invalid",
      },
    ],
  );
  await assertRuntimeCode(
    readCreditCustomers(memory.binding, CUSTOMER),
    "BENEFIT_CREDIT_OWNER_REQUIRED",
  );
});

test("FIFO grant lots reserve, consume, reverse, replay once, and reconcile cached balances", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  const firstGrantContext = context(OWNER, "grant-download-first");
  const first = await grantCustomerCredits(
    memory.binding,
    grantInput({ originId: "membership_credit_origin_first", quantity: 2 }),
    0,
    firstGrantContext,
    NOW,
  );
  assert.equal(first.replayed, false);
  assert.deepEqual(first.value.balances, {
    available: 2,
    reserved: 0,
    consumed: 0,
  });
  assert.equal(first.value.accountRevision, 1);
  assert.equal(first.value.stripeEnvironment, "test");
  assert.equal(first.value.livemode, false);

  const replayedFirst = await grantCustomerCredits(
    memory.binding,
    grantInput({ originId: "membership_credit_origin_first", quantity: 2 }),
    0,
    firstGrantContext,
    NOW,
  );
  assert.equal(replayedFirst.replayed, true);
  assert.deepEqual(replayedFirst.value, first.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_grant_lots"),
    1,
  );
  await assertRuntimeCode(
    grantCustomerCredits(
      memory.binding,
      grantInput({ originId: "membership_credit_origin_first", quantity: 3 }),
      0,
      firstGrantContext,
      NOW,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  const second = await grantCustomerCredits(
    memory.binding,
    grantInput({ originId: "membership_credit_origin_second", quantity: 2 }),
    1,
    context(OWNER, "grant-download-second"),
    NOW,
  );
  assert.equal(second.value.accountRevision, 2);
  assert.equal(second.value.creditAccountId, first.value.creditAccountId);
  assert.deepEqual(second.value.balances, {
    available: 4,
    reserved: 0,
    consumed: 0,
  });

  const reserveContext = context(CUSTOMER, "reserve-three-downloads");
  const reserved = await reserveCustomerCredits(
    memory.binding,
    reservationInput({
      purposeId: "download_fictional_bundle",
      requestId: "credit_request_download_bundle",
      quantity: 3,
    }),
    2,
    reserveContext,
    NOW,
  );
  assert.equal(reserved.replayed, false);
  assert.deepEqual(reserved.value.allocations, [
    {
      creditGrantLotId: first.value.creditGrantLotId,
      position: 1,
      quantity: 2,
    },
    {
      creditGrantLotId: second.value.creditGrantLotId,
      position: 2,
      quantity: 1,
    },
  ]);
  assert.deepEqual(reserved.value.balances, {
    available: 1,
    reserved: 3,
    consumed: 0,
  });
  assert.equal(reserved.value.accountRevision, 3);

  const consumeContext = context(CUSTOMER, "consume-download-bundle");
  const consumed = await consumeCreditReservation(
    memory.binding,
    reserved.value.creditReservationId,
    1,
    3,
    consumeContext,
    NOW,
  );
  assert.equal(consumed.value.state, "consumed");
  assert.match(consumed.value.creditLedgerEntryId, /^credit_entry_/);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE id = ? AND credit_reservation_id = ? AND entry_type = 'consumption'`,
      consumed.value.creditLedgerEntryId,
      reserved.value.creditReservationId,
    ),
    1,
  );
  assert.equal(consumed.value.reservationRevision, 2);
  assert.equal(consumed.value.accountRevision, 4);
  assert.deepEqual(consumed.value.balances, {
    available: 1,
    reserved: 0,
    consumed: 3,
  });
  const replayedConsume = await consumeCreditReservation(
    memory.binding,
    reserved.value.creditReservationId,
    1,
    3,
    consumeContext,
    NOW,
  );
  assert.equal(replayedConsume.replayed, true);
  assert.deepEqual(replayedConsume.value, consumed.value);
  await assertRuntimeCode(
    consumeCreditReservation(
      memory.binding,
      reserved.value.creditReservationId,
      1,
      4,
      consumeContext,
      NOW,
    ),
    "IDEMPOTENCY_CONFLICT",
  );

  const reversed = await reverseConsumedCreditReservation(
    memory.binding,
    reserved.value.creditReservationId,
    2,
    4,
    context(OWNER, "reverse-download-bundle"),
    NOW,
  );
  assert.equal(reversed.value.state, "reversed");
  assert.deepEqual(reversed.value.balances, {
    available: 4,
    reserved: 0,
    consumed: 0,
  });

  const detail = await readOwnerCreditAccountDetail(
    memory.binding,
    first.value.creditAccountId,
    OWNER,
  );
  assert.ok(detail);
  assert.equal(detail.balancesReconciled, true);
  assert.deepEqual(detail.ledgerBalances, {
    available: 4,
    reserved: 0,
    consumed: 0,
  });
  assert.deepEqual(
    detail.ledger.map(({ entryType }) => entryType),
    ["grant", "grant", "reservation", "consumption", "reversal"],
  );
  assert.deepEqual(
    detail.lots.map(({ available, reserved, consumed, state }) => ({
      available,
      reserved,
      consumed,
      state,
    })),
    [
      { available: 2, reserved: 0, consumed: 0, state: "active" },
      { available: 2, reserved: 0, consumed: 0, state: "active" },
    ],
  );
  assert.deepEqual(
    { ...ledgerSums(memory.database, first.value.creditAccountId) },
    {
      available: 4,
      reserved: 0,
      consumed: 0,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE stripe_environment = 'test' AND livemode = 0`,
    ),
    5,
  );
  assertTestOnlyRecords(memory.database);
});

test("release, reservation expiry, and lot expiry conserve quantities and histories", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  const granted = await grantCustomerCredits(
    memory.binding,
    grantInput({
      creditKind: "license",
      originId: "subscription_license_credits",
      quantity: 2,
      expiresAt: "2026-07-20T12:00:00.000Z",
    }),
    0,
    context(OWNER, "grant-license-credits"),
    NOW,
  );
  const firstReservation = await reserveCustomerCredits(
    memory.binding,
    reservationInput({
      creditKind: "license",
      purposeId: "license_request_release",
      requestId: "credit_request_license_release",
      quantity: 1,
    }),
    1,
    context(CUSTOMER, "reserve-license-release"),
    NOW,
  );
  const releaseContext = context(CUSTOMER, "release-license-credit");
  const released = await releaseCreditReservation(
    memory.binding,
    firstReservation.value.creditReservationId,
    1,
    2,
    releaseContext,
    NOW,
  );
  assert.equal(released.value.state, "released");
  assert.deepEqual(released.value.balances, {
    available: 2,
    reserved: 0,
    consumed: 0,
  });
  const replayedRelease = await releaseCreditReservation(
    memory.binding,
    firstReservation.value.creditReservationId,
    1,
    2,
    releaseContext,
    NOW,
  );
  assert.equal(replayedRelease.replayed, true);
  assert.deepEqual(replayedRelease.value, released.value);

  const secondReservation = await reserveCustomerCredits(
    memory.binding,
    reservationInput({
      creditKind: "license",
      purposeId: "license_request_expire",
      requestId: "credit_request_license_expire",
      quantity: 1,
      expiresAt: "2026-07-18T13:00:00.000Z",
    }),
    3,
    context(CUSTOMER, "reserve-license-expire"),
    NOW,
  );
  const expiredReservation = await expireCreditReservation(
    memory.binding,
    secondReservation.value.creditReservationId,
    1,
    4,
    context(OWNER, "expire-license-reservation"),
    new Date("2026-07-18T14:00:00.000Z"),
  );
  assert.equal(expiredReservation.value.state, "expired");
  assert.deepEqual(expiredReservation.value.balances, {
    available: 2,
    reserved: 0,
    consumed: 0,
  });

  const expiredLot = await expireCreditGrantLot(
    memory.binding,
    granted.value.creditGrantLotId,
    5,
    5,
    context(OWNER, "expire-license-lot"),
    new Date("2026-07-21T12:00:00.000Z"),
  );
  assert.equal(expiredLot.value.quantityExpired, 2);
  assert.deepEqual(expiredLot.value.balances, {
    available: 0,
    reserved: 0,
    consumed: 0,
  });

  const detail = await readCustomerCreditAccountDetail(
    memory.binding,
    "license",
    CUSTOMER,
  );
  assert.ok(detail);
  assert.equal(detail.balancesReconciled, true);
  assert.deepEqual(
    detail.ledger.map(({ entryType, originType }) => ({
      entryType,
      originType,
    })),
    [
      { entryType: "grant", originType: "membership" },
      { entryType: "reservation", originType: "license" },
      { entryType: "release", originType: "license" },
      { entryType: "reservation", originType: "license" },
      { entryType: "release", originType: "expiration" },
      { entryType: "expiration", originType: "expiration" },
    ],
  );
  assert.deepEqual(
    detail.lots.map(
      ({ available, reserved, consumed, expired, reversed, state }) => ({
        available,
        reserved,
        consumed,
        expired,
        reversed,
        state,
      }),
    ),
    [
      {
        available: 0,
        reserved: 0,
        consumed: 0,
        expired: 2,
        reversed: 0,
        state: "expired",
      },
    ],
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE credit_reservation_id = ? AND entry_type = 'release'`,
      firstReservation.value.creditReservationId,
    ),
    1,
  );
  assertTestOnlyRecords(memory.database);
});

test("owner reverses an unused grant lot once and preserves a reconciled history", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  const granted = await grantCustomerCredits(
    memory.binding,
    grantInput({ originId: "owner_reversible_grant", quantity: 2 }),
    0,
    context(OWNER, "grant-for-owner-reversal"),
    NOW,
  );
  const reversalContext = context(OWNER, "reverse-unused-grant");
  const reversed = await reverseCreditGrantLot(
    memory.binding,
    granted.value.creditGrantLotId,
    1,
    1,
    reversalContext,
    NOW,
  );
  assert.equal(reversed.replayed, false);
  assert.deepEqual(reversed.value, {
    creditAccountId: granted.value.creditAccountId,
    creditGrantLotId: granted.value.creditGrantLotId,
    customerUserId: CUSTOMER,
    creditKind: "download",
    quantityReversed: 2,
    lotRevision: 2,
    accountRevision: 2,
    balances: { available: 0, reserved: 0, consumed: 0 },
    stripeEnvironment: "test",
    livemode: false,
  });

  const replayed = await reverseCreditGrantLot(
    memory.binding,
    granted.value.creditGrantLotId,
    1,
    1,
    reversalContext,
    NOW,
  );
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.value, reversed.value);

  const detail = await readOwnerCreditAccountDetail(
    memory.binding,
    granted.value.creditAccountId,
    OWNER,
  );
  assert.ok(detail);
  assert.equal(detail.balancesReconciled, true);
  assert.deepEqual(detail.ledgerBalances, {
    available: 0,
    reserved: 0,
    consumed: 0,
  });
  assert.deepEqual(
    detail.ledger.map(({ entryType, originType }) => ({
      entryType,
      originType,
    })),
    [
      { entryType: "grant", originType: "membership" },
      { entryType: "expiration", originType: "reversal" },
    ],
  );
  assert.deepEqual(
    detail.lots.map(
      ({
        available,
        reserved,
        consumed,
        expired,
        reversed: quantity,
        state,
      }) => ({
        available,
        reserved,
        consumed,
        expired,
        reversed: quantity,
        state,
      }),
    ),
    [
      {
        available: 0,
        reserved: 0,
        consumed: 0,
        expired: 0,
        reversed: 2,
        state: "reversed",
      },
    ],
  );
  assertTestOnlyRecords(memory.database);
});

test("owner and customer read helpers preserve exact authority and environment", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedPrincipals(memory.database);

  const granted = await grantCustomerCredits(
    memory.binding,
    grantInput(),
    0,
    context(OWNER, "grant-for-read"),
    NOW,
  );
  assert.deepEqual(await readCustomerCreditAccounts(memory.binding, CUSTOMER), [
    {
      id: granted.value.creditAccountId,
      customerUserId: CUSTOMER,
      creditKind: "download",
      available: 2,
      reserved: 0,
      consumed: 0,
      revision: 1,
      stripeEnvironment: "test",
      livemode: false,
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z",
    },
  ]);
  assert.equal(
    (await readOwnerCreditAccounts(memory.binding, OWNER)).length,
    1,
  );
  assert.equal(
    (await readOwnerCreditAccounts(memory.binding, OWNER, CUSTOMER)).length,
    1,
  );
  assert.equal(
    (await readOwnerCreditAccounts(memory.binding, OWNER, OTHER_CUSTOMER))
      .length,
    0,
  );

  for (const actor of [OTHER_CUSTOMER, "user_credit_customer_disabled"]) {
    if (actor === OTHER_CUSTOMER) {
      assert.deepEqual(
        await readCustomerCreditAccounts(memory.binding, actor),
        [],
      );
    } else {
      await assertRuntimeCode(
        readCustomerCreditAccounts(memory.binding, actor),
        "BENEFIT_CREDIT_CUSTOMER_REQUIRED",
      );
    }
  }
  await assertRuntimeCode(
    readOwnerCreditAccounts(memory.binding, CUSTOMER),
    "BENEFIT_CREDIT_OWNER_REQUIRED",
  );
});
