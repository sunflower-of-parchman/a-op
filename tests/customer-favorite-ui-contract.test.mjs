import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public track and release favorite controls use server customer state and desired-state writes", async () => {
  const [server, toggle, trackPage, releasePage, detail] = await Promise.all([
    source("../components/account/customer-library/PublicFavoriteControl.tsx"),
    source("../components/account/customer-library/FavoriteToggle.tsx"),
    source("../app/(public)/music/tracks/[slug]/page.tsx"),
    source("../app/(public)/music/releases/[slug]/page.tsx"),
    source("../components/music/MusicDetail.tsx"),
  ]);

  assert.match(server, /getChatGPTUser\(\)/);
  assert.match(
    server,
    /resolveApplicationIdentity\(env\.DB, authenticatedUser\)/,
  );
  assert.match(server, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(server, /readCustomerFavoriteState\(/);
  assert.match(server, /error\.code === "MODULE_INACTIVE"/);
  assert.doesNotMatch(server, /props\.userId|userId\s*:/);

  assert.match(toggle, /"\/api\/account\/favorites"/);
  assert.match(toggle, /targetType,/);
  assert.match(toggle, /targetId,/);
  assert.match(toggle, /active: !active/);
  assert.match(toggle, /expectedRevision: revision/);
  assert.match(toggle, /aria-pressed=\{active\}/);
  assert.match(toggle, /Save favorite/);
  assert.match(toggle, /Remove favorite/);

  assert.match(trackPage, /targetType="track"/);
  assert.match(releasePage, /targetType="release"/);
  assert.match(detail, /customerAction/);
  assert.doesNotMatch(
    [server, toggle, trackPage, releasePage].join("\n"),
    /\bFormData\b|type=["']file["']|\bR2Bucket\b|<(?:img|picture|video)\b/i,
  );
});
