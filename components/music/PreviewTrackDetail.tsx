"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player/PlayerProvider";
import { EMPTY_TRACK_PREVIEW_QUEUE } from "./EmptyTrackPreview";
import styles from "./Music.module.css";

export function PreviewTrackDetail() {
  const { previewQueue } = usePlayer();

  return (
    <main className={`page-frame ${styles.previewDetail}`}>
      <Link className={styles.backToMusic} href="/music">
        Back to Music
      </Link>

      <div className={styles.previewDetailLayout}>
        <button
          aria-label="Open player preview for Track"
          className={styles.previewDetailArtwork}
          onClick={() => previewQueue(EMPTY_TRACK_PREVIEW_QUEUE, 0)}
          type="button"
        >
          <span aria-hidden="true" className={styles.detailPlayTriangle}>
            ▶
          </span>
        </button>

        <section className={styles.previewDetailIdentity}>
          <div className={styles.previewDetailTitle}>
            <h1>Track</h1>
            <p>Artist / Album</p>
          </div>
          <p className={styles.previewDetailDuration}>0:00</p>
          <nav
            aria-label="Track actions"
            className={styles.previewDetailActions}
          >
            <Link href="/account/favorites">Favorite</Link>
            <Link href="/account/library">Download</Link>
            <Link href="/account/playlists">Add to Playlist</Link>
            <Link href="/licensing">License Track</Link>
            <Link href="/commerce">Buy Track</Link>
          </nav>
        </section>
      </div>
    </main>
  );
}

export default PreviewTrackDetail;
