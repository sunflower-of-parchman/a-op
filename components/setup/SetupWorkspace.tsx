"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommerceTestModeNotice } from "@/components/commerce/CommerceTestModeNotice";
import type { SetupWorkspace as SetupWorkspaceState } from "@/db/setup-state.ts";

import styles from "./SetupWorkspace.module.css";

export interface SetupWorkspaceProps {
  readonly initial: SetupWorkspaceState;
  readonly currentSourceFingerprint: string;
}

interface ApiError {
  readonly error?: { readonly message?: string };
}

interface PreviewResult {
  readonly plan: {
    readonly readyForApply: boolean;
    readonly writesPerformed: 0;
    readonly operations: readonly unknown[];
    readonly blockers: readonly string[];
  };
}

interface ApplyResult {
  readonly result: {
    readonly status: string;
    readonly operationCount: number;
    readonly stateFingerprint: string;
  };
  readonly replayed: boolean;
}

function dateTime(value: string | null): string {
  if (value === null) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function shortHash(value: string | null): string {
  if (value === null) return "Not recorded";
  return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(
      body.error?.message ?? "The setup operation could not be completed.",
    );
  }
  return body;
}

export function SetupWorkspace({
  currentSourceFingerprint,
  initial,
}: SetupWorkspaceProps) {
  const router = useRouter();
  const [proposalText, setProposalText] = useState("");
  const [approvalText, setApprovalText] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const [working, setWorking] = useState<
    "preview" | "apply" | "export" | "verify" | null
  >(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PreviewResult["plan"] | null>(null);

  function proposalInput(): { proposal: unknown; approval?: unknown } {
    if (proposalText.trim().length === 0) {
      throw new Error("Paste the setup proposal JSON first.");
    }
    return {
      proposal: JSON.parse(proposalText) as unknown,
      ...(approvalText.trim().length === 0
        ? {}
        : { approval: JSON.parse(approvalText) as unknown }),
    };
  }

  function exactInput(): { proposal: unknown; approval: unknown } {
    if (approvalText.trim().length === 0) {
      throw new Error("Paste the separate exact approval JSON first.");
    }
    return {
      ...proposalInput(),
      approval: JSON.parse(approvalText) as unknown,
    };
  }

  async function previewExactProposal() {
    setWorking("preview");
    setMessage(
      approvalText.trim().length === 0
        ? "Validating the proposal before approval without writing state."
        : "Validating the exact proposal and approval without writing state.",
    );
    setPreview(null);
    try {
      const body = await responseJson<PreviewResult>(
        await fetch("/api/admin/setup/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(proposalInput()),
        }),
      );
      setPreview(body.plan);
      setMessage(
        body.plan.readyForApply
          ? `Preview complete: ${body.plan.operations.length} deterministic operations, zero writes.`
          : `Preview is blocked by ${body.plan.blockers.length} required action${body.plan.blockers.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The setup preview could not be completed.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function applyExactProposal() {
    setWorking("apply");
    setMessage("Applying only the exact approved internal operations.");
    try {
      const body = await responseJson<ApplyResult>(
        await fetch("/api/admin/setup/apply", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `setup-apply-${crypto.randomUUID()}`,
          },
          body: JSON.stringify(exactInput()),
        }),
      );
      setMessage(
        `${body.replayed ? "Verified existing" : "Applied"} ${body.result.operationCount} operations. State ${shortHash(body.result.stateFingerprint)}.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The approved setup proposal could not be applied.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function exportArtistDefinitions() {
    setWorking("export");
    setMessage("Creating the customer-independent export in memory.");
    try {
      const response = await fetch("/api/admin/setup/export", {
        method: "POST",
        headers: {
          "idempotency-key": `setup-export-${crypto.randomUUID()}`,
        },
      });
      if (!response.ok) {
        await responseJson<never>(response);
      }
      const body = await response.blob();
      const downloadUrl = URL.createObjectURL(body);
      try {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "a-op-artist-installation.export.json";
        link.click();
      } finally {
        URL.revokeObjectURL(downloadUrl);
      }
      setMessage(
        "Export created. The archive contains artist definitions and logical media manifests without customer records or media bytes.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The artist-owned export could not be created.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function verifyArtistDefinitions() {
    if (archive === null) {
      setMessage("Choose an a-op artist installation export to verify.");
      return;
    }
    setWorking("verify");
    setMessage("Verifying the exact archive checksums and schema in memory.");
    try {
      const body = await responseJson<{
        result: {
          status: "verified";
          fileCount: number;
          semanticFingerprint: string;
        };
      }>(
        await fetch("/api/admin/setup/export/verify", {
          method: "POST",
          headers: {
            "content-type": "application/vnd.a-op.artist-export+json",
            "idempotency-key": `setup-export-verify-${crypto.randomUUID()}`,
          },
          body: archive,
        }),
      );
      setMessage(
        `Verified ${body.result.fileCount} definition files. Content ${shortHash(body.result.semanticFingerprint)}.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The artist-owned export could not be verified.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">ChatGPT Work setup</p>
        <h2>Proposal, approval, and recovery</h2>
        <p>
          ChatGPT Work prepares a complete fourteen-topic proposal. Preview
          validates the exact artifact with zero writes. Apply accepts only the
          artist owner’s approval for that proposal hash and records durable,
          replay-safe results.
        </p>
      </header>

      <CommerceTestModeNotice detail="This Build Week installation has one commerce domain permanently configured for Stripe Test Mode simulation. Setup exposes no live-commerce switch." />

      <output className={styles.output} aria-live="polite">
        {message}
      </output>

      <section className={styles.section} aria-labelledby="setup-state-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="setup-state-heading">Installation setup state</h3>
            <p>Only hashes, status, counts, and timestamps are stored in D1.</p>
          </div>
          <span className={styles.status} data-status={initial.state.status}>
            {initial.state.status.replaceAll("_", " ")}
          </span>
        </div>
        <dl className={styles.statusList}>
          <div>
            <dt>Revision</dt>
            <dd>{initial.state.revision}</dd>
          </div>
          <div>
            <dt>Proposal</dt>
            <dd>{shortHash(initial.state.lastProposalHash)}</dd>
          </div>
          <div>
            <dt>Current source</dt>
            <dd>
              <code>{currentSourceFingerprint}</code>
            </dd>
          </div>
          <div>
            <dt>State fingerprint</dt>
            <dd>{shortHash(initial.state.stateFingerprint)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{dateTime(initial.state.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="proposal-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="proposal-heading">Exact proposal review</h3>
            <p>
              Proposal and approval remain separate artifacts. External hosting,
              domain, DNS, email, public upload, and repository actions require
              their own Michael-approved action and are never executed here.
            </p>
          </div>
        </div>
        <div className={styles.editorGrid}>
          <label>
            <span>Proposal JSON</span>
            <textarea
              autoComplete="off"
              rows={14}
              spellCheck={false}
              value={proposalText}
              onChange={(event) => setProposalText(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Approval JSON</span>
            <textarea
              autoComplete="off"
              rows={14}
              spellCheck={false}
              value={approvalText}
              onChange={(event) => setApprovalText(event.currentTarget.value)}
            />
          </label>
        </div>
        <div className="action-row">
          <button
            className="button button-secondary"
            type="button"
            disabled={working !== null}
            onClick={previewExactProposal}
          >
            {working === "preview" ? "Previewing…" : "Preview with zero writes"}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={working !== null || preview?.readyForApply !== true}
            onClick={applyExactProposal}
          >
            {working === "apply" ? "Applying…" : "Apply exact approval"}
          </button>
        </div>
      </section>

      <section
        className={styles.section}
        aria-labelledby="applications-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="applications-heading">Application history</h3>
            <p>Reapply reuses the saved proposal and operation receipts.</p>
          </div>
        </div>
        {initial.applications.length === 0 ? (
          <p className={styles.empty}>No setup proposal has been applied.</p>
        ) : (
          <div className={styles.tableRegion} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Proposal</th>
                  <th scope="col">Operations</th>
                  <th scope="col">Approved</th>
                  <th scope="col">Completed</th>
                </tr>
              </thead>
              <tbody>
                {initial.applications.map((application) => (
                  <tr key={application.id}>
                    <td data-status={application.status}>
                      {application.status}
                      {application.safeFailureCode
                        ? ` · ${application.safeFailureCode}`
                        : ""}
                    </td>
                    <td>
                      <code>{shortHash(application.proposalHash)}</code>
                    </td>
                    <td>{application.operationCount}</td>
                    <td>{dateTime(application.approvedAt)}</td>
                    <td>{dateTime(application.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="exports-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="exports-heading">Artist-owned export history</h3>
            <p>
              Exports contain artist definitions and media manifests. Customer
              data, provider payloads, credentials, machine paths, and media
              bytes require separate approved workflows and are excluded.
            </p>
          </div>
        </div>
        <div className="action-row">
          <button
            className="button button-primary"
            type="button"
            disabled={working !== null}
            onClick={exportArtistDefinitions}
          >
            {working === "export"
              ? "Creating export…"
              : "Export artist definitions"}
          </button>
          <label>
            <span>Archive to verify</span>
            <input
              type="file"
              accept="application/json,application/vnd.a-op.artist-export+json,.json"
              disabled={working !== null}
              onChange={(event) =>
                setArchive(event.currentTarget.files?.item(0) ?? null)
              }
            />
          </label>
          <button
            className="button button-secondary"
            type="button"
            disabled={working !== null || archive === null}
            onClick={verifyArtistDefinitions}
          >
            {working === "verify" ? "Verifying…" : "Verify exact export"}
          </button>
        </div>
        {initial.exports.length === 0 ? (
          <p className={styles.empty}>No portability export is recorded.</p>
        ) : (
          <ul className={styles.exportList}>
            {initial.exports.map((entry) => (
              <li key={entry.id}>
                <span data-status={entry.status}>{entry.status}</span>
                <strong>{entry.fileCount} verified definition files</strong>
                <span>{entry.byteCount} bytes</span>
                <span>{dateTime(entry.verifiedAt ?? entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default SetupWorkspace;
