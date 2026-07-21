"use client";

import { useState } from "react";
import type {
  CustomerFavoriteDTO,
  FavoriteMutationResult,
} from "@/lib/customer-library/types.ts";
import { customerLibraryMutation } from "./mutation";
import styles from "./CustomerLibrary.module.css";

export interface FavoriteListProps {
  readonly favorites: readonly CustomerFavoriteDTO[];
}

interface FavoriteState {
  readonly favorite: CustomerFavoriteDTO;
  readonly active: boolean;
  readonly revision: number;
  readonly pending: boolean;
  readonly message: string;
  readonly tone: "idle" | "error" | "success";
}

function favoriteLabel(favorite: CustomerFavoriteDTO): string {
  return (
    favorite.resource.title ??
    `Unavailable ${favorite.targetType} (${favorite.targetId})`
  );
}

export function FavoriteList({ favorites }: FavoriteListProps) {
  const [items, setItems] = useState<readonly FavoriteState[]>(() =>
    favorites.map((favorite) => ({
      favorite,
      active: true,
      revision: favorite.revision,
      pending: false,
      message: "",
      tone: "idle",
    })),
  );

  if (items.length === 0) {
    return <p className={styles.emptyState}>No favorites yet.</p>;
  }

  async function setDesiredState(item: FavoriteState) {
    const active = !item.active;
    setItems((current) =>
      current.map((candidate) =>
        candidate.favorite.id === item.favorite.id
          ? { ...candidate, pending: true, message: "", tone: "idle" }
          : candidate,
      ),
    );

    try {
      const result = await customerLibraryMutation<FavoriteMutationResult>(
        "/api/account/favorites",
        "PUT",
        {
          targetType: item.favorite.targetType,
          targetId: item.favorite.targetId,
          active,
          expectedRevision: item.revision,
        },
      );
      setItems((current) =>
        current.map((candidate) =>
          candidate.favorite.id === item.favorite.id
            ? {
                ...candidate,
                active: result.active,
                revision: result.revision,
                pending: false,
                message: result.active
                  ? "Favorite restored."
                  : "Favorite removed.",
                tone: "success",
              }
            : candidate,
        ),
      );
    } catch (error) {
      setItems((current) =>
        current.map((candidate) =>
          candidate.favorite.id === item.favorite.id
            ? {
                ...candidate,
                pending: false,
                message:
                  error instanceof Error
                    ? error.message
                    : "The favorite could not be updated.",
                tone: "error",
              }
            : candidate,
        ),
      );
    }
  }

  return (
    <ul className={styles.rows}>
      {items.map((item) => {
        const label = favoriteLabel(item.favorite);
        const resource = item.favorite.resource;
        return (
          <li className={styles.row} key={item.favorite.id}>
            <div className={styles.rowBody}>
              {resource.available && resource.href ? (
                <a className={styles.rowTitle} href={resource.href}>
                  {label}
                </a>
              ) : (
                <span className={styles.rowTitle}>{label}</span>
              )}
              <span className={styles.meta}>
                {item.favorite.targetType === "track"
                  ? "Track"
                  : item.favorite.targetType === "release"
                    ? "Album"
                    : "Collection"}
                {item.active ? " · Saved" : " · Removed"}
              </span>
              {!resource.available ? (
                <span className={styles.availability} data-available="false">
                  This catalog item is no longer available.
                </span>
              ) : null}
              <p
                aria-live="polite"
                className={styles.status}
                data-tone={item.tone}
              >
                {item.message}
              </p>
            </div>
            <div className={styles.actions}>
              <button
                aria-label={`${item.active ? "Remove" : "Restore"} ${label}`}
                className="button button-secondary"
                disabled={item.pending}
                onClick={() => void setDesiredState(item)}
                type="button"
              >
                {item.pending ? "Saving…" : item.active ? "Remove" : "Restore"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
