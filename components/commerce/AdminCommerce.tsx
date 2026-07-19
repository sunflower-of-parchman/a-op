import Link from "next/link";
import type { AdminCommerceEvidence } from "@/db/commerce-surface-read.ts";

import styles from "./Commerce.module.css";
import { CommerceTestModeNotice } from "./CommerceTestModeNotice";

export interface AdminCommerceProps {
  readonly activeProductCount: number;
  readonly evidence: AdminCommerceEvidence;
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function dateTime(value: string | null): string {
  if (!value) return "Pending";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date);
}

function label(value: string | null): string {
  if (!value) return "Pending";
  return value
    .split("_")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function AdminCommerce({
  activeProductCount,
  evidence,
}: AdminCommerceProps) {
  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Commerce</p>
        <h2>Test operations</h2>
        <p>
          Read-only evidence for Stripe test events, application orders,
          customer relationships, and fulfillment.
        </p>
      </header>

      <CommerceTestModeNotice detail="This Sites installation is permanently locked to the simulated Stripe test adapter. There is no live commerce control." />

      <dl className={styles.summaryList}>
        <div className={styles.summaryItem}>
          <dt>Active test products</dt>
          <dd>{activeProductCount}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Test orders</dt>
          <dd>{evidence.orders.length}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Fulfilled test events</dt>
          <dd>
            {
              evidence.fulfillments.filter(
                ({ status }) => status === "fulfilled",
              ).length
            }
          </dd>
        </div>
      </dl>

      <div className="action-row">
        <Link className="button button-secondary" href="/commerce">
          View test checkout
        </Link>
      </div>

      <section
        className={styles.evidenceSection}
        aria-labelledby="orders-title"
      >
        <div className={styles.evidenceHeading}>
          <h3 id="orders-title">Orders and customers</h3>
          <p>Application orders created from verified test fulfillment.</p>
        </div>
        {evidence.orders.length === 0 ? (
          <p className={styles.emptyState}>
            No test orders have been recorded.
          </p>
        ) : (
          <ol className={styles.evidenceList}>
            {evidence.orders.map((order) => (
              <li className={styles.evidenceRow} key={order.id}>
                <div className={styles.evidenceIdentity}>
                  <span className={styles.testRecordLabel}>Test record</span>
                  <h3>{order.productName}</h3>
                  <span className={styles.evidenceMeta}>
                    {order.customerName} · {order.customerEmail}
                  </span>
                </div>
                <div className={styles.evidenceFacts}>
                  <span>Order</span>
                  <strong>{label(order.status)}</strong>
                  <span>Fulfillment {label(order.fulfillmentStatus)}</span>
                </div>
                <div className={styles.evidenceFacts}>
                  <span>Test total</span>
                  <strong>{money(order.totalMinor, order.currency)}</strong>
                  <span>{dateTime(order.completedAt ?? order.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className={styles.evidenceSection}
        aria-labelledby="events-title"
      >
        <div className={styles.evidenceHeading}>
          <h3 id="events-title">Signed event evidence</h3>
          <p>
            Allowlisted Stripe identifiers and processing state. Raw webhook
            bodies and payment details are never shown.
          </p>
        </div>
        {evidence.events.length === 0 ? (
          <p className={styles.emptyState}>
            No test events have been recorded.
          </p>
        ) : (
          <ol className={styles.evidenceList}>
            {evidence.events.map((event) => (
              <li className={styles.evidenceRow} key={event.id}>
                <div className={styles.evidenceIdentity}>
                  <span className={styles.testRecordLabel}>Test event</span>
                  <h3>{event.eventType}</h3>
                  <span className={styles.evidenceMeta}>
                    {event.customerName ?? "No linked customer"}
                  </span>
                </div>
                <div className={styles.evidenceFacts}>
                  <span>Status</span>
                  <strong>{label(event.status)}</strong>
                  {event.failureCategory ? (
                    <span>Category {event.failureCategory}</span>
                  ) : null}
                </div>
                <div className={styles.evidenceFacts}>
                  <span>Stripe test event</span>
                  <strong>{event.stripeEventId}</strong>
                  <span>{dateTime(event.processedAt ?? event.receivedAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className={styles.evidenceSection}
        aria-labelledby="fulfillments-title"
      >
        <div className={styles.evidenceHeading}>
          <h3 id="fulfillments-title">Fulfillment evidence</h3>
          <p>
            The exact test provider object, customer, product, and resulting
            application state.
          </p>
        </div>
        {evidence.fulfillments.length === 0 ? (
          <p className={styles.emptyState}>
            No test fulfillment has been recorded.
          </p>
        ) : (
          <ol className={styles.evidenceList}>
            {evidence.fulfillments.map((fulfillment) => (
              <li className={styles.evidenceRow} key={fulfillment.id}>
                <div className={styles.evidenceIdentity}>
                  <span className={styles.testRecordLabel}>
                    Test fulfillment
                  </span>
                  <h3>{fulfillment.productName ?? label(fulfillment.kind)}</h3>
                  <span className={styles.evidenceMeta}>
                    {fulfillment.customerName} · {fulfillment.customerEmail}
                  </span>
                </div>
                <div className={styles.evidenceFacts}>
                  <span>Result</span>
                  <strong>{label(fulfillment.status)}</strong>
                  <span>{label(fulfillment.kind)}</span>
                </div>
                <div className={styles.evidenceFacts}>
                  <span>Provider object</span>
                  <strong>{fulfillment.providerObjectId}</strong>
                  <span>
                    {dateTime(fulfillment.completedAt ?? fulfillment.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default AdminCommerce;
