import {
  ADMIN_DASHBOARD_RANGE_KEYS,
  type AdminDashboardRange,
  type AdminDashboardRangeKey,
} from "./types.ts";

const RANGE_LABELS: Readonly<Record<AdminDashboardRangeKey, string>> = {
  today: "Today",
  week: "Past week",
  month: "Past month",
  year: "Year to date",
  all: "All time",
};

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isAdminDashboardRangeKey(
  value: unknown,
): value is AdminDashboardRangeKey {
  return (
    typeof value === "string" &&
    (ADMIN_DASHBOARD_RANGE_KEYS as readonly string[]).includes(value)
  );
}

export function resolveAdminDashboardRange(
  requested: unknown,
  at = new Date(),
): AdminDashboardRange {
  if (!(at instanceof Date) || Number.isNaN(at.valueOf())) {
    throw new TypeError("Dashboard time must be valid.");
  }
  const key = isAdminDashboardRangeKey(requested) ? requested : "today";
  const end = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const start = new Date(end);

  if (key === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (key === "month") start.setUTCDate(start.getUTCDate() - 29);
  if (key === "year") start.setUTCMonth(0, 1);
  if (key === "all") start.setUTCFullYear(2000, 0, 1);

  return Object.freeze({
    key,
    label: RANGE_LABELS[key],
    fromDayUtc: utcDay(start),
    toDayUtc: utcDay(end),
  });
}
