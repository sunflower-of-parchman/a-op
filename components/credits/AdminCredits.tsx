"use client";

import { useRouter } from "next/navigation";
import type { CreditAccountDetailDTO } from "@/lib/benefit-credits/types.ts";
import type { CreditCustomerDTO } from "@/db/credit-surface-read.ts";

import { CreditGrantForm } from "./CreditGrantForm";
import {
  type CreditMutationAction,
  CreditMutationControls,
} from "./CreditMutationControls";
import styles from "./Credits.module.css";
import { commerceOrigin, creditKindLabel, dateTime, label } from "./display";

export interface AdminCreditsProps {
  readonly accountDetails: readonly CreditAccountDetailDTO[];
  readonly customers: readonly CreditCustomerDTO[];
  readonly selectedCustomerId: string | null;
}

function TestRecordLabel({ commerce }: { readonly commerce: boolean }) {
  return (
    <span className={styles.testLabel}>
      {commerce ? "Stripe Test Mode" : "Test record"}
    </span>
  );
}

function reservationUrl(reservationId: string, action: string): string {
  return `/api/admin/credits/reservations/${encodeURIComponent(reservationId)}/${action}`;
}

function lotUrl(lotId: string, action: string): string {
  return `/api/admin/credits/lots/${encodeURIComponent(lotId)}/${action}`;
}

function reached(value: string | null): boolean {
  return value !== null && Date.parse(value) <= Date.now();
}

function lotActions(
  detail: CreditAccountDetailDTO,
  lot: CreditAccountDetailDTO["lots"][number],
): readonly CreditMutationAction[] {
  const actions: CreditMutationAction[] = [];
  if (
    lot.state === "active" &&
    lot.available > 0 &&
    lot.reserved === 0 &&
    reached(lot.expiresAt)
  ) {
    actions.push({
      label: "Expire available lot",
      url: lotUrl(lot.id, "expire"),
      body: {
        expectedLotRevision: lot.revision,
        expectedAccountRevision: detail.account.revision,
      },
    });
  }
  if (
    lot.state === "active" &&
    lot.available === lot.granted &&
    lot.reserved === 0 &&
    lot.consumed === 0 &&
    lot.expired === 0 &&
    lot.reversed === 0
  ) {
    actions.push({
      label: "Reverse unused lot",
      url: lotUrl(lot.id, "reverse"),
      body: {
        expectedLotRevision: lot.revision,
        expectedAccountRevision: detail.account.revision,
      },
    });
  }
  return actions;
}

function reservationActions(
  detail: CreditAccountDetailDTO,
  reservation: CreditAccountDetailDTO["reservations"][number],
): readonly CreditMutationAction[] {
  if (reservation.state === "reserved" && reached(reservation.expiresAt)) {
    return [
      {
        label: "Expire reservation",
        url: reservationUrl(reservation.id, "expire"),
        body: {
          expectedReservationRevision: reservation.revision,
          expectedAccountRevision: detail.account.revision,
        },
      },
    ];
  }
  if (reservation.state === "consumed") {
    return [
      {
        label: "Reverse consumption",
        url: reservationUrl(reservation.id, "reverse"),
        body: {
          expectedReservationRevision: reservation.revision,
          expectedAccountRevision: detail.account.revision,
        },
      },
    ];
  }
  return [];
}

function AccountOperations({
  detail,
}: {
  readonly detail: CreditAccountDetailDTO;
}) {
  const recentLedger = [...detail.ledger].reverse();
  return (
    <section
      className={styles.section}
      aria-labelledby={`admin-${detail.account.creditKind}-credits-title`}
    >
      <div className={styles.headingGroup}>
        <h3 id={`admin-${detail.account.creditKind}-credits-title`}>
          {creditKindLabel(detail.account.creditKind)}
        </h3>
        <p>
          Account revision {detail.account.revision}. Owner actions retain exact
          lot, reservation, and account revisions.
        </p>
      </div>

      <div className={styles.reconciliation}>
        <strong
          className={styles.reconciliationState}
          data-tone={detail.balancesReconciled ? "positive" : "critical"}
        >
          {detail.balancesReconciled
            ? "Balances reconciled"
            : "Mutations blocked pending reconciliation"}
        </strong>
        <span className={styles.reconciliationDetail}>
          Ledger totals: {detail.ledgerBalances.available} available,{" "}
          {detail.ledgerBalances.reserved} reserved,{" "}
          {detail.ledgerBalances.consumed} consumed.
        </span>
      </div>

      <div className={styles.headingGroup}>
        <h3>Grant lots</h3>
        <p>
          Expiration appears only after its exact time. Reversal appears only
          while the entire lot remains unused.
        </p>
      </div>
      {detail.lots.length === 0 ? (
        <p className={styles.emptyState}>No grant lots.</p>
      ) : (
        <ol className={styles.recordList}>
          {detail.lots.map((lot) => {
            const actions = lotActions(detail, lot);
            return (
              <li className={styles.recordRow} key={lot.id}>
                <div className={styles.recordIdentity}>
                  <TestRecordLabel commerce={commerceOrigin(lot.originType)} />
                  <h4>{label(lot.originType)} grant</h4>
                  <span className={styles.recordMeta}>{lot.originId}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Quantities</span>
                  <strong>{lot.available} available</strong>
                  <span>
                    {lot.reserved} reserved · {lot.consumed} consumed
                  </span>
                  <span>
                    {lot.expired} expired · {lot.reversed} reversed
                  </span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Lifecycle</span>
                  <strong>{label(lot.state)}</strong>
                  <span>
                    {lot.expiresAt
                      ? `Expires ${dateTime(lot.expiresAt)}`
                      : "No fixed expiry"}
                  </span>
                  <span>Revision {lot.revision}</span>
                </div>
                {actions.length > 0 && detail.balancesReconciled ? (
                  <div className={styles.recordActions}>
                    <CreditMutationControls
                      actions={actions}
                      subjectLabel={`Credit lot ${lot.id}`}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className={styles.headingGroup}>
        <h3>Reservations</h3>
        <p>
          Owners may expire a due reservation or reverse a consumed reservation.
          Release remains a customer-authorized operation.
        </p>
      </div>
      {detail.reservations.length === 0 ? (
        <p className={styles.emptyState}>No reservations.</p>
      ) : (
        <ol className={styles.recordList}>
          {detail.reservations.map((reservation) => {
            const actions = reservationActions(detail, reservation);
            return (
              <li className={styles.recordRow} key={reservation.id}>
                <div className={styles.recordIdentity}>
                  <TestRecordLabel commerce={false} />
                  <h4>{label(reservation.purposeType)}</h4>
                  <span className={styles.recordMeta}>
                    {reservation.purposeId}
                  </span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Reservation state</span>
                  <strong>{label(reservation.state)}</strong>
                  <span>{reservation.quantity} credits</span>
                  <span>Revision {reservation.revision}</span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Lifecycle</span>
                  <strong>Expires {dateTime(reservation.expiresAt)}</strong>
                  <span>{reservation.allocations.length} allocations</span>
                  <span>{reservation.requestId}</span>
                </div>
                {actions.length > 0 && detail.balancesReconciled ? (
                  <div className={styles.recordActions}>
                    <CreditMutationControls
                      actions={actions}
                      subjectLabel={`Credit reservation ${reservation.id}`}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className={styles.headingGroup}>
        <h3>Ledger history</h3>
        <p>Append-only movements and exact balances after each operation.</p>
      </div>
      {recentLedger.length === 0 ? (
        <p className={styles.emptyState}>No ledger entries.</p>
      ) : (
        <ol className={styles.recordList}>
          {recentLedger.map((entry) => (
            <li className={styles.recordRow} key={entry.id}>
              <div className={styles.recordIdentity}>
                <TestRecordLabel commerce={commerceOrigin(entry.originType)} />
                <h4>{label(entry.entryType)}</h4>
                <span className={styles.recordMeta}>
                  {label(entry.originType)} · {entry.originId}
                </span>
              </div>
              <div className={styles.recordFacts}>
                <span>Movement</span>
                <strong>{entry.delta.available} available</strong>
                <span>{entry.delta.reserved} reserved</span>
                <span>{entry.delta.consumed} consumed</span>
              </div>
              <div className={styles.recordFacts}>
                <span>Balances after</span>
                <strong>{entry.balancesAfter.available} available</strong>
                <span>{entry.balancesAfter.reserved} reserved</span>
                <span>{dateTime(entry.createdAt)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AdminCredits({
  accountDetails,
  customers,
  selectedCustomerId,
}: AdminCreditsProps) {
  const router = useRouter();
  const selectedCustomer =
    customers.find(({ userId }) => userId === selectedCustomerId) ?? null;
  const download = accountDetails.find(
    ({ account }) => account.creditKind === "download",
  );
  const license = accountDetails.find(
    ({ account }) => account.creditKind === "license",
  );
  const totalReserved = accountDetails.reduce(
    (sum, { account }) => sum + account.reserved,
    0,
  );
  const totalConsumed = accountDetails.reduce(
    (sum, { account }) => sum + account.consumed,
    0,
  );

  return (
    <div className={`admin-workspace ${styles.page}`}>
      <header className="workspace-section-heading">
        <p className="eyebrow">Credits</p>
        <h2>Credit ledger operations</h2>
        <p>
          Inspect one customer’s reconciled balances, grants, reservations, and
          ledger history. Owner mutations use the existing atomic credit
          contracts.
        </p>
      </header>

      {customers.length === 0 ? (
        <p className={styles.emptyState}>No active customers available.</p>
      ) : (
        <label className={styles.customerChooser}>
          <span>Customer</span>
          <select
            onChange={(event) =>
              router.push(
                `/admin/credits?customer=${encodeURIComponent(event.target.value)}`,
              )
            }
            value={selectedCustomerId ?? ""}
          >
            {customers.map((customer) => (
              <option key={customer.userId} value={customer.userId}>
                {customer.displayName} · {customer.email}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedCustomer ? (
        <>
          <dl className={styles.summaryList}>
            <div className={styles.summaryItem}>
              <dt>Download available</dt>
              <dd>{download?.account.available ?? 0}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>License available</dt>
              <dd>{license?.account.available ?? 0}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Total reserved</dt>
              <dd>{totalReserved}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Total consumed</dt>
              <dd>{totalConsumed}</dd>
            </div>
          </dl>

          <section
            className={styles.section}
            aria-labelledby="manual-grant-title"
          >
            <span className={styles.testLabel}>Test record</span>
            <div id="manual-grant-title">
              <CreditGrantForm
                accountDetails={accountDetails}
                customerName={selectedCustomer.displayName}
                customerUserId={selectedCustomer.userId}
              />
            </div>
          </section>

          {accountDetails.length === 0 ? (
            <p className={styles.emptyState}>
              This customer has no credit account history. A manual owner grant
              can create the first Test ledger account.
            </p>
          ) : (
            accountDetails.map((detail) => (
              <AccountOperations detail={detail} key={detail.account.id} />
            ))
          )}
        </>
      ) : null}
    </div>
  );
}

export default AdminCredits;
