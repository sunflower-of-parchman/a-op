"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PlaylistMutationResult } from "@/lib/customer-library/types.ts";
import { customerLibraryMutation } from "./mutation";
import {
  TrackSequenceEditor,
  type SelectedPlaylistTrack,
} from "./TrackSequenceEditor";
import type { PublishedTrackOption } from "./types";
import styles from "./CustomerLibrary.module.css";

export interface PlaylistCreatorProps {
  readonly tracks: readonly PublishedTrackOption[];
}

export function PlaylistCreator({ tracks }: PlaylistCreatorProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<readonly SelectedPlaylistTrack[]>(
    [],
  );
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"idle" | "error">("idle");

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    setTone("idle");

    try {
      const result = await customerLibraryMutation<PlaylistMutationResult>(
        "/api/account/playlists",
        "POST",
        {
          name,
          description,
          trackIds: selected.map(({ id }) => id),
        },
      );
      router.push(`/account/playlists/${encodeURIComponent(result.id)}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The playlist could not be created.",
      );
      setTone("error");
      setWorking(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={createPlaylist}>
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
          disabled={working || selected.length === 0}
          type="submit"
        >
          {working ? "Creating…" : "Create playlist"}
        </button>
        <p aria-live="polite" className={styles.status} data-tone={tone}>
          {message}
        </p>
      </div>
    </form>
  );
}
