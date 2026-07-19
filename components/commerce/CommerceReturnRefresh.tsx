"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./Commerce.module.css";

export interface CommerceReturnRefreshProps {
  readonly checkoutId: string;
  readonly settled: boolean;
}

function checkoutStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("result" in value)) return null;
  const result = (value as { readonly result?: unknown }).result;
  if (!result || typeof result !== "object" || !("status" in result)) {
    return null;
  }
  const status = (result as { readonly status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

export function CommerceReturnRefresh({
  checkoutId,
  settled,
}: CommerceReturnRefreshProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (settled) return;
    let active = true;
    let attempts = 0;

    const interval = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/commerce/checkout/${encodeURIComponent(checkoutId)}`,
          { headers: { accept: "application/json" }, cache: "no-store" },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!active) return;
        const status = response.ok ? checkoutStatus(payload) : null;
        if (
          status === "completed" ||
          status === "failed" ||
          status === "expired" ||
          status === "canceled"
        ) {
          router.refresh();
        }
      } catch {
        // The manual same-account status check remains available below.
      }
      if (attempts >= 8 && active) {
        window.clearInterval(interval);
        setMessage(
          "The verified result is still pending. Check again shortly.",
        );
      }
    }, 2_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [checkoutId, router, settled]);

  if (settled) return null;
  return (
    <div className={styles.productAction}>
      <button
        className="button button-secondary"
        onClick={() => router.refresh()}
        type="button"
      >
        Check verified result
      </button>
      <p aria-live="polite" className={styles.operationMessage} role="status">
        {message}
      </p>
    </div>
  );
}

export default CommerceReturnRefresh;
