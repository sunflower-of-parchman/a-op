"use client";

import { useState } from "react";

export function OwnerBootstrapControl() {
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function bootstrap() {
    setWorking(true);
    setMessage("Creating the owner authority record…");
    try {
      const response = await fetch("/api/setup/owner", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ confirm: "bootstrap-owner" }),
      });
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Owner bootstrap could not finish.",
        );
      }
      setMessage("Owner authority created. Administration is ready.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Owner bootstrap could not finish.",
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
        onClick={bootstrap}
        type="button"
      >
        Confirm owner bootstrap
      </button>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </div>
  );
}
