import type { TelemetryEventName } from "@/lib/telemetry/index.ts";

export const ADMIN_DASHBOARD_RANGE_KEYS = [
  "today",
  "week",
  "month",
  "year",
  "all",
] as const;

export type AdminDashboardRangeKey =
  (typeof ADMIN_DASHBOARD_RANGE_KEYS)[number];

export interface AdminDashboardRange {
  readonly key: AdminDashboardRangeKey;
  readonly label: string;
  readonly fromDayUtc: string;
  readonly toDayUtc: string;
}

export interface AdminDashboardSummary {
  readonly activeSubscriptions: number;
  readonly licensesIssued: number;
  readonly tracksSold: number;
  readonly trackDownloads: number;
  readonly activeCustomers: number;
  readonly publishedTracks: number;
  readonly newInquiries: number;
  readonly draftCourses: number;
  readonly draftVideos: number;
  readonly draftUpdates: number;
}

export interface AdminDashboardAction {
  readonly eventName: TelemetryEventName;
  readonly label: string;
  readonly count: number;
}

export interface AdminDashboardTelemetry {
  readonly active: boolean;
  readonly eventCount: number;
  readonly sessionCount: number;
  readonly linkedUserCount: number;
  readonly trackPlays: number;
  readonly actions: readonly AdminDashboardAction[];
}

export interface AdminDashboardData {
  readonly range: AdminDashboardRange;
  readonly summary: AdminDashboardSummary;
  readonly telemetry: AdminDashboardTelemetry;
}
