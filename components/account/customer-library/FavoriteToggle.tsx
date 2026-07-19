"use client";

import { useState } from "react";
import type {
  FavoriteMutationResult,
  FavoriteTargetType,
} from "@/lib/customer-library/types.ts";
import { customerLibraryMutation } from "./mutation";
import styles from "./CustomerLibrary.module.css";

export interface FavoriteToggleProps {
  readonly targetType: FavoriteTargetType;
  readonly targetId: string;
  readonly label: string;
  readonly initialActive: boolean;
  readonly initialRevision: number | null;
}

export function FavoriteToggle({
  targetType,
  targetId,
  label,
  initialActive,
  initialRevision,
}: FavoriteToggleProps) {
  const [active, setActive] = useState(initialActive);
  const [revision, setRevision] = useState(initialRevision);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"idle" | "error" | "success">("idle");

  async function updateFavorite() {
    setWorking(true);
    setMessage("");
    setTone("idle");
    try {
      const result = await customerLibraryMutation<FavoriteMutationResult>(
        "/api/account/favorites",
        "PUT",
        {
          targetType,
          targetId,
          active: !active,
          expectedRevision: revision,
        },
      );
      setActive(result.active);
      setRevision(result.revision);
      setMessage(result.active ? "Saved to favorites." : "Favorite removed.");
      setTone("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The favorite could not be updated.",
      );
      setTone("error");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.favoriteToggle}>
      <button
        aria-label={`${active ? "Remove" : "Save"} ${label} ${active ? "from" : "to"} favorites`}
        aria-pressed={active}
        className="button button-secondary"
        disabled={working}
        onClick={() => void updateFavorite()}
        type="button"
      >
        {working ? "Saving…" : active ? "Remove favorite" : "Save favorite"}
      </button>
      <p aria-live="polite" className={styles.status} data-tone={tone}>
        {message}
      </p>
    </div>
  );
}
