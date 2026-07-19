import { CommerceTestModeNotice } from "@/components/commerce";
import type {
  CreditAccountDetailDTO,
  CreditKind,
} from "@/lib/benefit-credits/types.ts";
import type { DownloadCreditTargetDTO } from "@/db/download-credit-redemption.ts";

import styles from "./Credits.module.css";
import { DownloadCreditRedemptionAction } from "./DownloadCreditRedemptionAction";
import { commerceOrigin, creditKindLabel, dateTime, label } from "./display";

export interface CustomerCreditAccountView {
  readonly kind: CreditKind;
  readonly detail: CreditAccountDetailDTO | null;
}

export interface CustomerCreditsProps {
  readonly accounts: readonly CustomerCreditAccountView[];
  readonly downloadTargets: readonly DownloadCreditTargetDTO[];
}

function TestRecordLabel({ commerce }: { readonly commerce: boolean }) {
  return (
    <span className={styles.testLabel}>
      {commerce ? "Stripe Test Mode" : "Test record"}
    </span>
  );
}

function AccountHistory({
  detail,
  kind,
}: {
  readonly detail: CreditAccountDetailDTO | null;
  readonly kind: CreditKind;
}) {
  if (!detail) {
    return (
      <section
        className={styles.section}
        aria-labelledby={`${kind}-credits-title`}
      >
        <div className={styles.headingGroup}>
          <h3 id={`${kind}-credits-title`}>{creditKindLabel(kind)}</h3>
          <p>
            This account begins when an owner grant or verified Stripe Test
            fulfillment creates the first credit lot.
          </p>
        </div>
        <dl className={styles.summaryList}>
          {[
            ["Available", 0],
            ["Reserved", 0],
            ["Consumed", 0],
            ["Ledger entries", 0],
          ].map(([name, value]) => (
            <div className={styles.summaryItem} key={String(name)}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.emptyState}>No credit activity recorded.</p>
      </section>
    );
  }

  const activeLots = detail.lots.filter(({ state }) => state === "active");
  const recentLedger = [...detail.ledger].reverse();

  return (
    <section
      className={styles.section}
      aria-labelledby={`${kind}-credits-title`}
    >
      <div className={styles.headingGroup}>
        <h3 id={`${kind}-credits-title`}>{creditKindLabel(kind)}</h3>
        <p>
          Available, reserved, and consumed balances reconcile against the
          append-only Test ledger.
        </p>
      </div>

      <dl className={styles.summaryList}>
        <div className={styles.summaryItem}>
          <dt>Available</dt>
          <dd>{detail.account.available}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Reserved</dt>
          <dd>{detail.account.reserved}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Consumed</dt>
          <dd>{detail.account.consumed}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Account revision</dt>
          <dd>{detail.account.revision}</dd>
        </div>
      </dl>

      <div className={styles.reconciliation}>
        <strong
          className={styles.reconciliationState}
          data-tone={detail.balancesReconciled ? "positive" : "critical"}
        >
          {detail.balancesReconciled
            ? "Balances reconciled"
            : "Operator reconciliation required"}
        </strong>
        <span className={styles.reconciliationDetail}>
          Ledger totals: {detail.ledgerBalances.available} available,{" "}
          {detail.ledgerBalances.reserved} reserved,{" "}
          {detail.ledgerBalances.consumed} consumed.
        </span>
      </div>

      <div className={styles.headingGroup}>
        <h3>Active lots</h3>
        <p>Unexpired sources that retain available or reserved quantity.</p>
      </div>
      {activeLots.length === 0 ? (
        <p className={styles.emptyState}>No active credit lots.</p>
      ) : (
        <ol className={styles.recordList}>
          {activeLots.map((lot) => (
            <li className={styles.recordRow} key={lot.id}>
              <div className={styles.recordIdentity}>
                <TestRecordLabel commerce={commerceOrigin(lot.originType)} />
                <h4>{label(lot.originType)} grant</h4>
                <span className={styles.recordMeta}>{lot.originId}</span>
              </div>
              <div className={styles.recordFacts}>
                <span>Lot quantities</span>
                <strong>{lot.available} available</strong>
                <span>{lot.reserved} reserved</span>
                <span>{lot.consumed} consumed</span>
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
            </li>
          ))}
        </ol>
      )}

      <div className={styles.headingGroup}>
        <h3>Reservations</h3>
        <p>
          Exact download or license-request purposes and their retained state.
        </p>
      </div>
      {detail.reservations.length === 0 ? (
        <p className={styles.emptyState}>No credit reservations.</p>
      ) : (
        <ol className={styles.recordList}>
          {detail.reservations.map((reservation) => (
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
                <span>{reservation.allocations.length} lot allocations</span>
                <span>{reservation.requestId}</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className={styles.headingGroup}>
        <h3>Ledger history</h3>
        <p>Every balance movement and its resulting reconciled totals.</p>
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
                <span>Balance movement</span>
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

export function CustomerCredits({
  accounts,
  downloadTargets,
}: CustomerCreditsProps) {
  const downloadAccount = accounts.find(({ kind }) => kind === "download");
  const availableDownloadCredits =
    downloadAccount?.detail?.account.available ?? 0;

  return (
    <div className={`account-content ${styles.page}`}>
      <header className="workspace-section-heading">
        <p className="eyebrow">Credits</p>
        <h2>Credit balances and history</h2>
        <p>
          Download and license credits retain their grants, reservations,
          consumption, reversals, expiration, and exact ledger totals.
        </p>
      </header>

      <CommerceTestModeNotice detail="Credits created by verified commerce are Stripe Test Mode records. They simulate benefits and protected access without accepting payment." />

      <section className={styles.section} aria-labelledby="use-download-credit">
        <div className={styles.headingGroup}>
          <h3 id="use-download-credit">Use a download credit</h3>
          <p>
            Choose a published protected track. One credit creates one durable
            download entitlement, and delivery still passes through the current
            server access decision.
          </p>
        </div>
        {downloadTargets.length === 0 ? (
          <p className={styles.emptyState}>
            No published protected track is ready for credit redemption.
          </p>
        ) : (
          <ol className={styles.recordList}>
            {downloadTargets.map((target) => (
              <li className={styles.recordRow} key={target.trackId}>
                <div className={styles.recordIdentity}>
                  <TestRecordLabel commerce={false} />
                  <h4>{target.title}</h4>
                  <span className={styles.recordMeta}>
                    {target.trackSlug} · published revision{" "}
                    {target.trackRevisionId}
                  </span>
                </div>
                <div className={styles.recordFacts}>
                  <span>Credit evidence</span>
                  <strong>{label(target.state)}</strong>
                  <span>
                    {target.creditReservationId ?? "No reservation yet"}
                  </span>
                  <span>
                    {target.creditLedgerEntryId ?? "No consumption yet"}
                  </span>
                </div>
                <div className={styles.recordActions}>
                  <DownloadCreditRedemptionAction
                    availableCredits={availableDownloadCredits}
                    target={target}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {accounts.map(({ detail, kind }) => (
        <AccountHistory detail={detail} key={kind} kind={kind} />
      ))}
    </div>
  );
}

export default CustomerCredits;
