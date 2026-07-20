"use client";

import Link from "next/link";
import { useState } from "react";
import { FavoriteHeartIcon } from "@/components/ui/FavoriteHeartIcon";
import { EmptyTrackPreview } from "./EmptyTrackPreview";
import { TrackColumnHeader } from "./TrackColumnHeader";
import styles from "./Music.module.css";

export interface PreviewCatalogDetailProps {
  readonly kind: "album" | "collection";
}

export function PreviewCatalogDetail({ kind }: PreviewCatalogDetailProps) {
  const [favorite, setFavorite] = useState(false);
  const title = kind === "album" ? "Album" : "Collection";
  const backHref = `/music?view=${kind === "album" ? "albums" : "collections"}`;

  return (
    <main className={`page-frame ${styles.previewCatalogDetail}`}>
      <Link className={styles.backToMusic} href={backHref}>
        <span aria-hidden="true">←</span> Back
      </Link>

      <section className={styles.previewCatalogHeader}>
        <div aria-hidden="true" className={styles.previewCatalogArtwork} />
        <div className={styles.previewCatalogIdentity}>
          <h1>{title}</h1>
          <p>5 tracks</p>
        </div>
        <div className={styles.previewCatalogActions}>
          <Link href="/commerce">Buy Downloads</Link>
          <button
            aria-label={`${favorite ? "Remove" : "Add"} ${title} ${favorite ? "from" : "to"} favorites`}
            aria-pressed={favorite}
            onClick={() => setFavorite((active) => !active)}
            type="button"
          >
            <FavoriteHeartIcon active={favorite} />
          </button>
        </div>
      </section>

      <section
        aria-labelledby="preview-catalog-tracks"
        className={styles.previewCatalogTracks}
      >
        <h2 className="sr-only" id="preview-catalog-tracks">
          Tracks
        </h2>
        <TrackColumnHeader />
        <EmptyTrackPreview playlists={[]} />
      </section>
    </main>
  );
}

export default PreviewCatalogDetail;
