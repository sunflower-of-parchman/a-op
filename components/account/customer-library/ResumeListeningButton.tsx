"use client";

import type { PlayerTrackDTO } from "@/lib/catalog/public-dto.ts";
import { usePlayer } from "@/components/player/PlayerProvider";

interface ResumablePlayerTrackDTO extends PlayerTrackDTO {
  readonly resumePositionMs?: number;
  readonly historyRevision?: number;
}

export interface ResumeListeningButtonProps {
  readonly track: PlayerTrackDTO;
  readonly resumePositionMs: number;
  readonly historyRevision: number;
}

export function ResumeListeningButton({
  track,
  resumePositionMs,
  historyRevision,
}: ResumeListeningButtonProps) {
  const { currentTrack, playQueue, state } = usePlayer();
  const resumableTrack: ResumablePlayerTrackDTO = {
    ...track,
    resumePositionMs,
    historyRevision,
  };
  const isPlaying =
    currentTrack?.id === track.id &&
    (state.phase === "playing" || state.phase === "loading");
  const action = isPlaying ? "Pause" : "Resume";

  return (
    <button
      aria-label={`${action} ${track.title}`}
      aria-pressed={isPlaying}
      className="button button-secondary"
      onClick={() => playQueue([resumableTrack], 0)}
      type="button"
    >
      {action}
    </button>
  );
}
