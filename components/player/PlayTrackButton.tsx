"use client";

import type { PlayerTrackDTO } from "@/lib/catalog/public-dto";
import { usePlayer } from "./PlayerProvider";
import styles from "./Player.module.css";

export interface PlayTrackButtonProps {
  readonly track: PlayerTrackDTO;
  readonly queue?: readonly PlayerTrackDTO[];
  readonly selectedIndex?: number;
  readonly compact?: boolean;
}

export function PlayTrackButton({
  track,
  queue = [track],
  selectedIndex = 0,
  compact = false,
}: PlayTrackButtonProps) {
  const { currentTrack, playQueue, state } = usePlayer();
  if (!track.streamUrl) return null;

  const isCurrent = currentTrack?.id === track.id;
  const isPlaying =
    isCurrent && (state.phase === "playing" || state.phase === "loading");
  const action = isPlaying ? "Pause" : "Play";

  return (
    <button
      aria-label={`${action} ${track.title}`}
      aria-pressed={isPlaying}
      className={compact ? styles.compactPlayButton : styles.playButton}
      onClick={() => playQueue(queue, selectedIndex)}
      type="button"
    >
      {action}
    </button>
  );
}
