import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readAdminDashboardSummary } =
  await import("../db/admin-dashboard-read.ts");
const { resolveAdminDashboardRange } =
  await import("../lib/admin-dashboard/range.ts");
const { MODULE_KEYS, resolveAdministrationNavigation } =
  await import("../lib/modules/index.ts");

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("dashboard ranges resolve stable UTC reporting windows", () => {
  const at = new Date("2026-07-19T19:00:00.000Z");
  assert.deepEqual(resolveAdminDashboardRange("today", at), {
    key: "today",
    label: "Today",
    fromDayUtc: "2026-07-19",
    toDayUtc: "2026-07-19",
  });
  assert.equal(resolveAdminDashboardRange("week", at).fromDayUtc, "2026-07-13");
  assert.equal(
    resolveAdminDashboardRange("month", at).fromDayUtc,
    "2026-06-20",
  );
  assert.equal(resolveAdminDashboardRange("year", at).fromDayUtc, "2026-01-01");
  assert.equal(resolveAdminDashboardRange("invalid", at).key, "today");
});

test("dashboard summary is D1-backed and rejects inactive identities", async () => {
  const memory = await createInMemoryD1();
  try {
    memory.database.exec(`
      INSERT INTO users (id, email, normalized_email, status)
      VALUES
        ('dashboard_owner', 'owner@example.invalid', 'owner@example.invalid', 'active'),
        ('dashboard_revoked', 'revoked@example.invalid', 'revoked@example.invalid', 'disabled');
      INSERT INTO role_assignments
        (id, user_id, role_key, assigned_by_user_id)
      VALUES
        ('dashboard_owner_role', 'dashboard_owner', 'owner', 'dashboard_owner'),
        ('dashboard_revoked_role', 'dashboard_revoked', 'owner', 'dashboard_owner');
    `);

    const summary = await readAdminDashboardSummary(
      memory.binding,
      "dashboard_owner",
      "2026-07-19",
      "2026-07-19",
    );
    assert.deepEqual(summary, {
      activeSubscriptions: 0,
      licensesIssued: 0,
      tracksSold: 0,
      trackDownloads: 0,
      activeCustomers: 0,
      publishedTracks: 0,
      newInquiries: 0,
      draftCourses: 0,
      draftVideos: 0,
      draftUpdates: 0,
    });

    await assert.rejects(
      readAdminDashboardSummary(
        memory.binding,
        "dashboard_revoked",
        "2026-07-19",
        "2026-07-19",
      ),
      (error) => error?.code === "ROLE_REQUIRED",
    );
  } finally {
    memory.close();
  }
});

test("admin surface exposes the compact operator workspace and omits implementation machinery", async () => {
  const [dashboard, shell, layout, page] = await Promise.all([
    source("../components/admin/AdminDashboard.tsx"),
    source("../components/admin/AdminShell.tsx"),
    source("../app/admin/layout.tsx"),
    source("../app/admin/page.tsx"),
  ]);

  assert.deepEqual(resolveAdministrationNavigation(MODULE_KEYS, true), [
    { href: "/admin", label: "Metrics" },
    { href: "/admin/contact", label: "Inquiries" },
    { href: "/admin/courses", label: "Courses" },
    { href: "/admin/whats-new", label: "What's New" },
    { href: "/admin/videos", label: "Videos" },
    { href: "/admin/access", label: "Entitlements" },
  ]);
  assert.match(shell, /Back to account/);
  assert.match(shell, /usePathname/);
  assert.doesNotMatch(shell, /actions|statusRegion|identity/);
  assert.doesNotMatch(
    layout,
    /ThemeToggle|View site|Sign out|chatGPTSignOutPath|readDraftArtistRevision|readPublishedArtistRevision/,
  );
  assert.doesNotMatch(dashboard, /Workspaces|workspaceGrid|\/admin\//);
  assert.match(page, /readAdminDashboardSummary/);
  assert.match(page, /readTelemetryAdminWorkspace/);
  assert.match(page, /title: "Metrics"/);
});
