import type { PlayerTrackDTO } from "@/lib/catalog/public-dto";

export type PlayerPhase =
  "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  readonly queue: readonly PlayerTrackDTO[];
  readonly currentIndex: number;
  readonly phase: PlayerPhase;
  readonly currentTimeMs: number;
  readonly durationMs: number | null;
  readonly volume: number;
  readonly repeat: RepeatMode;
  readonly error: string | null;
}

export type PlayerAction =
  | {
      readonly type: "load";
      readonly queue: readonly PlayerTrackDTO[];
      readonly currentIndex: number;
    }
  | { readonly type: "select"; readonly currentIndex: number }
  | { readonly type: "phase"; readonly phase: PlayerPhase }
  | {
      readonly type: "time";
      readonly currentTimeMs: number;
      readonly durationMs?: number | null;
    }
  | { readonly type: "volume"; readonly volume: number }
  | { readonly type: "repeat"; readonly repeat: RepeatMode }
  | { readonly type: "error"; readonly message: string };

export const INITIAL_PLAYER_STATE: PlayerState = Object.freeze({
  queue: Object.freeze([]),
  currentIndex: -1,
  phase: "idle",
  currentTimeMs: 0,
  durationMs: null,
  volume: 1,
  repeat: "off",
  error: null,
});

export function isPlayableTrack(
  track: PlayerTrackDTO,
): track is PlayerTrackDTO & { readonly streamUrl: string } {
  return typeof track.streamUrl === "string" && track.streamUrl.length > 0;
}

export function playableQueue(
  tracks: readonly PlayerTrackDTO[],
): readonly (PlayerTrackDTO & { readonly streamUrl: string })[] {
  return tracks.filter(isPlayableTrack);
}

export function clampPlayerTime(
  value: number,
  durationMs: number | null,
): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.max(0, Math.round(value));
  return durationMs === null ? normalized : Math.min(normalized, durationMs);
}

export function trackResumePosition(track: PlayerTrackDTO): number {
  return clampPlayerTime(track.resumePositionMs ?? 0, track.durationMs);
}

export function clampPlayerVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}

export function resolveNextIndex(
  currentIndex: number,
  queueLength: number,
  repeat: RepeatMode,
): number | null {
  if (queueLength <= 0 || currentIndex < 0 || currentIndex >= queueLength) {
    return null;
  }
  if (currentIndex + 1 < queueLength) return currentIndex + 1;
  return repeat === "all" ? 0 : null;
}

export function resolvePreviousIndex(
  currentIndex: number,
  queueLength: number,
  repeat: RepeatMode,
): number | null {
  if (queueLength <= 0 || currentIndex < 0 || currentIndex >= queueLength) {
    return null;
  }
  if (currentIndex > 0) return currentIndex - 1;
  return repeat === "all" ? queueLength - 1 : null;
}

export function formatPlayerTime(valueMs: number | null): string {
  if (valueMs === null || !Number.isFinite(valueMs) || valueMs < 0) {
    return "--:--";
  }

  const totalSeconds = Math.floor(valueMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function playerReducer(
  state: PlayerState,
  action: PlayerAction,
): PlayerState {
  switch (action.type) {
    case "load": {
      if (
        action.queue.length === 0 ||
        action.currentIndex < 0 ||
        action.currentIndex >= action.queue.length
      ) {
        return state;
      }
      const track = action.queue[action.currentIndex];
      return {
        ...state,
        queue: Object.freeze([...action.queue]),
        currentIndex: action.currentIndex,
        phase: "loading",
        currentTimeMs: trackResumePosition(track),
        durationMs: track.durationMs,
        error: null,
      };
    }
    case "select": {
      if (
        action.currentIndex < 0 ||
        action.currentIndex >= state.queue.length
      ) {
        return state;
      }
      const track = state.queue[action.currentIndex];
      return {
        ...state,
        currentIndex: action.currentIndex,
        phase: "loading",
        currentTimeMs: trackResumePosition(track),
        durationMs: track.durationMs,
        error: null,
      };
    }
    case "phase":
      return { ...state, phase: action.phase, error: null };
    case "time": {
      const durationMs =
        action.durationMs === undefined
          ? state.durationMs
          : action.durationMs === null
            ? null
            : Math.max(0, Math.round(action.durationMs));
      return {
        ...state,
        currentTimeMs: clampPlayerTime(action.currentTimeMs, durationMs),
        durationMs,
      };
    }
    case "volume":
      return { ...state, volume: clampPlayerVolume(action.volume) };
    case "repeat":
      return { ...state, repeat: action.repeat };
    case "error":
      return { ...state, phase: "error", error: action.message };
  }
}
