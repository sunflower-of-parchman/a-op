import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_PLAYER_STATE,
  clampPlayerTime,
  clampPlayerVolume,
  formatPlayerTime,
  nextRepeatMode,
  playableQueue,
  playerReducer,
  resolveNextIndex,
  resolvePreviousIndex,
  resolveShuffleIndex,
  trackResumePosition,
} from "../components/player/player-state.ts";

function track(id, streamUrl) {
  return {
    id,
    slug: id,
    href: `/music/tracks/${id}`,
    title: id,
    subtitle: null,
    durationMs: 120_000,
    streamUrl,
  };
}

test("builds a player queue only from server-approved stream URLs", () => {
  const tracks = [
    track("available-one", "/media/stream/available-one"),
    track("unavailable", null),
    track("available-two", "/media/stream/available-two"),
  ];

  assert.deepEqual(
    playableQueue(tracks).map(({ id }) => id),
    ["available-one", "available-two"],
  );
});

test("loads and selects a bounded queue without inventing playback state", () => {
  const queue = [
    track("one", "/media/stream/one"),
    track("two", "/media/stream/two"),
  ];
  const loaded = playerReducer(INITIAL_PLAYER_STATE, {
    type: "load",
    queue,
    currentIndex: 1,
  });

  assert.equal(loaded.currentIndex, 1);
  assert.equal(loaded.phase, "loading");
  assert.equal(loaded.durationMs, 120_000);
  assert.equal(loaded.currentTimeMs, 0);
  assert.equal(loaded.error, null);

  const selected = playerReducer(loaded, {
    type: "select",
    currentIndex: 0,
  });
  assert.equal(selected.currentIndex, 0);
  assert.equal(selected.phase, "loading");

  assert.equal(
    playerReducer(loaded, { type: "select", currentIndex: 4 }),
    loaded,
  );
});

test("uses only bounded server-projected resume state when loading a track", () => {
  const resumable = {
    ...track("resume", "/media/stream/resume"),
    durationMs: 120_000,
    resumePositionMs: 32_500,
    historyRevision: 4,
  };
  assert.equal(trackResumePosition(resumable), 32_500);
  assert.equal(
    trackResumePosition({ ...resumable, resumePositionMs: 180_000 }),
    120_000,
  );
  assert.equal(trackResumePosition(track("fresh", "/media/stream/fresh")), 0);

  const loaded = playerReducer(INITIAL_PLAYER_STATE, {
    type: "load",
    queue: [resumable],
    currentIndex: 0,
  });
  assert.equal(loaded.currentTimeMs, 32_500);
});

test("resolves previous, next, and repeat behavior deterministically", () => {
  assert.equal(resolveNextIndex(0, 3, "off"), 1);
  assert.equal(resolveNextIndex(2, 3, "off"), null);
  assert.equal(resolveNextIndex(2, 3, "all"), 0);
  assert.equal(resolveNextIndex(2, 3, "one"), null);

  assert.equal(resolvePreviousIndex(2, 3, "off"), 1);
  assert.equal(resolvePreviousIndex(0, 3, "off"), null);
  assert.equal(resolvePreviousIndex(0, 3, "all"), 2);

  assert.equal(nextRepeatMode("off"), "all");
  assert.equal(nextRepeatMode("all"), "one");
  assert.equal(nextRepeatMode("one"), "off");
});

test("resolves shuffle to a different bounded queue item", () => {
  assert.equal(resolveShuffleIndex(0, 5, 0), 1);
  assert.equal(resolveShuffleIndex(0, 5, 0.999999), 4);
  assert.equal(resolveShuffleIndex(3, 5, 0), 4);
  assert.equal(resolveShuffleIndex(3, 5, 0.5), 1);
  assert.equal(resolveShuffleIndex(0, 1, 0.5), null);
  assert.equal(resolveShuffleIndex(-1, 5, 0.5), null);
});

test("clamps media values and formats time for visible controls", () => {
  assert.equal(clampPlayerTime(-5, 10_000), 0);
  assert.equal(clampPlayerTime(14_000, 10_000), 10_000);
  assert.equal(clampPlayerTime(Number.NaN, null), 0);

  assert.equal(clampPlayerVolume(-1), 0);
  assert.equal(clampPlayerVolume(0.45), 0.45);
  assert.equal(clampPlayerVolume(2), 1);

  assert.equal(formatPlayerTime(null), "--:--");
  assert.equal(formatPlayerTime(0), "0:00");
  assert.equal(formatPlayerTime(65_000), "1:05");
  assert.equal(formatPlayerTime(3_665_000), "1:01:05");
});

test("clears the active queue while preserving player preferences", () => {
  const loaded = playerReducer(
    {
      ...INITIAL_PLAYER_STATE,
      repeat: "all",
      shuffle: true,
      volume: 0.4,
    },
    {
      type: "load",
      queue: [track("one", "/media/stream/one")],
      currentIndex: 0,
    },
  );
  const cleared = playerReducer(loaded, { type: "clear" });
  assert.equal(cleared.queue.length, 0);
  assert.equal(cleared.currentIndex, -1);
  assert.equal(cleared.repeat, "all");
  assert.equal(cleared.shuffle, true);
  assert.equal(cleared.volume, 0.4);
});
