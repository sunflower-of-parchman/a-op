"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createDefaultLegalSetupAnswers,
  type AdminLegalDocumentDTO,
  type LegalSetupAnswers,
  type LegalTelemetryMode,
} from "@/lib/legal/index.ts";
import styles from "./LegalDocuments.module.css";

interface MutationResponse {
  result?: {
    draftVersionId?: string;
    approvedVersionId?: string;
    publishedVersionId?: string;
    version?: number;
    revision?: number;
  };
  error?: { message?: string };
}

async function mutate(
  path: string,
  method: "PUT" | "POST",
  input: unknown,
): Promise<MutationResponse> {
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as MutationResponse;
  if (!response.ok) {
    throw new Error(
      body.error?.message ?? "The legal document change could not be saved.",
    );
  }
  return body;
}

function checked(data: FormData, name: string): boolean {
  return data.get(name) === "on";
}

export function LegalDocumentWorkspace({
  initial,
}: {
  readonly initial: AdminLegalDocumentDTO;
}) {
  const router = useRouter();
  const initialAnswers =
    initial.draft.setupAnswers ?? createDefaultLegalSetupAnswers();
  const [revision, setRevision] = useState(initial.revision);
  const [draftVersion, setDraftVersion] = useState(initial.draft.version);
  const [draftVersionId, setDraftVersionId] = useState(initial.draft.id);
  const [approvedVersionId, setApprovedVersionId] = useState(
    initial.approved?.id ?? null,
  );
  const [publishedVersionId, setPublishedVersionId] = useState(
    initial.published?.id ?? null,
  );
  const [setupComplete, setSetupComplete] = useState(
    initial.draft.setupAnswers !== null,
  );
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const data = new FormData(event.currentTarget);
    const services = String(data.get("services") ?? "")
      .split("\n")
      .map((service) => service.trim())
      .filter(Boolean);
    const setupAnswers: LegalSetupAnswers = {
      customerAccounts: checked(data, "customerAccounts"),
      identityProvider: "Sign in with ChatGPT",
      publicContactEmail: String(data.get("publicContactEmail") ?? ""),
      contactSubmissions: checked(data, "contactSubmissions"),
      telemetryMode: String(data.get("telemetryMode")) as LegalTelemetryMode,
      telemetryRetentionDays: Number(data.get("telemetryRetentionDays")),
      retentionStatement: String(data.get("retentionStatement") ?? ""),
      downloads: checked(data, "downloads"),
      protectedAccess: checked(data, "protectedAccess"),
      memberships: checked(data, "memberships"),
      subscriptions: checked(data, "subscriptions"),
      licensing: checked(data, "licensing"),
      stripeEnvironment: "test",
      stripeCheckout: "Stripe-hosted Test Checkout",
      realPaymentsAccepted: false,
      paymentCardDataHandledByAop: false,
      structuredDataStorage: "Sites-provided D1",
      fileStorage: "Sites-provided R2",
      sitesResidencyAtLaunch: "not_supported",
      services,
    };
    setWorking(true);
    setMessage("Saving a new immutable legal draft…");
    try {
      const response = await mutate(`/api/admin/legal/${initial.id}`, "PUT", {
        expectedRevision: revision,
        document: {
          documentId: initial.id,
          title: data.get("title"),
          introduction: data.get("introduction"),
          bodyText: data.get("bodyText"),
          setupAnswers,
        },
      });
      if (typeof response.result?.revision === "number") {
        setRevision(response.result.revision);
      }
      if (typeof response.result?.version === "number") {
        setDraftVersion(response.result.version);
      }
      if (typeof response.result?.draftVersionId === "string") {
        setDraftVersionId(response.result.draftVersionId);
      }
      setApprovedVersionId(null);
      setSetupComplete(true);
      setReviewConfirmed(false);
      setMessage(
        "Draft saved. The previously published version remains public until this exact draft is approved and published.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The draft could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeState(action: "approve" | "publish") {
    if (working) return;
    setWorking(true);
    setMessage(
      action === "approve"
        ? "Recording explicit owner approval for this exact draft…"
        : "Publishing the approved exact draft…",
    );
    try {
      const response = await mutate(
        `/api/admin/legal/${initial.id}/${action}`,
        "POST",
        { expectedRevision: revision, expectedDraftVersionId: draftVersionId },
      );
      if (typeof response.result?.revision === "number") {
        setRevision(response.result.revision);
      }
      if (action === "approve") {
        setApprovedVersionId(draftVersionId);
        setMessage(
          "Exact draft approved by the owner. Publication remains a separate action.",
        );
      } else {
        setPublishedVersionId(draftVersionId);
        setMessage("Approved legal version published.");
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The legal document state could not be changed.",
      );
    } finally {
      setWorking(false);
    }
  }

  const draftApproved = approvedVersionId === draftVersionId;
  const draftPublished = publishedVersionId === draftVersionId;

  return (
    <div className={styles.workspace}>
      <header className={styles.headingGroup}>
        <p className={styles.eyebrow}>Artist-reviewed legal starter</p>
        <h2>{initial.title}</h2>
        <p>
          Guided answers and written terms are frozen together in every version.
          The owner’s approval applies only to the exact current draft.
        </p>
        <p className={styles.caution}>
          This workflow supports artist review and is not legal advice.
        </p>
      </header>

      <dl className={styles.workspaceFacts}>
        <div>
          <dt>Root revision</dt>
          <dd>{revision}</dd>
        </div>
        <div>
          <dt>Current draft</dt>
          <dd>Version {draftVersion}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{draftApproved ? "Exact draft approved" : "Review required"}</dd>
        </div>
        <div>
          <dt>Public version</dt>
          <dd>
            {publishedVersionId
              ? draftPublished
                ? `Version ${draftVersion}`
                : "Earlier approved version"
              : "Existing page fallback"}
          </dd>
        </div>
      </dl>

      <p aria-live="polite" className={styles.operation} role="status">
        {message}
      </p>

      <form className={styles.form} onSubmit={save}>
        <section className={styles.formSection} aria-labelledby="legal-writing">
          <div className={styles.sectionHeading}>
            <h3 id="legal-writing">Document writing</h3>
            <p>Saving creates a new immutable version and clears approval.</p>
          </div>
          <label className={styles.field}>
            <span>Title</span>
            <input
              defaultValue={initial.draft.title}
              maxLength={160}
              name="title"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Introduction</span>
            <textarea
              defaultValue={initial.draft.introduction}
              maxLength={4000}
              name="introduction"
              rows={4}
            />
          </label>
          <label className={styles.field}>
            <span>Document body</span>
            <textarea
              defaultValue={initial.draft.bodyText}
              maxLength={40000}
              name="bodyText"
              required
              rows={18}
            />
          </label>
        </section>

        <section className={styles.formSection} aria-labelledby="legal-setup">
          <div className={styles.sectionHeading}>
            <h3 id="legal-setup">Guided installation facts</h3>
            <p>
              Record the capabilities and retention choices reflected in the
              document.
            </p>
          </div>
          <div className={styles.checkboxGrid}>
            {[
              ["customerAccounts", "Customer accounts"],
              ["contactSubmissions", "Contact submissions"],
              ["downloads", "Protected downloads"],
              ["protectedAccess", "Customer access and entitlements"],
              ["memberships", "Memberships"],
              ["subscriptions", "Subscriptions"],
              ["licensing", "Music licensing"],
            ].map(([name, label]) => (
              <label className={styles.checkbox} key={name}>
                <input
                  defaultChecked={Boolean(
                    initialAnswers[name as keyof LegalSetupAnswers],
                  )}
                  name={name}
                  type="checkbox"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Public contact email</span>
              <input
                defaultValue={initialAnswers.publicContactEmail}
                maxLength={320}
                name="publicContactEmail"
                type="email"
              />
            </label>
            <label className={styles.field}>
              <span>Telemetry collection</span>
              <select
                defaultValue={initialAnswers.telemetryMode}
                name="telemetryMode"
              >
                <option value="disabled">Disabled</option>
                <option value="consent_required">Consent required</option>
                <option value="anonymous">Anonymous</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Telemetry retention days</span>
              <input
                defaultValue={initialAnswers.telemetryRetentionDays}
                max={365}
                min={1}
                name="telemetryRetentionDays"
                required
                type="number"
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Retention statement</span>
            <textarea
              defaultValue={initialAnswers.retentionStatement}
              maxLength={2000}
              name="retentionStatement"
              required
              rows={5}
            />
          </label>
          <label className={styles.field}>
            <span>Services involved, one per line</span>
            <textarea
              defaultValue={initialAnswers.services.join("\n")}
              name="services"
              rows={6}
            />
          </label>
        </section>

        <section className={styles.fixedFacts} aria-labelledby="fixed-facts">
          <div className={styles.sectionHeading}>
            <h3 id="fixed-facts">Fixed Sites facts</h3>
            <p>These values remain fixed in this Build Week installation.</p>
          </div>
          <dl>
            <div>
              <dt>Identity</dt>
              <dd>Sign in with ChatGPT</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>Sites-provided D1 and R2</dd>
            </div>
            <div>
              <dt>Commerce</dt>
              <dd>
                Stripe-hosted Test Checkout · No real payment will be accepted
              </dd>
            </div>
            <div>
              <dt>Card data</dt>
              <dd>a-op does not collect or store payment-card fields</dd>
            </div>
            <div>
              <dt>Residency</dt>
              <dd>
                Sites does not support data residency or inference residency at
                launch
              </dd>
            </div>
          </dl>
        </section>

        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={working}
            type="submit"
          >
            Save new draft version
          </button>
          <label className={styles.reviewConfirmation}>
            <input
              checked={reviewConfirmed}
              onChange={(event) => setReviewConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>I reviewed this exact draft and its setup facts.</span>
          </label>
          <button
            className="button button-secondary"
            disabled={
              working || draftApproved || !reviewConfirmed || !setupComplete
            }
            onClick={() => changeState("approve")}
            type="button"
          >
            Approve exact draft
          </button>
          <button
            className="button button-secondary"
            disabled={working || !draftApproved || draftPublished}
            onClick={() => changeState("publish")}
            type="button"
          >
            Publish approved draft
          </button>
        </div>
      </form>

      <section className={styles.history} aria-labelledby="legal-history">
        <div className={styles.sectionHeading}>
          <h3 id="legal-history">Version history</h3>
          <p>Saved writing and guided answers remain frozen by version.</p>
        </div>
        <div className={styles.historyRows}>
          {initial.history.map((version) => (
            <details className={styles.historyRow} key={version.id}>
              <summary>
                Version {version.version} · {version.title}
                {version.id === initial.published?.id
                  ? " · public"
                  : version.approvedAt
                    ? " · approved"
                    : " · draft"}
              </summary>
              <p>{version.introduction}</p>
              <p className={styles.historyBody}>{version.bodyText}</p>
              <small>
                Created {version.createdAt}
                {version.approvedAt ? ` · approved ${version.approvedAt}` : ""}
                {version.setupAnswers
                  ? " · setup complete"
                  : " · starter setup incomplete"}
              </small>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
