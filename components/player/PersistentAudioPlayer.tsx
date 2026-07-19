"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatPlayerTime,
  resolveNextIndex,
  resolvePreviousIndex,
} from "./player-state";
import { usePlayer } from "./PlayerProvider";
import styles from "./Player.module.css";

export function PersistentAudioPlayer() {
  const {
    currentTrack,
    cycleRepeat,
    playNext,
    playPrevious,
    seek,
    selectQueueIndex,
    setVolume,
    state,
    togglePlayback,
  } = usePlayer();
  const [queueOpen, setQueueOpen] = useState(false);
  const queueId = useId();
  const queueCloseRef = useRef<HTMLButtonElement>(null);
  const queueToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!queueOpen) return;
    queueCloseRef.current?.focus();
    const closeQueue = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setQueueOpen(false);
      queueToggleRef.current?.focus();
    };
    window.addEventListener("keydown", closeQueue);
    return () => window.removeEventListener("keydown", closeQueue);
  }, [queueOpen]);

  if (!currentTrack) return null;

  const playing = state.phase === "playing" || state.phase === "loading";
  const nextIndex = resolveNextIndex(
    state.currentIndex,
    state.queue.length,
    state.repeat,
  );
  const previousIndex = resolvePreviousIndex(
    state.currentIndex,
    state.queue.length,
    state.repeat,
  );
  const durationMs = state.durationMs ?? currentTrack.durationMs;
  const status = state.error
    ? state.error
    : state.phase === "loading"
      ? `Loading ${currentTrack.title}.`
      : state.phase === "playing"
        ? `Playing ${currentTrack.title}.`
        : state.phase === "paused"
          ? `${currentTrack.title} paused.`
          : state.phase === "ended"
            ? `${currentTrack.title} ended.`
            : `${currentTrack.title} ready.`;

  return (
    <section aria-label="Audio player" className={styles.player}>
      <div className={styles.playerInner}>
        <div className={styles.nowPlaying}>
          <Link href={currentTrack.href}>{currentTrack.title}</Link>
          {currentTrack.subtitle ? <span>{currentTrack.subtitle}</span> : null}
        </div>

        <div aria-label="Playback controls" className={styles.transport}>
          <button
            className={styles.controlButton}
            disabled={previousIndex === null && state.currentTimeMs <= 3000}
            onClick={playPrevious}
            type="button"
          >
            Previous
          </button>
          <button
            aria-label={`${playing ? "Pause" : "Play"} ${currentTrack.title}`}
            className={styles.primaryControl}
            onClick={togglePlayback}
            type="button"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            className={styles.controlButton}
            disabled={nextIndex === null}
            onClick={playNext}
            type="button"
          >
            Next
          </button>
        </div>

        <div className={styles.timeline}>
          <span>{formatPlayerTime(state.currentTimeMs)}</span>
          <label>
            <span>Position</span>
            <input
              aria-label={`Seek ${currentTrack.title}`}
              aria-valuetext={`${formatPlayerTime(state.currentTimeMs)} of ${formatPlayerTime(durationMs)}`}
              disabled={durationMs === null || durationMs <= 0}
              max={durationMs ?? 0}
              min={0}
              onChange={(event) => seek(Number(event.currentTarget.value))}
              step={1000}
              type="range"
              value={Math.min(state.currentTimeMs, durationMs ?? 0)}
            />
          </label>
          <span>{formatPlayerTime(durationMs)}</span>
        </div>

        <div className={styles.playerOptions}>
          <button
            className={styles.quietButton}
            onClick={cycleRepeat}
            type="button"
          >
            Repeat:{" "}
            {state.repeat === "off"
              ? "Off"
              : state.repeat === "all"
                ? "All"
                : "One"}
          </button>
          <button
            aria-controls={queueId}
            aria-expanded={queueOpen}
            className={styles.quietButton}
            onClick={() => setQueueOpen((open) => !open)}
            ref={queueToggleRef}
            type="button"
          >
            Queue ({state.queue.length})
          </button>
          <label className={styles.volumeControl}>
            <span>Volume</span>
            <input
              aria-label="Volume"
              max={100}
              min={0}
              onChange={(event) =>
                setVolume(Number(event.currentTarget.value) / 100)
              }
              step={1}
              type="range"
              value={Math.round(state.volume * 100)}
            />
          </label>
        </div>

        <p
          aria-live="polite"
          className={state.error ? styles.playerError : styles.playerStatus}
          role="status"
        >
          {status}
        </p>
      </div>

      {queueOpen ? (
        <section
          aria-label="Playback queue"
          className={styles.queuePanel}
          id={queueId}
        >
          <div className={styles.queueHeading}>
            <h2>Queue</h2>
            <button
              className={styles.quietButton}
              onClick={() => {
                setQueueOpen(false);
                queueToggleRef.current?.focus();
              }}
              ref={queueCloseRef}
              type="button"
            >
              Close queue
            </button>
          </div>
          <ol className={styles.queueList}>
            {state.queue.map((track, index) => (
              <li key={`${index}:${track.id}`}>
                <button
                  aria-current={
                    index === state.currentIndex ? "true" : undefined
                  }
                  className={styles.queueItem}
                  onClick={() => selectQueueIndex(index)}
                  type="button"
                >
                  <span>{track.title}</span>
                  {track.subtitle ? <span>{track.subtitle}</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}

export default PersistentAudioPlayer;
