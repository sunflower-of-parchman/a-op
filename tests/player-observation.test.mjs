import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_MEANINGFUL_LISTEN_STATE,
  observeMeaningfulListen,
} from "../components/player/meaningful-listen.ts";

function transition(state, action, thresholdMs = 5_000) {
  return observeMeaningfulListen(state, action, thresholdMs);
}

function loadTrack(state, id = "track-one") {
  return transition(state, {
    type: "load",
    trackId: id,
    trackSlug: id,
  }).state;
}

test("accumulates played media time and emits once at the configured threshold", () => {
  let state = loadTrack(INITIAL_MEANINGFUL_LISTEN_STATE);
  state = transition(state, { type: "playing", positionMs: 0 }).state;
  state = transition(state, { type: "progress", positionMs: 2_400 }).state;

  const threshold = transition(
    state,
    { type: "progress", positionMs: 5_100 },
    5_000,
  );
  assert.deepEqual(threshold.observation, {
    type: "meaningful-listen",
    trackId: "track-one",
    trackSlug: "track-one",
    playedTimeMs: 5_100,
    thresholdMs: 5_000,
  });
  assert.equal(threshold.state.hasEmitted, true);

  const later = transition(
    threshold.state,
    { type: "progress", positionMs: 8_000 },
    5_000,
  );
  assert.equal(later.state.playedTimeMs, 8_000);
  assert.equal(later.observation, null);
});

test("does not count forward or backward seek jumps", () => {
  let state = loadTrack(INITIAL_MEANINGFUL_LISTEN_STATE);
  state = transition(state, { type: "playing", positionMs: 0 }).state;
  state = transition(state, { type: "progress", positionMs: 2_000 }).state;
  state = transition(state, { type: "seeking" }).state;
  state = transition(state, { type: "progress", positionMs: 92_000 }).state;
  state = transition(state, { type: "seeked", positionMs: 92_000 }).state;
  state = transition(state, { type: "progress", positionMs: 94_000 }).state;

  assert.equal(state.playedTimeMs, 4_000);

  state = transition(state, { type: "seeking" }).state;
  state = transition(state, { type: "seeked", positionMs: 1_000 }).state;
  const afterRewind = transition(state, {
    type: "progress",
    positionMs: 2_000,
  });
  assert.equal(afterRewind.state.playedTimeMs, 5_000);
  assert.equal(afterRewind.observation?.type, "meaningful-listen");
});

test("counts the final played interval on pause and ignores paused progress", () => {
  let state = loadTrack(INITIAL_MEANINGFUL_LISTEN_STATE);
  state = transition(state, { type: "playing", positionMs: 0 }, 2_000).state;
  state = transition(state, { type: "progress", positionMs: 900 }, 2_000).state;
  state = transition(state, { type: "progress", positionMs: 900 }, 2_000).state;
  assert.equal(state.playedTimeMs, 900);

  const paused = transition(
    state,
    { type: "paused", positionMs: 2_100 },
    2_000,
  );
  assert.equal(paused.state.playedTimeMs, 2_100);
  assert.equal(paused.observation?.playedTimeMs, 2_100);

  const inactiveProgress = transition(
    paused.state,
    { type: "progress", positionMs: 20_000 },
    2_000,
  );
  assert.equal(inactiveProgress.state.playedTimeMs, 2_100);
  assert.equal(inactiveProgress.observation, null);
});

test("resets accumulated time and one-shot emission when a new track loads", () => {
  let state = loadTrack(INITIAL_MEANINGFUL_LISTEN_STATE, "track-one");
  state = transition(state, { type: "playing", positionMs: 0 }, 1_000).state;
  state = transition(
    state,
    { type: "progress", positionMs: 1_000 },
    1_000,
  ).state;
  assert.equal(state.hasEmitted, true);

  state = loadTrack(state, "track-two");
  assert.equal(state.track?.id, "track-two");
  assert.equal(state.playedTimeMs, 0);
  assert.equal(state.hasEmitted, false);

  state = transition(
    state,
    { type: "playing", positionMs: 50_000 },
    1_000,
  ).state;
  const secondTrack = transition(
    state,
    { type: "progress", positionMs: 51_000 },
    1_000,
  );
  assert.equal(secondTrack.observation?.trackId, "track-two");
});

test("rejects invalid thresholds and ignores invalid media positions", () => {
  let state = loadTrack(INITIAL_MEANINGFUL_LISTEN_STATE);
  state = transition(state, { type: "playing", positionMs: 0 }).state;
  state = transition(state, {
    type: "progress",
    positionMs: Number.NaN,
  }).state;
  assert.equal(state.playedTimeMs, 0);

  assert.throws(
    () => transition(state, { type: "progress", positionMs: 1_000 }, 0),
    /threshold must be positive/i,
  );
});
