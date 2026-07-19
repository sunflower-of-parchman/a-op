import { env } from "cloudflare:workers";
import {
  PlaylistCreator,
  PlaylistList,
  type PublishedTrackOption,
} from "@/components/account";
import styles from "@/components/account/customer-library/CustomerLibrary.module.css";
import { requireCustomerLibraryPage } from "@/components/account/customer-library/server";
import { readPublicMusicIndex } from "@/db/catalog-read.ts";
import { readCustomerPlaylists } from "@/db/customer-read.ts";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const identity = await requireCustomerLibraryPage("/account/playlists");
  const [playlists, catalog] = await Promise.all([
    readCustomerPlaylists(env.DB, identity.userId),
    readPublicMusicIndex(env.DB, { kind: "track", sort: "title" }),
  ]);
  const tracks: readonly PublishedTrackOption[] = catalog.items.map(
    (track) => ({
      id: track.id,
      slug: track.slug,
      title: track.title,
      subtitle: track.subtitle,
    }),
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h2>Playlists</h2>
        <p>
          Arrange published tracks into your own listening order. Playlist
          changes are saved to your customer account.
        </p>
      </header>
      <section className={styles.section} aria-labelledby="create-playlist">
        <div className={styles.sectionHeading}>
          <h3 id="create-playlist">Create playlist</h3>
          <p>Select tracks in the order you want to hear them.</p>
        </div>
        <PlaylistCreator tracks={tracks} />
      </section>
      <section className={styles.section} aria-labelledby="saved-playlists">
        <div className={styles.sectionHeading}>
          <h3 id="saved-playlists">Your playlists</h3>
        </div>
        <PlaylistList playlists={playlists} />
      </section>
    </div>
  );
}
