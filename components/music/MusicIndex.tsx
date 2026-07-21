import Image from "next/image";
import Link from "next/link";
import { PublicFavoriteControl } from "@/components/account";
import { PlayTrackButton } from "@/components/player";
import { TelemetryPageView } from "@/components/telemetry";
import type { CommerceProductDTO } from "@/lib/commerce/domain.ts";
import type {
  CatalogIndexItemDTO,
  PublicMusicIndexDTO,
  PublicMusicView,
} from "@/lib/catalog/public-dto";
import type {
  CustomerFavoriteDTO,
  CustomerPlaylistDTO,
  ListeningHistoryDTO,
} from "@/lib/customer-library/types.ts";
import type { LicenseOfferDTO } from "@/lib/licensing/types.ts";
import { EmptyTrackPreview } from "./EmptyTrackPreview";
import { MobileMusicControls } from "./MobileMusicControls";
import { MusicFilters } from "./MusicFilters";
import { MusicSort } from "./MusicSort";
import { PublicTrackActions } from "./PublicTrackActions";
import { TrackColumnHeader } from "./TrackColumnHeader";
import styles from "./Music.module.css";

const LIBRARY_LINKS: readonly {
  readonly href: string;
  readonly label: string;
  readonly view: PublicMusicView;
}[] = [
  { href: "/music?view=explore", label: "Explore", view: "explore" },
  { href: "/music", label: "Tracks", view: "tracks" },
  {
    href: "/music?view=collections",
    label: "Collections",
    view: "collections",
  },
  { href: "/music?view=albums", label: "Albums", view: "albums" },
  {
    href: "/music?view=favorites",
    label: "Favorites",
    view: "favorites",
  },
];

function durationLabel(value: number | null): string {
  const totalSeconds = Math.floor((value ?? 0) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function viewTitle(view: PublicMusicView): string {
  if (view === "tracks") return "All Tracks";
  if (view === "collections") return "Collections";
  if (view === "albums") return "Albums";
  if (view === "favorites") return "Favorites";
  return "Explore";
}

function resultLabel(count: number, view: PublicMusicView): string {
  const noun =
    view === "tracks"
      ? "track"
      : view === "collections"
        ? "collection"
        : view === "albums"
          ? "album"
          : "item";
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function EmptyMessage({ children }: { readonly children: string }) {
  return <p className={styles.emptyMessage}>{children}</p>;
}

interface CatalogRowProps {
  readonly item: CatalogIndexItemDTO;
  readonly product: CommerceProductDTO | null;
  readonly licenseOffer: LicenseOfferDTO | null;
  readonly playlists: readonly CustomerPlaylistDTO[];
}

function CatalogRow({
  item,
  product,
  licenseOffer,
  playlists,
}: CatalogRowProps) {
  return (
    <article className={styles.catalogRow}>
      <div className={styles.catalogLead}>
        <div
          aria-hidden={item.artwork ? undefined : "true"}
          className={`${styles.indexArtwork} ${item.artwork ? "" : styles.indexArtworkEmpty}`}
        >
          {item.artwork ? (
            <Image
              alt={item.artwork.alt}
              fill
              sizes="56px"
              src={item.artwork.url}
              unoptimized
            />
          ) : null}
          {item.playableTrack ? (
            <div className={styles.artworkPlayback}>
              <PlayTrackButton compact track={item.playableTrack} />
            </div>
          ) : null}
        </div>

        <div className={styles.catalogIdentity}>
          <h3>
            <Link href={item.href}>{item.title}</Link>
            <span>{durationLabel(item.durationMs)}</span>
          </h3>
        </div>
      </div>

      <dl className={styles.trackFacts}>
        <div>
          <dt>Tempo</dt>
          <dd>{item.tempoBpm === null ? "" : `${item.tempoBpm} BPM`}</dd>
        </div>
        <div>
          <dt>Meter</dt>
          <dd>{item.meter ?? ""}</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>{item.musicalKey ?? ""}</dd>
        </div>
      </dl>

      <div className={styles.catalogPlayback}>
        <span aria-hidden="true" />
      </div>

      <div className={styles.catalogActions}>
        <PublicTrackActions
          artworkAlt={item.artwork?.alt ?? null}
          artworkUrl={item.artwork?.url ?? null}
          downloadHref="/account/library"
          licenseHref={
            licenseOffer
              ? `/licensing#offer-${licenseOffer.slug}`
              : "/licensing"
          }
          playlists={playlists}
          productHref={
            product ? `/commerce#${product.offerAnchorId}` : "/commerce"
          }
          trackHref={item.href}
          trackId={item.id}
          trackSubtitle={item.subtitle}
          trackTitle={item.title}
        />
      </div>
    </article>
  );
}

function CatalogCard({ item }: { readonly item: CatalogIndexItemDTO }) {
  return (
    <article className={styles.catalogCard}>
      <Link className={styles.catalogCardLink} href={item.href}>
        {item.artwork ? (
          <div className={styles.cardArtwork}>
            <Image
              alt={item.artwork.alt}
              fill
              sizes="(max-width: 720px) 45vw, 240px"
              src={item.artwork.url}
              unoptimized
            />
          </div>
        ) : null}
        <span className={styles.cardIdentity}>
          <strong>{item.title}</strong>
          <span>
            {item.kind === "release"
              ? item.publishedAt.slice(0, 4)
              : `${item.trackCount ?? 0} ${(item.trackCount ?? 0) === 1 ? "track" : "tracks"}`}
          </span>
        </span>
      </Link>
      {item.kind === "release" || item.kind === "collection" ? (
        <PublicFavoriteControl
          compact
          label={item.title}
          targetId={item.id}
          targetType={item.kind}
        />
      ) : null}
    </article>
  );
}

function CardSection({
  empty,
  items,
  title,
}: {
  readonly empty: string;
  readonly items: readonly CatalogIndexItemDTO[];
  readonly title: string | null;
}) {
  return (
    <section className={styles.viewSection}>
      {title ? <h2>{title}</h2> : null}
      {items.length === 0 ? (
        <EmptyMessage>{empty}</EmptyMessage>
      ) : (
        <div className={styles.catalogGrid}>
          {items.map((item) => (
            <CatalogCard item={item} key={`${item.kind}:${item.id}`} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyCatalogPreview({
  count,
  kind,
}: {
  readonly count: number;
  readonly kind: "album" | "collection";
}) {
  const title = kind === "album" ? "Album" : "Collection";
  const route = kind === "album" ? "releases" : "collections";
  return (
    <div
      aria-label={`${title} interface previews`}
      className={styles.catalogGrid}
      role="list"
    >
      {Array.from({ length: count }, (_, index) => (
        <article
          className={styles.catalogCard}
          key={`${kind}:${index + 1}`}
          role="listitem"
        >
          <Link
            aria-label={`Open ${title} preview ${index + 1}`}
            className={styles.catalogCardLink}
            href={`/music/${route}/preview-${index + 1}`}
          >
            <span
              aria-hidden="true"
              className={`${styles.cardArtwork} ${styles.cardArtworkEmpty}`}
            />
            <span className={styles.cardIdentity}>
              <strong>{title}</strong>
              <span>5 tracks</span>
            </span>
          </Link>
        </article>
      ))}
    </div>
  );
}

export interface MusicIndexProps {
  readonly data: PublicMusicIndexDTO;
  readonly favorites?: readonly CustomerFavoriteDTO[];
  readonly licenseOffers: readonly LicenseOfferDTO[];
  readonly listeningHistory?: readonly ListeningHistoryDTO[];
  readonly playlists?: readonly CustomerPlaylistDTO[];
  readonly products: readonly CommerceProductDTO[];
  readonly view: PublicMusicView;
}

export function MusicIndex({
  data,
  favorites = [],
  licenseOffers,
  listeningHistory = [],
  playlists = [],
  products,
  view,
}: MusicIndexProps) {
  const filterKey = [
    data.query.q,
    data.query.kind,
    data.query.sort,
    data.query.meter ?? "",
    data.query.tempoMin ?? "",
    data.query.tempoMax ?? "",
    data.query.musicalKey ?? "",
    data.query.durationMinMs ?? "",
    data.query.durationMaxMs ?? "",
    view,
  ].join(":");
  const trackProducts = new Map(
    products
      .filter(
        (product) =>
          product.productType === "track" &&
          product.resourceType === "track" &&
          product.resourceId !== null,
      )
      .map((product) => [product.resourceId as string, product] as const),
  );
  const trackLicenseOffers = new Map(
    licenseOffers.map((offer) => [offer.snapshot.track.id, offer] as const),
  );
  const favoriteKeys = new Set(
    favorites.map((favorite) => `${favorite.targetType}:${favorite.targetId}`),
  );
  const tracks = data.items.filter((item) => item.kind === "track");
  const albums = data.items.filter((item) => item.kind === "release");
  const collections = data.items.filter((item) => item.kind === "collection");
  const visibleTracks =
    view === "favorites"
      ? tracks.filter((item) => favoriteKeys.has(`track:${item.id}`))
      : tracks;
  const visibleAlbums =
    view === "favorites"
      ? albums.filter((item) => favoriteKeys.has(`release:${item.id}`))
      : albums;
  const visibleCollections =
    view === "favorites"
      ? collections.filter((item) => favoriteKeys.has(`collection:${item.id}`))
      : collections;
  const visibleCount =
    view === "tracks"
      ? visibleTracks.length
      : view === "albums"
        ? visibleAlbums.length
        : view === "collections"
          ? visibleCollections.length
          : view === "favorites"
            ? visibleTracks.length +
              visibleAlbums.length +
              visibleCollections.length
            : data.items.length;
  const showEmptyTrackPreview =
    visibleTracks.length === 0 ||
    (visibleTracks.length === 1 &&
      visibleTracks[0].title === "Track" &&
      visibleTracks[0].artwork === null &&
      visibleTracks[0].playableTrack === null &&
      visibleTracks[0].durationMs === null &&
      visibleTracks[0].meter === null &&
      visibleTracks[0].tempoBpm === null &&
      visibleTracks[0].musicalKey === null);
  const displayedCount =
    view === "tracks" && showEmptyTrackPreview ? 5 : visibleCount;

  return (
    <>
      <TelemetryPageView
        eventName="music-view"
        resourceId="site"
        resourceType="site"
      />
      <div className={styles.libraryShell}>
        <aside className={styles.librarySidebar}>
          <details className={styles.sidebarDisclosure} open>
            <summary>
              <span>Browse and filter</span>
            </summary>
            <div className={styles.sidebarContent}>
              <div className={styles.sidebarUpper}>
                <nav aria-label="Music library">
                  <p className={styles.sidebarLabel}>Library</p>
                  <ul className={styles.libraryNavigation}>
                    {LIBRARY_LINKS.map((item) => (
                      <li key={item.view}>
                        <Link
                          aria-current={view === item.view ? "page" : undefined}
                          href={item.href}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>

                <MusicFilters
                  availableKeys={data.availableKeys}
                  availableMeters={data.availableMeters}
                  key={filterKey}
                  query={data.query}
                  view={view}
                />
              </div>

              <div className={styles.sidebarCustomer}>
                <section>
                  <div className={styles.sidebarSectionHeading}>
                    <p className={styles.sidebarLabel}>Your playlists</p>
                    <Link
                      aria-label="Create playlist"
                      href="/account/playlists"
                    >
                      +
                    </Link>
                  </div>
                  {playlists.length > 0 ? (
                    <ul className={styles.customerLinks}>
                      {playlists.map((playlist) => (
                        <li key={playlist.id}>
                          <Link href={`/account/playlists/${playlist.id}`}>
                            {playlist.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section>
                  <div className={styles.sidebarSectionHeading}>
                    <p className={styles.sidebarLabel}>Recently played</p>
                    <Link href="/account/listening-history">See all</Link>
                  </div>
                  {listeningHistory.length > 0 ? (
                    <ul className={styles.recentLinks}>
                      {listeningHistory.slice(0, 3).map((history) => (
                        <li key={history.id}>
                          {history.track.href ? (
                            <Link href={history.track.href}>
                              {history.track.title ??
                                history.listenedRevision.title}
                            </Link>
                          ) : (
                            history.listenedRevision.title
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            </div>
          </details>
        </aside>

        <main className={styles.libraryMain}>
          <MobileMusicControls
            availableKeys={data.availableKeys}
            availableMeters={data.availableMeters}
            query={data.query}
            view={view}
          />
          <header className={styles.libraryHeader}>
            <h1>Music Library</h1>
          </header>

          <div className={styles.listHeader}>
            <h2>{viewTitle(view)}</h2>
            <div className={styles.listTools}>
              <MusicSort query={data.query} view={view} />
              <p aria-live="polite" role="status">
                {resultLabel(displayedCount, view)}
              </p>
            </div>
          </div>

          {view === "tracks" ? (
            <section className={styles.trackTable}>
              <TrackColumnHeader />
              {showEmptyTrackPreview ? (
                <EmptyTrackPreview playlists={playlists} />
              ) : (
                <ol
                  aria-label="Published tracks"
                  className={styles.catalogList}
                >
                  {visibleTracks.map((item) => (
                    <li key={item.id}>
                      <CatalogRow
                        item={item}
                        licenseOffer={trackLicenseOffers.get(item.id) ?? null}
                        product={trackProducts.get(item.id) ?? null}
                        playlists={playlists}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : view === "collections" ? (
            visibleCollections.length === 0 ? (
              <section className={styles.viewSection}>
                <EmptyCatalogPreview count={2} kind="collection" />
              </section>
            ) : (
              <CardSection
                empty="No collections have been published yet."
                items={visibleCollections}
                title={null}
              />
            )
          ) : view === "albums" ? (
            visibleAlbums.length === 0 ? (
              <section className={styles.viewSection}>
                <EmptyCatalogPreview count={3} kind="album" />
              </section>
            ) : (
              <CardSection
                empty="No albums have been published yet."
                items={visibleAlbums}
                title={null}
              />
            )
          ) : view === "favorites" ? (
            <div className={styles.favoriteSections}>
              <CardSection
                empty="No favorite albums yet."
                items={visibleAlbums}
                title="Favorite Albums"
              />
              <CardSection
                empty="No favorite collections yet."
                items={visibleCollections}
                title="Favorite Collections"
              />
              <section className={styles.viewSection}>
                <h2>Favorite Tracks</h2>
                {visibleTracks.length === 0 ? (
                  <EmptyMessage>No favorite tracks yet.</EmptyMessage>
                ) : (
                  <ol className={styles.catalogList}>
                    {visibleTracks.map((item) => (
                      <li key={item.id}>
                        <CatalogRow
                          item={item}
                          licenseOffer={trackLicenseOffers.get(item.id) ?? null}
                          product={trackProducts.get(item.id) ?? null}
                          playlists={playlists}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          ) : data.items.length === 0 ? (
            <EmptyMessage>No music has been published yet.</EmptyMessage>
          ) : (
            <div className={styles.exploreSections}>
              <CardSection
                empty="No albums have been published yet."
                items={albums}
                title="Albums"
              />
              <CardSection
                empty="No collections have been published yet."
                items={collections}
                title="Collections"
              />
              <section className={styles.viewSection}>
                <h2>Tracks</h2>
                {tracks.length === 0 ? (
                  <EmptyMessage>
                    No tracks have been published yet.
                  </EmptyMessage>
                ) : (
                  <ol className={styles.catalogList}>
                    {tracks.map((item) => (
                      <li key={item.id}>
                        <CatalogRow
                          item={item}
                          licenseOffer={trackLicenseOffers.get(item.id) ?? null}
                          product={trackProducts.get(item.id) ?? null}
                          playlists={playlists}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default MusicIndex;
