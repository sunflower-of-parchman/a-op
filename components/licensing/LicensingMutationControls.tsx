"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Licensing.module.css";

interface MutationEnvelope {
  readonly error?: { readonly message?: unknown };
}

export interface LicensingMutationAction {
  readonly label: string;
  readonly url: string;
}

export interface LicensingMutationControlsProps {
  readonly actions: readonly LicensingMutationAction[];
  readonly expectedRevision: number;
  readonly reasonRequired?: boolean;
  readonly subjectLabel: string;
}

interface PendingOperation {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

function publicError(payload: MutationEnvelope | null): string | null {
  const value = payload?.error?.message;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function LicensingMutationControls({
  actions,
  expectedRevision,
  reasonRequired = false,
  subjectLabel,
}: LicensingMutationControlsProps) {
  const router = useRouter();
  const pendingOperation = useRef<PendingOperation | null>(null);
  const [reason, setReason] = useState("");
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();

  async function run(action: LicensingMutationAction) {
    const normalizedReason = reason.trim();
    if (reasonRequired && normalizedReason.length === 0) {
      setTone("critical");
      setMessage("Record a reason before making this change.");
      return;
    }

    const body = {
      expectedRevision,
      ...(reasonRequired ? { reason: normalizedReason } : {}),
    };
    const serializedBody = JSON.stringify(body);
    const fingerprint = `${action.url}:${serializedBody}`;
    const pending = pendingOperation.current;
    const operation =
      pending?.fingerprint === fingerprint
        ? pending
        : { fingerprint, idempotencyKey: crypto.randomUUID() };
    pendingOperation.current = operation;
    setWorkingAction(action.url);
    setTone(undefined);
    setMessage(`${action.label} in progress…`);

    try {
      const response = await fetch(action.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operation.idempotencyKey,
        },
        body: serializedBody,
      });
      const payload = (await response
        .json()
        .catch(() => null)) as MutationEnvelope | null;
      if (!response.ok) {
        if (response.status < 500) pendingOperation.current = null;
        throw new Error(
          publicError(payload) ?? `${action.label} did not finish.`,
        );
      }

      pendingOperation.current = null;
      setReason("");
      setTone("positive");
      setMessage(`${action.label} complete.`);
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : `${action.label} did not finish.`,
      );
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <form
      aria-label={`${subjectLabel} actions`}
      className={styles.operation}
      onSubmit={(event) => event.preventDefault()}
    >
      {reasonRequired ? (
        <label className={styles.field}>
          <span>Reason</span>
          <input
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </label>
      ) : null}
      <div className={styles.formActions}>
        {actions.map((action) => (
          <button
            className="button button-secondary"
            disabled={workingAction !== null}
            key={action.url}
            onClick={() => run(action)}
            type="button"
          >
            {workingAction === action.url ? `${action.label}…` : action.label}
          </button>
        ))}
      </div>
      <p
        aria-live="polite"
        className={styles.operationMessage}
        data-tone={tone}
        role="status"
      >
        {message}
      </p>
    </form>
  );
}

export default LicensingMutationControls;
