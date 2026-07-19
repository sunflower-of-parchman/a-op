import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the persistent player resumes and checkpoints only server-enabled customer history", async () => {
  const [layout, boundary, provider, state, dto] = await Promise.all([
    source("../app/layout.tsx"),
    source("../components/player/PlayerBoundary.tsx"),
    source("../components/player/PlayerProvider.tsx"),
    source("../components/player/player-state.ts"),
    source("../lib/catalog/public-dto.ts"),
  ]);

  assert.match(layout, /getChatGPTUser\(\)/);
  assert.match(
    layout,
    /resolveApplicationIdentity\(env\.DB, authenticatedUser\)/,
  );
  assert.match(layout, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(layout, /readActiveModuleKeys\(env\.DB\)/);
  assert.match(layout, /activeModules\.includes\("customer-library"\)/);
  assert.match(layout, /<PlayerBoundary historyEnabled=\{historyEnabled\}>/);
  assert.match(boundary, /<PlayerProvider historyEnabled=\{historyEnabled\}>/);

  assert.match(provider, /fetch\("\/api\/account\/listening-history"/);
  assert.match(provider, /method: "PUT"/);
  assert.match(provider, /"idempotency-key": `checkpoint:/);
  assert.match(provider, /expectedRevision/);
  assert.match(provider, /response\.status === 409/);
  assert.match(provider, /refreshListeningHistory\(\)/);
  assert.match(provider, /meaningful,/);
  assert.match(provider, /onPause=/);
  assert.match(provider, /onEnded=/);
  assert.match(provider, /onLoadedMetadata=/);
  assert.match(provider, /pendingResumeMsRef/);
  assert.doesNotMatch(provider, /userId\s*:|localStorage|sessionStorage/);

  assert.match(state, /trackResumePosition\(track\)/);
  assert.match(dto, /resumePositionMs\?: number \| null/);
  assert.match(dto, /historyRevision\?: number \| null/);
});
