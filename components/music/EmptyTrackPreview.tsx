"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player/PlayerProvider";
import type { PlayerTrackDTO } from "@/lib/catalog/public-dto";
import type { CustomerPlaylistDTO } from "@/lib/customer-library/types";
import styles from "./Music.module.css";
import { TrackActions } from "./TrackActions";

export const EMPTY_TRACK_PREVIEW_QUEUE: readonly PlayerTrackDTO[] =
  Object.freeze(
    Array.from({ length: 5 }, (_, index) => ({
      id: `empty-track-preview-${index + 1}`,
      slug: `empty-track-preview-${index + 1}`,
      href: "/music/tracks/preview",
      title: "Track",
      subtitle: "Artist / Album",
      durationMs: 0,
      meter: null,
      tempoBpm: null,
      musicalKey: null,
      streamUrl: null,
    })),
  );

export function EmptyTrackPreview({
  playlists,
}: {
  readonly playlists: readonly CustomerPlaylistDTO[];
}) {
  const { currentTrack, previewQueue } = usePlayer();

  return (
    <ol aria-label="Track interface preview" className={styles.catalogList}>
      {EMPTY_TRACK_PREVIEW_QUEUE.map((track, index) => {
        const selected = currentTrack?.id === track.id;
        return (
          <li key={track.id}>
            <article className={styles.catalogRow}>
              <div className={styles.catalogLead}>
                <button
                  aria-label={`Open player preview for track ${index + 1}`}
                  aria-pressed={selected}
                  className={styles.previewArtworkButton}
                  onClick={() => previewQueue(EMPTY_TRACK_PREVIEW_QUEUE, index)}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.playTriangle}>
                    ▶
                  </span>
                </button>
                <div className={styles.catalogIdentity}>
                  <h3>
                    <Link
                      className={styles.previewTrackTitle}
                      href="/music/tracks/preview"
                    >
                      Track
                    </Link>
                    <span>0:00</span>
                  </h3>
                </div>
              </div>

              <dl className={styles.trackFacts}>
                <div>
                  <dt>Tempo</dt>
                  <dd />
                </div>
                <div>
                  <dt>Meter</dt>
                  <dd />
                </div>
                <div>
                  <dt>Key</dt>
                  <dd />
                </div>
              </dl>

              <div aria-hidden="true" className={styles.catalogPlayback} />
              <nav
                aria-label={`Track ${index + 1} actions`}
                className={styles.catalogActions}
              >
                <TrackActions
                  canSave={false}
                  downloadHref="/account/library"
                  initialFavoriteActive={false}
                  initialFavoriteRevision={null}
                  licenseHref="/licensing"
                  playlists={playlists}
                  preview
                  productHref="/commerce"
                  trackHref="/music/tracks/preview"
                  trackId={null}
                  trackSubtitle="Artist / Album"
                  trackTitle="Track"
                />
              </nav>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

export default EmptyTrackPreview;
