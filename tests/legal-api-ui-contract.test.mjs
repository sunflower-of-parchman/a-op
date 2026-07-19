import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("legal administration routes are owner-only, idempotent, and separate approval from publication", async () => {
  const routes = await Promise.all(
    [
      "../app/api/admin/legal/route.ts",
      "../app/api/admin/legal/[documentId]/route.ts",
      "../app/api/admin/legal/[documentId]/approve/route.ts",
      "../app/api/admin/legal/[documentId]/publish/route.ts",
    ].map(source),
  );
  for (const route of routes) {
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  }
  for (const route of routes.slice(1)) {
    assert.match(route, /requireIdempotencyKey\(request\)/);
    assert.match(route, /readJsonMutation\(request\)/);
  }
  assert.match(routes[1], /saveLegalDocumentDraft/);
  assert.match(routes[2], /approveLegalDocumentDraft/);
  assert.match(routes[3], /publishLegalDocument/);
});

test("legal writes retain live owner, exact revision, immutable version, and conditional audit guards", async () => {
  const write = await source("../db/legal-write.ts");
  assert.ok((write.match(/activeOwnerCondition/g) ?? []).length >= 5);
  assert.ok((write.match(/prepareConditionalAuditEvent/g) ?? []).length >= 4);
  assert.match(write, /INSERT INTO legal_document_versions/);
  assert.doesNotMatch(
    write,
    /UPDATE legal_document_versions[\s\S]{0,240}SET\s+(?:title|body_text|setup_answers_json)\s*=/i,
  );
  assert.match(write, /approved_version_id = \?1/);
  assert.match(write, /published_version_id = \?1/);
  assert.match(write, /exact_draft\.setup_answers_json/);
  assert.match(write, /LEGAL_APPROVAL_REQUIRED/);
});

test("public privacy and terms prefer approved legal publication and retain the page fallback", async () => {
  const [page, read] = await Promise.all([
    source("../app/(public)/[slug]/page.tsx"),
    source("../db/legal-read.ts"),
  ]);
  assert.match(page, /readPublishedLegalDocument/);
  assert.match(page, /readPublishedPageBySlug/);
  assert.match(page, /slug === "privacy" \|\| slug === "terms"/);
  assert.match(read, /version\.approved_by_user_id IS NOT NULL/);
  assert.match(read, /version\.approved_at IS NOT NULL/);
  assert.match(read, /document\.published_version_id/);
});

test("legal UI states artist review, fixed Test Mode, no-real-payment, and residency facts without assets", async () => {
  const sources = await Promise.all([
    source("../components/legal/LegalDocumentLibrary.tsx"),
    source("../components/legal/LegalDocumentWorkspace.tsx"),
    source("../components/legal/PublishedLegalDocument.tsx"),
    source("../components/legal/LegalDocuments.module.css"),
  ]);
  const combined = sources.join("\n");
  assert.match(combined, /artist-reviewed/i);
  assert.match(combined, /Stripe Test Mode/);
  assert.match(combined, /No real payment will be accepted/);
  assert.match(
    combined,
    /does not support data\s+residency or inference residency at\s+launch/,
  );
  assert.match(combined, /Approve exact draft/);
  assert.match(combined, /Publish approved draft/);
  assert.match(combined, /@media \(max-width: 760px\)/);
  assert.match(combined, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(combined, /<(?:img|picture|audio|video|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']|\bFileReader\b/i);
  assert.doesNotMatch(
    sources[3],
    /(?:background-)?image\s*:|url\(|gradient\(/i,
  );
});
