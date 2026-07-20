import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("video pages and delivery are module-gated and authorize R2 after the central access decision", async () => {
  const [publicIndex, hostedPlayer, delivery, mediaRoute] = await Promise.all([
    source("../app/(public)/videos/page.tsx"),
    source("../components/video/HostedVideoPlayer.tsx"),
    source("../lib/video/delivery.ts"),
    source("../app/api/videos/[videoId]/media/route.ts"),
  ]);
  assert.match(publicIndex, /requireActiveModule\(env\.DB, "video"\)/);
  assert.match(mediaRoute, /resolveApplicationIdentity/);
  assert.match(mediaRoute, /deliverHostedVideo/);
  const decisionIndex = delivery.indexOf("await publicVideoDecision");
  const headIndex = delivery.indexOf("await store.head");
  const getIndex = delivery.indexOf("await store.get");
  assert.ok(decisionIndex >= 0 && decisionIndex < headIndex);
  assert.ok(headIndex < getIndex);
  assert.match(
    delivery,
    /await requireActiveModule\(input\.binding, "video"\)/,
  );
  assert.match(delivery, /parseByteRange/);
  assert.match(delivery, /"x-aop-access-source"/);
  assert.match(hostedPlayer, /preload="none"/);
});

test("context, credits, and transcript precede every player and external media stays inert until click consent", async () => {
  const [detail, consent, workspace] = await Promise.all([
    source("../components/video/VideoDetail.tsx"),
    source("../components/video/ExternalVideoConsent.tsx"),
    source("../components/video/VideoWorkspace.tsx"),
  ]);
  assert.ok(detail.indexOf("From the artist") < detail.indexOf("Playback"));
  assert.ok(detail.indexOf("Credits") < detail.indexOf("Playback"));
  assert.ok(detail.indexOf("Transcript") < detail.indexOf("Playback"));
  assert.match(consent, /useState\(false\)/);
  assert.match(consent, /onClick=\{\(\) => setConsented\(true\)\}/);
  assert.match(consent, /if \(!consented\)/);
  assert.match(consent, /src=\{embedUrl\}/);
  assert.match(
    consent,
    /sandbox="allow-scripts allow-same-origin allow-presentation"/,
  );
  assert.match(consent, /referrerPolicy="no-referrer"/);
  assert.match(consent, /!videoId/);
  assert.match(workspace, /videoId=\{null\}/);
});

test("video and update mutations resolve live server authority, module state, and idempotency", async () => {
  const paths = [
    "../app/api/admin/videos/[slug]/route.ts",
    "../app/api/admin/videos/[slug]/publish/route.ts",
    "../app/api/admin/whats-new/[slug]/route.ts",
    "../app/api/admin/whats-new/[slug]/publish/route.ts",
    "../app/api/updates/[updateId]/read/route.ts",
  ];
  const sources = await Promise.all(paths.map(source));
  for (const route of sources) {
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireApplicationAuthority/);
    assert.match(route, /requireActiveModule\(env\.DB,/);
    assert.match(route, /requireIdempotencyKey\(request\)/);
  }
  assert.match(sources[0], /\["owner", "editor"\]/);
  assert.match(sources[0], /permissionKey: "pages\.write"/);
  assert.match(sources[1], /\["owner"\]/);
  assert.match(sources[4], /\["customer"\]/);
});

test("workstream UI uses open theme-token layouts with no bundled, generated, or upload assets", async () => {
  const files = [
    "../components/video/Video.module.css",
    "../components/video/VideoDetail.tsx",
    "../components/video/VideoWorkspace.tsx",
    "../components/updates/Updates.module.css",
    "../components/updates/UpdateIndex.tsx",
    "../components/updates/UpdateWorkspace.tsx",
    "../components/updates/EditorialWorkspace.tsx",
  ];
  const sources = await Promise.all(files.map(source));
  const combined = sources.join("\n");
  const styles = `${sources[0]}\n${sources[3]}`;
  assert.match(combined, /var\(--slate\)/);
  assert.match(combined, /@media \(max-width: 720px\)/);
  assert.match(combined, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(
    combined,
    /type=["']file["']|\bFormData\b|\bFileReader\b/,
  );
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(|gradient\(/i);
  assert.doesNotMatch(combined, /placeholder=/i);
});
