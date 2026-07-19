import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCreditGrantInput,
  validateCreditReservationInput,
} from "../lib/benefit-credits/index.ts";

test("credit grant validation preserves exact supported input", () => {
  const result = validateCreditGrantInput({
    customerUserId: "user_fictional_customer",
    creditKind: "download",
    originType: "membership",
    originId: "membership_fictional_001",
    quantity: 3,
    expiresAt: "2027-07-18T12:00:00-06:00",
    fulfillmentEventId: null,
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      customerUserId: "user_fictional_customer",
      creditKind: "download",
      originType: "membership",
      originId: "membership_fictional_001",
      quantity: 3,
      expiresAt: "2027-07-18T18:00:00.000Z",
      fulfillmentEventId: null,
    },
  });
});

test("grant validation rejects unknown fields, unsafe IDs, invalid quantities, and timestamps", () => {
  const result = validateCreditGrantInput({
    customerUserId: "user with spaces",
    creditKind: "generic",
    originType: "browser",
    originId: "",
    quantity: 0,
    expiresAt: "tomorrow",
    fulfillmentEventId: "fulfillment\ninjected",
    availableBalance: 999,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    new Set(result.issues.map(({ field }) => field)),
    new Set([
      "availableBalance",
      "customerUserId",
      "creditKind",
      "originType",
      "originId",
      "quantity",
      "expiresAt",
      "fulfillmentEventId",
    ]),
  );
});

test("reservation validation binds exact matching kind, purpose, request, quantity, and expiry", () => {
  assert.deepEqual(
    validateCreditReservationInput({
      creditKind: "license",
      purposeType: "license_request",
      purposeId: "license_request_fictional_001",
      requestId: "request_credit_fictional_001",
      quantity: 1,
      expiresAt: "2026-07-19T12:00:00.000Z",
    }),
    {
      ok: true,
      value: {
        creditKind: "license",
        purposeType: "license_request",
        purposeId: "license_request_fictional_001",
        requestId: "request_credit_fictional_001",
        quantity: 1,
        expiresAt: "2026-07-19T12:00:00.000Z",
      },
    },
  );
});

test("download and license purposes cannot be crossed or supplied by balance fields", () => {
  for (const input of [
    {
      creditKind: "download",
      purposeType: "license_request",
      purposeId: "license_request_001",
      requestId: "request_credit_001",
      quantity: 1,
      expiresAt: "2026-07-19T12:00:00.000Z",
    },
    {
      creditKind: "license",
      purposeType: "download",
      purposeId: "download_001",
      requestId: "request_credit_002",
      quantity: 1,
      expiresAt: "2026-07-19T12:00:00.000Z",
      reservedBalance: 10,
    },
  ]) {
    const result = validateCreditReservationInput(input);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(({ field }) => field === "purposeType"));
  }
});
