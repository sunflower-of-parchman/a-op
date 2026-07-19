"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { TelemetryAdminWorkspaceDTO } from "@/lib/telemetry/index.ts";
import styles from "./Telemetry.module.css";

async function mutate(path: string, input: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message ?? "The telemetry operation failed.");
  }
}

function yesterdayUtc(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function TelemetryAdminWorkspace({
  workspace,
}: {
  readonly workspace: TelemetryAdminWorkspaceDTO;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function settings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("Saving telemetry settings…");
    try {
      await mutate("/api/admin/telemetry/settings", {
        collectionMode: data.get("collectionMode"),
        retentionDays: Number(data.get("retentionDays")),
        meaningfulListenSeconds: Number(data.get("meaningfulListenSeconds")),
        expectedRevision: workspace.settings.revision,
      });
      setMessage("Telemetry settings saved and active for new requests.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings failed.");
    } finally {
      setPending(false);
    }
  }

  async function aggregate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("Aggregating the completed UTC day…");
    try {
      await mutate("/api/admin/telemetry/aggregate", {
        dayUtc: data.get("dayUtc"),
      });
      setMessage("UTC-day aggregate finalized.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Aggregation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function prune() {
    if (pending) return;
    setPending(true);
    setMessage("Checking aggregate coverage and applying retention…");
    try {
      await mutate("/api/admin/telemetry/prune", {});
      setMessage("Eligible source events were pruned. Aggregate facts remain.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Retention failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">First-party telemetry</p>
        <h2>Audience activity</h2>
        <p>
          Review aggregate actions and daily sessions. Source events contain
          allowlisted internal resource identifiers and no free-form visitor,
          URL, search, payment, card, or provider data.
        </p>
      </header>

      <section
        className="workspace-section"
        aria-labelledby="telemetry-settings-heading"
      >
        <div className="workspace-section-heading">
          <h3 id="telemetry-settings-heading">Collection and retention</h3>
          <p>Each saved change governs the next server request immediately.</p>
        </div>
        <form className={styles.form} onSubmit={settings}>
          <label className={styles.field}>
            <span>Collection mode</span>
            <select
              defaultValue={workspace.settings.collectionMode}
              name="collectionMode"
            >
              <option value="disabled">Disabled</option>
              <option value="consent_required">Consent required</option>
              <option value="anonymous">Anonymous first party</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Source-event retention days</span>
            <input
              defaultValue={workspace.settings.retentionDays}
              max={365}
              min={1}
              name="retentionDays"
              required
              type="number"
            />
          </label>
          <label className={styles.field}>
            <span>Meaningful-listen seconds</span>
            <input
              defaultValue={workspace.settings.meaningfulListenSeconds}
              max={300}
              min={5}
              name="meaningfulListenSeconds"
              required
              type="number"
            />
          </label>
          <button
            className="button button-primary"
            disabled={pending}
            type="submit"
          >
            Save settings
          </button>
        </form>
      </section>

      <section
        className="workspace-section"
        aria-labelledby="telemetry-summary-heading"
      >
        <div className="workspace-section-heading">
          <h3 id="telemetry-summary-heading">Selected period</h3>
          <p>
            {workspace.range.fromDayUtc} through {workspace.range.toDayUtc},
            UTC. Today is live. Completed days become durable through
            finalization.
          </p>
        </div>
        <form action="/admin/telemetry" className={styles.range} method="get">
          <label className={styles.field}>
            <span>From UTC day</span>
            <input
              defaultValue={workspace.range.fromDayUtc}
              max={workspace.range.toDayUtc}
              name="from"
              required
              type="date"
            />
          </label>
          <label className={styles.field}>
            <span>Through UTC day</span>
            <input
              defaultValue={workspace.range.toDayUtc}
              min={workspace.range.fromDayUtc}
              name="to"
              required
              type="date"
            />
          </label>
          <button className="button button-secondary" type="submit">
            View period
          </button>
        </form>
        <dl className={styles.totals}>
          <div>
            <dt>Actions</dt>
            <dd>{workspace.totals.eventCount}</dd>
          </div>
          <div>
            <dt>Session-days</dt>
            <dd>{workspace.totals.sessionCount}</dd>
          </div>
          <div>
            <dt>Linked account-days</dt>
            <dd>{workspace.totals.linkedUserCount}</dd>
          </div>
        </dl>
        <div className={styles.tableFrame}>
          <table>
            <thead>
              <tr>
                <th scope="col">UTC day</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Events</th>
                <th scope="col">Sessions</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {workspace.rows.map((row) => (
                <tr
                  key={`${row.dayUtc}:${row.eventName}:${row.resourceType}:${row.resourceId}`}
                >
                  <td>{row.dayUtc}</td>
                  <td>{row.eventName}</td>
                  <td>
                    {row.resourceType} · {row.resourceId}
                  </td>
                  <td>{row.eventCount}</td>
                  <td>{row.sessionCount}</td>
                  <td>{row.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {workspace.rows.length === 0 ? (
          <p className={styles.empty}>
            No aggregate activity is available for this period.
          </p>
        ) : null}
      </section>

      <section
        className="workspace-section"
        aria-labelledby="telemetry-operations-heading"
      >
        <div className="workspace-section-heading">
          <h3 id="telemetry-operations-heading">Daily operation</h3>
          <p>
            Finalize a completed UTC day before retention can remove its source
            events. Replay leaves one aggregate and one operation receipt.
          </p>
        </div>
        <form className={styles.operation} onSubmit={aggregate}>
          <label className={styles.field}>
            <span>Completed UTC day</span>
            <input
              defaultValue={yesterdayUtc()}
              max={yesterdayUtc()}
              name="dayUtc"
              required
              type="date"
            />
          </label>
          <button
            className="button button-secondary"
            disabled={pending}
            type="submit"
          >
            Finalize day
          </button>
        </form>
        <div className={styles.operation}>
          <p>
            Retention is {workspace.settings.retentionDays} days. Aggregate
            facts remain after eligible source events are removed.
          </p>
          <button
            className="button button-secondary"
            disabled={pending}
            onClick={() => void prune()}
            type="button"
          >
            Apply retention safely
          </button>
        </div>
        <p aria-live="polite" className={styles.message} role="status">
          {message}
        </p>
      </section>
    </div>
  );
}
