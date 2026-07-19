import { changedRows } from "./audit-events.ts";
import {
  activeCustomerCondition,
  activeOwnerCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
  type PreparedMutation,
} from "./mutation.ts";
import {
  applyCreditBalanceDelta,
  assertCreditReservationTransition,
  creditBalanceDelta,
  moveCreditLotQuantity,
  type CreditBalanceDelta,
  type CreditBalances,
  type CreditFulfillmentGrantContext,
  type CreditFulfillmentGuard,
  type CreditGrantInput,
  type CreditGrantReceipt,
  type CreditKind,
  type CreditLedgerEntryType,
  type CreditLedgerOrigin,
  type CreditLotAllocationDTO,
  type CreditLotExpirationReceipt,
  type CreditLotReversalReceipt,
  type CreditLotQuantities,
  type CreditLotState,
  type CreditReservationReceipt,
  type CreditReservationState,
  isPositiveCreditRevision,
  isSafeCreditId,
  validateCreditGrantInput,
  validateCreditReservationInput,
} from "@/lib/benefit-credits/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CountRow {
  count: number;
}

interface SqlCreditCondition {
  readonly sql: string;
  readonly bindings: readonly (null | number | string)[];
}

export interface LicenseRequestCreditAcquisitionGuard {
  readonly licenseRequestId: string;
}

/**
 * Server-owned facts that pin a download-credit consumption to the same
 * delivery-ready revision and future-dated entitlement prepared by the
 * redemption coordinator. Callers cannot provide arbitrary SQL.
 */
export interface DownloadCreditConsumptionGuard {
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly entitlementId: string;
  readonly entitlementSourceId: string;
  readonly entitlementPreparedOperationKey: string;
  readonly pendingEntitlementStartsAt: string;
}

interface AccountRow {
  id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  available_balance: number;
  reserved_balance: number;
  consumed_balance: number;
  revision: number;
}

interface LedgerSumsRow {
  available: number;
  reserved: number;
  consumed: number;
}

interface LotRow {
  id: string;
  credit_account_id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  quantity_granted: number;
  quantity_available: number;
  quantity_reserved: number;
  quantity_consumed: number;
  quantity_expired: number;
  quantity_reversed: number;
  state: CreditLotState;
  expires_at: string | null;
  revision: number;
}

interface ReservationRow {
  id: string;
  credit_account_id: string;
  customer_user_id: string;
  credit_kind: CreditKind;
  purpose_type: "download" | "license_request";
  purpose_id: string;
  request_id: string;
  quantity: number;
  state: CreditReservationState;
  expires_at: string;
  revision: number;
  account_revision: number;
  available_balance: number;
  reserved_balance: number;
  consumed_balance: number;
}

interface AllocationLotRow extends LotRow {
  allocation_id: string;
  position: number;
  allocation_quantity: number;
}

interface LotAccountRow extends LotRow {
  account_id: string;
  account_revision: number;
  available_balance: number;
  reserved_balance: number;
  consumed_balance: number;
}

const ACCOUNT_RECONCILIATION_SQL = `(credit_accounts.available_balance = COALESCE((
  SELECT SUM(entry.available_delta)
  FROM credit_ledger_entries AS entry
  WHERE entry.credit_account_id = credit_accounts.id
), 0)
AND credit_accounts.reserved_balance = COALESCE((
  SELECT SUM(entry.reserved_delta)
  FROM credit_ledger_entries AS entry
  WHERE entry.credit_account_id = credit_accounts.id
), 0)
AND credit_accounts.consumed_balance = COALESCE((
  SELECT SUM(entry.consumed_delta)
  FROM credit_ledger_entries AS entry
  WHERE entry.credit_account_id = credit_accounts.id
), 0))`;

const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;

function invalidInput(
  issues: readonly { field: string; message: string }[],
): RuntimeError {
  return new RuntimeError(
    "BENEFIT_CREDIT_INPUT_INVALID",
    "Credit input is invalid.",
    {
      status: 400,
      publicMessage: "Review the credit details and try again.",
      details: { issues },
    },
  );
}

function safeId(value: unknown, field: string): string {
  if (!isSafeCreditId(value)) {
    throw invalidInput([
      { field, message: `${field} must be a safe application identifier.` },
    ]);
  }
  return value;
}

function positiveRevision(value: unknown, field: string): number {
  if (!isPositiveCreditRevision(value)) {
    throw invalidInput([
      { field, message: `${field} must be a positive revision.` },
    ]);
  }
  return value;
}

function accountRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidInput([
      {
        field: "expectedAccountRevision",
        message: "expectedAccountRevision must be zero or a positive revision.",
      },
    ]);
  }
  return value as number;
}

function operationTime(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw invalidInput([
      { field: "now", message: "A valid operation time is required." },
    ]);
  }
  return value.toISOString();
}

function operationKey(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw invalidInput([
      { field, message: `${field} must be a safe stored operation key.` },
    ]);
  }
  return value;
}

function fulfillmentGrantContext(
  value: CreditFulfillmentGrantContext,
): CreditFulfillmentGrantContext {
  const operationId = safeId(value?.operationId, "operationId");
  const requestId = safeId(value?.requestId, "requestId");
  if (
    typeof value?.factsFingerprint !== "string" ||
    !SHA256_FINGERPRINT.test(value.factsFingerprint)
  ) {
    throw invalidInput([
      {
        field: "factsFingerprint",
        message: "factsFingerprint must be a lowercase SHA-256 digest.",
      },
    ]);
  }
  return Object.freeze({
    operationId,
    factsFingerprint: value.factsFingerprint,
    requestId,
  });
}

function trustedFulfillmentGuard(
  value: CreditFulfillmentGuard,
): SqlCreditCondition {
  const sql = typeof value?.sql === "string" ? value.sql.trim() : "";
  if (
    sql.length < 1 ||
    sql.length > 4_000 ||
    /\0|;|--|\/\*|\*\//.test(sql) ||
    !Array.isArray(value?.bindings) ||
    value.bindings.some(
      (binding) =>
        binding !== null &&
        typeof binding !== "string" &&
        (typeof binding !== "number" || !Number.isFinite(binding)),
    )
  ) {
    throw invalidInput([
      {
        field: "fulfillmentGuard",
        message:
          "fulfillmentGuard must be one parameter-bound trusted SQL predicate.",
      },
    ]);
  }
  return Object.freeze({
    sql: `(${sql})`,
    bindings: Object.freeze([...value.bindings]),
  });
}

function combineCreditConditions(
  ...conditions: readonly SqlCreditCondition[]
): SqlCreditCondition {
  return Object.freeze({
    sql: conditions.map(({ sql }) => `(${sql})`).join(" AND "),
    bindings: Object.freeze(
      conditions.flatMap(({ bindings }) => [...bindings]),
    ),
  });
}

function exactFulfillmentCondition(
  input: CreditGrantInput & { readonly fulfillmentEventId: string },
  context: CreditFulfillmentGrantContext,
  callerGuard: SqlCreditCondition,
): SqlCreditCondition {
  return combineCreditConditions(
    {
      sql: `EXISTS (
        SELECT 1 FROM fulfillment_events AS credit_fulfillment
        WHERE credit_fulfillment.id = ?
          AND credit_fulfillment.customer_user_id = ?
          AND credit_fulfillment.facts_fingerprint = ?
          AND credit_fulfillment.status IN ('processing', 'fulfilled')
          AND credit_fulfillment.stripe_environment = 'test'
          AND credit_fulfillment.livemode = 0
      )`,
      bindings: [
        input.fulfillmentEventId,
        input.customerUserId,
        context.factsFingerprint,
      ],
    },
    callerGuard,
  );
}

async function requireFulfillmentCondition(
  binding: D1Database,
  condition: SqlCreditCondition,
): Promise<void> {
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "BENEFIT_CREDIT_FULFILLMENT_REQUIRED",
    "The exact verified test fulfillment does not authorize this credit grant.",
    {
      status: 409,
      publicMessage: "The verified test fulfillment is not ready for credits.",
    },
  );
}

function accountBalances(row: AccountRow | ReservationRow): CreditBalances {
  return Object.freeze({
    available: row.available_balance,
    reserved: row.reserved_balance,
    consumed: row.consumed_balance,
  });
}

function lotQuantities(row: LotRow): CreditLotQuantities {
  return Object.freeze({
    granted: row.quantity_granted,
    available: row.quantity_available,
    reserved: row.quantity_reserved,
    consumed: row.quantity_consumed,
    expired: row.quantity_expired,
    reversed: row.quantity_reversed,
  });
}

async function requireAuthority(
  binding: D1Database,
  authority: SqlAuthorityCondition,
  code: "BENEFIT_CREDIT_OWNER_REQUIRED" | "BENEFIT_CREDIT_CUSTOMER_REQUIRED",
): Promise<void> {
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(code, "Live credit authority is required.", {
    status: 403,
    publicMessage:
      code === "BENEFIT_CREDIT_OWNER_REQUIRED"
        ? "Owner access is required for this credit operation."
        : "Customer access is required for this credit operation.",
  });
}

async function requireOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  return requireAuthority(
    binding,
    activeOwnerCondition(actorUserId),
    "BENEFIT_CREDIT_OWNER_REQUIRED",
  );
}

async function requireCustomer(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  return requireAuthority(
    binding,
    activeCustomerCondition(actorUserId),
    "BENEFIT_CREDIT_CUSTOMER_REQUIRED",
  );
}

async function requireTargetCustomer(
  binding: D1Database,
  customerUserId: string,
): Promise<void> {
  const authority = activeCustomerCondition(customerUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "BENEFIT_CREDIT_CUSTOMER_UNAVAILABLE",
    "Credits require a live customer authority record.",
    {
      status: 409,
      publicMessage: "Choose an active customer before changing credits.",
    },
  );
}

async function readAccount(
  binding: D1Database,
  customerUserId: string,
  creditKind: CreditKind,
): Promise<AccountRow | null> {
  return binding
    .prepare(
      `SELECT id, customer_user_id, credit_kind, available_balance,
              reserved_balance, consumed_balance, revision
       FROM credit_accounts
       WHERE customer_user_id = ? AND credit_kind = ?
         AND stripe_environment = 'test' AND livemode = 0
       LIMIT 1`,
    )
    .bind(customerUserId, creditKind)
    .first<AccountRow>();
}

async function readLedgerSums(
  binding: D1Database,
  creditAccountId: string,
): Promise<CreditBalances> {
  const row = await binding
    .prepare(
      `SELECT COALESCE(SUM(available_delta), 0) AS available,
              COALESCE(SUM(reserved_delta), 0) AS reserved,
              COALESCE(SUM(consumed_delta), 0) AS consumed
       FROM credit_ledger_entries
       WHERE credit_account_id = ?`,
    )
    .bind(creditAccountId)
    .first<LedgerSumsRow>();
  return Object.freeze({
    available: row?.available ?? 0,
    reserved: row?.reserved ?? 0,
    consumed: row?.consumed ?? 0,
  });
}

async function requireReconciledAccount(
  binding: D1Database,
  account: AccountRow | ReservationRow,
): Promise<void> {
  const cached = accountBalances(account);
  const ledger = await readLedgerSums(
    binding,
    "credit_account_id" in account ? account.credit_account_id : account.id,
  );
  if (
    cached.available === ledger.available &&
    cached.reserved === ledger.reserved &&
    cached.consumed === ledger.consumed
  ) {
    return;
  }
  throw new RuntimeError(
    "BENEFIT_CREDIT_BALANCE_MISMATCH",
    "Cached credit balances do not match the immutable ledger.",
    {
      status: 500,
      publicMessage:
        "Credit balances need reconciliation before this operation.",
    },
  );
}

function exactAccountCondition(input: {
  readonly accountId: string;
  readonly customerUserId: string;
  readonly creditKind: CreditKind;
  readonly revision: number;
  readonly balances: CreditBalances;
  readonly operationKey: string;
  readonly reconcile?: boolean;
}): { readonly sql: string; readonly bindings: readonly (number | string)[] } {
  return {
    sql: `EXISTS (
      SELECT 1 FROM credit_accounts
      WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
        AND revision = ? AND available_balance = ?
        AND reserved_balance = ? AND consumed_balance = ?
        AND last_operation_key = ?
        AND stripe_environment = 'test' AND livemode = 0
        ${input.reconcile ? `AND ${ACCOUNT_RECONCILIATION_SQL}` : ""}
    )`,
    bindings: [
      input.accountId,
      input.customerUserId,
      input.creditKind,
      input.revision,
      input.balances.available,
      input.balances.reserved,
      input.balances.consumed,
      input.operationKey,
    ],
  };
}

function prepareRequiredAuditEvent(
  binding: D1Database,
  input: {
    readonly actorUserId: string | null;
    readonly action: string;
    readonly subjectType: string;
    readonly subjectId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly requestId: string;
    readonly details?: Record<string, unknown>;
    readonly result: Record<string, unknown>;
  },
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, ?, CASE WHEN (${conditionSql}) THEN ? ELSE NULL END,
               ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      ...conditionBindings,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
    );
}

async function replayOrStale<T>(
  binding: D1Database,
  mutation: PreparedMutation<T>,
  error: unknown,
  subject: string,
): Promise<MutationResult<T>> {
  try {
    return await replayAfterMutationFailure(binding, mutation, error);
  } catch (replayError) {
    if (replayError === error) throw staleMutation(subject);
    throw replayError;
  }
}

function prepareLedgerEntry(
  binding: D1Database,
  input: {
    readonly id: string;
    readonly accountId: string;
    readonly customerUserId: string;
    readonly creditKind: CreditKind;
    readonly lotId: string | null;
    readonly reservationId: string | null;
    readonly entryType: CreditLedgerEntryType;
    readonly delta: CreditBalanceDelta;
    readonly after: CreditBalances;
    readonly originType: CreditLedgerOrigin;
    readonly originId: string;
    readonly fulfillmentEventId: string | null;
    readonly idempotencyKey: string;
    readonly condition: {
      sql: string;
      bindings: readonly (null | number | string)[];
    };
  },
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO credit_ledger_entries
        (id, credit_account_id, customer_user_id, credit_kind,
         credit_grant_lot_id, credit_reservation_id, entry_type,
         available_delta, reserved_delta, consumed_delta,
         available_after, reserved_after, consumed_after,
         origin_type, origin_id, fulfillment_event_id,
         stripe_environment, livemode, idempotency_key)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', 0, ?
       WHERE ${input.condition.sql}`,
    )
    .bind(
      input.id,
      input.accountId,
      input.customerUserId,
      input.creditKind,
      input.lotId,
      input.reservationId,
      input.entryType,
      input.delta.available,
      input.delta.reserved,
      input.delta.consumed,
      input.after.available,
      input.after.reserved,
      input.after.consumed,
      input.originType,
      input.originId,
      input.fulfillmentEventId,
      input.idempotencyKey,
      ...input.condition.bindings,
    );
}

export async function grantCustomerCredits(
  binding: D1Database,
  rawInput: unknown,
  rawExpectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<CreditGrantReceipt>> {
  await requireOwner(binding, context.actorUserId);
  const validated = validateCreditGrantInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  await requireTargetCustomer(binding, input.customerUserId);
  const expectedAccountRevision = accountRevision(rawExpectedAccountRevision);
  const nowIso = operationTime(now);
  if (input.expiresAt !== null && input.expiresAt <= nowIso) {
    throw invalidInput([
      {
        field: "expiresAt",
        message: "expiresAt must be later than the grant time.",
      },
    ]);
  }

  const operation = "benefit-credit.grant";
  const mutation = await prepareMutation<CreditGrantReceipt>(
    binding,
    operation,
    context,
    { ...input, expectedAccountRevision },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };

  return executeCreditGrant(binding, input, expectedAccountRevision, nowIso, {
    operation,
    mutation,
    grantAuthority: activeOwnerCondition(context.actorUserId),
    auditActorUserId: context.actorUserId,
    requestId: context.requestId,
    auditDetails: {
      creditKind: input.creditKind,
      quantity: input.quantity,
      source: "owner",
    },
  });
}

/**
 * Projects a verified Stripe Test fulfillment into the shared credit ledger.
 * This is a server-internal boundary: the repository independently requires
 * the exact fulfillment event and also applies the caller's trusted SQL guard
 * inside every statement in the atomic D1 batch.
 */
export async function grantFulfillmentCredits(
  binding: D1Database,
  rawInput: unknown,
  rawExpectedAccountRevision: unknown,
  rawContext: CreditFulfillmentGrantContext,
  rawGuard: CreditFulfillmentGuard,
  now = new Date(),
): Promise<MutationResult<CreditGrantReceipt>> {
  const validated = validateCreditGrantInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  if (
    input.fulfillmentEventId === null ||
    !["order", "membership", "subscription"].includes(input.originType)
  ) {
    throw invalidInput([
      {
        field: "originType",
        message:
          "Fulfillment credit grants require order, membership, or subscription origin and a fulfillmentEventId.",
      },
    ]);
  }
  const fulfillmentInput = input as CreditGrantInput & {
    readonly fulfillmentEventId: string;
  };
  const context = fulfillmentGrantContext(rawContext);
  const callerGuard = trustedFulfillmentGuard(rawGuard);
  const expectedAccountRevision = accountRevision(rawExpectedAccountRevision);
  const nowIso = operationTime(now);
  if (input.expiresAt !== null && input.expiresAt <= nowIso) {
    throw invalidInput([
      {
        field: "expiresAt",
        message: "expiresAt must be later than the grant time.",
      },
    ]);
  }
  await requireTargetCustomer(binding, input.customerUserId);
  const grantAuthority = exactFulfillmentCondition(
    fulfillmentInput,
    context,
    callerGuard,
  );
  await requireFulfillmentCondition(binding, grantAuthority);

  const operation = "benefit-credit.fulfillment.grant";
  const mutationContext: MutationContext = {
    actorUserId: fulfillmentInput.fulfillmentEventId,
    idempotencyKey: context.operationId,
    requestId: context.requestId,
  };
  const mutation = await prepareMutation<CreditGrantReceipt>(
    binding,
    operation,
    mutationContext,
    {
      ...input,
      expectedAccountRevision,
      operationId: context.operationId,
      factsFingerprint: context.factsFingerprint,
      fulfillmentGuard: callerGuard,
    },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };

  return executeCreditGrant(binding, input, expectedAccountRevision, nowIso, {
    operation,
    mutation,
    grantAuthority,
    auditActorUserId: null,
    requestId: context.requestId,
    auditDetails: {
      creditKind: input.creditKind,
      quantity: input.quantity,
      source: "stripe_test_fulfillment",
      fulfillmentEventId: fulfillmentInput.fulfillmentEventId,
      factsFingerprint: context.factsFingerprint,
    },
  });
}

async function executeCreditGrant(
  binding: D1Database,
  input: CreditGrantInput,
  expectedAccountRevision: number,
  nowIso: string,
  execution: Readonly<{
    operation: string;
    mutation: PreparedMutation<CreditGrantReceipt>;
    grantAuthority: SqlCreditCondition;
    auditActorUserId: string | null;
    requestId: string;
    auditDetails: Record<string, unknown>;
  }>,
): Promise<MutationResult<CreditGrantReceipt>> {
  const { grantAuthority, mutation } = execution;

  const existing = await readAccount(
    binding,
    input.customerUserId,
    input.creditKind,
  );
  if (
    (existing === null && expectedAccountRevision !== 0) ||
    (existing !== null && existing.revision !== expectedAccountRevision)
  ) {
    throw staleMutation("credit account");
  }
  if (existing) await requireReconciledAccount(binding, existing);

  const duplicateOrigin = existing
    ? await binding
        .prepare(
          `SELECT COUNT(*) AS count FROM credit_grant_lots
           WHERE credit_account_id = ? AND origin_type = ? AND origin_id = ?`,
        )
        .bind(existing.id, input.originType, input.originId)
        .first<CountRow>()
    : null;
  if ((duplicateOrigin?.count ?? 0) > 0) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_GRANT_EXISTS",
      "That origin already created a credit grant.",
      { status: 409, publicMessage: "That credit grant already exists." },
    );
  }

  const accountId = existing?.id ?? `credit_account_${crypto.randomUUID()}`;
  const lotId = `credit_lot_${crypto.randomUUID()}`;
  const ledgerId = `credit_entry_${crypto.randomUUID()}`;
  const before = existing
    ? accountBalances(existing)
    : { available: 0, reserved: 0, consumed: 0 };
  const delta = creditBalanceDelta("grant", input.quantity);
  const after = applyCreditBalanceDelta(before, delta);
  const nextAccountRevision = existing ? existing.revision + 1 : 1;
  const result: CreditGrantReceipt = Object.freeze({
    creditAccountId: accountId,
    creditGrantLotId: lotId,
    creditLedgerEntryId: ledgerId,
    customerUserId: input.customerUserId,
    creditKind: input.creditKind,
    quantity: input.quantity,
    accountRevision: nextAccountRevision,
    balances: after,
    stripeEnvironment: "test",
    livemode: false,
  });
  const customer = activeCustomerCondition(input.customerUserId);
  const statements: D1PreparedStatement[] = [];

  if (existing) {
    statements.push(
      binding
        .prepare(
          `UPDATE credit_accounts
           SET available_balance = ?, reserved_balance = ?, consumed_balance = ?,
               revision = revision + 1, last_operation_key = ?, updated_at = ?
           WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
             AND revision = ? AND available_balance = ?
             AND reserved_balance = ? AND consumed_balance = ?
             AND stripe_environment = 'test' AND livemode = 0
             AND ${ACCOUNT_RECONCILIATION_SQL}
             AND ${grantAuthority.sql} AND ${customer.sql}`,
        )
        .bind(
          after.available,
          after.reserved,
          after.consumed,
          mutation.namespacedKey,
          nowIso,
          accountId,
          input.customerUserId,
          input.creditKind,
          existing.revision,
          before.available,
          before.reserved,
          before.consumed,
          ...grantAuthority.bindings,
          ...customer.bindings,
        ),
    );
  } else {
    statements.push(
      binding
        .prepare(
          `INSERT INTO credit_accounts
            (id, customer_user_id, credit_kind, available_balance,
             reserved_balance, consumed_balance, stripe_environment, livemode,
             revision, last_operation_key, created_at, updated_at)
           SELECT ?, ?, ?, ?, 0, 0, 'test', 0, 1, ?, ?, ?
           WHERE ${grantAuthority.sql} AND ${customer.sql}
             AND NOT EXISTS (
               SELECT 1 FROM credit_accounts
               WHERE customer_user_id = ? AND credit_kind = ?
             )`,
        )
        .bind(
          accountId,
          input.customerUserId,
          input.creditKind,
          input.quantity,
          mutation.namespacedKey,
          nowIso,
          nowIso,
          ...grantAuthority.bindings,
          ...customer.bindings,
          input.customerUserId,
          input.creditKind,
        ),
    );
  }

  const exactAccount = exactAccountCondition({
    accountId,
    customerUserId: input.customerUserId,
    creditKind: input.creditKind,
    revision: nextAccountRevision,
    balances: after,
    operationKey: mutation.namespacedKey,
  });
  statements.push(
    binding
      .prepare(
        `INSERT INTO credit_grant_lots
          (id, credit_account_id, customer_user_id, credit_kind,
           origin_type, origin_id, quantity_granted, quantity_available,
           quantity_reserved, quantity_consumed, quantity_expired,
           quantity_reversed, state, expires_at, fulfillment_event_id,
           stripe_environment, livemode, revision, last_operation_key,
           created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'active', ?, ?,
                'test', 0, 1, ?, ?, ?
         WHERE ${exactAccount.sql} AND ${grantAuthority.sql} AND ${customer.sql}`,
      )
      .bind(
        lotId,
        accountId,
        input.customerUserId,
        input.creditKind,
        input.originType,
        input.originId,
        input.quantity,
        input.quantity,
        input.expiresAt,
        input.fulfillmentEventId,
        mutation.namespacedKey,
        nowIso,
        nowIso,
        ...exactAccount.bindings,
        ...grantAuthority.bindings,
        ...customer.bindings,
      ),
  );
  statements.push(
    prepareLedgerEntry(binding, {
      id: ledgerId,
      accountId,
      customerUserId: input.customerUserId,
      creditKind: input.creditKind,
      lotId,
      reservationId: null,
      entryType: "grant",
      delta,
      after,
      originType:
        input.originType === "reversal" ? "reversal" : input.originType,
      originId: input.originId,
      fulfillmentEventId: input.fulfillmentEventId,
      idempotencyKey: `${mutation.namespacedKey}:ledger`,
      condition: {
        sql: `${exactAccount.sql} AND EXISTS (
          SELECT 1 FROM credit_grant_lots
          WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
            AND quantity_granted = ? AND quantity_available = ?
            AND state = 'active' AND revision = 1
            AND last_operation_key = ? AND fulfillment_event_id IS ?
        ) AND ${grantAuthority.sql} AND ${customer.sql}`,
        bindings: [
          ...exactAccount.bindings,
          lotId,
          accountId,
          input.customerUserId,
          input.quantity,
          input.quantity,
          mutation.namespacedKey,
          input.fulfillmentEventId,
          ...grantAuthority.bindings,
          ...customer.bindings,
        ],
      },
    }),
  );

  const finalAccount = exactAccountCondition({
    accountId,
    customerUserId: input.customerUserId,
    creditKind: input.creditKind,
    revision: nextAccountRevision,
    balances: after,
    operationKey: mutation.namespacedKey,
    reconcile: true,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: execution.auditActorUserId,
        action: execution.operation,
        subjectType: "credit-grant-lot",
        subjectId: lotId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: execution.requestId,
        details: execution.auditDetails,
        result: { ...result },
      },
      `${finalAccount.sql}
       AND EXISTS (
         SELECT 1 FROM credit_grant_lots
         WHERE id = ? AND credit_account_id = ? AND revision = 1
           AND last_operation_key = ? AND fulfillment_event_id IS ?
       )
       AND EXISTS (
         SELECT 1 FROM credit_ledger_entries
         WHERE id = ? AND credit_account_id = ?
           AND idempotency_key = ? AND fulfillment_event_id IS ?
       )
       AND ${grantAuthority.sql} AND ${customer.sql}`,
      [
        ...finalAccount.bindings,
        lotId,
        accountId,
        mutation.namespacedKey,
        input.fulfillmentEventId,
        ledgerId,
        accountId,
        `${mutation.namespacedKey}:ledger`,
        input.fulfillmentEventId,
        ...grantAuthority.bindings,
        ...customer.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("credit account");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "credit account");
  }
}

async function readReservation(
  binding: D1Database,
  reservationId: string,
): Promise<ReservationRow | null> {
  return binding
    .prepare(
      `SELECT reservation.id, reservation.credit_account_id,
              reservation.customer_user_id, reservation.credit_kind,
              reservation.purpose_type, reservation.purpose_id,
              reservation.request_id, reservation.quantity, reservation.state,
              reservation.expires_at, reservation.revision,
              account.revision AS account_revision,
              account.available_balance, account.reserved_balance,
              account.consumed_balance
       FROM credit_reservations AS reservation
       JOIN credit_accounts AS account
         ON account.id = reservation.credit_account_id
        AND account.customer_user_id = reservation.customer_user_id
        AND account.credit_kind = reservation.credit_kind
       WHERE reservation.id = ?
         AND reservation.stripe_environment = 'test' AND reservation.livemode = 0
         AND account.stripe_environment = 'test' AND account.livemode = 0
       LIMIT 1`,
    )
    .bind(reservationId)
    .first<ReservationRow>();
}

async function readAllocationLots(
  binding: D1Database,
  reservationId: string,
): Promise<readonly AllocationLotRow[]> {
  const result = await binding
    .prepare(
      `SELECT allocation.id AS allocation_id, allocation.position,
              allocation.quantity AS allocation_quantity,
              lot.id, lot.credit_account_id, lot.customer_user_id,
              lot.credit_kind, lot.quantity_granted, lot.quantity_available,
              lot.quantity_reserved, lot.quantity_consumed,
              lot.quantity_expired, lot.quantity_reversed, lot.state,
              lot.expires_at, lot.revision
       FROM credit_reservation_allocations AS allocation
       JOIN credit_grant_lots AS lot
         ON lot.id = allocation.credit_grant_lot_id
       WHERE allocation.credit_reservation_id = ?
         AND lot.stripe_environment = 'test' AND lot.livemode = 0
       ORDER BY allocation.position ASC`,
    )
    .bind(reservationId)
    .all<AllocationLotRow>();
  return Object.freeze(result.results ?? []);
}

async function readAvailableLots(
  binding: D1Database,
  accountId: string,
  nowIso: string,
): Promise<readonly LotRow[]> {
  const result = await binding
    .prepare(
      `SELECT id, credit_account_id, customer_user_id, credit_kind,
              quantity_granted, quantity_available, quantity_reserved,
              quantity_consumed, quantity_expired, quantity_reversed,
              state, expires_at, revision
       FROM credit_grant_lots
       WHERE credit_account_id = ? AND state = 'active'
         AND quantity_available > 0
         AND (expires_at IS NULL OR expires_at > ?)
         AND stripe_environment = 'test' AND livemode = 0
       ORDER BY created_at ASC, rowid ASC`,
    )
    .bind(accountId, nowIso)
    .all<LotRow>();
  return Object.freeze(result.results ?? []);
}

function allocateLots(
  lots: readonly LotRow[],
  quantity: number,
): readonly (CreditLotAllocationDTO & { readonly lot: LotRow })[] {
  let remaining = quantity;
  const allocations: (CreditLotAllocationDTO & { readonly lot: LotRow })[] = [];
  for (const lot of lots) {
    if (remaining === 0) break;
    const allocated = Math.min(remaining, lot.quantity_available);
    if (allocated > 0) {
      allocations.push(
        Object.freeze({
          creditGrantLotId: lot.id,
          position: allocations.length + 1,
          quantity: allocated,
          lot,
        }),
      );
      remaining -= allocated;
    }
  }
  if (remaining > 0) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_INSUFFICIENT",
      "The credit account has insufficient unexpired available lots.",
      { status: 409, publicMessage: "There are not enough available credits." },
    );
  }
  return Object.freeze(allocations);
}

export async function reserveCustomerCredits(
  binding: D1Database,
  rawInput: unknown,
  rawExpectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
  licenseRequestGuard: LicenseRequestCreditAcquisitionGuard | null = null,
): Promise<MutationResult<CreditReservationReceipt>> {
  await requireCustomer(binding, context.actorUserId);
  const validated = validateCreditReservationInput(rawInput);
  if (!validated.ok) throw invalidInput(validated.issues);
  const input = validated.value;
  if (
    licenseRequestGuard !== null &&
    (input.creditKind !== "license" ||
      input.purposeType !== "license_request" ||
      input.purposeId !== licenseRequestGuard.licenseRequestId)
  ) {
    throw invalidInput([
      {
        field: "purposeId",
        message:
          "The exclusive license-request guard must match a license-credit reservation purpose.",
      },
    ]);
  }
  const expectedAccountRevision = positiveRevision(
    rawExpectedAccountRevision,
    "expectedAccountRevision",
  );
  const nowIso = operationTime(now);
  if (input.expiresAt <= nowIso) {
    throw invalidInput([
      {
        field: "expiresAt",
        message: "expiresAt must be later than the reservation time.",
      },
    ]);
  }

  const operation = "benefit-credit.reserve";
  const mutation = await prepareMutation<CreditReservationReceipt>(
    binding,
    operation,
    context,
    { ...input, expectedAccountRevision },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };

  const account = await readAccount(
    binding,
    context.actorUserId,
    input.creditKind,
  );
  if (!account) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_ACCOUNT_NOT_FOUND",
      "Credit account not found.",
      {
        status: 404,
        publicMessage: "No credit account is available for this credit type.",
      },
    );
  }
  if (account.revision !== expectedAccountRevision)
    throw staleMutation("credit account");
  await requireReconciledAccount(binding, account);

  const collision = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM credit_reservations
       WHERE request_id = ?
          OR (credit_account_id = ? AND purpose_type = ? AND purpose_id = ?)`,
    )
    .bind(input.requestId, account.id, input.purposeType, input.purposeId)
    .first<CountRow>();
  if ((collision?.count ?? 0) > 0) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_RESERVATION_CONFLICT",
      "The request or exact purpose is already bound to a reservation.",
      {
        status: 409,
        publicMessage: "That credit purpose already has a reservation.",
      },
    );
  }
  if (account.available_balance < input.quantity) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_INSUFFICIENT",
      "The credit account has insufficient available balance.",
      { status: 409, publicMessage: "There are not enough available credits." },
    );
  }

  const lots = await readAvailableLots(binding, account.id, nowIso);
  const allocations = allocateLots(lots, input.quantity);
  const reservationId = `credit_reservation_${crypto.randomUUID()}`;
  const ledgerId = `credit_entry_${crypto.randomUUID()}`;
  const before = accountBalances(account);
  const delta = creditBalanceDelta("reservation", input.quantity);
  const after = applyCreditBalanceDelta(before, delta);
  const resultAllocations = Object.freeze(
    allocations.map(({ creditGrantLotId, position, quantity }) =>
      Object.freeze({ creditGrantLotId, position, quantity }),
    ),
  );
  const result: CreditReservationReceipt = Object.freeze({
    creditAccountId: account.id,
    creditReservationId: reservationId,
    creditLedgerEntryId: ledgerId,
    customerUserId: context.actorUserId,
    creditKind: input.creditKind,
    purposeType: input.purposeType,
    purposeId: input.purposeId,
    requestId: input.requestId,
    quantity: input.quantity,
    state: "reserved",
    reservationRevision: 1,
    accountRevision: account.revision + 1,
    balances: after,
    allocations: resultAllocations,
    stripeEnvironment: "test",
    livemode: false,
  });
  const acquisitionGuard: SqlCreditCondition =
    licenseRequestGuard === null
      ? Object.freeze({ sql: "1 = 1", bindings: Object.freeze([]) })
      : Object.freeze({
          sql: `EXISTS (
            SELECT 1
            FROM license_requests AS guarded_request
            WHERE guarded_request.id = ?
              AND guarded_request.customer_user_id = ?
              AND guarded_request.state IN ('submitted', 'approved')
              AND guarded_request.stripe_environment = 'test'
              AND guarded_request.livemode = 0
              AND NOT EXISTS (
                SELECT 1
                FROM issued_licenses
                WHERE license_request_id = guarded_request.id
                  AND customer_user_id = guarded_request.customer_user_id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM checkout_sessions
                WHERE license_request_id = guarded_request.id
                  AND status IN ('creating', 'open', 'completed')
                  AND stripe_environment = 'test' AND livemode = 0
              )
          )`,
          bindings: Object.freeze([
            licenseRequestGuard.licenseRequestId,
            context.actorUserId,
          ]),
        });
  const customer = activeCustomerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE credit_accounts
         SET available_balance = ?, reserved_balance = ?, consumed_balance = ?,
             revision = revision + 1, last_operation_key = ?, updated_at = ?
         WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
           AND revision = ? AND available_balance = ?
           AND reserved_balance = ? AND consumed_balance = ?
           AND available_balance >= ?
           AND stripe_environment = 'test' AND livemode = 0
           AND ${ACCOUNT_RECONCILIATION_SQL}
           AND ${customer.sql}
           AND ${acquisitionGuard.sql}`,
      )
      .bind(
        after.available,
        after.reserved,
        after.consumed,
        mutation.namespacedKey,
        nowIso,
        account.id,
        context.actorUserId,
        input.creditKind,
        account.revision,
        before.available,
        before.reserved,
        before.consumed,
        input.quantity,
        ...customer.bindings,
        ...acquisitionGuard.bindings,
      ),
  ];
  const exactAccount = exactAccountCondition({
    accountId: account.id,
    customerUserId: context.actorUserId,
    creditKind: input.creditKind,
    revision: account.revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
  });
  statements.push(
    binding
      .prepare(
        `INSERT INTO credit_reservations
          (id, credit_account_id, customer_user_id, credit_kind,
           purpose_type, purpose_id, quantity, state, expires_at, request_id,
           stripe_environment, livemode, revision, last_operation_key,
           created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, 'test', 0, 1, ?, ?, ?
         WHERE ${exactAccount.sql} AND ${customer.sql}
           AND ${acquisitionGuard.sql}
           AND NOT EXISTS (SELECT 1 FROM credit_reservations WHERE request_id = ?)
           AND NOT EXISTS (
             SELECT 1 FROM credit_reservations
             WHERE credit_account_id = ? AND purpose_type = ? AND purpose_id = ?
           )`,
      )
      .bind(
        reservationId,
        account.id,
        context.actorUserId,
        input.creditKind,
        input.purposeType,
        input.purposeId,
        input.quantity,
        input.expiresAt,
        input.requestId,
        mutation.namespacedKey,
        nowIso,
        nowIso,
        ...exactAccount.bindings,
        ...customer.bindings,
        ...acquisitionGuard.bindings,
        input.requestId,
        account.id,
        input.purposeType,
        input.purposeId,
      ),
  );

  const projectedLots = allocations.map((allocation) => ({
    allocation,
    operationKey: `${mutation.namespacedKey}:lot:${allocation.position}`,
    projected: moveCreditLotQuantity(
      lotQuantities(allocation.lot),
      "reservation",
      allocation.quantity,
    ),
  }));
  for (const { allocation, operationKey, projected } of projectedLots) {
    statements.push(
      binding
        .prepare(
          `UPDATE credit_grant_lots
           SET quantity_available = ?, quantity_reserved = ?,
               quantity_consumed = ?, quantity_expired = ?,
               quantity_reversed = ?, state = ?, revision = revision + 1,
               last_operation_key = ?, updated_at = ?
           WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
             AND credit_kind = ? AND revision = ? AND state = 'active'
             AND quantity_available = ? AND quantity_reserved = ?
             AND quantity_consumed = ? AND quantity_expired = ?
             AND quantity_reversed = ? AND quantity_available >= ?
             AND (expires_at IS NULL OR expires_at > ?)
             AND stripe_environment = 'test' AND livemode = 0
             AND ${exactAccount.sql} AND ${customer.sql}
             AND ${acquisitionGuard.sql}`,
        )
        .bind(
          projected.quantities.available,
          projected.quantities.reserved,
          projected.quantities.consumed,
          projected.quantities.expired,
          projected.quantities.reversed,
          projected.state,
          operationKey,
          nowIso,
          allocation.lot.id,
          account.id,
          context.actorUserId,
          input.creditKind,
          allocation.lot.revision,
          allocation.lot.quantity_available,
          allocation.lot.quantity_reserved,
          allocation.lot.quantity_consumed,
          allocation.lot.quantity_expired,
          allocation.lot.quantity_reversed,
          allocation.quantity,
          nowIso,
          ...exactAccount.bindings,
          ...customer.bindings,
          ...acquisitionGuard.bindings,
        ),
    );
    statements.push(
      binding
        .prepare(
          `INSERT INTO credit_reservation_allocations
            (id, credit_reservation_id, credit_grant_lot_id, position, quantity,
             created_at)
           SELECT ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM credit_reservations
             WHERE id = ? AND credit_account_id = ? AND revision = 1
               AND last_operation_key = ?
           )
             AND EXISTS (
               SELECT 1 FROM credit_grant_lots
               WHERE id = ? AND revision = ? AND last_operation_key = ?
             )
             AND ${customer.sql}
             AND ${acquisitionGuard.sql}`,
        )
        .bind(
          `credit_allocation_${crypto.randomUUID()}`,
          reservationId,
          allocation.lot.id,
          allocation.position,
          allocation.quantity,
          nowIso,
          reservationId,
          account.id,
          mutation.namespacedKey,
          allocation.lot.id,
          allocation.lot.revision + 1,
          operationKey,
          ...customer.bindings,
          ...acquisitionGuard.bindings,
        ),
    );
  }

  statements.push(
    prepareLedgerEntry(binding, {
      id: ledgerId,
      accountId: account.id,
      customerUserId: context.actorUserId,
      creditKind: input.creditKind,
      lotId: null,
      reservationId,
      entryType: "reservation",
      delta,
      after,
      originType: input.creditKind === "download" ? "download" : "license",
      originId: input.purposeId,
      fulfillmentEventId: null,
      idempotencyKey: `${mutation.namespacedKey}:ledger`,
      condition: {
        sql: `${exactAccount.sql}
          AND EXISTS (
            SELECT 1 FROM credit_reservations
            WHERE id = ? AND credit_account_id = ? AND revision = 1
              AND last_operation_key = ?
          )
          AND (SELECT COALESCE(SUM(quantity), 0)
               FROM credit_reservation_allocations
               WHERE credit_reservation_id = ?) = ?
          AND ${customer.sql}
          AND ${acquisitionGuard.sql}`,
        bindings: [
          ...exactAccount.bindings,
          reservationId,
          account.id,
          mutation.namespacedKey,
          reservationId,
          input.quantity,
          ...customer.bindings,
          ...acquisitionGuard.bindings,
        ],
      },
    }),
  );

  const finalAccount = exactAccountCondition({
    accountId: account.id,
    customerUserId: context.actorUserId,
    creditKind: input.creditKind,
    revision: account.revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
    reconcile: true,
  });
  const lotConditions = projectedLots.map(
    () => `EXISTS (SELECT 1 FROM credit_grant_lots
       WHERE id = ? AND revision = ? AND quantity_available = ?
         AND quantity_reserved = ? AND quantity_consumed = ?
         AND last_operation_key = ?)`,
  );
  const lotConditionBindings = projectedLots.flatMap(
    ({ allocation, operationKey, projected }) => [
      allocation.lot.id,
      allocation.lot.revision + 1,
      projected.quantities.available,
      projected.quantities.reserved,
      projected.quantities.consumed,
      operationKey,
    ],
  );
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "credit-reservation",
        subjectId: reservationId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          creditKind: input.creditKind,
          purposeType: input.purposeType,
          purposeId: input.purposeId,
          quantity: input.quantity,
        },
        result: { ...result },
      },
      `${finalAccount.sql}
       AND EXISTS (
         SELECT 1 FROM credit_reservations
         WHERE id = ? AND request_id = ? AND purpose_type = ? AND purpose_id = ?
           AND revision = 1 AND last_operation_key = ?
       )
       AND (SELECT COALESCE(SUM(quantity), 0)
            FROM credit_reservation_allocations
            WHERE credit_reservation_id = ?) = ?
       AND EXISTS (SELECT 1 FROM credit_ledger_entries WHERE id = ?)
       AND ${lotConditions.join(" AND ")}
       AND ${customer.sql}
       AND ${acquisitionGuard.sql}`,
      [
        ...finalAccount.bindings,
        reservationId,
        input.requestId,
        input.purposeType,
        input.purposeId,
        mutation.namespacedKey,
        reservationId,
        input.quantity,
        ledgerId,
        ...lotConditionBindings,
        ...customer.bindings,
        ...acquisitionGuard.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("credit account");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "credit account");
  }
}

type ReservationTransition = "consume" | "release" | "expire" | "reverse";

function exactDownloadConsumptionCondition(
  rawGuard: DownloadCreditConsumptionGuard | null,
  reservation: ReservationRow,
): SqlCreditCondition {
  if (rawGuard === null) {
    return Object.freeze({ sql: "1 = 1", bindings: Object.freeze([]) });
  }

  const guard = Object.freeze({
    trackId: safeId(rawGuard.trackId, "downloadConsumptionGuard.trackId"),
    trackRevisionId: safeId(
      rawGuard.trackRevisionId,
      "downloadConsumptionGuard.trackRevisionId",
    ),
    entitlementId: safeId(
      rawGuard.entitlementId,
      "downloadConsumptionGuard.entitlementId",
    ),
    entitlementSourceId: safeId(
      rawGuard.entitlementSourceId,
      "downloadConsumptionGuard.entitlementSourceId",
    ),
    entitlementPreparedOperationKey: operationKey(
      rawGuard.entitlementPreparedOperationKey,
      "downloadConsumptionGuard.entitlementPreparedOperationKey",
    ),
    pendingEntitlementStartsAt: operationKey(
      rawGuard.pendingEntitlementStartsAt,
      "downloadConsumptionGuard.pendingEntitlementStartsAt",
    ),
  });
  if (
    reservation.credit_kind !== "download" ||
    reservation.purpose_type !== "download" ||
    reservation.purpose_id !== guard.trackId
  ) {
    throw invalidInput([
      {
        field: "downloadConsumptionGuard.trackId",
        message:
          "The delivery guard must match the exact download-credit reservation.",
      },
    ]);
  }

  return Object.freeze({
    sql: `EXISTS (
      SELECT 1 FROM artist_modules
      WHERE module_key = 'downloads' AND active = 1
    )
    AND EXISTS (
      SELECT 1
      FROM tracks AS guarded_track
      JOIN track_revisions AS guarded_revision
        ON guarded_revision.id = guarded_track.published_revision_id
       AND guarded_revision.track_id = guarded_track.id
      JOIN media_derivatives AS guarded_derivative
        ON guarded_derivative.id = guarded_revision.download_derivative_id
       AND guarded_derivative.source_media_id = guarded_revision.original_media_id
      JOIN media_objects AS guarded_source
        ON guarded_source.id = guarded_derivative.source_media_id
      WHERE guarded_track.id = ?
        AND guarded_track.publication_state = 'published'
        AND guarded_revision.id = ?
        AND guarded_revision.download_mode = 'protected'
        AND guarded_derivative.kind = 'download'
        AND guarded_derivative.status = 'ready'
        AND guarded_derivative.approval_state = 'approved'
        AND guarded_derivative.object_key GLOB 'derivatives/*'
        AND guarded_derivative.content_type LIKE 'audio/%'
        AND guarded_derivative.format IS NOT NULL
        AND guarded_derivative.byte_length IS NOT NULL
        AND guarded_derivative.content_sha256 IS NOT NULL
        AND guarded_source.kind = 'audio'
        AND guarded_source.status = 'ready'
        AND guarded_source.approval_state = 'approved'
        AND guarded_source.content_type LIKE 'audio/%'
        AND guarded_source.content_sha256 IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM entitlements AS guarded_entitlement
      WHERE guarded_entitlement.id = ?
        AND guarded_entitlement.user_id = ?
        AND guarded_entitlement.source_type = 'credit'
        AND guarded_entitlement.source_id = ?
        AND guarded_entitlement.resource_type = 'track'
        AND guarded_entitlement.resource_id = ?
        AND guarded_entitlement.actions_json = '["download"]'
        AND guarded_entitlement.state = 'active'
        AND guarded_entitlement.starts_at = ?
        AND guarded_entitlement.expires_at IS NULL
        AND guarded_entitlement.remaining_uses IS NULL
        AND guarded_entitlement.download_disposition = 'attachment'
        AND guarded_entitlement.stripe_environment = 'test'
        AND guarded_entitlement.livemode = 0
        AND guarded_entitlement.fulfillment_event_id IS NULL
        AND guarded_entitlement.credit_reservation_id IS NULL
        AND guarded_entitlement.revision = 1
        AND guarded_entitlement.last_operation_key = ?
    )`,
    bindings: Object.freeze([
      guard.trackId,
      guard.trackRevisionId,
      guard.entitlementId,
      reservation.customer_user_id,
      guard.entitlementSourceId,
      guard.trackId,
      guard.pendingEntitlementStartsAt,
      guard.entitlementPreparedOperationKey,
    ]),
  });
}

const TRANSITIONS = Object.freeze({
  consume: {
    from: "reserved",
    to: "consumed",
    entryType: "consumption",
    movement: "consumption",
    timestampColumn: "consumed_at",
    originType: null,
    authority: "customer",
  },
  release: {
    from: "reserved",
    to: "released",
    entryType: "release",
    movement: "release",
    timestampColumn: "released_at",
    originType: null,
    authority: "customer",
  },
  expire: {
    from: "reserved",
    to: "expired",
    entryType: "release",
    movement: "release",
    timestampColumn: "expired_at",
    originType: "expiration",
    authority: "owner",
  },
  reverse: {
    from: "consumed",
    to: "reversed",
    entryType: "reversal",
    movement: "reversal",
    timestampColumn: "reversed_at",
    originType: "reversal",
    authority: "owner",
  },
} as const);

async function transitionReservation(
  binding: D1Database,
  rawReservationId: unknown,
  rawExpectedReservationRevision: unknown,
  rawExpectedAccountRevision: unknown,
  context: MutationContext,
  transition: ReservationTransition,
  now: Date,
  downloadConsumptionGuard: DownloadCreditConsumptionGuard | null = null,
): Promise<MutationResult<CreditReservationReceipt>> {
  const spec = TRANSITIONS[transition];
  if (spec.authority === "owner")
    await requireOwner(binding, context.actorUserId);
  else await requireCustomer(binding, context.actorUserId);
  const reservationId = safeId(rawReservationId, "reservationId");
  const expectedReservationRevision = positiveRevision(
    rawExpectedReservationRevision,
    "expectedReservationRevision",
  );
  const expectedAccountRevision = positiveRevision(
    rawExpectedAccountRevision,
    "expectedAccountRevision",
  );
  const nowIso = operationTime(now);
  const operation = `benefit-credit.${transition}`;
  const mutation = await prepareMutation<CreditReservationReceipt>(
    binding,
    operation,
    context,
    {
      reservationId,
      expectedReservationRevision,
      expectedAccountRevision,
      ...(downloadConsumptionGuard === null
        ? {}
        : { downloadConsumptionGuard }),
    },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };

  const reservation = await readReservation(binding, reservationId);
  if (!reservation) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_RESERVATION_NOT_FOUND",
      "Credit reservation not found.",
      { status: 404, publicMessage: "That credit reservation was not found." },
    );
  }
  if (
    spec.authority === "customer" &&
    reservation.customer_user_id !== context.actorUserId
  ) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_CUSTOMER_REQUIRED",
      "A customer can change only their own exact credit reservation.",
      {
        status: 403,
        publicMessage: "Customer access is required for this credit operation.",
      },
    );
  }
  if (
    reservation.revision !== expectedReservationRevision ||
    reservation.account_revision !== expectedAccountRevision
  ) {
    throw staleMutation("credit reservation");
  }
  if (reservation.state !== spec.from) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_RESERVATION_STATE_INVALID",
      "The credit reservation is not in the required state.",
      {
        status: 409,
        publicMessage: "That credit reservation cannot make this transition.",
      },
    );
  }
  if (downloadConsumptionGuard !== null && transition !== "consume") {
    throw invalidInput([
      {
        field: "downloadConsumptionGuard",
        message: "A download delivery guard applies only to consumption.",
      },
    ]);
  }
  const consumptionGuard = exactDownloadConsumptionCondition(
    downloadConsumptionGuard,
    reservation,
  );
  assertCreditReservationTransition(spec.from, spec.to);
  if (transition === "consume" && reservation.expires_at <= nowIso) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_RESERVATION_EXPIRED",
      "An expired reservation cannot be consumed.",
      { status: 409, publicMessage: "That credit reservation has expired." },
    );
  }
  if (transition === "expire" && reservation.expires_at > nowIso) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_RESERVATION_NOT_EXPIRED",
      "The credit reservation has not reached its expiration time.",
      {
        status: 409,
        publicMessage: "That credit reservation has not expired.",
      },
    );
  }
  await requireReconciledAccount(binding, reservation);

  const allocations = await readAllocationLots(binding, reservationId);
  if (
    allocations.length === 0 ||
    allocations.reduce(
      (sum, allocation) => sum + allocation.allocation_quantity,
      0,
    ) !== reservation.quantity
  ) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_ALLOCATION_INVALID",
      "Reservation allocations do not conserve the reserved quantity.",
      { status: 500, publicMessage: "Credit allocations need reconciliation." },
    );
  }

  const entryType = spec.entryType as CreditLedgerEntryType;
  const delta = creditBalanceDelta(entryType, reservation.quantity);
  const before = accountBalances(reservation);
  const after = applyCreditBalanceDelta(before, delta);
  const projectedLots = allocations.map((allocation) => ({
    allocation,
    operationKey: `${mutation.namespacedKey}:lot:${allocation.position}`,
    projected: moveCreditLotQuantity(
      lotQuantities(allocation),
      spec.movement,
      allocation.allocation_quantity,
    ),
  }));
  const resultAllocations = Object.freeze(
    allocations.map((allocation) =>
      Object.freeze({
        creditGrantLotId: allocation.id,
        position: allocation.position,
        quantity: allocation.allocation_quantity,
      }),
    ),
  );
  const ledgerId = `credit_entry_${crypto.randomUUID()}`;
  const result: CreditReservationReceipt = Object.freeze({
    creditAccountId: reservation.credit_account_id,
    creditReservationId: reservation.id,
    creditLedgerEntryId: ledgerId,
    customerUserId: reservation.customer_user_id,
    creditKind: reservation.credit_kind,
    purposeType: reservation.purpose_type,
    purposeId: reservation.purpose_id,
    requestId: reservation.request_id,
    quantity: reservation.quantity,
    state: spec.to,
    reservationRevision: reservation.revision + 1,
    accountRevision: reservation.account_revision + 1,
    balances: after,
    allocations: resultAllocations,
    stripeEnvironment: "test",
    livemode: false,
  });
  const authority =
    spec.authority === "owner"
      ? activeOwnerCondition(context.actorUserId)
      : activeCustomerCondition(context.actorUserId);
  const accountCustomerCondition =
    spec.authority === "customer"
      ? "AND customer_user_id = ?"
      : "AND customer_user_id = ?";
  const accountCustomerBinding = reservation.customer_user_id;
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE credit_accounts
         SET available_balance = ?, reserved_balance = ?, consumed_balance = ?,
             revision = revision + 1, last_operation_key = ?, updated_at = ?
         WHERE id = ? ${accountCustomerCondition} AND credit_kind = ?
           AND revision = ? AND available_balance = ?
           AND reserved_balance = ? AND consumed_balance = ?
           AND stripe_environment = 'test' AND livemode = 0
           AND ${ACCOUNT_RECONCILIATION_SQL}
           AND ${authority.sql}
           AND ${consumptionGuard.sql}`,
      )
      .bind(
        after.available,
        after.reserved,
        after.consumed,
        mutation.namespacedKey,
        nowIso,
        reservation.credit_account_id,
        accountCustomerBinding,
        reservation.credit_kind,
        reservation.account_revision,
        before.available,
        before.reserved,
        before.consumed,
        ...authority.bindings,
        ...consumptionGuard.bindings,
      ),
  ];
  const exactAccount = exactAccountCondition({
    accountId: reservation.credit_account_id,
    customerUserId: reservation.customer_user_id,
    creditKind: reservation.credit_kind,
    revision: reservation.account_revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
  });
  statements.push(
    binding
      .prepare(
        `UPDATE credit_reservations
         SET state = ?, ${spec.timestampColumn} = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = ?
         WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
           AND credit_kind = ? AND state = ? AND revision = ?
           AND request_id = ? AND purpose_type = ? AND purpose_id = ?
           AND stripe_environment = 'test' AND livemode = 0
           AND ${exactAccount.sql} AND ${authority.sql}
           AND ${consumptionGuard.sql}`,
      )
      .bind(
        spec.to,
        nowIso,
        mutation.namespacedKey,
        nowIso,
        reservation.id,
        reservation.credit_account_id,
        reservation.customer_user_id,
        reservation.credit_kind,
        spec.from,
        reservation.revision,
        reservation.request_id,
        reservation.purpose_type,
        reservation.purpose_id,
        ...exactAccount.bindings,
        ...authority.bindings,
        ...consumptionGuard.bindings,
      ),
  );

  for (const { allocation, operationKey, projected } of projectedLots) {
    statements.push(
      binding
        .prepare(
          `UPDATE credit_grant_lots
           SET quantity_available = ?, quantity_reserved = ?,
               quantity_consumed = ?, quantity_expired = ?,
               quantity_reversed = ?, state = ?, revision = revision + 1,
               last_operation_key = ?, updated_at = ?
           WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
             AND credit_kind = ? AND revision = ? AND state = ?
             AND quantity_available = ? AND quantity_reserved = ?
             AND quantity_consumed = ? AND quantity_expired = ?
             AND quantity_reversed = ?
             AND stripe_environment = 'test' AND livemode = 0
             AND ${exactAccount.sql}
             AND EXISTS (
               SELECT 1 FROM credit_reservations
               WHERE id = ? AND revision = ? AND state = ?
                 AND last_operation_key = ?
             )
             AND ${authority.sql}
             AND ${consumptionGuard.sql}`,
        )
        .bind(
          projected.quantities.available,
          projected.quantities.reserved,
          projected.quantities.consumed,
          projected.quantities.expired,
          projected.quantities.reversed,
          projected.state,
          operationKey,
          nowIso,
          allocation.id,
          reservation.credit_account_id,
          reservation.customer_user_id,
          reservation.credit_kind,
          allocation.revision,
          allocation.state,
          allocation.quantity_available,
          allocation.quantity_reserved,
          allocation.quantity_consumed,
          allocation.quantity_expired,
          allocation.quantity_reversed,
          ...exactAccount.bindings,
          reservation.id,
          reservation.revision + 1,
          spec.to,
          mutation.namespacedKey,
          ...authority.bindings,
          ...consumptionGuard.bindings,
        ),
    );
  }

  statements.push(
    prepareLedgerEntry(binding, {
      id: ledgerId,
      accountId: reservation.credit_account_id,
      customerUserId: reservation.customer_user_id,
      creditKind: reservation.credit_kind,
      lotId: null,
      reservationId: reservation.id,
      entryType,
      delta,
      after,
      originType:
        (spec.originType as CreditLedgerOrigin | null) ??
        (reservation.credit_kind === "download" ? "download" : "license"),
      originId: reservation.purpose_id,
      fulfillmentEventId: null,
      idempotencyKey: `${mutation.namespacedKey}:ledger`,
      condition: {
        sql: `${exactAccount.sql}
          AND EXISTS (
            SELECT 1 FROM credit_reservations
            WHERE id = ? AND revision = ? AND state = ?
              AND last_operation_key = ?
          )
          AND ${authority.sql}
          AND ${consumptionGuard.sql}`,
        bindings: [
          ...exactAccount.bindings,
          reservation.id,
          reservation.revision + 1,
          spec.to,
          mutation.namespacedKey,
          ...authority.bindings,
          ...consumptionGuard.bindings,
        ],
      },
    }),
  );

  const finalAccount = exactAccountCondition({
    accountId: reservation.credit_account_id,
    customerUserId: reservation.customer_user_id,
    creditKind: reservation.credit_kind,
    revision: reservation.account_revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
    reconcile: true,
  });
  const lotConditions = projectedLots.map(
    () => `EXISTS (SELECT 1 FROM credit_grant_lots
       WHERE id = ? AND revision = ? AND quantity_available = ?
         AND quantity_reserved = ? AND quantity_consumed = ?
         AND state = ? AND last_operation_key = ?)`,
  );
  const lotConditionBindings = projectedLots.flatMap(
    ({ allocation, operationKey, projected }) => [
      allocation.id,
      allocation.revision + 1,
      projected.quantities.available,
      projected.quantities.reserved,
      projected.quantities.consumed,
      projected.state,
      operationKey,
    ],
  );
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "credit-reservation",
        subjectId: reservation.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { transition, quantity: reservation.quantity },
        result: { ...result },
      },
      `${finalAccount.sql}
       AND EXISTS (
         SELECT 1 FROM credit_reservations
         WHERE id = ? AND revision = ? AND state = ?
           AND last_operation_key = ?
       )
       AND EXISTS (SELECT 1 FROM credit_ledger_entries WHERE id = ?)
       AND ${lotConditions.join(" AND ")}
       AND ${authority.sql}
       AND ${consumptionGuard.sql}`,
      [
        ...finalAccount.bindings,
        reservation.id,
        reservation.revision + 1,
        spec.to,
        mutation.namespacedKey,
        ledgerId,
        ...lotConditionBindings,
        ...authority.bindings,
        ...consumptionGuard.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("credit reservation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "credit reservation");
  }
}

export function consumeCreditReservation(
  binding: D1Database,
  reservationId: unknown,
  expectedReservationRevision: unknown,
  expectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
  downloadConsumptionGuard: DownloadCreditConsumptionGuard | null = null,
): Promise<MutationResult<CreditReservationReceipt>> {
  return transitionReservation(
    binding,
    reservationId,
    expectedReservationRevision,
    expectedAccountRevision,
    context,
    "consume",
    now,
    downloadConsumptionGuard,
  );
}

export function releaseCreditReservation(
  binding: D1Database,
  reservationId: unknown,
  expectedReservationRevision: unknown,
  expectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<CreditReservationReceipt>> {
  return transitionReservation(
    binding,
    reservationId,
    expectedReservationRevision,
    expectedAccountRevision,
    context,
    "release",
    now,
  );
}

export function expireCreditReservation(
  binding: D1Database,
  reservationId: unknown,
  expectedReservationRevision: unknown,
  expectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<CreditReservationReceipt>> {
  return transitionReservation(
    binding,
    reservationId,
    expectedReservationRevision,
    expectedAccountRevision,
    context,
    "expire",
    now,
  );
}

export function reverseConsumedCreditReservation(
  binding: D1Database,
  reservationId: unknown,
  expectedReservationRevision: unknown,
  expectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<CreditReservationReceipt>> {
  return transitionReservation(
    binding,
    reservationId,
    expectedReservationRevision,
    expectedAccountRevision,
    context,
    "reverse",
    now,
  );
}

async function readLotWithAccount(
  binding: D1Database,
  lotId: string,
): Promise<LotAccountRow | null> {
  return binding
    .prepare(
      `SELECT lot.id, lot.credit_account_id, lot.customer_user_id,
              lot.credit_kind, lot.quantity_granted, lot.quantity_available,
              lot.quantity_reserved, lot.quantity_consumed,
              lot.quantity_expired, lot.quantity_reversed, lot.state,
              lot.expires_at, lot.revision,
              account.id AS account_id, account.revision AS account_revision,
              account.available_balance, account.reserved_balance,
              account.consumed_balance
       FROM credit_grant_lots AS lot
       JOIN credit_accounts AS account
         ON account.id = lot.credit_account_id
        AND account.customer_user_id = lot.customer_user_id
        AND account.credit_kind = lot.credit_kind
       WHERE lot.id = ?
         AND lot.stripe_environment = 'test' AND lot.livemode = 0
         AND account.stripe_environment = 'test' AND account.livemode = 0
       LIMIT 1`,
    )
    .bind(lotId)
    .first<LotAccountRow>();
}

export async function expireCreditGrantLot(
  binding: D1Database,
  rawLotId: unknown,
  rawExpectedLotRevision: unknown,
  rawExpectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<CreditLotExpirationReceipt>> {
  await requireOwner(binding, context.actorUserId);
  const lotId = safeId(rawLotId, "creditGrantLotId");
  const expectedLotRevision = positiveRevision(
    rawExpectedLotRevision,
    "expectedLotRevision",
  );
  const expectedAccountRevision = positiveRevision(
    rawExpectedAccountRevision,
    "expectedAccountRevision",
  );
  const nowIso = operationTime(now);
  const operation = "benefit-credit.expire-lot";
  const mutation = await prepareMutation<CreditLotExpirationReceipt>(
    binding,
    operation,
    context,
    { lotId, expectedLotRevision, expectedAccountRevision },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };

  const lot = await readLotWithAccount(binding, lotId);
  if (!lot) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_LOT_NOT_FOUND",
      "Credit lot not found.",
      {
        status: 404,
        publicMessage: "That credit lot was not found.",
      },
    );
  }
  if (
    lot.revision !== expectedLotRevision ||
    lot.account_revision !== expectedAccountRevision
  ) {
    throw staleMutation("credit lot");
  }
  if (lot.state !== "active" || lot.quantity_available < 1) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_LOT_STATE_INVALID",
      "Only an active credit lot with available quantity can expire.",
      { status: 409, publicMessage: "That credit lot cannot expire." },
    );
  }
  if (lot.quantity_reserved > 0) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_LOT_RESERVED",
      "A credit lot with active reservations cannot expire.",
      {
        status: 409,
        publicMessage:
          "Release or expire reservations before expiring this credit lot.",
      },
    );
  }
  if (lot.expires_at === null || lot.expires_at > nowIso) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_LOT_NOT_EXPIRED",
      "The credit lot has not reached its expiration time.",
      { status: 409, publicMessage: "That credit lot has not expired." },
    );
  }
  const accountForReconciliation: AccountRow = {
    id: lot.account_id,
    customer_user_id: lot.customer_user_id,
    credit_kind: lot.credit_kind,
    available_balance: lot.available_balance,
    reserved_balance: lot.reserved_balance,
    consumed_balance: lot.consumed_balance,
    revision: lot.account_revision,
  };
  await requireReconciledAccount(binding, accountForReconciliation);

  const quantityExpired = lot.quantity_available;
  const delta = creditBalanceDelta("expiration", quantityExpired);
  const before = accountBalances(accountForReconciliation);
  const after = applyCreditBalanceDelta(before, delta);
  const projected = moveCreditLotQuantity(
    lotQuantities(lot),
    "expiration",
    quantityExpired,
  );
  const result: CreditLotExpirationReceipt = Object.freeze({
    creditAccountId: lot.credit_account_id,
    creditGrantLotId: lot.id,
    customerUserId: lot.customer_user_id,
    creditKind: lot.credit_kind,
    quantityExpired,
    lotRevision: lot.revision + 1,
    accountRevision: lot.account_revision + 1,
    balances: after,
    stripeEnvironment: "test",
    livemode: false,
  });
  const owner = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE credit_accounts
         SET available_balance = ?, reserved_balance = ?, consumed_balance = ?,
             revision = revision + 1, last_operation_key = ?, updated_at = ?
         WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
           AND revision = ? AND available_balance = ?
           AND reserved_balance = ? AND consumed_balance = ?
           AND available_balance >= ?
           AND stripe_environment = 'test' AND livemode = 0
           AND ${ACCOUNT_RECONCILIATION_SQL}
           AND ${owner.sql}`,
      )
      .bind(
        after.available,
        after.reserved,
        after.consumed,
        mutation.namespacedKey,
        nowIso,
        lot.credit_account_id,
        lot.customer_user_id,
        lot.credit_kind,
        lot.account_revision,
        before.available,
        before.reserved,
        before.consumed,
        quantityExpired,
        ...owner.bindings,
      ),
  ];
  const exactAccount = exactAccountCondition({
    accountId: lot.credit_account_id,
    customerUserId: lot.customer_user_id,
    creditKind: lot.credit_kind,
    revision: lot.account_revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
  });
  statements.push(
    binding
      .prepare(
        `UPDATE credit_grant_lots
         SET quantity_available = ?, quantity_reserved = ?,
             quantity_consumed = ?, quantity_expired = ?,
             quantity_reversed = ?, state = ?, expired_at = ?,
             revision = revision + 1, last_operation_key = ?, updated_at = ?
         WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
           AND credit_kind = ? AND revision = ? AND state = 'active'
           AND quantity_available = ? AND quantity_reserved = 0
           AND quantity_consumed = ? AND quantity_expired = ?
           AND quantity_reversed = ? AND expires_at IS NOT NULL
           AND expires_at <= ?
           AND stripe_environment = 'test' AND livemode = 0
           AND ${exactAccount.sql} AND ${owner.sql}`,
      )
      .bind(
        projected.quantities.available,
        projected.quantities.reserved,
        projected.quantities.consumed,
        projected.quantities.expired,
        projected.quantities.reversed,
        projected.state,
        nowIso,
        mutation.namespacedKey,
        nowIso,
        lot.id,
        lot.credit_account_id,
        lot.customer_user_id,
        lot.credit_kind,
        lot.revision,
        lot.quantity_available,
        lot.quantity_consumed,
        lot.quantity_expired,
        lot.quantity_reversed,
        nowIso,
        ...exactAccount.bindings,
        ...owner.bindings,
      ),
  );

  const ledgerId = `credit_entry_${crypto.randomUUID()}`;
  statements.push(
    prepareLedgerEntry(binding, {
      id: ledgerId,
      accountId: lot.credit_account_id,
      customerUserId: lot.customer_user_id,
      creditKind: lot.credit_kind,
      lotId: lot.id,
      reservationId: null,
      entryType: "expiration",
      delta,
      after,
      originType: "expiration",
      originId: lot.id,
      fulfillmentEventId: null,
      idempotencyKey: `${mutation.namespacedKey}:ledger`,
      condition: {
        sql: `${exactAccount.sql}
          AND EXISTS (
            SELECT 1 FROM credit_grant_lots
            WHERE id = ? AND revision = ? AND state = 'expired'
              AND quantity_expired = ? AND last_operation_key = ?
          ) AND ${owner.sql}`,
        bindings: [
          ...exactAccount.bindings,
          lot.id,
          lot.revision + 1,
          projected.quantities.expired,
          mutation.namespacedKey,
          ...owner.bindings,
        ],
      },
    }),
  );

  const finalAccount = exactAccountCondition({
    accountId: lot.credit_account_id,
    customerUserId: lot.customer_user_id,
    creditKind: lot.credit_kind,
    revision: lot.account_revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
    reconcile: true,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "credit-grant-lot",
        subjectId: lot.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { quantityExpired },
        result: { ...result },
      },
      `${finalAccount.sql}
       AND EXISTS (
         SELECT 1 FROM credit_grant_lots
         WHERE id = ? AND revision = ? AND state = 'expired'
           AND quantity_expired = ? AND last_operation_key = ?
       )
       AND EXISTS (SELECT 1 FROM credit_ledger_entries WHERE id = ?)
       AND ${owner.sql}`,
      [
        ...finalAccount.bindings,
        lot.id,
        lot.revision + 1,
        projected.quantities.expired,
        mutation.namespacedKey,
        ledgerId,
        ...owner.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("credit lot");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "credit lot");
  }
}

/** Reverses an unused grant lot while preserving its immutable origin and total. */
export async function reverseCreditGrantLot(
  binding: D1Database,
  rawLotId: unknown,
  rawExpectedLotRevision: unknown,
  rawExpectedAccountRevision: unknown,
  context: MutationContext,
  now = new Date(),
): Promise<MutationResult<CreditLotReversalReceipt>> {
  await requireOwner(binding, context.actorUserId);
  const lotId = safeId(rawLotId, "creditGrantLotId");
  const expectedLotRevision = positiveRevision(
    rawExpectedLotRevision,
    "expectedLotRevision",
  );
  const expectedAccountRevision = positiveRevision(
    rawExpectedAccountRevision,
    "expectedAccountRevision",
  );
  const nowIso = operationTime(now);
  const operation = "benefit-credit.reverse-lot";
  const mutation = await prepareMutation<CreditLotReversalReceipt>(
    binding,
    operation,
    context,
    { lotId, expectedLotRevision, expectedAccountRevision },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const lot = await readLotWithAccount(binding, lotId);
  if (!lot) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_LOT_NOT_FOUND",
      "Credit lot not found.",
      { status: 404, publicMessage: "That credit lot was not found." },
    );
  }
  if (
    lot.revision !== expectedLotRevision ||
    lot.account_revision !== expectedAccountRevision
  ) {
    throw staleMutation("credit lot");
  }
  if (
    lot.state !== "active" ||
    lot.quantity_available < 1 ||
    lot.quantity_reserved !== 0 ||
    lot.quantity_consumed !== 0 ||
    lot.quantity_expired !== 0 ||
    lot.quantity_reversed !== 0
  ) {
    throw new RuntimeError(
      "BENEFIT_CREDIT_LOT_REVERSAL_BLOCKED",
      "Only an unused active credit lot can be reversed.",
      {
        status: 409,
        publicMessage:
          "Release reservations and reverse consumption before reversing this credit lot.",
      },
    );
  }

  const accountForReconciliation: AccountRow = {
    id: lot.account_id,
    customer_user_id: lot.customer_user_id,
    credit_kind: lot.credit_kind,
    available_balance: lot.available_balance,
    reserved_balance: lot.reserved_balance,
    consumed_balance: lot.consumed_balance,
    revision: lot.account_revision,
  };
  await requireReconciledAccount(binding, accountForReconciliation);

  const quantityReversed = lot.quantity_available;
  // The fixed schema represents removal of available credit with an expiration
  // delta; origin_type='reversal' preserves the business reason.
  const delta = creditBalanceDelta("expiration", quantityReversed);
  const before = accountBalances(accountForReconciliation);
  const after = applyCreditBalanceDelta(before, delta);
  const projected = moveCreditLotQuantity(
    lotQuantities(lot),
    "grant-reversal",
    quantityReversed,
  );
  const result: CreditLotReversalReceipt = Object.freeze({
    creditAccountId: lot.credit_account_id,
    creditGrantLotId: lot.id,
    customerUserId: lot.customer_user_id,
    creditKind: lot.credit_kind,
    quantityReversed,
    lotRevision: lot.revision + 1,
    accountRevision: lot.account_revision + 1,
    balances: after,
    stripeEnvironment: "test",
    livemode: false,
  });
  const owner = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `UPDATE credit_accounts
         SET available_balance = ?, reserved_balance = ?, consumed_balance = ?,
             revision = revision + 1, last_operation_key = ?, updated_at = ?
         WHERE id = ? AND customer_user_id = ? AND credit_kind = ?
           AND revision = ? AND available_balance = ?
           AND reserved_balance = ? AND consumed_balance = ?
           AND available_balance >= ?
           AND stripe_environment = 'test' AND livemode = 0
           AND ${ACCOUNT_RECONCILIATION_SQL}
           AND ${owner.sql}`,
      )
      .bind(
        after.available,
        after.reserved,
        after.consumed,
        mutation.namespacedKey,
        nowIso,
        lot.credit_account_id,
        lot.customer_user_id,
        lot.credit_kind,
        lot.account_revision,
        before.available,
        before.reserved,
        before.consumed,
        quantityReversed,
        ...owner.bindings,
      ),
  ];
  const exactAccount = exactAccountCondition({
    accountId: lot.credit_account_id,
    customerUserId: lot.customer_user_id,
    creditKind: lot.credit_kind,
    revision: lot.account_revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
  });
  statements.push(
    binding
      .prepare(
        `UPDATE credit_grant_lots
         SET quantity_available = ?, quantity_reserved = ?,
             quantity_consumed = ?, quantity_expired = ?,
             quantity_reversed = ?, state = ?, reversed_at = ?,
             revision = revision + 1, last_operation_key = ?, updated_at = ?
         WHERE id = ? AND credit_account_id = ? AND customer_user_id = ?
           AND credit_kind = ? AND revision = ? AND state = 'active'
           AND quantity_available = ? AND quantity_reserved = 0
           AND quantity_consumed = 0 AND quantity_expired = 0
           AND quantity_reversed = 0
           AND stripe_environment = 'test' AND livemode = 0
           AND ${exactAccount.sql} AND ${owner.sql}`,
      )
      .bind(
        projected.quantities.available,
        projected.quantities.reserved,
        projected.quantities.consumed,
        projected.quantities.expired,
        projected.quantities.reversed,
        projected.state,
        nowIso,
        mutation.namespacedKey,
        nowIso,
        lot.id,
        lot.credit_account_id,
        lot.customer_user_id,
        lot.credit_kind,
        lot.revision,
        lot.quantity_available,
        ...exactAccount.bindings,
        ...owner.bindings,
      ),
  );

  const ledgerId = `credit_entry_${crypto.randomUUID()}`;
  statements.push(
    prepareLedgerEntry(binding, {
      id: ledgerId,
      accountId: lot.credit_account_id,
      customerUserId: lot.customer_user_id,
      creditKind: lot.credit_kind,
      lotId: lot.id,
      reservationId: null,
      entryType: "expiration",
      delta,
      after,
      originType: "reversal",
      originId: lot.id,
      fulfillmentEventId: null,
      idempotencyKey: `${mutation.namespacedKey}:ledger`,
      condition: {
        sql: `${exactAccount.sql}
          AND EXISTS (
            SELECT 1 FROM credit_grant_lots
            WHERE id = ? AND revision = ? AND state = 'reversed'
              AND quantity_reversed = ? AND last_operation_key = ?
          ) AND ${owner.sql}`,
        bindings: [
          ...exactAccount.bindings,
          lot.id,
          lot.revision + 1,
          projected.quantities.reversed,
          mutation.namespacedKey,
          ...owner.bindings,
        ],
      },
    }),
  );

  const finalAccount = exactAccountCondition({
    accountId: lot.credit_account_id,
    customerUserId: lot.customer_user_id,
    creditKind: lot.credit_kind,
    revision: lot.account_revision + 1,
    balances: after,
    operationKey: mutation.namespacedKey,
    reconcile: true,
  });
  const auditIndex = statements.length;
  statements.push(
    prepareRequiredAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "credit-grant-lot",
        subjectId: lot.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { quantityReversed },
        result: { ...result },
      },
      `${finalAccount.sql}
       AND EXISTS (
         SELECT 1 FROM credit_grant_lots
         WHERE id = ? AND revision = ? AND state = 'reversed'
           AND quantity_reversed = ? AND last_operation_key = ?
       )
       AND EXISTS (SELECT 1 FROM credit_ledger_entries WHERE id = ?)
       AND ${owner.sql}`,
      [
        ...finalAccount.bindings,
        lot.id,
        lot.revision + 1,
        projected.quantities.reversed,
        mutation.namespacedKey,
        ledgerId,
        ...owner.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[0]) !== 1 ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("credit lot");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayOrStale(binding, mutation, error, "credit lot");
  }
}
