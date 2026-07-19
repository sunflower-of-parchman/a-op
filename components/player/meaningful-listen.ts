export const DEFAULT_MEANINGFUL_LISTEN_THRESHOLD_MS = 10_000;

export interface MeaningfulListenObservation {
  readonly type: "meaningful-listen";
  readonly trackId: string;
  readonly trackSlug: string;
  readonly playedTimeMs: number;
  readonly thresholdMs: number;
}

export type PlayerObservation = MeaningfulListenObservation;

export type PlayerObserver = (observation: PlayerObservation) => void;

export const NOOP_PLAYER_OBSERVER: PlayerObserver = () => undefined;

interface ObservedTrack {
  readonly id: string;
  readonly slug: string;
}

export interface MeaningfulListenState {
  readonly track: ObservedTrack | null;
  readonly playedTimeMs: number;
  readonly lastPositionMs: number | null;
  readonly isPlaying: boolean;
  readonly isSeeking: boolean;
  readonly hasEmitted: boolean;
}

export type MeaningfulListenAction =
  | {
      readonly type: "load";
      readonly trackId: string;
      readonly trackSlug: string;
    }
  | { readonly type: "playing"; readonly positionMs: number }
  | { readonly type: "progress"; readonly positionMs: number }
  | { readonly type: "seeking" }
  | { readonly type: "seeked"; readonly positionMs: number }
  | { readonly type: "paused"; readonly positionMs: number }
  | { readonly type: "ended"; readonly positionMs: number }
  | { readonly type: "stopped" };

export interface MeaningfulListenTransition {
  readonly state: MeaningfulListenState;
  readonly observation: MeaningfulListenObservation | null;
}

export const INITIAL_MEANINGFUL_LISTEN_STATE: MeaningfulListenState =
  Object.freeze({
    track: null,
    playedTimeMs: 0,
    lastPositionMs: null,
    isPlaying: false,
    isSeeking: false,
    hasEmitted: false,
  });

function normalizePositionMs(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizeThresholdMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Meaningful-listen threshold must be positive.");
  }
  return Math.max(1, Math.round(value));
}

function accumulateProgress(
  state: MeaningfulListenState,
  positionMs: number,
): MeaningfulListenState {
  const normalizedPosition = normalizePositionMs(positionMs);
  if (
    normalizedPosition === null ||
    state.track === null ||
    !state.isPlaying ||
    state.isSeeking
  ) {
    return state;
  }

  const deltaMs =
    state.lastPositionMs === null
      ? 0
      : Math.max(0, normalizedPosition - state.lastPositionMs);

  return {
    ...state,
    playedTimeMs: state.playedTimeMs + deltaMs,
    lastPositionMs: normalizedPosition,
  };
}

function reduceMeaningfulListen(
  state: MeaningfulListenState,
  action: MeaningfulListenAction,
): MeaningfulListenState {
  switch (action.type) {
    case "load":
      return {
        track: { id: action.trackId, slug: action.trackSlug },
        playedTimeMs: 0,
        lastPositionMs: null,
        isPlaying: false,
        isSeeking: false,
        hasEmitted: false,
      };
    case "playing":
      return {
        ...state,
        lastPositionMs: normalizePositionMs(action.positionMs),
        isPlaying: true,
        isSeeking: false,
      };
    case "progress":
      return accumulateProgress(state, action.positionMs);
    case "seeking":
      return {
        ...state,
        lastPositionMs: null,
        isSeeking: true,
      };
    case "seeked":
      return {
        ...state,
        lastPositionMs: state.isPlaying
          ? normalizePositionMs(action.positionMs)
          : null,
        isSeeking: false,
      };
    case "paused":
    case "ended": {
      const progressed = accumulateProgress(state, action.positionMs);
      return {
        ...progressed,
        lastPositionMs: null,
        isPlaying: false,
        isSeeking: false,
      };
    }
    case "stopped":
      return {
        ...state,
        lastPositionMs: null,
        isPlaying: false,
        isSeeking: false,
      };
  }
}

export function observeMeaningfulListen(
  state: MeaningfulListenState,
  action: MeaningfulListenAction,
  thresholdMs = DEFAULT_MEANINGFUL_LISTEN_THRESHOLD_MS,
): MeaningfulListenTransition {
  const normalizedThreshold = normalizeThresholdMs(thresholdMs);
  let nextState = reduceMeaningfulListen(state, action);
  const observedTrack = nextState.track;

  if (
    observedTrack === null ||
    nextState.hasEmitted ||
    nextState.playedTimeMs < normalizedThreshold
  ) {
    return { state: nextState, observation: null };
  }

  nextState = { ...nextState, hasEmitted: true };
  return {
    state: nextState,
    observation: {
      type: "meaningful-listen",
      trackId: observedTrack.id,
      trackSlug: observedTrack.slug,
      playedTimeMs: nextState.playedTimeMs,
      thresholdMs: normalizedThreshold,
    },
  };
}
