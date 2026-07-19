"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DownloadCreditTargetDTO,
  DownloadCreditTargetState,
} from "@/db/download-credit-redemption.ts";

import styles from "./Credits.module.css";

interface RedemptionEnvelope {
  readonly result?: { readonly entitlementId?: unknown };
  readonly error?: { readonly message?: unknown };
}

export interface DownloadCreditRedemptionActionProps {
  readonly availableCredits: number;
  readonly target: DownloadCreditTargetDTO;
}

function publicError(payload: RedemptionEnvelope | null): string | null {
  const value = payload?.error?.message;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function statusLabel(state: DownloadCreditTargetState): string {
  if (state === "available") return "Ready for one credit";
  if (state === "prepared")
    return "Download entitlement prepared · credit not spent";
  if (state === "reserved") return "Credit reserved · ready to resume";
  if (state === "consumed")
    return "Credit consumed · entitlement ready to resume";
  if (state === "redeemed") return "Download entitlement active";
  return "Credit purpose closed";
}

export function DownloadCreditRedemptionAction({
  availableCredits,
  target,
}: DownloadCreditRedemptionActionProps) {
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();
  const [working, setWorking] = useState(false);
  const recoverable =
    target.state === "prepared" ||
    target.state === "reserved" ||
    target.state === "consumed";
  const canRedeem = target.state === "available" && availableCredits >= 1;

  async function redeem() {
    operationKey.current ??= crypto.randomUUID();
    setWorking(true);
    setTone(undefined);
    setMessage(
      recoverable
        ? "Resuming the exact download-credit redemption…"
        : "Reserving one download credit…",
    );

    try {
      const response = await fetch(
        `/api/credits/downloads/${encodeURIComponent(target.trackId)}/redeem`,
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
          publicError(payload) ?? "Download-credit redemption did not finish.",
        );
      }

      operationKey.current = null;
      setTone("positive");
      setMessage("Download entitlement created from one Test-mode credit.");
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : "Download-credit redemption did not finish.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.operation}>
      <div className={styles.formActions}>
        {target.state === "redeemed" && target.downloadUrl ? (
          <a
            aria-label={`Download ${target.title}`}
            className="button button-secondary"
            href={target.downloadUrl}
          >
            Download
          </a>
        ) : recoverable || canRedeem ? (
          <button
            className="button button-secondary"
            disabled={working}
            onClick={redeem}
            type="button"
          >
            {working
              ? "Redeeming download credit…"
              : recoverable
                ? "Resume download-credit redemption"
                : "Use one download credit"}
          </button>
        ) : null}
        <span className={styles.recordMeta}>{statusLabel(target.state)}</span>
      </div>

      {target.state === "available" && availableCredits < 1 ? (
        <p className={styles.operationMessage} data-tone="critical">
          There are not enough available download credits.
        </p>
      ) : target.state === "unavailable" ? (
        <p className={styles.operationMessage} data-tone="critical">
          This track already has a closed download-credit purpose.
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

export default DownloadCreditRedemptionAction;
