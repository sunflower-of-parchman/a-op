import Image from "next/image";
import type { ReactNode } from "react";
import type { PublicMusicDetailDTO } from "@/lib/catalog/public-dto";
import { PlayableTrackList } from "@/components/player";
import { TelemetryPageView } from "@/components/telemetry";
import styles from "./Music.module.css";

function displayDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export interface MusicDetailProps {
  readonly data: PublicMusicDetailDTO;
  readonly customerAction?: ReactNode;
}

export function MusicDetail({ data, customerAction }: MusicDetailProps) {
  return (
    <>
      {data.kind === "release" || data.kind === "track" ? (
        <TelemetryPageView
          eventName={data.kind === "release" ? "release-view" : "track-view"}
          resourceId={data.id}
          resourceType={data.kind}
        />
      ) : null}
      <header className={`page-frame ${styles.detailHeader}`}>
        {data.artwork ? (
          <div className={styles.detailArtwork}>
            <Image
              alt={data.artwork.alt}
              fill
              priority
              sizes="(max-width: 720px) calc(100vw - 2rem), 32vw"
              src={data.artwork.url}
              unoptimized
            />
          </div>
        ) : null}

        <div className={styles.detailHeading}>
          <h1>{data.title}</h1>
          {data.subtitle ? (
            <p className={styles.detailSubtitle}>{data.subtitle}</p>
          ) : null}
          <div className={styles.detailMetadata}>
            {data.date ? (
              <time dateTime={data.date}>{displayDate(data.date)}</time>
            ) : null}
            {data.tags.length > 0 ? (
              <ul aria-label="Tags" className={styles.tagList}>
                {data.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {customerAction ? (
            <div className={styles.detailActions}>{customerAction}</div>
          ) : null}
        </div>
      </header>

      <div className={`page-frame ${styles.detailContent}`}>
        {data.description ? (
          <section aria-label="About this music" className={styles.description}>
            <p>{data.description}</p>
          </section>
        ) : null}

        {data.tracks.length > 0 ? (
          <section
            aria-labelledby="music-tracks-title"
            className={styles.detailSection}
          >
            <h2 id="music-tracks-title">
              {data.kind === "track" ? "Listen" : "Tracks"}
            </h2>
            <PlayableTrackList
              label={`${data.title} tracks`}
              tracks={data.tracks}
            />
          </section>
        ) : null}

        {data.credits.length > 0 ? (
          <section
            aria-labelledby="music-credits-title"
            className={styles.detailSection}
          >
            <h2 id="music-credits-title">Credits</h2>
            <dl className={styles.creditList}>
              {data.credits.map((credit) => (
                <div key={credit.id}>
                  <dt>{credit.name}</dt>
                  <dd>
                    <span>{credit.role}</span>
                    {credit.details ? <span>{credit.details}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </>
  );
}

export default MusicDetail;
