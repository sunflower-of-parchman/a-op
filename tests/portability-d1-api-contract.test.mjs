import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("artist export routes are owner-only, same-origin, idempotent, and memory-only", async () => {
  const [createRoute, verifyRoute, repository] = await Promise.all([
    source("../app/api/admin/setup/export/route.ts"),
    source("../app/api/admin/setup/export/verify/route.ts"),
    source("../db/portability-export.ts"),
  ]);
  for (const route of [createRoute, verifyRoute]) {
    assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
    assert.match(route, /requireSameOrigin\(request\)/);
    assert.match(route, /requireIdempotencyKey\(request\)/);
    assert.doesNotMatch(route, /env\.MEDIA|\.put\(|writeFile|mkdtemp|tmpdir/);
  }
  assert.match(createRoute, /application\/vnd\.a-op\.artist-export\+json/);
  assert.match(createRoute, /content-disposition/);
  assert.match(createRoute, /no-store/);
  assert.match(verifyRoute, /MAXIMUM_ARCHIVE_BYTES/);
  assert.match(verifyRoute, /parseArtistExportArchiveBytes/);
  assert.match(verifyRoute, /verifyArtistExportArchive/);
  assert.match(verifyRoute, /markPortableArtistExportVerified/);
  assert.doesNotMatch(
    repository,
    /stripe_price_id|external_embed_url|object_key/,
  );
  assert.match(repository, /bindingState: "pending"/);
  assert.match(repository, /WHERE kind != 'export'/);
  assert.match(repository, /resource_type != 'license-document'/);
  assert.match(repository, /resource_type != 'order'/);
  assert.doesNotMatch(
    repository,
    /FROM\s+(?:profiles|favorites|playlists|listening_history|orders|checkout_sessions|commerce_events|entitlements|contact_submissions|telemetry_events|audit_events)\b/i,
  );
});

test("portable SHA fields use strict hex validation without payment-value scanning", async () => {
  const [archive, validation] = await Promise.all([
    source("../lib/portability/archive.ts"),
    source("../lib/portability/validation.ts"),
  ]);
  assert.match(archive, /function readSha256/);
  assert.match(archive, /!SHA256\.test\(value\)/);
  assert.doesNotMatch(archive, /readBoundedString\(value\.sha256/);
  assert.doesNotMatch(validation, /\bcardNumber\b/i);
  assert.match(validation, /containsPanLikeValue/);
  assert.match(validation, /\["card", "number"\]\.join\(""\)/);
});
