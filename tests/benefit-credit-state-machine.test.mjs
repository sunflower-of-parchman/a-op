import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCreditBalanceDelta,
  assertCreditReservationTransition,
  creditBalanceDelta,
  creditLotState,
  moveCreditLotQuantity,
} from "../lib/benefit-credits/index.ts";

test("ledger deltas implement grant, reserve, consume, release, reversal, and expiration", () => {
  assert.deepEqual(creditBalanceDelta("grant", 3), {
    available: 3,
    reserved: 0,
    consumed: 0,
  });
  assert.deepEqual(creditBalanceDelta("reservation", 2), {
    available: -2,
    reserved: 2,
    consumed: 0,
  });
  assert.deepEqual(creditBalanceDelta("consumption", 2), {
    available: 0,
    reserved: -2,
    consumed: 2,
  });
  assert.deepEqual(creditBalanceDelta("release", 2), {
    available: 2,
    reserved: -2,
    consumed: 0,
  });
  assert.deepEqual(creditBalanceDelta("reversal", 2), {
    available: 2,
    reserved: 0,
    consumed: -2,
  });
  assert.deepEqual(creditBalanceDelta("expiration", 2), {
    available: -2,
    reserved: 0,
    consumed: 0,
  });
});

test("cached balances reject underflow and follow exact immutable deltas", () => {
  let balances = { available: 0, reserved: 0, consumed: 0 };
  balances = applyCreditBalanceDelta(balances, creditBalanceDelta("grant", 2));
  balances = applyCreditBalanceDelta(
    balances,
    creditBalanceDelta("reservation", 1),
  );
  balances = applyCreditBalanceDelta(
    balances,
    creditBalanceDelta("consumption", 1),
  );
  assert.deepEqual(balances, { available: 1, reserved: 0, consumed: 1 });
  balances = applyCreditBalanceDelta(
    balances,
    creditBalanceDelta("reversal", 1),
  );
  assert.deepEqual(balances, { available: 2, reserved: 0, consumed: 0 });

  assert.throws(
    () =>
      applyCreditBalanceDelta(balances, creditBalanceDelta("consumption", 1)),
    /Reserved credit balance/,
  );
});

test("lot movements conserve every granted credit through the full lifecycle", () => {
  const initial = {
    granted: 2,
    available: 2,
    reserved: 0,
    consumed: 0,
    expired: 0,
    reversed: 0,
  };
  const grantReversed = moveCreditLotQuantity(initial, "grant-reversal", 2);
  assert.equal(grantReversed.state, "reversed");
  assert.deepEqual(grantReversed.quantities, {
    granted: 2,
    available: 0,
    reserved: 0,
    consumed: 0,
    expired: 0,
    reversed: 2,
  });

  const reserved = moveCreditLotQuantity(initial, "reservation", 2);
  assert.equal(reserved.state, "active");
  assert.deepEqual(reserved.quantities, {
    ...initial,
    available: 0,
    reserved: 2,
  });
  const consumed = moveCreditLotQuantity(reserved.quantities, "consumption", 2);
  assert.equal(consumed.state, "exhausted");
  const reversed = moveCreditLotQuantity(consumed.quantities, "reversal", 2);
  assert.equal(reversed.state, "active");
  const expired = moveCreditLotQuantity(reversed.quantities, "expiration", 2);
  assert.equal(expired.state, "expired");
  assert.deepEqual(expired.quantities, {
    granted: 2,
    available: 0,
    reserved: 0,
    consumed: 0,
    expired: 2,
    reversed: 0,
  });
  assert.equal(creditLotState(expired.quantities), "expired");
});

test("reservation state transitions allow one terminal path and one consumed reversal", () => {
  for (const transition of [
    ["reserved", "consumed"],
    ["reserved", "released"],
    ["reserved", "expired"],
    ["consumed", "reversed"],
  ]) {
    assert.doesNotThrow(() => assertCreditReservationTransition(...transition));
  }
  for (const transition of [
    ["released", "consumed"],
    ["expired", "released"],
    ["reversed", "reserved"],
    ["consumed", "released"],
  ]) {
    assert.throws(() => assertCreditReservationTransition(...transition));
  }
});
