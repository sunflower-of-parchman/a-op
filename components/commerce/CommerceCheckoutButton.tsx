"use client";

import { useRef, useState } from "react";

import styles from "./Commerce.module.css";

interface CheckoutEnvelope {
  readonly result?: {
    readonly checkoutUrl?: unknown;
    readonly status?: unknown;
  };
  readonly error?: {
    readonly message?: unknown;
  };
}

export interface CommerceCheckoutButtonProps {
  readonly productId: string;
  readonly productName: string;
  readonly licenseRequestId?: string;
}

function publicError(payload: CheckoutEnvelope | null): string | null {
  const message = payload?.error?.message;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : null;
}

function stripeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function CommerceCheckoutButton({
  licenseRequestId,
  productId,
  productName,
}: CommerceCheckoutButtonProps) {
  const operationKey = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function beginCheckout() {
    operationKey.current ??= crypto.randomUUID();
    setWorking(true);
    setFailed(false);
    setMessage("Opening Stripe Test Checkout…");

    try {
      const response = await fetch("/api/commerce/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey.current,
        },
        body: JSON.stringify({
          productId,
          ...(licenseRequestId ? { licenseRequestId } : {}),
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as CheckoutEnvelope | null;
      if (!response.ok) {
        if (response.status < 500) operationKey.current = null;
        throw new Error(
          publicError(payload) ?? "Stripe Test Checkout could not be opened.",
        );
      }
      const checkoutUrl = stripeCheckoutUrl(payload?.result?.checkoutUrl);
      if (!checkoutUrl) {
        throw new Error(
          "The application did not return a valid Stripe Test Checkout address.",
        );
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Stripe Test Checkout could not be opened.",
      );
      setWorking(false);
    }
  }

  return (
    <div className={styles.productAction}>
      <button
        aria-label={`Open Stripe Test Checkout for ${productName}`}
        className={styles.checkoutButton}
        disabled={working}
        onClick={beginCheckout}
        type="button"
      >
        {working ? "Opening Test Checkout" : "Continue in Stripe Test Mode"}
      </button>
      <p
        aria-live="polite"
        className={styles.operationMessage}
        data-tone={failed ? "critical" : undefined}
        role="status"
      >
        {message}
      </p>
    </div>
  );
}

export default CommerceCheckoutButton;
