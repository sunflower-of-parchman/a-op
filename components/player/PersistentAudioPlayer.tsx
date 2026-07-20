"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatPlayerTime,
  resolveNextIndex,
  resolvePreviousIndex,
  resolveShuffleIndex,
} from "./player-state";
import {
  CloseIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./PlayerIcons";
import { usePlayer } from "./PlayerProvider";
import styles from "./Player.module.css";

export function PersistentAudioPlayer() {
  const {
    currentTrack,
    closePlayer,
    cycleRepeat,
    playNext,
    playPrevious,
    seek,
    selectQueueIndex,
    setVolume,
    state,
    toggleShuffle,
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
  const nextIndex = state.shuffle
    ? (resolveShuffleIndex(state.currentIndex, state.queue.length, 0) ??
      resolveNextIndex(state.currentIndex, state.queue.length, state.repeat))
    : resolveNextIndex(state.currentIndex, state.queue.length, state.repeat);
  const previousIndex = resolvePreviousIndex(
    state.currentIndex,
    state.queue.length,
    state.repeat,
  );
  const durationMs = state.durationMs ?? currentTrack.durationMs;
  const previewing = currentTrack.streamUrl === null;
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
          <div aria-hidden="true" className={styles.playerArtwork} />
          <div className={styles.nowPlayingIdentity}>
            <Link href={currentTrack.href}>{currentTrack.title}</Link>
            {currentTrack.subtitle ? (
              <span>{currentTrack.subtitle}</span>
            ) : null}
          </div>
        </div>

        <div aria-label="Playback controls" className={styles.transport}>
          <button
            aria-label="Previous track"
            className={styles.iconButton}
            disabled={previousIndex === null && state.currentTimeMs <= 3000}
            onClick={playPrevious}
            type="button"
          >
            <PreviousIcon />
          </button>
          <button
            aria-label={`${playing ? "Pause" : "Play"} ${currentTrack.title}`}
            className={styles.primaryIconButton}
            disabled={previewing}
            onClick={togglePlayback}
            type="button"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            aria-label="Next track"
            className={styles.iconButton}
            disabled={nextIndex === null}
            onClick={playNext}
            type="button"
          >
            <NextIcon />
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
            aria-label={`Shuffle ${state.shuffle ? "on" : "off"}`}
            aria-pressed={state.shuffle}
            className={styles.iconButton}
            onClick={toggleShuffle}
            type="button"
          >
            <ShuffleIcon />
          </button>
          <button
            aria-label={`Repeat ${state.repeat === "off" ? "off" : state.repeat}`}
            aria-pressed={state.repeat !== "off"}
            className={styles.iconButton}
            onClick={cycleRepeat}
            type="button"
          >
            <RepeatIcon />
            {state.repeat === "one" ? (
              <span aria-hidden="true" className={styles.iconBadge}>
                1
              </span>
            ) : null}
          </button>
          <button
            aria-label={`Open queue with ${state.queue.length} tracks`}
            aria-controls={queueId}
            aria-expanded={queueOpen}
            className={styles.iconButton}
            onClick={() => setQueueOpen((open) => !open)}
            ref={queueToggleRef}
            type="button"
          >
            <QueueIcon />
          </button>
          <label className={styles.volumeControl}>
            <VolumeIcon />
            <span className="sr-only">Volume</span>
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
          <button
            aria-label="Close audio player"
            className={styles.iconButton}
            onClick={closePlayer}
            type="button"
          >
            <CloseIcon />
          </button>
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
              aria-label="Close queue"
              className={styles.iconButton}
              onClick={() => {
                setQueueOpen(false);
                queueToggleRef.current?.focus();
              }}
              ref={queueCloseRef}
              type="button"
            >
              <CloseIcon />
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
