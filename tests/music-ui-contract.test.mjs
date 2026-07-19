import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  rootLayout: "../app/layout.tsx",
  layout: "../app/(public)/layout.tsx",
  indexRoute: "../app/(public)/music/page.tsx",
  releaseRoute: "../app/(public)/music/releases/[slug]/page.tsx",
  trackRoute: "../app/(public)/music/tracks/[slug]/page.tsx",
  collectionRoute: "../app/(public)/music/collections/[slug]/page.tsx",
  musicIndex: "../components/music/MusicIndex.tsx",
  musicDetail: "../components/music/MusicDetail.tsx",
  musicStyles: "../components/music/Music.module.css",
  playerBoundary: "../components/player/PlayerBoundary.tsx",
  playerProvider: "../components/player/PlayerProvider.tsx",
  player: "../components/player/PersistentAudioPlayer.tsx",
  playerStyles: "../components/player/Player.module.css",
  trackList: "../components/player/PlayableTrackList.tsx",
  currentDetail: "../lib/catalog/read-current-detail.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("owns the music routes through public-index and identity-aware detail boundaries", async () => {
  const [index, release, track, collection, currentDetail] = await Promise.all([
    source(files.indexRoute),
    source(files.releaseRoute),
    source(files.trackRoute),
    source(files.collectionRoute),
    source(files.currentDetail),
  ]);

  assert.match(index, /readPublicMusicIndex\(env\.DB, query\)/);
  assert.match(release, /readCurrentCatalogRelease\(env\.DB, slug\)/);
  assert.match(track, /readCurrentCatalogTrack\(env\.DB, slug\)/);
  assert.match(collection, /readCurrentCatalogCollection\(env\.DB, slug\)/);
  assert.match(currentDetail, /getChatGPTUser\(\)/);
  assert.match(
    currentDetail,
    /resolveApplicationIdentity\(binding, authenticatedUser\)/,
  );
  assert.match(currentDetail, /readCatalogRelease\(/);
  assert.match(currentDetail, /readCatalogTrack\(/);
  assert.match(currentDetail, /readCatalogCollection\(/);
  assert.match(release, /if \(!release\) notFound\(\)/);
  assert.match(track, /if \(!track\) notFound\(\)/);
  assert.match(collection, /if \(!collection\) notFound\(\)/);
});

test("keeps the neutral catalog image-free and literal when empty", async () => {
  const [index, detail, styles] = await Promise.all([
    source(files.musicIndex),
    source(files.musicDetail),
    source(files.musicStyles),
  ]);
  const combined = `${index}\n${detail}`;

  assert.match(index, /data\.catalogSize === 0/);
  assert.match(index, /No music has been published yet\./);
  assert.match(index, /item\.artwork \?/);
  assert.match(index, /styles\.catalogRowWithoutArtwork/);
  assert.match(styles, /\.catalogRowWithoutArtwork/);
  assert.match(detail, /data\.artwork \?/);
  assert.doesNotMatch(
    combined,
    /\.(?:aiff?|mp3|wav|flac|m4a|jpe?g|png|webp|gif|svg)\b/i,
  );
  assert.doesNotMatch(combined, /data:(?:audio|image)\//i);
  assert.doesNotMatch(combined, /placeholder|fallback/i);
});

test("mounts one root-persistent player and reveals it only after selection", async () => {
  const [rootLayout, layout, boundary, provider] = await Promise.all([
    source(files.rootLayout),
    source(files.layout),
    source(files.playerBoundary),
    source(files.playerProvider),
  ]);

  assert.match(
    rootLayout,
    /<PlayerBoundary historyEnabled=\{historyEnabled\}>[\s\S]*\{children\}[\s\S]*<\/PlayerBoundary>/,
  );
  assert.doesNotMatch(layout, /PlayerBoundary/);
  assert.match(boundary, /currentTrack \? <PersistentAudioPlayer \/> : null/);
  assert.match(
    boundary,
    /data-player-visible=\{currentTrack \? "true" : "false"\}/,
  );
  assert.match(provider, /<audio/);
  assert.doesNotMatch(provider, /src=/);
  assert.match(provider, /track\.streamUrl/);
});

test("exposes labeled keyboard controls, queue state, and live playback status", async () => {
  const [player, playerStyles, trackList] = await Promise.all([
    source(files.player),
    source(files.playerStyles),
    source(files.trackList),
  ]);

  assert.match(player, /aria-label="Audio player"/);
  assert.match(player, /aria-label="Playback controls"/);
  assert.match(player, /aria-label=\{`Seek \$\{currentTrack\.title\}`\}/);
  assert.match(player, /aria-valuetext=/);
  assert.match(player, /aria-label="Volume"/);
  assert.match(player, /aria-controls=\{queueId\}/);
  assert.match(player, /aria-expanded=\{queueOpen\}/);
  assert.match(player, /event\.key !== "Escape"/);
  assert.match(player, /queueCloseRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(player, /disabled=\{index === state\.currentIndex\}/);
  assert.match(player, /aria-live="polite"/);
  assert.match(playerStyles, /max-height: 100dvh/);
  assert.match(playerStyles, /min-height: 2\.75rem/);
  assert.match(trackList, /aria-current=\{isCurrent \? "true" : undefined\}/);
  assert.match(trackList, /track\.streamUrl \?/);
  assert.match(trackList, /Streaming unavailable/);
});
