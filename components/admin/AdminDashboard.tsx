import Link from "next/link";
import type { AdminDashboardData } from "@/lib/admin-dashboard/index.ts";

import styles from "./AdminDashboard.module.css";

interface AdminDashboardProps {
  readonly data: AdminDashboardData;
}

const RANGE_LINKS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Past week" },
  { key: "month", label: "Past month" },
  { key: "year", label: "Year to date" },
  { key: "all", label: "All time" },
] as const;

function CountMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  );
}

export function AdminDashboard({ data }: AdminDashboardProps) {
  return (
    <div className={styles.dashboard}>
      <nav className={styles.rangeNavigation} aria-label="Metrics range">
        {RANGE_LINKS.map(({ key, label }) => (
          <Link
            aria-current={data.range.key === key ? "page" : undefined}
            className={styles.rangeLink}
            data-current={data.range.key === key ? "true" : "false"}
            href={key === "today" ? "/admin" : `/admin?range=${key}`}
            key={key}
            prefetch={false}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className={styles.summary} aria-labelledby="summary-heading">
        <div className={styles.sectionHeading}>
          <h2 id="summary-heading">Activity</h2>
          <p>{data.range.label}</p>
        </div>
        <dl className={styles.primaryMetrics}>
          <CountMetric
            label="Active subscriptions"
            value={data.summary.activeSubscriptions}
          />
          <CountMetric
            label="Licenses issued"
            value={data.summary.licensesIssued}
          />
          <CountMetric label="Tracks sold" value={data.summary.tracksSold} />
          <CountMetric label="Track plays" value={data.telemetry.trackPlays} />
          <CountMetric
            label="Track downloads"
            value={data.summary.trackDownloads}
          />
        </dl>
      </section>

      {data.telemetry.active ? (
        <section className={styles.activity} aria-labelledby="website-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="website-heading">Website activity</h2>
              <p>
                First-party, consent-aware totals from {data.range.fromDayUtc}{" "}
                to {data.range.toDayUtc}.
              </p>
            </div>
          </div>
          <dl className={styles.activityTotals}>
            <CountMetric label="Actions" value={data.telemetry.eventCount} />
            <CountMetric
              label="Session-days"
              value={data.telemetry.sessionCount}
            />
            <CountMetric
              label="Linked account-days"
              value={data.telemetry.linkedUserCount}
            />
          </dl>
          <div
            className={styles.actionTable}
            role="table"
            aria-label="Top actions"
          >
            <div className={styles.actionHeader} role="row">
              <span role="columnheader">Top action</span>
              <span role="columnheader">Count</span>
            </div>
            {data.telemetry.actions.length > 0 ? (
              data.telemetry.actions.map((action) => (
                <div
                  className={styles.actionRow}
                  role="row"
                  key={action.eventName}
                >
                  <span role="cell">{action.label}</span>
                  <span role="cell">{action.count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className={styles.emptyState}>No activity in this range.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
