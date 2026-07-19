import Link from "next/link";
import type { CommerceReturnState } from "@/db/commerce-surface-read.ts";

import styles from "./Commerce.module.css";
import { CommerceReturnRefresh } from "./CommerceReturnRefresh";
import { CommerceTestModeNotice } from "./CommerceTestModeNotice";

export interface CommerceReturnResultProps {
  readonly browserCanceled?: boolean;
  readonly result: CommerceReturnState | null;
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

function stateCopy(
  result: CommerceReturnState,
  browserCanceled: boolean,
): {
  readonly title: string;
  readonly detail: string;
  readonly tone: "positive" | "attention" | "critical";
} {
  if (
    browserCanceled &&
    result.orderId === null &&
    result.fulfillmentStatus === null
  ) {
    return {
      title: "No access was granted",
      detail:
        "Stripe Test Checkout was canceled in the browser. The return address changed no application state and granted no access.",
      tone: "critical",
    };
  }
  if (
    result.orderStatus === "fulfilled" &&
    result.fulfillmentStatus === "fulfilled"
  ) {
    return {
      title: "Test order complete",
      detail:
        "The signed Stripe test event created the application order and fulfillment exactly once.",
      tone: "positive",
    };
  }
  if (
    result.checkoutStatus === "failed" ||
    result.checkoutStatus === "expired" ||
    result.checkoutStatus === "canceled" ||
    result.orderStatus === "failed" ||
    result.orderStatus === "canceled" ||
    result.orderStatus === "reversed"
  ) {
    return {
      title: "No access was granted",
      detail:
        "This test checkout did not complete with verified fulfillment. It created no new access.",
      tone: "critical",
    };
  }
  if (result.orderId) {
    return {
      title: "Verified result received",
      detail:
        "The application owns this test order. Its fulfillment state is shown below.",
      tone: "attention",
    };
  }
  return {
    title: "Waiting for verified result",
    detail:
      "The return address does not grant access. This page waits for application-owned state created by a signed Stripe test event.",
    tone: "attention",
  };
}

function label(value: string | null): string {
  if (!value) return "Pending";
  return value
    .split("_")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function CommerceReturnResult({
  browserCanceled = false,
  result,
}: CommerceReturnResultProps) {
  if (!result) {
    return (
      <div className={`page-frame ${styles.page}`}>
        <section className={styles.section} aria-labelledby="return-title">
          <CommerceTestModeNotice />
          <div className={styles.resultTitle}>
            <h2 id="return-title">
              {browserCanceled
                ? "No access was granted"
                : "Checkout result unavailable"}
            </h2>
            <p>
              {browserCanceled
                ? "Stripe Test Checkout was canceled in the browser. No order, entitlement, membership, subscription, license, or credit was created by this return address."
                : "This account has no matching test checkout. A browser return value cannot create an order or grant access."}
            </p>
          </div>
          <div className="action-row">
            <Link className="button button-primary" href="/commerce">
              View test products
            </Link>
            <Link className="button button-secondary" href="/account/orders">
              View test orders
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const copy = stateCopy(result, browserCanceled);
  const settled =
    browserCanceled ||
    copy.tone === "critical" ||
    (result.orderStatus === "fulfilled" &&
      result.fulfillmentStatus === "fulfilled");

  return (
    <div className={`page-frame ${styles.page}`}>
      <section className={styles.section} aria-labelledby="return-title">
        <CommerceTestModeNotice />
        <div className={styles.resultState}>
          <div className={styles.resultTitle}>
            <h2 id="return-title">{copy.title}</h2>
            <p>{copy.detail}</p>
          </div>

          <dl className={styles.definitionList}>
            <div className={styles.definitionItem}>
              <dt>Product</dt>
              <dd>{result.productName}</dd>
            </div>
            <div className={styles.definitionItem}>
              <dt>Amount</dt>
              <dd>{money(result.amountMinor, result.currency)}</dd>
            </div>
            <div className={styles.definitionItem}>
              <dt>Checkout</dt>
              <dd data-tone={copy.tone}>{label(result.checkoutStatus)}</dd>
            </div>
            <div className={styles.definitionItem}>
              <dt>Application order</dt>
              <dd data-tone={copy.tone}>{label(result.orderStatus)}</dd>
            </div>
            <div className={styles.definitionItem}>
              <dt>Fulfillment</dt>
              <dd data-tone={copy.tone}>{label(result.fulfillmentStatus)}</dd>
            </div>
            <div className={styles.definitionItem}>
              <dt>Environment</dt>
              <dd className={styles.environmentFact}>
                <span className={styles.testRecordLabel}>Test record</span>
                Stripe Test Mode, livemode false
              </dd>
            </div>
            <div className={styles.definitionItem}>
              <dt>Completed</dt>
              <dd>{dateTime(result.completedAt)}</dd>
            </div>
          </dl>

          <CommerceReturnRefresh
            checkoutId={result.checkoutId}
            settled={settled}
          />

          <div className="action-row">
            <Link className="button button-primary" href="/account/orders">
              View test orders
            </Link>
            <Link className="button button-secondary" href="/commerce">
              Return to test products
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CommerceReturnResult;
