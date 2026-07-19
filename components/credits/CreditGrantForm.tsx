"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreditAccountDetailDTO,
  CreditKind,
} from "@/lib/benefit-credits/types.ts";

import styles from "./Credits.module.css";
import { creditKindLabel } from "./display";

interface GrantEnvelope {
  readonly error?: { readonly message?: unknown };
}

export interface CreditGrantFormProps {
  readonly accountDetails: readonly CreditAccountDetailDTO[];
  readonly customerName: string;
  readonly customerUserId: string;
}

function publicError(payload: GrantEnvelope | null): string | null {
  const value = payload?.error?.message;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function CreditGrantForm({
  accountDetails,
  customerName,
  customerUserId,
}: CreditGrantFormProps) {
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [creditKind, setCreditKind] = useState<CreditKind>("download");
  const [quantity, setQuantity] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();
  const selectedAccount = accountDetails.find(
    ({ account }) => account.creditKind === creditKind,
  );

  async function submitGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1) {
      setTone("critical");
      setMessage("Enter a positive whole credit quantity.");
      return;
    }
    let normalizedExpiration: string | null = null;
    if (expiresAt) {
      const parsedExpiration = new Date(expiresAt);
      if (Number.isNaN(parsedExpiration.valueOf())) {
        setTone("critical");
        setMessage("Enter a valid future expiration time.");
        return;
      }
      normalizedExpiration = parsedExpiration.toISOString();
    }

    operationKey.current ??= crypto.randomUUID();
    setWorking(true);
    setTone(undefined);
    setMessage("Recording the owner grant…");
    try {
      const response = await fetch("/api/admin/credits/grants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey.current,
        },
        body: JSON.stringify({
          customerUserId,
          creditKind,
          quantity: parsedQuantity,
          expiresAt: normalizedExpiration,
          expectedAccountRevision: selectedAccount?.account.revision ?? 0,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as GrantEnvelope | null;
      if (!response.ok) {
        if (response.status < 500) operationKey.current = null;
        throw new Error(
          publicError(payload) ?? "The credit grant did not finish.",
        );
      }

      operationKey.current = null;
      setQuantity("1");
      setExpiresAt("");
      setTone("positive");
      setMessage("Owner grant recorded in the Test ledger.");
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : "The credit grant did not finish.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submitGrant}>
      <div className={styles.headingGroup}>
        <h3>Manual owner grant</h3>
        <p>
          Add a precise Test credit lot for {customerName}. The owner origin,
          Test environment, and operation identity are set on the server.
        </p>
      </div>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Credit type</span>
          <select
            onChange={(event) =>
              setCreditKind(event.target.value as CreditKind)
            }
            value={creditKind}
          >
            <option value="download">{creditKindLabel("download")}</option>
            <option value="license">{creditKindLabel("license")}</option>
          </select>
          <small>
            Current account revision {selectedAccount?.account.revision ?? 0}
          </small>
        </label>
        <label className={styles.field}>
          <span>Quantity</span>
          <input
            inputMode="numeric"
            max={1000000}
            min={1}
            onChange={(event) => setQuantity(event.target.value)}
            required
            step={1}
            type="number"
            value={quantity}
          />
        </label>
        <label className={styles.field}>
          <span>Expiration, optional</span>
          <input
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            value={expiresAt}
          />
          <small>Leave empty for no fixed expiry.</small>
        </label>
      </div>
      <div className={styles.formActions}>
        <button
          className="button button-primary"
          disabled={working}
          type="submit"
        >
          {working ? "Recording grant" : "Grant Test credits"}
        </button>
        <p
          aria-live="polite"
          className={styles.operationMessage}
          data-tone={tone}
          role="status"
        >
          {message}
        </p>
      </div>
    </form>
  );
}

export default CreditGrantForm;
