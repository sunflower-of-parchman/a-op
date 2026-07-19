import Link from "next/link";
import type { PublicVideoSummaryDTO } from "@/lib/video/types.ts";
import styles from "./Video.module.css";

export function VideoIndex({
  videos,
}: {
  readonly videos: readonly PublicVideoSummaryDTO[];
}) {
  return (
    <section className={`${styles.index} page-frame`}>
      <header className={styles.indexHeader}>
        <p className={styles.eyebrow}>Published video</p>
        <h2>Context, credits, and transcripts from the artist.</h2>
        <p>
          Each external player remains off until a visitor chooses to load it.
        </p>
      </header>
      {videos.length === 0 ? (
        <p className={styles.empty}>No videos are published yet.</p>
      ) : (
        <ol className={styles.list}>
          {videos.map((video) => (
            <li className={styles.row} key={video.id}>
              <div className={styles.rowIdentity}>
                <p className={styles.eyebrow}>
                  {video.deliveryKind === "external"
                    ? "External player"
                    : "Artist hosted"}
                </p>
                <h2>
                  <Link href={`/videos/${video.slug}`}>{video.title}</Link>
                </h2>
              </div>
              <div>
                <p className={styles.summary}>{video.summary}</p>
                <p className={styles.metadata}>
                  Transcript: {video.transcriptLanguages.join(", ")}
                </p>
              </div>
              <Link
                className={styles.resourceLink}
                href={`/videos/${video.slug}`}
              >
                Open video
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
