"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function CustomerActivationControl() {
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function activate() {
    operationKey.current ??= crypto.randomUUID();
    setWorking(true);
    setMessage("Activating your customer account…");

    try {
      const response = await fetch("/api/account/activate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey.current,
        },
        body: "{}",
      });
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The customer account could not be activated.",
        );
      }

      setMessage("Customer account activated.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The customer account could not be activated.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="working-form__actions">
      <button
        className="button button-primary"
        disabled={working}
        onClick={activate}
        type="button"
      >
        {working ? "Activating" : "Activate customer account"}
      </button>
      <p aria-live="polite" className="operation-message" role="status">
        {message}
      </p>
    </div>
  );
}
