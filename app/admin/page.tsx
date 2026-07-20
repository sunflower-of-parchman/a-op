import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AdminDashboard } from "@/components/admin";
import { readAdminDashboardSummary } from "@/db/admin-dashboard-read.ts";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import { readTelemetryAdminWorkspace } from "@/db/telemetry-read.ts";
import {
  resolveAdminDashboardRange,
  type AdminDashboardAction,
  type AdminDashboardData,
  type AdminDashboardTelemetry,
} from "@/lib/admin-dashboard/index.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import type { TelemetryEventName } from "@/lib/telemetry/index.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Metrics" };

type SearchValue = string | string[] | undefined;

function firstValue(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function actionLabel(eventName: TelemetryEventName): string {
  return eventName
    .split("-")
    .map((word, index) =>
      index === 0 ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word,
    )
    .join(" ");
}

function emptyTelemetry(active: boolean): AdminDashboardTelemetry {
  return Object.freeze({
    active,
    eventCount: 0,
    sessionCount: 0,
    linkedUserCount: 0,
    trackPlays: 0,
    actions: Object.freeze([]),
  });
}

export default async function AdministrationOverview({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, SearchValue>> }>) {
  const query = await searchParams;
  const range = resolveAdminDashboardRange(firstValue(query.range));
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) {
    notFound();
  }

  const owner = hasApplicationRole(identity, "owner");
  const activeModules = await readActiveModuleKeys(env.DB);
  const telemetryActive = activeModules.includes("telemetry");
  const [summary, telemetryWorkspace] = await Promise.all([
    readAdminDashboardSummary(
      env.DB,
      identity.userId,
      range.fromDayUtc,
      range.toDayUtc,
    ),
    owner && telemetryActive
      ? readTelemetryAdminWorkspace(
          env.DB,
          identity.userId,
          range.fromDayUtc,
          range.toDayUtc,
        )
      : Promise.resolve(null),
  ]);

  let telemetry = emptyTelemetry(telemetryActive);
  if (telemetryWorkspace) {
    const actionCounts = new Map<TelemetryEventName, number>();
    for (const row of telemetryWorkspace.rows) {
      actionCounts.set(
        row.eventName,
        (actionCounts.get(row.eventName) ?? 0) + row.eventCount,
      );
    }
    const actions: readonly AdminDashboardAction[] = Object.freeze(
      [...actionCounts.entries()]
        .map(([eventName, count]) => ({
          eventName,
          label: actionLabel(eventName),
          count,
        }))
        .sort((left, right) =>
          right.count === left.count
            ? left.label.localeCompare(right.label)
            : right.count - left.count,
        )
        .slice(0, 5),
    );
    telemetry = Object.freeze({
      active: true,
      eventCount: telemetryWorkspace.totals.eventCount,
      sessionCount: telemetryWorkspace.totals.sessionCount,
      linkedUserCount: telemetryWorkspace.totals.linkedUserCount,
      trackPlays: actionCounts.get("playback-start") ?? 0,
      actions,
    });
  }

  const data: AdminDashboardData = Object.freeze({
    range,
    summary,
    telemetry,
  });

  return <AdminDashboard data={data} />;
}
