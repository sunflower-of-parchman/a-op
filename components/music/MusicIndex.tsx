import Image from "next/image";
import Link from "next/link";
import type {
  CatalogIndexItemDTO,
  PublicCatalogKind,
  PublicMusicIndexDTO,
} from "@/lib/catalog/public-dto";
import { PlayTrackButton } from "@/components/player";
import { TelemetryPageView } from "@/components/telemetry";
import { MusicFilters } from "./MusicFilters";
import styles from "./Music.module.css";

const KIND_LABELS: Readonly<Record<PublicCatalogKind, string>> = {
  release: "Release",
  track: "Track",
  collection: "Collection",
};

function displayDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function resultLabel(count: number): string {
  return `${count} published ${count === 1 ? "result" : "results"}`;
}

function CatalogRow({ item }: { readonly item: CatalogIndexItemDTO }) {
  const rowClassName = item.artwork
    ? styles.catalogRow
    : `${styles.catalogRow} ${styles.catalogRowWithoutArtwork}`;

  return (
    <article className={rowClassName}>
      {item.artwork ? (
        <div className={styles.indexArtwork}>
          <Image
            alt={item.artwork.alt}
            fill
            sizes="(max-width: 720px) 72px, 104px"
            src={item.artwork.url}
            unoptimized
          />
        </div>
      ) : null}

      <div className={styles.catalogIdentity}>
        <span className={styles.kindLabel}>{KIND_LABELS[item.kind]}</span>
        <h2>
          <Link href={item.href}>{item.title}</Link>
        </h2>
        {item.subtitle ? <p>{item.subtitle}</p> : null}
      </div>

      <div className={styles.catalogSummary}>
        {item.description ? <p>{item.description}</p> : null}
        <div className={styles.catalogMetadata}>
          <time dateTime={item.publishedAt}>
            {displayDate(item.publishedAt)}
          </time>
          {item.trackCount !== null ? (
            <span>
              {item.trackCount} {item.trackCount === 1 ? "track" : "tracks"}
            </span>
          ) : null}
        </div>
      </div>

      {item.playableTrack ? (
        <PlayTrackButton compact track={item.playableTrack} />
      ) : null}
    </article>
  );
}

export function MusicIndex({ data }: { readonly data: PublicMusicIndexDTO }) {
  const filterKey = [
    data.query.q,
    data.query.kind,
    data.query.tag ?? "",
    data.query.sort,
  ].join(":");

  return (
    <>
      <TelemetryPageView
        eventName="music-view"
        resourceId="site"
        resourceType="site"
      />
      <header className="functional-page-heading page-frame">
        <h1>Music</h1>
      </header>

      <div className={`page-frame ${styles.musicContent}`}>
        {data.catalogSize === 0 ? (
          <section
            aria-labelledby="empty-catalog-title"
            className={styles.emptyState}
          >
            <h2 id="empty-catalog-title">No music has been published yet.</h2>
          </section>
        ) : (
          <>
            <MusicFilters
              availableTags={data.availableTags}
              key={filterKey}
              query={data.query}
            />
            <p aria-live="polite" className={styles.resultCount} role="status">
              {resultLabel(data.items.length)}
            </p>

            {data.items.length === 0 ? (
              <section className={styles.emptyState}>
                <h2>No published music matches these filters.</h2>
                <Link className={styles.textLink} href="/music">
                  Clear filters
                </Link>
              </section>
            ) : (
              <ol aria-label="Published music" className={styles.catalogList}>
                {data.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <CatalogRow item={item} />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default MusicIndex;
