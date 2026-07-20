"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useTelemetry } from "@/components/telemetry";
import type { PlayerTrackDTO } from "@/lib/catalog/public-dto";
import {
  INITIAL_MEANINGFUL_LISTEN_STATE,
  NOOP_PLAYER_OBSERVER,
  observeMeaningfulListen,
  type MeaningfulListenAction,
  type PlayerObserver,
} from "./meaningful-listen";
import {
  INITIAL_PLAYER_STATE,
  clampPlayerTime,
  clampPlayerVolume,
  isPlayableTrack,
  nextRepeatMode,
  playableQueue,
  playerReducer,
  resolveNextIndex,
  resolvePreviousIndex,
  resolveShuffleIndex,
  trackResumePosition,
  type PlayerState,
} from "./player-state";
import styles from "./Player.module.css";

const PLAYBACK_ERROR = "This track could not be played.";
const PREVIOUS_RESTART_SECONDS = 3;

interface PlayerContextValue {
  readonly state: PlayerState;
  readonly currentTrack: PlayerTrackDTO | null;
  readonly playQueue: (
    tracks: readonly PlayerTrackDTO[],
    selectedIndex: number,
  ) => void;
  readonly previewQueue: (
    tracks: readonly PlayerTrackDTO[],
    selectedIndex: number,
  ) => void;
  readonly togglePlayback: () => void;
  readonly playPrevious: () => void;
  readonly playNext: () => void;
  readonly selectQueueIndex: (index: number) => void;
  readonly seek: (timeMs: number) => void;
  readonly setVolume: (volume: number) => void;
  readonly cycleRepeat: () => void;
  readonly toggleShuffle: () => void;
  readonly closePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

interface PlayerProviderProps {
  readonly children: ReactNode;
  readonly historyEnabled?: boolean;
  readonly meaningfulListenThresholdMs?: number;
  readonly onObservation?: PlayerObserver;
}

interface ListeningHistoryReadItem {
  readonly trackId?: unknown;
  readonly revision?: unknown;
  readonly resumePositionMs?: unknown;
}

function validHistoryRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function validResumePosition(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("Player controls must be rendered inside PlayerProvider.");
  }
  return context;
}

export function PlayerProvider({
  children,
  historyEnabled = false,
  meaningfulListenThresholdMs,
  onObservation = NOOP_PLAYER_OBSERVER,
}: PlayerProviderProps) {
  const { configuration: telemetryConfiguration, record: recordTelemetry } =
    useTelemetry();
  const effectiveMeaningfulListenThresholdMs =
    meaningfulListenThresholdMs ??
    telemetryConfiguration.meaningfulListenSeconds * 1000;
  const [state, dispatch] = useReducer(playerReducer, INITIAL_PLAYER_STATE);
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedStreamUrlRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const playbackOperationRef = useRef(0);
  const pendingResumeMsRef = useRef<number | null>(null);
  const meaningfulListenRef = useRef(INITIAL_MEANINGFUL_LISTEN_STATE);
  const historyRevisionRef = useRef(new Map<string, number>());
  const historyPositionRef = useRef(new Map<string, number>());
  const historyReadRef = useRef<Promise<void>>(Promise.resolve());
  const checkpointQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentTrack = state.queue[state.currentIndex] ?? null;

  const refreshListeningHistory = useCallback(async () => {
    if (!historyEnabled) return;
    try {
      const response = await fetch("/api/account/listening-history", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        listeningHistory?: readonly ListeningHistoryReadItem[];
      };
      if (!Array.isArray(body.listeningHistory)) return;

      for (const item of body.listeningHistory) {
        if (typeof item.trackId !== "string" || item.trackId.length === 0) {
          continue;
        }
        if (validHistoryRevision(item.revision)) {
          historyRevisionRef.current.set(item.trackId, item.revision);
        }
        if (validResumePosition(item.resumePositionMs)) {
          historyPositionRef.current.set(item.trackId, item.resumePositionMs);
        }
      }
    } catch {
      // Customer history is additive and never interrupts public playback.
    }
  }, [historyEnabled]);

  useEffect(() => {
    if (!historyEnabled) {
      historyRevisionRef.current.clear();
      historyPositionRef.current.clear();
      historyReadRef.current = Promise.resolve();
      return;
    }
    const read = refreshListeningHistory();
    historyReadRef.current = read;
  }, [historyEnabled, refreshListeningHistory]);

  const checkpointListening = useCallback(
    (
      trackId: string,
      positionMs: number,
      meaningful: boolean,
      projectedRevision: number | null = null,
    ) => {
      if (!historyEnabled || !validResumePosition(Math.round(positionMs))) {
        return;
      }

      const normalizedPosition = Math.round(positionMs);
      if (
        projectedRevision !== null &&
        validHistoryRevision(projectedRevision) &&
        !historyRevisionRef.current.has(trackId)
      ) {
        historyRevisionRef.current.set(trackId, projectedRevision);
      }

      const run = async () => {
        await historyReadRef.current;

        const write = async (expectedRevision: number | null) =>
          fetch("/api/account/listening-history", {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "idempotency-key": `checkpoint:${crypto.randomUUID()}`,
            },
            body: JSON.stringify({
              trackId,
              positionMs: normalizedPosition,
              meaningful,
              expectedRevision,
            }),
          });

        let response = await write(
          historyRevisionRef.current.get(trackId) ?? null,
        );
        if (response.status === 409) {
          await refreshListeningHistory();
          response = await write(
            historyRevisionRef.current.get(trackId) ?? null,
          );
        }
        if (!response.ok) return;

        const body = (await response.json()) as {
          result?: { revision?: unknown; positionMs?: unknown };
        };
        if (validHistoryRevision(body.result?.revision)) {
          historyRevisionRef.current.set(trackId, body.result.revision);
        }
        if (validResumePosition(body.result?.positionMs)) {
          historyPositionRef.current.set(trackId, body.result.positionMs);
        }
      };

      checkpointQueueRef.current = checkpointQueueRef.current
        .then(run, run)
        .catch(() => undefined);
    },
    [historyEnabled, refreshListeningHistory],
  );

  const recordObservation = useCallback(
    (action: MeaningfulListenAction) => {
      const transition = observeMeaningfulListen(
        meaningfulListenRef.current,
        action,
        effectiveMeaningfulListenThresholdMs,
      );
      meaningfulListenRef.current = transition.state;
      if (!transition.observation) return false;

      try {
        onObservation(transition.observation);
      } catch {
        // Observation consumers cannot interrupt public audio playback.
      }
      void recordTelemetry({
        eventName: "meaningful-listen",
        resourceType: "track",
        resourceId: transition.observation.trackId,
        playedTimeMs: transition.observation.playedTimeMs,
      });

      if ("positionMs" in action) {
        checkpointListening(
          transition.observation.trackId,
          action.positionMs,
          true,
        );
      }
      return true;
    },
    [
      checkpointListening,
      effectiveMeaningfulListenThresholdMs,
      onObservation,
      recordTelemetry,
    ],
  );

  const setAudioPosition = useCallback(
    (audio: HTMLAudioElement, positionMs: number) => {
      recordObservation({ type: "seeking" });
      audio.currentTime = positionMs / 1000;
      recordObservation({ type: "seeked", positionMs });
    },
    [recordObservation],
  );

  const playElement = useCallback(
    (audio: HTMLAudioElement) => {
      const operation = ++playbackOperationRef.current;
      dispatch({ type: "phase", phase: "loading" });
      void audio.play().catch(() => {
        if (playbackOperationRef.current !== operation) return;
        recordObservation({ type: "stopped" });
        dispatch({ type: "error", message: PLAYBACK_ERROR });
      });
    },
    [recordObservation],
  );

  const loadAndPlay = useCallback(
    (track: PlayerTrackDTO & { readonly streamUrl: string }) => {
      const audio = audioRef.current;
      if (!audio) return;

      playbackOperationRef.current += 1;
      loadedStreamUrlRef.current = track.streamUrl;
      loadedTrackIdRef.current = track.id;
      if (validHistoryRevision(track.historyRevision)) {
        historyRevisionRef.current.set(track.id, track.historyRevision);
      }
      if (validResumePosition(track.resumePositionMs)) {
        historyPositionRef.current.set(track.id, track.resumePositionMs);
      }
      recordObservation({
        type: "load",
        trackId: track.id,
        trackSlug: track.slug,
      });
      const projectedResume =
        track.resumePositionMs ?? historyPositionRef.current.get(track.id) ?? 0;
      const resumePositionMs = trackResumePosition({
        ...track,
        resumePositionMs: projectedResume,
      });
      pendingResumeMsRef.current =
        resumePositionMs > 0 ? resumePositionMs : null;
      audio.src = track.streamUrl;
      audio.load();
      if (pendingResumeMsRef.current === null) playElement(audio);
    },
    [playElement, recordObservation],
  );

  const playQueue = useCallback(
    (tracks: readonly PlayerTrackDTO[], selectedIndex: number) => {
      const requestedTrack = tracks[selectedIndex];
      if (!requestedTrack || !isPlayableTrack(requestedTrack)) return;

      const queue = playableQueue(tracks).map((track) => ({
        ...track,
        resumePositionMs:
          track.resumePositionMs ??
          historyPositionRef.current.get(track.id) ??
          null,
        historyRevision:
          track.historyRevision ??
          historyRevisionRef.current.get(track.id) ??
          null,
      }));
      const queueIndex = queue.findIndex(
        (candidate) => candidate.id === requestedTrack.id,
      );
      if (queueIndex < 0) return;
      const selectedTrack = queue[queueIndex];

      const audio = audioRef.current;
      if (
        currentTrack?.id === selectedTrack.id &&
        loadedStreamUrlRef.current === selectedTrack.streamUrl &&
        audio
      ) {
        if (state.phase === "playing" || state.phase === "loading") {
          playbackOperationRef.current += 1;
          pendingResumeMsRef.current = null;
          audio.pause();
          dispatch({ type: "phase", phase: "paused" });
          return;
        }

        if (audio.ended) setAudioPosition(audio, 0);
        playElement(audio);
        return;
      }

      dispatch({ type: "load", queue, currentIndex: queueIndex });
      loadAndPlay(selectedTrack);
    },
    [currentTrack?.id, loadAndPlay, playElement, setAudioPosition, state.phase],
  );

  const previewQueue = useCallback(
    (tracks: readonly PlayerTrackDTO[], selectedIndex: number) => {
      const requestedTrack = tracks[selectedIndex];
      if (
        !requestedTrack ||
        requestedTrack.streamUrl !== null ||
        selectedIndex < 0 ||
        selectedIndex >= tracks.length
      ) {
        return;
      }

      const audio = audioRef.current;
      playbackOperationRef.current += 1;
      pendingResumeMsRef.current = null;
      loadedStreamUrlRef.current = null;
      loadedTrackIdRef.current = null;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      dispatch({ type: "load", queue: tracks, currentIndex: selectedIndex });
      dispatch({ type: "phase", phase: "idle" });
    },
    [],
  );

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || !isPlayableTrack(currentTrack)) return;

    if (state.phase === "playing" || state.phase === "loading") {
      playbackOperationRef.current += 1;
      pendingResumeMsRef.current = null;
      audio.pause();
      dispatch({ type: "phase", phase: "paused" });
      return;
    }

    if (audio.ended) setAudioPosition(audio, 0);
    if (loadedStreamUrlRef.current !== currentTrack.streamUrl) {
      loadAndPlay(currentTrack);
    } else {
      playElement(audio);
    }
  }, [currentTrack, loadAndPlay, playElement, setAudioPosition, state.phase]);

  const selectTrackAt = useCallback(
    (index: number) => {
      const track = state.queue[index];
      if (!track) return;
      dispatch({ type: "select", currentIndex: index });
      if (!isPlayableTrack(track)) {
        dispatch({ type: "phase", phase: "idle" });
        return;
      }
      loadAndPlay(track);
    },
    [loadAndPlay, state.queue],
  );

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (audio.currentTime > PREVIOUS_RESTART_SECONDS) {
      setAudioPosition(audio, 0);
      dispatch({
        type: "time",
        currentTimeMs: 0,
        durationMs: state.durationMs,
      });
      return;
    }

    const previousIndex = resolvePreviousIndex(
      state.currentIndex,
      state.queue.length,
      state.repeat,
    );
    if (previousIndex === null) {
      setAudioPosition(audio, 0);
      return;
    }
    selectTrackAt(previousIndex);
  }, [currentTrack, selectTrackAt, setAudioPosition, state]);

  const playNext = useCallback(() => {
    const nextIndex = state.shuffle
      ? (resolveShuffleIndex(
          state.currentIndex,
          state.queue.length,
          Math.random(),
        ) ??
        resolveNextIndex(state.currentIndex, state.queue.length, state.repeat))
      : resolveNextIndex(state.currentIndex, state.queue.length, state.repeat);
    if (nextIndex !== null) selectTrackAt(nextIndex);
  }, [selectTrackAt, state]);

  const selectQueueIndex = useCallback(
    (index: number) => {
      if (index === state.currentIndex) return;
      selectTrackAt(index);
    },
    [selectTrackAt, state.currentIndex],
  );

  const seek = useCallback(
    (timeMs: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const nextTime = clampPlayerTime(timeMs, state.durationMs);
      setAudioPosition(audio, nextTime);
      dispatch({
        type: "time",
        currentTimeMs: nextTime,
        durationMs: state.durationMs,
      });
    },
    [setAudioPosition, state.durationMs],
  );

  const setVolume = useCallback((volume: number) => {
    const normalized = clampPlayerVolume(volume);
    if (audioRef.current) audioRef.current.volume = normalized;
    dispatch({ type: "volume", volume: normalized });
  }, []);

  const cycleRepeat = useCallback(() => {
    dispatch({ type: "repeat", repeat: nextRepeatMode(state.repeat) });
  }, [state.repeat]);

  const toggleShuffle = useCallback(() => {
    dispatch({ type: "shuffle", shuffle: !state.shuffle });
  }, [state.shuffle]);

  const closePlayer = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    loadedStreamUrlRef.current = null;
    loadedTrackIdRef.current = null;
    pendingResumeMsRef.current = null;
    meaningfulListenRef.current = INITIAL_MEANINGFUL_LISTEN_STATE;
    dispatch({ type: "clear" });
  }, []);

  const context = useMemo<PlayerContextValue>(
    () => ({
      state,
      currentTrack,
      playQueue,
      previewQueue,
      togglePlayback,
      playPrevious,
      playNext,
      selectQueueIndex,
      seek,
      setVolume,
      cycleRepeat,
      toggleShuffle,
      closePlayer,
    }),
    [
      currentTrack,
      closePlayer,
      cycleRepeat,
      playNext,
      playPrevious,
      playQueue,
      previewQueue,
      seek,
      selectQueueIndex,
      setVolume,
      state,
      toggleShuffle,
      togglePlayback,
    ],
  );

  return (
    <PlayerContext.Provider value={context}>
      <audio
        aria-hidden="true"
        className={styles.nativeAudio}
        onDurationChange={(event) => {
          const duration = event.currentTarget.duration;
          dispatch({
            type: "time",
            currentTimeMs: event.currentTarget.currentTime * 1000,
            durationMs: Number.isFinite(duration) ? duration * 1000 : null,
          });
        }}
        onEnded={(event) => {
          const positionMs = event.currentTarget.currentTime * 1000;
          const meaningfulRecorded = recordObservation({
            type: "ended",
            positionMs,
          });
          if (!meaningfulRecorded && currentTrack) {
            checkpointListening(
              currentTrack.id,
              positionMs,
              false,
              currentTrack.historyRevision ?? null,
            );
          }
          if (state.repeat === "one") {
            const audio = audioRef.current;
            if (audio) {
              setAudioPosition(audio, 0);
              playElement(audio);
            }
            return;
          }

          const nextIndex = state.shuffle
            ? (resolveShuffleIndex(
                state.currentIndex,
                state.queue.length,
                Math.random(),
              ) ??
              resolveNextIndex(
                state.currentIndex,
                state.queue.length,
                state.repeat,
              ))
            : resolveNextIndex(
                state.currentIndex,
                state.queue.length,
                state.repeat,
              );
          if (nextIndex === null) {
            dispatch({ type: "phase", phase: "ended" });
          } else {
            selectTrackAt(nextIndex);
          }
        }}
        onError={() => {
          pendingResumeMsRef.current = null;
          recordObservation({ type: "stopped" });
          dispatch({ type: "error", message: PLAYBACK_ERROR });
        }}
        onPause={(event) => {
          const positionMs = event.currentTarget.currentTime * 1000;
          const meaningfulRecorded = recordObservation({
            type: "paused",
            positionMs,
          });
          if (!meaningfulRecorded && currentTrack) {
            checkpointListening(
              currentTrack.id,
              positionMs,
              false,
              currentTrack.historyRevision ?? null,
            );
          }
          if (!event.currentTarget.ended) {
            dispatch({ type: "phase", phase: "paused" });
          }
        }}
        onPlaying={(event) => {
          if (loadedTrackIdRef.current) {
            void recordTelemetry({
              eventName: "playback-start",
              resourceType: "track",
              resourceId: loadedTrackIdRef.current,
            });
          }
          recordObservation({
            type: "playing",
            positionMs: event.currentTarget.currentTime * 1000,
          });
          dispatch({ type: "phase", phase: "playing" });
        }}
        onLoadedMetadata={(event) => {
          const resumePositionMs = pendingResumeMsRef.current;
          if (resumePositionMs === null) return;
          pendingResumeMsRef.current = null;
          setAudioPosition(event.currentTarget, resumePositionMs);
          dispatch({
            type: "time",
            currentTimeMs: resumePositionMs,
            durationMs: Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration * 1000
              : null,
          });
          playElement(event.currentTarget);
        }}
        onSeeked={(event) => {
          recordObservation({
            type: "seeked",
            positionMs: event.currentTarget.currentTime * 1000,
          });
        }}
        onSeeking={() => recordObservation({ type: "seeking" })}
        onTimeUpdate={(event) => {
          const duration = event.currentTarget.duration;
          recordObservation({
            type: "progress",
            positionMs: event.currentTarget.currentTime * 1000,
          });
          dispatch({
            type: "time",
            currentTimeMs: event.currentTarget.currentTime * 1000,
            durationMs: Number.isFinite(duration) ? duration * 1000 : null,
          });
        }}
        playsInline
        preload="metadata"
        ref={audioRef}
        tabIndex={-1}
      />
      {children}
    </PlayerContext.Provider>
  );
}
