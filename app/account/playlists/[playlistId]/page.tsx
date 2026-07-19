import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PlaylistEditor,
  type PublishedTrackOption,
} from "@/components/account";
import styles from "@/components/account/customer-library/CustomerLibrary.module.css";
import { requireCustomerLibraryPage } from "@/components/account/customer-library/server";
import { readPublicMusicIndex } from "@/db/catalog-read.ts";
import { readCustomerPlaylist } from "@/db/customer-read.ts";

export const dynamic = "force-dynamic";

const SAFE_PLAYLIST_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

interface PlaylistPageProps {
  readonly params: Promise<{ playlistId: string }>;
}

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const identity = await requireCustomerLibraryPage("/account/playlists");
  const { playlistId } = await params;
  if (!SAFE_PLAYLIST_ID.test(playlistId)) notFound();

  const [playlist, catalog] = await Promise.all([
    readCustomerPlaylist(env.DB, identity.userId, playlistId),
    readPublicMusicIndex(env.DB, { kind: "track", sort: "title" }),
  ]);
  if (!playlist) notFound();

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
        <Link className={styles.backLink} href="/account/playlists">
          Back to playlists
        </Link>
        <h2>{playlist.name}</h2>
        <p>
          Reorder tracks, update the playlist details, or archive this playlist.
          Changes use revision {playlist.revision} as their starting point.
        </p>
      </header>
      <PlaylistEditor playlist={playlist} tracks={tracks} />
    </div>
  );
}
