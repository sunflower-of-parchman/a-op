import {
  activeCustomerCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import {
  type CreditAccountDTO,
  type CreditAccountDetailDTO,
  type CreditBalances,
  type CreditGrantLotDTO,
  type CreditKind,
  type CreditLedgerEntryDTO,
  type CreditReservationDTO,
  isSafeCreditId,
} from "@/lib/benefit-credits/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CountRow {
  count: number;
}

interface AccountRow {
  id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  available_balance: number;
  reserved_balance: number;
  consumed_balance: number;
  revision: number;
  stripe_environment: "test";
  livemode: number;
  created_at: string;
  updated_at: string;
}

interface LotRow {
  id: string;
  credit_account_id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  origin_type: CreditGrantLotDTO["originType"];
  origin_id: string;
  quantity_granted: number;
  quantity_available: number;
  quantity_reserved: number;
  quantity_consumed: number;
  quantity_expired: number;
  quantity_reversed: number;
  state: CreditGrantLotDTO["state"];
  expires_at: string | null;
  expired_at: string | null;
  reversed_at: string | null;
  fulfillment_event_id: string | null;
  revision: number;
  stripe_environment: "test";
  livemode: number;
  created_at: string;
  updated_at: string;
}

interface ReservationRow {
  id: string;
  credit_account_id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  purpose_type: CreditReservationDTO["purposeType"];
  purpose_id: string;
  quantity: number;
  state: CreditReservationDTO["state"];
  expires_at: string;
  consumed_at: string | null;
  released_at: string | null;
  expired_at: string | null;
  reversed_at: string | null;
  request_id: string;
  revision: number;
  stripe_environment: "test";
  livemode: number;
  created_at: string;
  updated_at: string;
}

interface AllocationRow {
  credit_reservation_id: string;
  credit_grant_lot_id: string;
  position: number;
  quantity: number;
}

interface LedgerRow {
  id: string;
  credit_account_id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  credit_grant_lot_id: string | null;
  credit_reservation_id: string | null;
  entry_type: CreditLedgerEntryDTO["entryType"];
  available_delta: number;
  reserved_delta: number;
  consumed_delta: number;
  available_after: number;
  reserved_after: number;
  consumed_after: number;
  origin_type: CreditLedgerEntryDTO["originType"];
  origin_id: string;
  fulfillment_event_id: string | null;
  stripe_environment: "test";
  livemode: number;
  created_at: string;
}

function safeId(value: unknown, field: string): string {
  if (!isSafeCreditId(value)) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_INPUT_INVALID",
      "Credit identifier is invalid.",
      {
        status: 400,
        publicMessage: "Review the credit request and try again.",
        details: { field },
      },
    );
  }
  return value;
}

function creditKind(value: unknown): CreditKind {
  if (value !== "download" && value !== "license") {
    throw new RuntimeError(
      "BENEFIT_CREDIT_INPUT_INVALID",
      "Credit kind is invalid.",
      {
        status: 400,
        publicMessage: "Choose download or license credits.",
      },
    );
  }
  return value;
}

async function requireAuthority(
  binding: D1Database,
  authority: SqlAuthorityCondition,
  role: "owner" | "customer",
): Promise<void> {
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    role === "owner"
      ? "BENEFIT_CREDIT_OWNER_REQUIRED"
      : "BENEFIT_CREDIT_CUSTOMER_REQUIRED",
    "Live credit authority is required.",
    {
      status: 403,
      publicMessage:
        role === "owner"
          ? "Owner access is required to view these credits."
          : "Customer access is required to view these credits.",
    },
  );
}

function mapAccount(row: AccountRow): CreditAccountDTO {
  return Object.freeze({
    id: row.id,
    customerUserId: row.customer_user_id,
    creditKind: row.credit_kind,
    available: row.available_balance,
    reserved: row.reserved_balance,
    consumed: row.consumed_balance,
    revision: row.revision,
    stripeEnvironment: "test",
    livemode: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapLot(row: LotRow): CreditGrantLotDTO {
  return Object.freeze({
    id: row.id,
    creditAccountId: row.credit_account_id,
    customerUserId: row.customer_user_id,
    creditKind: row.credit_kind,
    originType: row.origin_type,
    originId: row.origin_id,
    granted: row.quantity_granted,
    available: row.quantity_available,
    reserved: row.quantity_reserved,
    consumed: row.quantity_consumed,
    expired: row.quantity_expired,
    reversed: row.quantity_reversed,
    state: row.state,
    expiresAt: row.expires_at,
    expiredAt: row.expired_at,
    reversedAt: row.reversed_at,
    fulfillmentEventId: row.fulfillment_event_id,
    revision: row.revision,
    stripeEnvironment: "test",
    livemode: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapLedger(row: LedgerRow): CreditLedgerEntryDTO {
  return Object.freeze({
    id: row.id,
    creditAccountId: row.credit_account_id,
    customerUserId: row.customer_user_id,
    creditKind: row.credit_kind,
    creditGrantLotId: row.credit_grant_lot_id,
    creditReservationId: row.credit_reservation_id,
    entryType: row.entry_type,
    delta: Object.freeze({
      available: row.available_delta,
      reserved: row.reserved_delta,
      consumed: row.consumed_delta,
    }),
    balancesAfter: Object.freeze({
      available: row.available_after,
      reserved: row.reserved_after,
      consumed: row.consumed_after,
    }),
    originType: row.origin_type,
    originId: row.origin_id,
    fulfillmentEventId: row.fulfillment_event_id,
    stripeEnvironment: "test",
    livemode: false,
    createdAt: row.created_at,
  });
}

async function accountDetail(
  binding: D1Database,
  account: AccountRow,
  authority: SqlAuthorityCondition,
): Promise<CreditAccountDetailDTO> {
  const [lotResult, reservationResult, allocationResult, ledgerResult] =
    await Promise.all([
      binding
        .prepare(
          `SELECT lot.* FROM credit_grant_lots AS lot
           WHERE lot.credit_account_id = ?
             AND lot.stripe_environment = 'test' AND lot.livemode = 0
             AND ${authority.sql}
           ORDER BY lot.created_at ASC, lot.rowid ASC`,
        )
        .bind(account.id, ...authority.bindings)
        .all<LotRow>(),
      binding
        .prepare(
          `SELECT reservation.* FROM credit_reservations AS reservation
           WHERE reservation.credit_account_id = ?
             AND reservation.stripe_environment = 'test'
             AND reservation.livemode = 0
             AND ${authority.sql}
           ORDER BY reservation.created_at DESC, reservation.rowid DESC`,
        )
        .bind(account.id, ...authority.bindings)
        .all<ReservationRow>(),
      binding
        .prepare(
          `SELECT allocation.credit_reservation_id,
                  allocation.credit_grant_lot_id,
                  allocation.position, allocation.quantity
           FROM credit_reservation_allocations AS allocation
           JOIN credit_reservations AS reservation
             ON reservation.id = allocation.credit_reservation_id
           WHERE reservation.credit_account_id = ?
             AND ${authority.sql}
           ORDER BY allocation.credit_reservation_id, allocation.position`,
        )
        .bind(account.id, ...authority.bindings)
        .all<AllocationRow>(),
      binding
        .prepare(
          `SELECT ledger.* FROM credit_ledger_entries AS ledger
           WHERE ledger.credit_account_id = ?
             AND ledger.stripe_environment = 'test' AND ledger.livemode = 0
             AND ${authority.sql}
           ORDER BY ledger.created_at ASC, ledger.rowid ASC`,
        )
        .bind(account.id, ...authority.bindings)
        .all<LedgerRow>(),
    ]);

  const allocations = allocationResult.results ?? [];
  const reservations = Object.freeze(
    (reservationResult.results ?? []).map((row) =>
      Object.freeze({
        id: row.id,
        creditAccountId: row.credit_account_id,
        customerUserId: row.customer_user_id,
        creditKind: row.credit_kind,
        purposeType: row.purpose_type,
        purposeId: row.purpose_id,
        quantity: row.quantity,
        state: row.state,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        releasedAt: row.released_at,
        expiredAt: row.expired_at,
        reversedAt: row.reversed_at,
        requestId: row.request_id,
        revision: row.revision,
        stripeEnvironment: "test" as const,
        livemode: false as const,
        allocations: Object.freeze(
          allocations
            .filter(
              ({ credit_reservation_id }) => credit_reservation_id === row.id,
            )
            .map((allocation) =>
              Object.freeze({
                creditGrantLotId: allocation.credit_grant_lot_id,
                position: allocation.position,
                quantity: allocation.quantity,
              }),
            ),
        ),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
  );
  const ledger = Object.freeze((ledgerResult.results ?? []).map(mapLedger));
  const ledgerBalances = ledger.reduce<CreditBalances>(
    (balances, entry) =>
      Object.freeze({
        available: balances.available + entry.delta.available,
        reserved: balances.reserved + entry.delta.reserved,
        consumed: balances.consumed + entry.delta.consumed,
      }),
    Object.freeze({ available: 0, reserved: 0, consumed: 0 }),
  );
  const mappedAccount = mapAccount(account);

  return Object.freeze({
    account: mappedAccount,
    lots: Object.freeze((lotResult.results ?? []).map(mapLot)),
    reservations,
    ledger,
    ledgerBalances,
    balancesReconciled:
      mappedAccount.available === ledgerBalances.available &&
      mappedAccount.reserved === ledgerBalances.reserved &&
      mappedAccount.consumed === ledgerBalances.consumed,
  });
}

async function findAccount(
  binding: D1Database,
  whereSql: string,
  bindings: readonly string[],
  authority: SqlAuthorityCondition,
): Promise<AccountRow | null> {
  return binding
    .prepare(
      `SELECT id, customer_user_id, credit_kind, available_balance,
              reserved_balance, consumed_balance, revision,
              stripe_environment, livemode, created_at, updated_at
       FROM credit_accounts
       WHERE ${whereSql}
         AND stripe_environment = 'test' AND livemode = 0
         AND ${authority.sql}
       LIMIT 1`,
    )
    .bind(...bindings, ...authority.bindings)
    .first<AccountRow>();
}

export async function readCustomerCreditAccounts(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly CreditAccountDTO[]> {
  const actor = safeId(actorUserId, "actorUserId");
  const authority = activeCustomerCondition(actor);
  await requireAuthority(binding, authority, "customer");
  const result = await binding
    .prepare(
      `SELECT id, customer_user_id, credit_kind, available_balance,
              reserved_balance, consumed_balance, revision,
              stripe_environment, livemode, created_at, updated_at
       FROM credit_accounts
       WHERE customer_user_id = ?
         AND stripe_environment = 'test' AND livemode = 0
         AND ${authority.sql}
       ORDER BY credit_kind`,
    )
    .bind(actor, ...authority.bindings)
    .all<AccountRow>();
  return Object.freeze((result.results ?? []).map(mapAccount));
}

export async function readCustomerCreditAccountDetail(
  binding: D1Database,
  rawKind: unknown,
  actorUserId: string,
): Promise<CreditAccountDetailDTO | null> {
  const actor = safeId(actorUserId, "actorUserId");
  const kind = creditKind(rawKind);
  const authority = activeCustomerCondition(actor);
  await requireAuthority(binding, authority, "customer");
  const account = await findAccount(
    binding,
    "customer_user_id = ? AND credit_kind = ?",
    [actor, kind],
    authority,
  );
  return account ? accountDetail(binding, account, authority) : null;
}

export async function readOwnerCreditAccountDetail(
  binding: D1Database,
  rawAccountId: unknown,
  actorUserId: string,
): Promise<CreditAccountDetailDTO | null> {
  const accountId = safeId(rawAccountId, "creditAccountId");
  const actor = safeId(actorUserId, "actorUserId");
  const authority = activeOwnerCondition(actor);
  await requireAuthority(binding, authority, "owner");
  const account = await findAccount(binding, "id = ?", [accountId], authority);
  return account ? accountDetail(binding, account, authority) : null;
}

export async function readOwnerCreditAccounts(
  binding: D1Database,
  actorUserId: string,
  rawCustomerUserId?: unknown,
): Promise<readonly CreditAccountDTO[]> {
  const actor = safeId(actorUserId, "actorUserId");
  const customerUserId =
    rawCustomerUserId === undefined
      ? null
      : safeId(rawCustomerUserId, "customerUserId");
  const authority = activeOwnerCondition(actor);
  await requireAuthority(binding, authority, "owner");
  const result = await binding
    .prepare(
      `SELECT id, customer_user_id, credit_kind, available_balance,
              reserved_balance, consumed_balance, revision,
              stripe_environment, livemode, created_at, updated_at
       FROM credit_accounts
       WHERE (? IS NULL OR customer_user_id = ?)
         AND stripe_environment = 'test' AND livemode = 0
         AND ${authority.sql}
       ORDER BY customer_user_id, credit_kind`,
    )
    .bind(customerUserId, customerUserId, ...authority.bindings)
    .all<AccountRow>();
  return Object.freeze((result.results ?? []).map(mapAccount));
}
