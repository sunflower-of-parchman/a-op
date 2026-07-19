import Link from "next/link";
import type { CustomerPlaylistDTO } from "@/lib/customer-library/types.ts";
import styles from "./CustomerLibrary.module.css";

export interface PlaylistListProps {
  readonly playlists: readonly CustomerPlaylistDTO[];
}

export function PlaylistList({ playlists }: PlaylistListProps) {
  if (playlists.length === 0) {
    return <p className={styles.emptyState}>No playlists yet.</p>;
  }

  return (
    <ul className={styles.rows}>
      {playlists.map((playlist) => (
        <li className={styles.row} key={playlist.id}>
          <div className={styles.rowBody}>
            <Link
              className={styles.rowTitle}
              href={`/account/playlists/${encodeURIComponent(playlist.id)}`}
            >
              {playlist.name}
            </Link>
            <span className={styles.meta}>
              {playlist.tracks.length} track
              {playlist.tracks.length === 1 ? "" : "s"} · Revision{" "}
              {playlist.revision}
            </span>
            {playlist.description ? <p>{playlist.description}</p> : null}
          </div>
          <Link
            className="button button-secondary"
            href={`/account/playlists/${encodeURIComponent(playlist.id)}`}
          >
            Edit
          </Link>
        </li>
      ))}
    </ul>
  );
}
