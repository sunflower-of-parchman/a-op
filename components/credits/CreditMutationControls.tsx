"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Credits.module.css";

interface MutationEnvelope {
  readonly error?: { readonly message?: unknown };
}

export interface CreditMutationAction {
  readonly body: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly url: string;
}

export interface CreditMutationControlsProps {
  readonly actions: readonly CreditMutationAction[];
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

export function CreditMutationControls({
  actions,
  subjectLabel,
}: CreditMutationControlsProps) {
  const router = useRouter();
  const pendingOperation = useRef<PendingOperation | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();

  async function run(action: CreditMutationAction) {
    const serializedBody = JSON.stringify(action.body);
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
    <div
      aria-label={`${subjectLabel} actions`}
      className={styles.operation}
      role="group"
    >
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
    </div>
  );
}

export default CreditMutationControls;
