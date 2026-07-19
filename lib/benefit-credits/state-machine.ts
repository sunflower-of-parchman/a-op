import type {
  CreditBalanceDelta,
  CreditBalances,
  CreditLedgerEntryType,
  CreditLotQuantities,
  CreditLotState,
  CreditReservationState,
} from "./types.ts";

function assertSafeNonnegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer.`);
  }
}

export function creditBalanceDelta(
  entryType: CreditLedgerEntryType,
  quantity: number,
): CreditBalanceDelta {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(
      "Credit movement quantity must be a positive integer.",
    );
  }
  const deltas = {
    grant: { available: quantity, reserved: 0, consumed: 0 },
    reservation: {
      available: -quantity,
      reserved: quantity,
      consumed: 0,
    },
    consumption: {
      available: 0,
      reserved: -quantity,
      consumed: quantity,
    },
    release: { available: quantity, reserved: -quantity, consumed: 0 },
    reversal: { available: quantity, reserved: 0, consumed: -quantity },
    expiration: { available: -quantity, reserved: 0, consumed: 0 },
  } satisfies Record<CreditLedgerEntryType, CreditBalanceDelta>;
  return Object.freeze(deltas[entryType]);
}

export function applyCreditBalanceDelta(
  balances: CreditBalances,
  delta: CreditBalanceDelta,
): CreditBalances {
  const next = {
    available: balances.available + delta.available,
    reserved: balances.reserved + delta.reserved,
    consumed: balances.consumed + delta.consumed,
  };
  assertSafeNonnegative(next.available, "Available credit balance");
  assertSafeNonnegative(next.reserved, "Reserved credit balance");
  assertSafeNonnegative(next.consumed, "Consumed credit balance");
  return Object.freeze(next);
}

export function creditLotState(
  quantities: CreditLotQuantities,
): CreditLotState {
  const values = Object.values(quantities);
  values.forEach((value) =>
    assertSafeNonnegative(value, "Credit lot quantity"),
  );
  if (
    quantities.available +
      quantities.reserved +
      quantities.consumed +
      quantities.expired +
      quantities.reversed !==
    quantities.granted
  ) {
    throw new RangeError("Credit lot quantities must conserve the grant.");
  }
  if (quantities.reversed > 0) {
    if (quantities.available !== 0 || quantities.reserved !== 0) {
      throw new RangeError(
        "A reversed credit lot cannot remain available or reserved.",
      );
    }
    return "reversed";
  }
  if (quantities.expired > 0) {
    if (quantities.available !== 0 || quantities.reserved !== 0) {
      throw new RangeError(
        "An expired credit lot cannot remain available or reserved.",
      );
    }
    return "expired";
  }
  return quantities.available + quantities.reserved > 0
    ? "active"
    : "exhausted";
}

export function moveCreditLotQuantity(
  quantities: CreditLotQuantities,
  movement:
    | "reservation"
    | "consumption"
    | "release"
    | "reversal"
    | "expiration"
    | "grant-reversal",
  quantity: number,
): Readonly<{ quantities: CreditLotQuantities; state: CreditLotState }> {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError("Credit lot movement must be a positive integer.");
  }
  const next = { ...quantities };
  if (movement === "reservation") {
    if (next.available < quantity)
      throw new RangeError(
        "The credit lot has insufficient available quantity.",
      );
    next.available -= quantity;
    next.reserved += quantity;
  } else if (movement === "consumption") {
    if (next.reserved < quantity)
      throw new RangeError(
        "The credit lot has insufficient reserved quantity.",
      );
    next.reserved -= quantity;
    next.consumed += quantity;
  } else if (movement === "release") {
    if (next.reserved < quantity)
      throw new RangeError(
        "The credit lot has insufficient reserved quantity.",
      );
    next.reserved -= quantity;
    next.available += quantity;
  } else if (movement === "reversal") {
    if (next.consumed < quantity)
      throw new RangeError(
        "The credit lot has insufficient consumed quantity.",
      );
    next.consumed -= quantity;
    next.available += quantity;
  } else if (movement === "expiration") {
    if (next.available < quantity)
      throw new RangeError(
        "The credit lot has insufficient available quantity.",
      );
    next.available -= quantity;
    next.expired += quantity;
  } else {
    if (next.available < quantity)
      throw new RangeError(
        "The credit lot has insufficient available quantity.",
      );
    next.available -= quantity;
    next.reversed += quantity;
  }

  const frozen = Object.freeze(next);
  return Object.freeze({ quantities: frozen, state: creditLotState(frozen) });
}

export function assertCreditReservationTransition(
  from: CreditReservationState,
  to: CreditReservationState,
): void {
  const allowed =
    (from === "reserved" &&
      (to === "consumed" || to === "released" || to === "expired")) ||
    (from === "consumed" && to === "reversed");
  if (!allowed) {
    throw new RangeError(
      `Credit reservation cannot move from ${from} to ${to}.`,
    );
  }
}
