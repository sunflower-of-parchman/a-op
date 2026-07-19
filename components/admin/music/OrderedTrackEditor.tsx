"use client";

import { useMemo } from "react";
import type {
  AdminCollectionTrack,
  AdminReleaseTrack,
  AdminTrackOption,
  ReleaseTrackInput,
} from "@/lib/catalog/types.ts";

import styles from "./CatalogAdmin.module.css";

type ExistingTrack = AdminReleaseTrack | AdminCollectionTrack;

interface OrderedTrackEditorProps {
  readonly initialTracks: readonly ExistingTrack[];
  readonly mode: "collection" | "release";
  readonly onChange: (
    value: readonly ReleaseTrackInput[] | readonly string[],
  ) => void;
  readonly options: readonly AdminTrackOption[];
  readonly releaseValue?: readonly ReleaseTrackInput[];
  readonly trackIds?: readonly string[];
}

export function OrderedTrackEditor({
  initialTracks,
  mode,
  onChange,
  options,
  releaseValue = [],
  trackIds = [],
}: OrderedTrackEditorProps) {
  const entries =
    mode === "release"
      ? releaseValue
      : trackIds.map((trackId) => ({ trackId }));
  const choices = useMemo(() => {
    const current = initialTracks.map((track) => ({
      id: track.trackId,
      slug: track.slug,
      title: track.title,
      available: options.some((option) => option.id === track.trackId),
    }));
    for (const option of options) {
      if (!current.some((choice) => choice.id === option.id)) {
        current.push({ ...option, available: true });
      }
    }
    return current;
  }, [initialTracks, options]);

  function commit(
    next: readonly {
      trackId: string;
      discNumber?: number;
      trackNumber?: number;
    }[],
  ) {
    if (mode === "release") {
      onChange(
        next.map((entry, index) => ({
          trackId: entry.trackId,
          discNumber: entry.discNumber ?? 1,
          trackNumber: entry.trackNumber ?? index + 1,
        })),
      );
    } else {
      onChange(next.map(({ trackId }) => trackId));
    }
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= entries.length) return;
    const next = [...entries];
    [next[index], next[destination]] = [next[destination], next[index]];
    commit(next);
  }

  function add() {
    const selected = new Set(entries.map(({ trackId }) => trackId));
    const option = options.find(({ id }) => !selected.has(id));
    if (!option) return;
    const lastReleaseEntry = mode === "release" ? releaseValue.at(-1) : null;
    commit([
      ...entries,
      {
        trackId: option.id,
        discNumber: lastReleaseEntry?.discNumber ?? 1,
        trackNumber: (lastReleaseEntry?.trackNumber ?? entries.length) + 1,
      },
    ]);
  }

  const selected = new Set(entries.map(({ trackId }) => trackId));
  const canAdd = options.some(({ id }) => !selected.has(id));

  return (
    <div>
      <div className={styles.creditHeader}>
        <div>
          <h4 className={styles.subheading}>Track sequence</h4>
          <p className={styles.sequenceMeta}>
            Select published tracks and arrange their public order.
          </p>
        </div>
        <button
          className="button button-secondary"
          disabled={!canAdd}
          onClick={add}
          type="button"
        >
          Add track
        </button>
      </div>
      {entries.length === 0 ? (
        <p className={styles.empty}>
          Publish a track before adding it to this {mode}.
        </p>
      ) : (
        <ol className={styles.sequenceList}>
          {entries.map((entry, index) => (
            <li
              className={styles.sequenceRow}
              data-compact={mode === "collection" ? "true" : "false"}
              key={`${entry.trackId}-${index}`}
            >
              <label className="field-group">
                <span>Track {index + 1}</span>
                <select
                  onChange={(event) =>
                    commit(
                      entries.map((candidate, entryIndex) =>
                        entryIndex === index
                          ? { ...candidate, trackId: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  required
                  value={entry.trackId}
                >
                  {choices.map((choice) => (
                    <option
                      disabled={
                        choice.id !== entry.trackId && selected.has(choice.id)
                      }
                      key={choice.id}
                      value={choice.id}
                    >
                      {choice.title} · /{choice.slug}
                      {choice.available ? "" : " · not currently published"}
                    </option>
                  ))}
                </select>
              </label>
              {mode === "release" && "discNumber" in entry ? (
                <>
                  <label className="field-group">
                    <span>Disc</span>
                    <input
                      min={1}
                      onChange={(event) =>
                        commit(
                          entries.map((candidate, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...candidate,
                                  discNumber: Number(event.target.value),
                                }
                              : candidate,
                          ),
                        )
                      }
                      required
                      type="number"
                      value={entry.discNumber}
                    />
                  </label>
                  <label className="field-group">
                    <span>Track</span>
                    <input
                      min={1}
                      onChange={(event) =>
                        commit(
                          entries.map((candidate, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...candidate,
                                  trackNumber: Number(event.target.value),
                                }
                              : candidate,
                          ),
                        )
                      }
                      required
                      type="number"
                      value={entry.trackNumber}
                    />
                  </label>
                </>
              ) : null}
              <div className={styles.positionActions}>
                <button
                  aria-label={`Move track ${index + 1} up`}
                  className="text-button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  Move up
                </button>
                <button
                  aria-label={`Move track ${index + 1} down`}
                  className="text-button"
                  disabled={index === entries.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  Move down
                </button>
                <button
                  aria-label={`Remove track ${index + 1}`}
                  className="text-button"
                  onClick={() =>
                    commit(
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
