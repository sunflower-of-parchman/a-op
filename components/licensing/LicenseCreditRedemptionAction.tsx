"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Licensing.module.css";

interface RedemptionEnvelope {
  readonly result?: {
    readonly issuedLicense?: { readonly issuedLicenseId?: unknown };
  };
  readonly error?: { readonly message?: unknown };
}

export interface LicenseCreditRedemptionActionProps {
  readonly availableCredits: number;
  readonly hasRecoverableReservation: boolean;
  readonly licenseCreditCost: number;
  readonly licenseRequestId: string;
}

function publicError(payload: RedemptionEnvelope | null): string | null {
  const value = payload?.error?.message;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function LicenseCreditRedemptionAction({
  availableCredits,
  hasRecoverableReservation,
  licenseCreditCost,
  licenseRequestId,
}: LicenseCreditRedemptionActionProps) {
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();
  const [working, setWorking] = useState(false);
  const canRedeem =
    hasRecoverableReservation || availableCredits >= licenseCreditCost;

  async function redeem() {
    operationKey.current ??= crypto.randomUUID();
    setWorking(true);
    setTone(undefined);
    setMessage(
      hasRecoverableReservation
        ? "Resuming the exact license-credit redemption…"
        : `Reserving ${licenseCreditCost} license credits…`,
    );

    try {
      const response = await fetch(
        `/api/licensing/requests/${encodeURIComponent(licenseRequestId)}/redeem-credit`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": operationKey.current,
          },
          body: "{}",
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as RedemptionEnvelope | null;
      if (!response.ok) {
        if (response.status < 500) operationKey.current = null;
        throw new Error(
          publicError(payload) ?? "License-credit redemption did not finish.",
        );
      }

      operationKey.current = null;
      setTone("positive");
      setMessage("License issued from the exact license-credit cost.");
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : "License-credit redemption did not finish.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.operation}>
      <div className={styles.formActions}>
        <button
          className="button button-secondary"
          disabled={working || !canRedeem}
          onClick={redeem}
          type="button"
        >
          {working
            ? "Redeeming license credits…"
            : hasRecoverableReservation
              ? "Resume license-credit redemption"
              : `Redeem ${licenseCreditCost} license credits`}
        </button>
        <span className={styles.recordMeta}>
          {availableCredits} available · exact cost {licenseCreditCost}
        </span>
      </div>
      {!canRedeem ? (
        <p className={styles.operationMessage} data-tone="critical">
          There are not enough available license credits.
        </p>
      ) : (
        <p className={styles.recordMeta}>
          Stripe Test Mode · No real payment will be accepted.
        </p>
      )}
      <p
        aria-live="polite"
        className={styles.operationMessage}
        data-tone={tone}
        role="status"
      >
        {message}
      </p>
    </div>
  );
}

export default LicenseCreditRedemptionAction;
