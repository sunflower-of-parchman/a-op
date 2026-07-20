import { activeApplicationIdentityCondition } from "./authority-guards.ts";
import type { AdminDashboardSummary } from "@/lib/admin-dashboard/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface DashboardSummaryRow {
  active_subscriptions: unknown;
  licenses_issued: unknown;
  tracks_sold: unknown;
  track_downloads: unknown;
  active_customers: unknown;
  published_tracks: unknown;
  new_inquiries: unknown;
  draft_courses: unknown;
  draft_videos: unknown;
  draft_updates: unknown;
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RuntimeError(
      "ADMIN_DASHBOARD_INTEGRITY_INVALID",
      `D1 returned an invalid ${label}.`,
      {
        status: 500,
        publicMessage: "The dashboard summary could not be read safely.",
      },
    );
  }
  return value as number;
}

export async function readAdminDashboardSummary(
  binding: D1Database,
  actorUserId: string,
  fromDayUtc: string,
  toDayUtc: string,
): Promise<AdminDashboardSummary> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDayUtc) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDayUtc) ||
    fromDayUtc > toDayUtc
  ) {
    throw new TypeError("Dashboard range must contain valid UTC days.");
  }
  const authority = activeApplicationIdentityCondition(actorUserId);
  const row = await binding
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM subscriptions
          WHERE state IN ('active', 'cancellation_scheduled'))
           AS active_subscriptions,
         (SELECT COUNT(*) FROM issued_licenses
          WHERE substr(issued_at, 1, 10) BETWEEN ? AND ?)
           AS licenses_issued,
         (SELECT COALESCE(SUM(item.quantity), 0)
          FROM order_items AS item
          JOIN orders AS customer_order ON customer_order.id = item.order_id
          WHERE customer_order.status = 'fulfilled'
            AND item.product_type = 'track'
            AND substr(COALESCE(customer_order.completed_at, customer_order.created_at), 1, 10)
                BETWEEN ? AND ?)
           AS tracks_sold,
         (SELECT COUNT(*) FROM download_events
          WHERE substr(delivered_at, 1, 10) BETWEEN ? AND ?)
           AS track_downloads,
         (SELECT COUNT(DISTINCT assignment.user_id)
          FROM role_assignments AS assignment
          JOIN users AS customer ON customer.id = assignment.user_id
          WHERE assignment.role_key = 'customer'
            AND assignment.revoked_at IS NULL
            AND customer.status = 'active')
           AS active_customers,
         (SELECT COUNT(*) FROM tracks WHERE publication_state = 'published')
           AS published_tracks,
         (SELECT COUNT(*) FROM contact_submissions WHERE state = 'new')
           AS new_inquiries,
         (SELECT COUNT(*) FROM courses WHERE publication_state = 'draft')
           AS draft_courses,
         (SELECT COUNT(*) FROM videos WHERE publication_state = 'draft')
           AS draft_videos,
         (SELECT COUNT(*) FROM updates WHERE state = 'draft')
           AS draft_updates
       WHERE ${authority.sql}`,
    )
    .bind(
      fromDayUtc,
      toDayUtc,
      fromDayUtc,
      toDayUtc,
      fromDayUtc,
      toDayUtc,
      ...authority.bindings,
    )
    .first<DashboardSummaryRow>();

  if (!row) {
    throw new RuntimeError(
      "ROLE_REQUIRED",
      "Dashboard reads require an active application identity.",
      { status: 403, publicMessage: "Administration access is required." },
    );
  }

  return Object.freeze({
    activeSubscriptions: count(
      row.active_subscriptions,
      "active subscription count",
    ),
    licensesIssued: count(row.licenses_issued, "issued license count"),
    tracksSold: count(row.tracks_sold, "sold track count"),
    trackDownloads: count(row.track_downloads, "track download count"),
    activeCustomers: count(row.active_customers, "active customer count"),
    publishedTracks: count(row.published_tracks, "published track count"),
    newInquiries: count(row.new_inquiries, "new inquiry count"),
    draftCourses: count(row.draft_courses, "draft course count"),
    draftVideos: count(row.draft_videos, "draft video count"),
    draftUpdates: count(row.draft_updates, "draft update count"),
  });
}
