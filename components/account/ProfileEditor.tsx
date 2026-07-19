"use client";

import { useState, type FormEvent } from "react";

export interface ProfileEditorProps {
  readonly displayName: string;
  readonly revision: number;
}

export function ProfileEditor({
  displayName: initialDisplayName,
  revision: initialRevision,
}: ProfileEditorProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [revision, setRevision] = useState(initialRevision);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("Saving…");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ displayName, expectedRevision: revision }),
      });
      const body = (await response.json()) as {
        result?: { revision?: number };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The profile could not be saved.",
        );
      }
      if (typeof body.result?.revision === "number") {
        setRevision(body.result.revision);
      }
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The profile could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="working-form" onSubmit={submit}>
      <label className="field-group">
        <span>Display name</span>
        <input
          maxLength={120}
          name="displayName"
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </label>
      <div className="working-form__actions">
        <button
          className="button button-primary"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving" : "Save profile"}
        </button>
        <p aria-live="polite" role="status">
          {message}
        </p>
      </div>
    </form>
  );
}
