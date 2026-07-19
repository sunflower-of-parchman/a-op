import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("content section administration routes resolve owner authority and idempotency", async () => {
  const paths = [
    "../app/api/admin/content-sections/route.ts",
    "../app/api/admin/content-sections/[sectionKey]/route.ts",
    "../app/api/admin/content-sections/[sectionKey]/publish/route.ts",
    "../app/api/admin/content-sections/[sectionKey]/archive/route.ts",
  ];
  const routes = await Promise.all(paths.map(source));
  for (const route of routes) {
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  }
  for (const route of routes.slice(1)) {
    assert.match(route, /requireIdempotencyKey\(request\)/);
    assert.match(route, /readJsonMutation\(request\)/);
  }
  assert.match(routes[1], /saveContentSectionDraft/);
  assert.match(routes[2], /publishContentSection/);
  assert.match(routes[3], /archiveContentSection/);
});

test("content section writes repeat live owner, exact draft, and conditional audit guards", async () => {
  const write = await source("../db/content-section-write.ts");
  assert.ok((write.match(/activeOwnerCondition/g) ?? []).length >= 4);
  assert.ok((write.match(/draft_revision_id/g) ?? []).length >= 16);
  assert.ok((write.match(/prepareConditionalAuditEvent/g) ?? []).length >= 4);
  assert.match(write, /content_section_revisions AS exact_draft/);
  assert.match(write, /section\.version = \?5/);
  assert.match(write, /CONTENT_SECTION_ARCHIVED/);
  assert.match(write, /CONTENT_SECTION_IN_USE/);
  assert.match(write, /PUBLISHED_PAGE_REFERENCE_CONDITION/);
});

test("administration reads expose current drafts and exact published options", async () => {
  const [read, library, listPage, editorPage] = await Promise.all([
    source("../db/content-section-read.ts"),
    source("../components/admin/content-sections/ContentSectionLibrary.tsx"),
    source("../app/admin/content-sections/page.tsx"),
    source("../app/admin/content-sections/[sectionKey]/page.tsx"),
  ]);
  assert.match(read, /listPublishedContentSectionOptions/);
  assert.match(read, /listPageCompositionContentSectionOptions/);
  assert.match(read, /activeOwnerCondition\(actorUserId\)/);
  assert.match(read, /activePageEditorCondition\(actorUserId, pageScopeId\)/);
  assert.match(read, /requireFinalOwnerBarrier/);
  assert.match(read, /published\.id = section\.published_revision_id/);
  assert.match(read, /section\.publication_state = 'published'/);
  assert.match(library, /Current draft/);
  assert.match(library, /Publication/);
  assert.match(listPage, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(editorPage, /hasApplicationRole\(identity, "owner"\)/);
});

test("content section library and editor are responsive, open, and asset-free", async () => {
  const sources = await Promise.all([
    source("../components/admin/content-sections/ContentSectionLibrary.tsx"),
    source("../components/admin/content-sections/ContentSectionWorkspace.tsx"),
    source("../components/admin/content-sections/ContentSections.module.css"),
  ]);
  const combined = sources.join("\n");
  assert.match(combined, /var\(--slate\)/);
  assert.match(combined, /@media \(max-width: 720px\)/);
  assert.match(combined, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(combined, /<(?:img|picture|audio|video|source)\b/i);
  assert.doesNotMatch(
    combined,
    /type=["']file["']|\bFormData\b|\bFileReader\b|placeholder=/i,
  );
  assert.doesNotMatch(
    sources[2],
    /(?:background-)?image\s*:|url\(|gradient\(/i,
  );
});
