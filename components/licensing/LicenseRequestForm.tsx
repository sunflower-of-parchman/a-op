"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Licensing.module.css";

interface LicenseRequestEnvelope {
  readonly result?: { readonly state?: unknown };
  readonly error?: { readonly message?: unknown };
}

export interface LicenseRequestFormProps {
  readonly licenseOfferId: string;
  readonly optionLabel: string;
}

function errorMessage(payload: LicenseRequestEnvelope | null): string | null {
  const value = payload?.error?.message;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function LicenseRequestForm({
  licenseOfferId,
  optionLabel,
}: LicenseRequestFormProps) {
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [licenseeName, setLicenseeName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"critical" | "positive" | undefined>();
  const [working, setWorking] = useState(false);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    operationKey.current ??= crypto.randomUUID();
    setWorking(true);
    setTone(undefined);
    setMessage("Submitting the exact intended use…");

    try {
      const response = await fetch("/api/licensing/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey.current,
        },
        body: JSON.stringify({
          licenseOfferId,
          licenseeName,
          projectTitle,
          intendedUse,
          projectDescription,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as LicenseRequestEnvelope | null;
      if (!response.ok) {
        if (response.status < 500) operationKey.current = null;
        throw new Error(
          errorMessage(payload) ?? "The licensing request did not finish.",
        );
      }

      operationKey.current = null;
      setTone("positive");
      setMessage(
        payload?.result?.state === "pending_approval"
          ? "Request submitted for artist approval."
          : "Request submitted. Its frozen terms are now in your account.",
      );
      router.refresh();
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : "The licensing request did not finish.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submitRequest}>
      <div className={styles.headingGroup}>
        <h4>Request {optionLabel}</h4>
        <p className={styles.supportingText}>
          Describe the exact project and intended use. The submitted offer,
          terms version, option, track revision, and description are frozen
          together.
        </p>
      </div>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Licensee name</span>
          <input
            autoComplete="organization"
            maxLength={160}
            onChange={(event) => setLicenseeName(event.target.value)}
            required
            value={licenseeName}
          />
        </label>
        <label className={styles.field}>
          <span>Project title</span>
          <input
            maxLength={240}
            onChange={(event) => setProjectTitle(event.target.value)}
            required
            value={projectTitle}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span>Exact intended use</span>
        <textarea
          maxLength={2000}
          onChange={(event) => setIntendedUse(event.target.value)}
          required
          rows={4}
          value={intendedUse}
        />
        <small>Include how and where the music will appear.</small>
      </label>
      <label className={styles.field}>
        <span>Project description</span>
        <textarea
          maxLength={12000}
          onChange={(event) => setProjectDescription(event.target.value)}
          required
          rows={5}
          value={projectDescription}
        />
      </label>
      <div className={styles.formActions}>
        <button
          className="button button-primary"
          disabled={working}
          type="submit"
        >
          {working ? "Submitting request" : "Submit licensing request"}
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

export default LicenseRequestForm;
