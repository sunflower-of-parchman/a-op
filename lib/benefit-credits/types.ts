export type CreditKind = "download" | "license";
export type CreditPurposeType = "download" | "license_request";
export type CreditGrantOrigin =
  "owner" | "membership" | "subscription" | "order" | "reversal";
export type CreditLedgerOrigin =
  | "owner"
  | "membership"
  | "subscription"
  | "order"
  | "download"
  | "license"
  | "expiration"
  | "reversal";
export type CreditLedgerEntryType =
  | "grant"
  | "reservation"
  | "consumption"
  | "release"
  | "reversal"
  | "expiration";
export type CreditLotState = "active" | "exhausted" | "expired" | "reversed";
export type CreditReservationState =
  "reserved" | "consumed" | "released" | "expired" | "reversed";

export interface CreditBalances {
  readonly available: number;
  readonly reserved: number;
  readonly consumed: number;
}

export interface CreditBalanceDelta {
  readonly available: number;
  readonly reserved: number;
  readonly consumed: number;
}

export interface CreditLotQuantities {
  readonly granted: number;
  readonly available: number;
  readonly reserved: number;
  readonly consumed: number;
  readonly expired: number;
  readonly reversed: number;
}

export interface CreditGrantInput {
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly originType: CreditGrantOrigin;
  readonly originId: string;
  readonly quantity: number;
  readonly expiresAt: string | null;
  readonly fulfillmentEventId: string | null;
}

/** Server-internal replay identity for one verified fulfillment projection. */
export interface CreditFulfillmentGrantContext {
  readonly operationId: string;
  readonly factsFingerprint: string;
  readonly requestId: string;
}

/**
 * A trusted, self-contained SQL predicate supplied by the fulfillment caller.
 * Values remain parameter-bound; the credit repository adds its own exact
 * fulfillment-event, customer, status, fingerprint, and test-mode checks.
 */
export interface CreditFulfillmentGuard {
  readonly sql: string;
  readonly bindings: readonly (null | number | string)[];
}

export interface CreditReservationInput {
  readonly creditKind: CreditKind;
  readonly purposeType: CreditPurposeType;
  readonly purposeId: string;
  readonly requestId: string;
  readonly quantity: number;
  readonly expiresAt: string;
}

export interface CreditGrantReceipt {
  readonly creditAccountId: string;
  readonly creditGrantLotId: string;
  readonly creditLedgerEntryId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly quantity: number;
  readonly accountRevision: number;
  readonly balances: CreditBalances;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface CreditLotAllocationDTO {
  readonly creditGrantLotId: string;
  readonly position: number;
  readonly quantity: number;
}

export interface CreditReservationReceipt {
  readonly creditAccountId: string;
  readonly creditReservationId: string;
  readonly creditLedgerEntryId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly purposeType: CreditPurposeType;
  readonly purposeId: string;
  readonly requestId: string;
  readonly quantity: number;
  readonly state: CreditReservationState;
  readonly reservationRevision: number;
  readonly accountRevision: number;
  readonly balances: CreditBalances;
  readonly allocations: readonly CreditLotAllocationDTO[];
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface CreditLotExpirationReceipt {
  readonly creditAccountId: string;
  readonly creditGrantLotId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly quantityExpired: number;
  readonly lotRevision: number;
  readonly accountRevision: number;
  readonly balances: CreditBalances;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface CreditLotReversalReceipt {
  readonly creditAccountId: string;
  readonly creditGrantLotId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly quantityReversed: number;
  readonly lotRevision: number;
  readonly accountRevision: number;
  readonly balances: CreditBalances;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface CreditAccountDTO extends CreditBalances {
  readonly id: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly revision: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreditGrantLotDTO extends CreditLotQuantities {
  readonly id: string;
  readonly creditAccountId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly originType: CreditGrantOrigin;
  readonly originId: string;
  readonly state: CreditLotState;
  readonly expiresAt: string | null;
  readonly expiredAt: string | null;
  readonly reversedAt: string | null;
  readonly fulfillmentEventId: string | null;
  readonly revision: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreditReservationDTO {
  readonly id: string;
  readonly creditAccountId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly purposeType: CreditPurposeType;
  readonly purposeId: string;
  readonly quantity: number;
  readonly state: CreditReservationState;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  readonly releasedAt: string | null;
  readonly expiredAt: string | null;
  readonly reversedAt: string | null;
  readonly requestId: string;
  readonly revision: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly allocations: readonly CreditLotAllocationDTO[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreditLedgerEntryDTO {
  readonly id: string;
  readonly creditAccountId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly creditGrantLotId: string | null;
  readonly creditReservationId: string | null;
  readonly entryType: CreditLedgerEntryType;
  readonly delta: CreditBalanceDelta;
  readonly balancesAfter: CreditBalances;
  readonly originType: CreditLedgerOrigin;
  readonly originId: string;
  readonly fulfillmentEventId: string | null;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly createdAt: string;
}

export interface CreditAccountDetailDTO {
  readonly account: CreditAccountDTO;
  readonly lots: readonly CreditGrantLotDTO[];
  readonly reservations: readonly CreditReservationDTO[];
  readonly ledger: readonly CreditLedgerEntryDTO[];
  readonly ledgerBalances: CreditBalances;
  readonly balancesReconciled: boolean;
}
