"use client";

import Link from "next/link";
import type { PublicMusicDetailTrackDTO } from "@/lib/catalog/public-dto";
import { PlayTrackButton } from "./PlayTrackButton";
import { formatPlayerTime } from "./player-state";
import { usePlayer } from "./PlayerProvider";
import styles from "./Player.module.css";

export interface PlayableTrackListProps {
  readonly tracks: readonly PublicMusicDetailTrackDTO[];
  readonly label: string;
}

function positionLabel(item: PublicMusicDetailTrackDTO): string {
  if (item.discNumber !== null && item.trackNumber !== null) {
    return item.discNumber > 1
      ? `${item.discNumber}.${item.trackNumber}`
      : String(item.trackNumber);
  }
  return String(item.position);
}

export function PlayableTrackList({ tracks, label }: PlayableTrackListProps) {
  const { currentTrack } = usePlayer();
  const queue = tracks.map(({ track }) => track);

  return (
    <ol aria-label={label} className={styles.trackList}>
      {tracks.map((item, index) => {
        const { track } = item;
        const isCurrent = currentTrack?.id === track.id;

        return (
          <li
            aria-current={isCurrent ? "true" : undefined}
            className={styles.trackRow}
            key={`${item.position}:${track.id}`}
          >
            <span aria-label={`Track ${positionLabel(item)}`}>
              {positionLabel(item)}
            </span>
            <div className={styles.trackIdentity}>
              <Link href={track.href}>{track.title}</Link>
              {track.subtitle ? <span>{track.subtitle}</span> : null}
            </div>
            <span className={styles.trackDuration}>
              {track.durationMs === null
                ? ""
                : formatPlayerTime(track.durationMs)}
            </span>
            {track.streamUrl ? (
              <PlayTrackButton
                compact
                queue={queue}
                selectedIndex={index}
                track={track}
              />
            ) : (
              <span className={styles.unavailable}>Streaming unavailable</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
