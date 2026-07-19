"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CustomerPlaylistDTO,
  PlaylistMutationResult,
} from "@/lib/customer-library/types.ts";
import { customerLibraryMutation } from "./mutation";
import {
  TrackSequenceEditor,
  type SelectedPlaylistTrack,
} from "./TrackSequenceEditor";
import type { PublishedTrackOption } from "./types";
import styles from "./CustomerLibrary.module.css";

export interface PlaylistEditorProps {
  readonly playlist: CustomerPlaylistDTO;
  readonly tracks: readonly PublishedTrackOption[];
}

function initialTrackSelection(
  playlist: CustomerPlaylistDTO,
): readonly SelectedPlaylistTrack[] {
  return playlist.tracks.map(({ track }) => ({
    id: track.id,
    title: track.title ?? `Unavailable track (${track.id})`,
    subtitle: track.subtitle,
    available: track.available,
  }));
}

export function PlaylistEditor({ playlist, tracks }: PlaylistEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [selected, setSelected] = useState<readonly SelectedPlaylistTrack[]>(
    () => initialTrackSelection(playlist),
  );
  const [revision, setRevision] = useState(playlist.revision);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"idle" | "error" | "success">("idle");
  const hasUnavailableTracks = selected.some(({ available }) => !available);
  const playlistUrl = `/api/account/playlists/${encodeURIComponent(playlist.id)}`;

  async function savePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    setTone("idle");

    try {
      const result = await customerLibraryMutation<PlaylistMutationResult>(
        playlistUrl,
        "PUT",
        {
          name,
          description,
          trackIds: selected.map(({ id }) => id),
          expectedRevision: revision,
        },
      );
      setRevision(result.revision);
      setMessage(`Playlist saved at revision ${result.revision}.`);
      setTone("success");
      setWorking(false);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The playlist could not be saved.",
      );
      setTone("error");
      setWorking(false);
    }
  }

  async function archivePlaylist() {
    const confirmed = window.confirm(
      `Archive “${name}”? It will leave your active playlists.`,
    );
    if (!confirmed) return;

    setWorking(true);
    setMessage("");
    setTone("idle");
    try {
      await customerLibraryMutation<PlaylistMutationResult>(
        playlistUrl,
        "DELETE",
        { expectedRevision: revision },
      );
      router.push("/account/playlists");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The playlist could not be archived.",
      );
      setTone("error");
      setWorking(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={savePlaylist}>
      <label className={styles.field}>
        <span>Name</span>
        <input
          autoComplete="off"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          type="text"
          value={name}
        />
      </label>
      <label className={styles.field}>
        <span>Description</span>
        <textarea
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          value={description}
        />
      </label>
      <TrackSequenceEditor
        disabled={working}
        legend="Track order"
        onChange={setSelected}
        options={tracks}
        selected={selected}
      />
      <div className={styles.formActions}>
        <button
          className="button button-primary"
          disabled={working || hasUnavailableTracks}
          type="submit"
        >
          {working ? "Saving…" : "Save playlist"}
        </button>
        <button
          className={`button button-secondary ${styles.dangerButton}`}
          disabled={working}
          onClick={() => void archivePlaylist()}
          type="button"
        >
          Archive playlist
        </button>
      </div>
      {hasUnavailableTracks ? (
        <p className={styles.availability} data-available="false">
          Remove unavailable tracks before saving this playlist.
        </p>
      ) : null}
      <p aria-live="polite" className={styles.status} data-tone={tone}>
        {message}
      </p>
    </form>
  );
}
