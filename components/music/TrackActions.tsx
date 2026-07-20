"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { customerLibraryMutation } from "@/components/account/customer-library/mutation";
import { DownloadIcon } from "@/components/ui/DownloadIcon";
import { FavoriteHeartIcon } from "@/components/ui/FavoriteHeartIcon";
import type {
  CustomerPlaylistDTO,
  FavoriteMutationResult,
  PlaylistMutationResult,
} from "@/lib/customer-library/types";
import styles from "./Music.module.css";

export interface TrackActionsProps {
  readonly artworkAlt?: string | null;
  readonly artworkUrl?: string | null;
  readonly canSave: boolean;
  readonly downloadHref: string;
  readonly initialFavoriteActive: boolean;
  readonly initialFavoriteRevision: number | null;
  readonly licenseHref: string;
  readonly playlists: readonly CustomerPlaylistDTO[];
  readonly preview?: boolean;
  readonly productHref: string;
  readonly trackHref: string;
  readonly trackId: string | null;
  readonly trackSubtitle: string | null;
  readonly trackTitle: string;
}

function openDialog(ref: React.RefObject<HTMLDialogElement | null>) {
  if (ref.current && !ref.current.open) ref.current.showModal();
}

function closeDialog(ref: React.RefObject<HTMLDialogElement | null>) {
  if (ref.current?.open) ref.current.close();
}

export function TrackActions({
  artworkAlt = null,
  artworkUrl = null,
  canSave,
  downloadHref,
  initialFavoriteActive,
  initialFavoriteRevision,
  licenseHref,
  playlists,
  preview = false,
  productHref,
  trackHref,
  trackId,
  trackSubtitle,
  trackTitle,
}: TrackActionsProps) {
  const router = useRouter();
  const actionDialog = useRef<HTMLDialogElement>(null);
  const playlistDialog = useRef<HTMLDialogElement>(null);
  const [favoriteActive, setFavoriteActive] = useState(initialFavoriteActive);
  const [favoriteRevision, setFavoriteRevision] = useState(
    initialFavoriteRevision,
  );
  const [working, setWorking] = useState(false);
  const [playlistMode, setPlaylistMode] = useState<"choose" | "create">(
    "choose",
  );
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [message, setMessage] = useState("");

  function requirePublishedTrack(): string | null {
    if (canSave && trackId) return trackId;
    if (preview) {
      setMessage("This control will save when a published track is available.");
      return null;
    }
    router.push("/account");
    return null;
  }

  async function toggleFavorite() {
    const durableTrackId = requirePublishedTrack();
    if (!durableTrackId) {
      if (preview) setFavoriteActive((active) => !active);
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      const result = await customerLibraryMutation<FavoriteMutationResult>(
        "/api/account/favorites",
        "PUT",
        {
          targetType: "track",
          targetId: durableTrackId,
          active: !favoriteActive,
          expectedRevision: favoriteRevision,
        },
      );
      setFavoriteActive(result.active);
      setFavoriteRevision(result.revision);
      setMessage(
        result.active ? "Added to favorites." : "Removed from favorites.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Favorite could not be updated.",
      );
    } finally {
      setWorking(false);
    }
  }

  function showPlaylistDialog() {
    closeDialog(actionDialog);
    setPlaylistMode("choose");
    setMessage("");
    openDialog(playlistDialog);
  }

  async function addToPlaylist(playlist: CustomerPlaylistDTO) {
    const durableTrackId = requirePublishedTrack();
    if (!durableTrackId) return;
    const trackIds = playlist.tracks.map(({ track }) => track.id);
    if (trackIds.includes(durableTrackId)) {
      setMessage(`Already in ${playlist.name}.`);
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      await customerLibraryMutation<PlaylistMutationResult>(
        `/api/account/playlists/${encodeURIComponent(playlist.id)}`,
        "PUT",
        {
          name: playlist.name,
          description: playlist.description,
          trackIds: [...trackIds, durableTrackId],
          expectedRevision: playlist.revision,
        },
      );
      closeDialog(playlistDialog);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Track could not be added.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const durableTrackId = requirePublishedTrack();
    if (!durableTrackId) return;
    setWorking(true);
    setMessage("");
    try {
      await customerLibraryMutation<PlaylistMutationResult>(
        "/api/account/playlists",
        "POST",
        {
          name: playlistName,
          description: playlistDescription,
          trackIds: [durableTrackId],
        },
      );
      closeDialog(playlistDialog);
      setPlaylistName("");
      setPlaylistDescription("");
      setPlaylistMode("choose");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Playlist could not be created.",
      );
    } finally {
      setWorking(false);
    }
  }

  const favoriteLabel = favoriteActive
    ? "Remove from Favorites"
    : "Add to Favorites";

  return (
    <>
      <div className={styles.desktopTrackActions}>
        <Link className={styles.trackAction} href={productHref}>
          Buy Track
        </Link>
        <Link className={styles.trackAction} href={licenseHref}>
          License Track
        </Link>
        <Link
          aria-label={`Download ${trackTitle}`}
          className={styles.downloadIconLink}
          href={downloadHref}
        >
          <DownloadIcon />
        </Link>
        <button
          aria-label={favoriteLabel}
          aria-pressed={favoriteActive}
          className={styles.favoriteHeart}
          disabled={working}
          onClick={() => void toggleFavorite()}
          type="button"
        >
          <FavoriteHeartIcon active={favoriteActive} />
        </button>
        <button
          aria-label={`Add ${trackTitle} to a playlist`}
          className={styles.addPlaylistButton}
          onClick={showPlaylistDialog}
          type="button"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      <div className={styles.mobileTrackActions}>
        <Link className={styles.trackAction} href={productHref}>
          Buy Track
        </Link>
        <button
          aria-label={`More actions for ${trackTitle}`}
          className={styles.mobileTrackMenuButton}
          onClick={() => openDialog(actionDialog)}
          type="button"
        >
          <span aria-hidden="true">⋮</span>
        </button>
      </div>

      <dialog className={styles.mobileActionDialog} ref={actionDialog}>
        <button
          aria-label="Close track actions"
          className={styles.dialogClose}
          onClick={() => closeDialog(actionDialog)}
          type="button"
        >
          ×
        </button>
        <div className={styles.dialogTrackIdentity}>
          <div className={styles.dialogArtwork}>
            {artworkUrl ? (
              <Image
                alt={artworkAlt ?? ""}
                fill
                sizes="96px"
                src={artworkUrl}
                unoptimized
              />
            ) : null}
          </div>
          <div>
            <strong>{trackTitle}</strong>
            {trackSubtitle ? <span>{trackSubtitle}</span> : null}
          </div>
        </div>
        <nav aria-label={`${trackTitle} mobile actions`}>
          <Link href={trackHref}>View Track</Link>
          <button
            disabled={working}
            onClick={() => void toggleFavorite()}
            type="button"
          >
            {favoriteLabel}
          </button>
          <Link href={downloadHref}>Download</Link>
          <Link href={productHref}>Buy Track</Link>
          <Link href={licenseHref}>License Track</Link>
          <button onClick={showPlaylistDialog} type="button">
            Add to Playlist
          </button>
        </nav>
      </dialog>

      <dialog className={styles.playlistDialog} ref={playlistDialog}>
        <header>
          <h2>Add to Playlist</h2>
          <button
            aria-label="Close add to playlist"
            className={styles.dialogClose}
            onClick={() => closeDialog(playlistDialog)}
            type="button"
          >
            ×
          </button>
        </header>

        <div className={styles.dialogTrackIdentity}>
          <div className={styles.dialogArtwork}>
            {artworkUrl ? (
              <Image
                alt={artworkAlt ?? ""}
                fill
                sizes="72px"
                src={artworkUrl}
                unoptimized
              />
            ) : null}
          </div>
          <div>
            <strong>{trackTitle}</strong>
            {trackSubtitle ? <span>{trackSubtitle}</span> : null}
          </div>
        </div>

        {playlistMode === "choose" ? (
          <div className={styles.playlistChooser}>
            {playlists.map((playlist) => (
              <button
                disabled={working}
                key={playlist.id}
                onClick={() => void addToPlaylist(playlist)}
                type="button"
              >
                <span>
                  <strong>{playlist.name}</strong>
                  {playlist.description ? (
                    <small>{playlist.description}</small>
                  ) : null}
                </span>
                <span aria-hidden="true">+</span>
              </button>
            ))}
            <button
              className={styles.createPlaylistChoice}
              onClick={() => {
                setMessage("");
                setPlaylistMode("create");
              }}
              type="button"
            >
              <span aria-hidden="true">+</span> Create New Playlist
            </button>
          </div>
        ) : (
          <form className={styles.createPlaylistForm} onSubmit={createPlaylist}>
            <label>
              <span>Playlist Name</span>
              <input
                autoComplete="off"
                maxLength={120}
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder="Enter playlist name"
                required
                value={playlistName}
              />
            </label>
            <label>
              <span>Description (optional)</span>
              <textarea
                maxLength={1000}
                onChange={(event) => setPlaylistDescription(event.target.value)}
                placeholder="Enter description"
                rows={3}
                value={playlistDescription}
              />
            </label>
            <div>
              <button
                className="button button-secondary"
                onClick={() => setPlaylistMode("choose")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={working || playlistName.trim().length === 0}
                type="submit"
              >
                {working ? "Creating…" : "Create & Add"}
              </button>
            </div>
          </form>
        )}
        <p aria-live="polite" className={styles.dialogStatus}>
          {message}
        </p>
      </dialog>
    </>
  );
}

export default TrackActions;
