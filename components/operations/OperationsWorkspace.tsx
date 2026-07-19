"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type {
  OperationsAccessExplanation,
  OperationsOverview,
} from "@/lib/operations/types.ts";
import styles from "./OperationsWorkspace.module.css";

export interface OperationsWorkspaceProps {
  readonly overview: OperationsOverview;
  readonly telemetryActive: boolean;
}

interface ApiEnvelope<T> {
  readonly result?: T;
  readonly error?: { readonly message?: string };
}

function dateTime(value: string | null): string {
  if (value === null) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

async function readApi<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || body.result === undefined) {
    throw new Error(
      body.error?.message ?? "The operation could not be completed.",
    );
  }
  return body.result;
}

export function OperationsWorkspace({
  overview,
  telemetryActive,
}: OperationsWorkspaceProps) {
  const [jobResult, setJobResult] = useState<string>("");
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [explanation, setExplanation] =
    useState<OperationsAccessExplanation | null>(null);
  const [explanationStatus, setExplanationStatus] = useState<string>("");

  async function retryJob(jobId: string, expectedAttemptCount: number) {
    setRetryingJobId(jobId);
    setJobResult("");
    try {
      const result = await readApi<{
        readonly jobId: string;
        readonly status: string;
        readonly attemptCount: number;
      }>(
        await fetch(
          `/api/admin/operations/jobs/${encodeURIComponent(jobId)}/retry`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": `operations-retry-${crypto.randomUUID()}`,
            },
            body: JSON.stringify({ expectedAttemptCount }),
          },
        ),
      );
      setJobResult(
        `${result.jobId} is ${result.status} with ${result.attemptCount} preserved attempts.`,
      );
    } catch (error) {
      setJobResult(
        error instanceof Error
          ? error.message
          : "The retry could not be completed.",
      );
    } finally {
      setRetryingJobId(null);
    }
  }

  async function explainAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExplanation(null);
    setExplanationStatus("Resolving current D1 access facts.");
    const data = new FormData(event.currentTarget);
    try {
      const result = await readApi<OperationsAccessExplanation>(
        await fetch("/api/admin/operations/access-explanation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerUserId: data.get("customerUserId"),
            resourceType: data.get("resourceType"),
            resourceId: data.get("resourceId"),
            action: data.get("action"),
          }),
        }),
      );
      setExplanation(result);
      setExplanationStatus("");
    } catch (error) {
      setExplanationStatus(
        error instanceof Error
          ? error.message
          : "The access explanation could not be resolved.",
      );
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">Owner operations</p>
        <h2>System state and recovery</h2>
        <p>
          Current D1, R2, identity, media, and job evidence is projected as
          statuses, counts, stable application identifiers, and timestamps.
        </p>
        <p className={styles.generated}>
          Generated {dateTime(overview.generatedAt)}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="diagnostic-heading">
        <h3 id="diagnostic-heading">Diagnostics</h3>
        <dl className={styles.diagnostics}>
          <div data-status={overview.database.status}>
            <dt>D1 and schema</dt>
            <dd>{overview.database.status}</dd>
            <dd>
              Schema version {overview.database.schemaVersion ?? "unavailable"}{" "}
              of {overview.database.expectedSchemaVersion}
            </dd>
            <dd>{overview.database.tableCount} tables</dd>
          </div>
          <div data-status={overview.storage.status}>
            <dt>R2</dt>
            <dd>{overview.storage.status}</dd>
            <dd>
              {overview.storage.objectCount === null
                ? "Count unavailable"
                : `${overview.storage.objectCount} objects`}
            </dd>
          </div>
          <div data-status={overview.identity.status}>
            <dt>Identity</dt>
            <dd>{overview.identity.status}</dd>
            <dd>{overview.identity.activeOwnerCount} owners</dd>
            <dd>{overview.identity.activeEditorCount} editors</dd>
            <dd>{overview.identity.activeCustomerCount} customers</dd>
          </div>
          <div data-status={overview.media.status}>
            <dt>Media</dt>
            <dd>{overview.media.status}</dd>
            <dd>{overview.media.readySourceCount} ready sources</dd>
            <dd>{overview.media.readyDerivativeCount} ready derivatives</dd>
            <dd>
              {overview.media.failedSourceCount +
                overview.media.failedDerivativeCount}{" "}
              failed records
            </dd>
          </div>
          <div data-status={overview.jobs.status}>
            <dt>Media jobs</dt>
            <dd>{overview.jobs.status}</dd>
            <dd>{overview.jobs.pendingCount} pending</dd>
            <dd>{overview.jobs.processingCount} processing</dd>
            <dd>{overview.jobs.failedCount} failed</dd>
            <dd>{overview.jobs.staleCount} stale</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="jobs-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="jobs-heading">Media jobs</h3>
            <p>
              Retry preserves every recorded attempt and writes one audit
              receipt.
            </p>
          </div>
          <output className={styles.output} aria-live="polite">
            {jobResult}
          </output>
        </div>
        {overview.recentJobs.length === 0 ? (
          <p className={styles.empty}>No media jobs are recorded.</p>
        ) : (
          <div className={styles.tableRegion} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Source</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <code>{job.id}</code>
                    </td>
                    <td>
                      <code>{job.sourceMediaId}</code>
                    </td>
                    <td>{job.derivativeKind}</td>
                    <td data-status={job.stale ? "attention" : job.status}>
                      {job.stale ? "stale" : job.status}
                    </td>
                    <td>{job.attemptCount}</td>
                    <td>{dateTime(job.updatedAt)}</td>
                    <td>
                      {job.retryable ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={retryingJobId !== null}
                          onClick={() => retryJob(job.id, job.attemptCount)}
                        >
                          {retryingJobId === job.id ? "Retrying…" : "Retry"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="access-heading">
        <h3 id="access-heading">Access explanation</h3>
        <p>
          Resolve an exact D1 customer and resource, then run the central access
          decision contract against current server-owned facts.
        </p>
        <form className={styles.explanationForm} onSubmit={explainAccess}>
          <label>
            Customer user ID
            <input name="customerUserId" required maxLength={128} />
          </label>
          <label>
            Resource type
            <select name="resourceType" defaultValue="track">
              <option value="track">Track</option>
              <option value="release">Release</option>
              <option value="collection">Collection</option>
              <option value="course">Course</option>
              <option value="lesson">Lesson</option>
              <option value="license-document">License document</option>
            </select>
          </label>
          <label>
            Resource ID
            <input name="resourceId" required maxLength={128} />
          </label>
          <label>
            Action
            <select name="action" defaultValue="view">
              <option value="view">View</option>
              <option value="stream">Stream</option>
              <option value="download">Download</option>
            </select>
          </label>
          <button className="button button-primary" type="submit">
            Explain access
          </button>
        </form>
        <output className={styles.output} aria-live="polite">
          {explanationStatus}
        </output>
        {explanation ? (
          <dl className={styles.explanationResult}>
            <div>
              <dt>Customer</dt>
              <dd>
                <code>{explanation.customerUserId}</code>
              </dd>
            </div>
            <div>
              <dt>Resource</dt>
              <dd>
                <code>
                  {explanation.resourceType}:{explanation.resourceId}
                </code>
              </dd>
            </div>
            <div>
              <dt>Resource state</dt>
              <dd>{explanation.resourceStatus}</dd>
            </div>
            <div>
              <dt>Access mode</dt>
              <dd>{explanation.accessMode}</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>{explanation.decision.allowed ? "allowed" : "denied"}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{explanation.decision.reason}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{explanation.decision.source}</dd>
            </div>
            <div>
              <dt>Decision time</dt>
              <dd>{dateTime(explanation.decidedAt)}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="failures-heading">
        <h3 id="failures-heading">Operational failures</h3>
        {overview.recentFailures.length === 0 ? (
          <p className={styles.empty}>No operational failures are recorded.</p>
        ) : (
          <ul className={styles.eventList}>
            {overview.recentFailures.map((failure) => (
              <li key={failure.id}>
                <code>{failure.id}</code>
                <strong>{failure.code}</strong>
                <span>
                  {failure.component} · {failure.severity}
                </span>
                <span>{failure.occurrenceCount} occurrences</span>
                <time dateTime={failure.lastOccurredAt}>
                  {dateTime(failure.lastOccurredAt)}
                </time>
                <span>{failure.resolvedAt ? "resolved" : "open"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="audit-heading">
        <h3 id="audit-heading">Redacted audit projection</h3>
        <p>
          Stored JSON is parsed and re-redacted before this projection is
          returned to the browser.
        </p>
        {overview.recentAuditEvents.length === 0 ? (
          <p className={styles.empty}>No audit events are recorded.</p>
        ) : (
          <ul className={styles.auditList}>
            {overview.recentAuditEvents.map((event) => (
              <li key={event.id}>
                <div>
                  <code>{event.id}</code>
                  <strong>{event.action}</strong>
                  <span>
                    {event.subjectType}:{event.subjectId}
                  </span>
                  <time dateTime={event.createdAt}>
                    {dateTime(event.createdAt)}
                  </time>
                </div>
                <pre>
                  {JSON.stringify(
                    { details: event.details, result: event.result },
                    null,
                    2,
                  )}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      {telemetryActive ? (
        <section
          className={styles.section}
          aria-labelledby="maintenance-heading"
        >
          <h3 id="maintenance-heading">Maintenance</h3>
          <p>
            Telemetry aggregation and retention pruning remain in the telemetry
            workspace with their current consent and retention controls.
          </p>
          <Link className="button button-secondary" href="/admin/telemetry">
            Open telemetry maintenance
          </Link>
        </section>
      ) : null}
    </div>
  );
}
