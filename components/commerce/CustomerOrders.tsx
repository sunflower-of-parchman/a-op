import Link from "next/link";
import type { CustomerCommerceOrder } from "@/db/commerce-surface-read.ts";

import styles from "./Commerce.module.css";

export interface CustomerOrdersProps {
  readonly orders: readonly CustomerCommerceOrder[];
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

export function CustomerOrders({ orders }: CustomerOrdersProps) {
  return (
    <div className={styles.section}>
      <div className={styles.headingGroup}>
        <h2>Orders</h2>
        <p>Your order and fulfillment history.</p>
      </div>

      {orders.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No orders yet.</p>
          <Link className={styles.inlineLink} href="/commerce">
            View available test products
          </Link>
        </div>
      ) : (
        <ol className={styles.recordList}>
          {orders.map((order) => (
            <li className={styles.record} key={order.id}>
              <div className={styles.recordIdentity}>
                <span className={styles.testRecordLabel}>Test record</span>
                <h3>{order.productName}</h3>
                <span className={styles.recordMeta}>
                  Ordered {dateTime(order.createdAt)}
                </span>
              </div>
              <div className={styles.recordStatus}>
                <span className={styles.recordMeta}>Order</span>
                <strong>{label(order.status)}</strong>
                <span className={styles.recordMeta}>
                  Fulfillment {label(order.fulfillmentStatus)}
                </span>
              </div>
              <div className={styles.recordAmount}>
                <span className={styles.recordMeta}>Test total</span>
                <strong>{money(order.totalMinor, order.currency)}</strong>
                <span className={styles.recordMeta}>
                  {order.stripeEnvironment}, livemode false
                </span>
              </div>
              <div className={styles.recordActions}>
                {order.checkoutId ? (
                  <Link
                    href={`/commerce/return?checkout=${encodeURIComponent(order.checkoutId)}`}
                  >
                    View verified result
                  </Link>
                ) : (
                  <span className={styles.recordMeta}>
                    Verified renewal invoice
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default CustomerOrders;
