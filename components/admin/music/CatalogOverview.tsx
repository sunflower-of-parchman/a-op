import Link from "next/link";
import type {
  AdminCatalogIndex,
  AdminCatalogSummary,
  AdminMediaSummary,
} from "@/lib/catalog/types.ts";

import styles from "./CatalogAdmin.module.css";

interface CatalogListProps {
  readonly canCreate: boolean;
  readonly emptyMessage: string;
  readonly items: readonly AdminCatalogSummary[];
  readonly noun: "collection" | "release" | "track";
  readonly plural: "collections" | "releases" | "tracks";
  readonly title: string;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatBytes(value: number | null): string {
  if (value === null) return "Pending";
  if (value < 1000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function readiness(status: string, approvalState: string): string {
  if (approvalState === "rejected") return "rejected";
  if (status === "failed") return "failed";
  if (status === "ready" && approvalState === "approved") return "ready";
  if (approvalState === "pending") return "pending";
  return status;
}

function CatalogList({
  canCreate,
  emptyMessage,
  items,
  noun,
  plural,
  title,
}: CatalogListProps) {
  return (
    <section className={styles.section} aria-labelledby={`${plural}-heading`}>
      <div className={styles.sectionHeading}>
        <div>
          <h3 id={`${plural}-heading`}>{title}</h3>
          <p>Draft and published state remain separately versioned.</p>
        </div>
        {canCreate ? (
          <Link
            className="button button-primary"
            href={`/admin/music/${plural}/new`}
          >
            Add {noun}
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <ul className={styles.itemList}>
          {items.map((item) => (
            <li className={styles.itemRow} key={item.id}>
              <div>
                <h4>{item.title}</h4>
                <span className={styles.slug}>/{item.slug}</span>
                <span className={styles.supporting}>
                  Version {item.version} · Updated{" "}
                  {formatUpdatedAt(item.updatedAt)}
                </span>
              </div>
              <span
                className={styles.status}
                data-state={item.publicationState}
              >
                {item.publicationState}
              </span>
              <Link
                className="text-link"
                href={`/admin/music/${plural}/${item.slug}`}
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MediaInventory({
  media,
}: {
  readonly media: readonly AdminMediaSummary[];
}) {
  if (media.length === 0) {
    return <p className={styles.empty}>No media has been registered.</p>;
  }

  return (
    <ul className={styles.mediaList}>
      {media.map((source) => {
        const sourceReadiness = readiness(source.status, source.approvalState);
        return (
          <li className={styles.mediaRow} key={source.id}>
            <div className={styles.mediaHeader}>
              <div>
                <strong>{source.kind} source</strong>
                <span className={styles.identifier}>{source.id}</span>
              </div>
              <span className={styles.status} data-readiness={sourceReadiness}>
                {source.status} · {source.approvalState}
              </span>
            </div>
            <dl className={styles.mediaFacts}>
              <div>
                <dt>Content type</dt>
                <dd>{source.contentType}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(source.byteLength)}</dd>
              </div>
              <div>
                <dt>Source version</dt>
                <dd>{source.sourceVersion}</dd>
              </div>
              <div>
                <dt>Derivatives</dt>
                <dd>{source.derivatives.length}</dd>
              </div>
            </dl>
            {source.derivatives.length > 0 ? (
              <ul className={styles.derivativeList}>
                {source.derivatives.map((derivative) => {
                  const derivativeReadiness = readiness(
                    derivative.status,
                    derivative.approvalState,
                  );
                  return (
                    <li className={styles.derivativeRow} key={derivative.id}>
                      <div>
                        <strong>{derivative.kind}</strong>
                        <span className={styles.mediaMeta}>
                          {derivative.processingProfile}{" "}
                          {derivative.processingVersion}
                          {derivative.contentType
                            ? ` · ${derivative.contentType}`
                            : ""}
                          {` · ${formatBytes(derivative.byteLength)}`}
                        </span>
                        <span className={styles.identifier}>
                          {derivative.id}
                        </span>
                      </div>
                      <span
                        className={styles.status}
                        data-readiness={derivativeReadiness}
                      >
                        {derivative.status} · {derivative.approvalState}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.supporting}>No derivatives registered.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CatalogOverview({
  canCreate,
  canViewMedia,
  data,
}: {
  readonly canCreate: boolean;
  readonly canViewMedia: boolean;
  readonly data: AdminCatalogIndex;
}) {
  return (
    <div className={styles.overview}>
      <header className={styles.heading}>
        <p className="eyebrow">Catalog administration</p>
        <h2>Music</h2>
        <p>
          Create private catalog revisions, review media readiness, and publish
          the artist-approved state that visitors can browse.
        </p>
      </header>
      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt>Tracks</dt>
          <dd>{data.tracks.length}</dd>
        </div>
        <div className={styles.metric}>
          <dt>Releases</dt>
          <dd>{data.releases.length}</dd>
        </div>
        <div className={styles.metric}>
          <dt>Collections</dt>
          <dd>{data.collections.length}</dd>
        </div>
      </dl>

      <CatalogList
        canCreate={canCreate}
        emptyMessage="No track drafts have been created."
        items={data.tracks}
        noun="track"
        plural="tracks"
        title="Tracks"
      />
      <CatalogList
        canCreate={canCreate}
        emptyMessage="No release drafts have been created."
        items={data.releases}
        noun="release"
        plural="releases"
        title="Releases"
      />
      <CatalogList
        canCreate={canCreate}
        emptyMessage="No collection drafts have been created."
        items={data.collections}
        noun="collection"
        plural="collections"
        title="Collections"
      />

      <section className={styles.section} aria-labelledby="media-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="media-heading">Media readiness</h3>
            <p>
              Source and derivative metadata is read-only here. Publication uses
              approved, ready records.
            </p>
          </div>
        </div>
        {canViewMedia ? (
          <MediaInventory media={data.media} />
        ) : (
          <p className={styles.empty}>
            Media readiness is available to the owner and assigned media
            editors.
          </p>
        )}
      </section>
    </div>
  );
}
