"use client";

import type { PublishedTrackOption } from "./types";
import styles from "./CustomerLibrary.module.css";

export interface SelectedPlaylistTrack {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly available: boolean;
}

export interface TrackSequenceEditorProps {
  readonly legend: string;
  readonly options: readonly PublishedTrackOption[];
  readonly selected: readonly SelectedPlaylistTrack[];
  readonly disabled?: boolean;
  readonly onChange: (tracks: readonly SelectedPlaylistTrack[]) => void;
}

function moveTrack(
  tracks: readonly SelectedPlaylistTrack[],
  from: number,
  to: number,
): readonly SelectedPlaylistTrack[] {
  const next = [...tracks];
  const [track] = next.splice(from, 1);
  if (!track) return tracks;
  next.splice(to, 0, track);
  return next;
}

export function TrackSequenceEditor({
  legend,
  options,
  selected,
  disabled = false,
  onChange,
}: TrackSequenceEditorProps) {
  const selectedIds = new Set(selected.map(({ id }) => id));
  const availableToAdd = options.filter(({ id }) => !selectedIds.has(id));

  return (
    <fieldset className={styles.trackPicker} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      {selected.length === 0 ? (
        <p className={styles.emptyState}>No tracks selected.</p>
      ) : (
        <ol className={styles.selectedList}>
          {selected.map((track, index) => (
            <li className={styles.selectedRow} key={track.id}>
              <div className={styles.trackIdentity}>
                <span className={styles.trackPosition}>Track {index + 1}</span>
                <span className={styles.trackTitle}>{track.title}</span>
                {track.subtitle ? (
                  <span className={styles.meta}>{track.subtitle}</span>
                ) : null}
                {!track.available ? (
                  <span className={styles.availability} data-available="false">
                    Unavailable. Remove this track before saving.
                  </span>
                ) : null}
              </div>
              <div className={styles.orderActions}>
                <button
                  aria-label={`Move ${track.title} up`}
                  className="button button-secondary"
                  disabled={index === 0}
                  onClick={() =>
                    onChange(moveTrack(selected, index, index - 1))
                  }
                  type="button"
                >
                  Move up
                </button>
                <button
                  aria-label={`Move ${track.title} down`}
                  className="button button-secondary"
                  disabled={index === selected.length - 1}
                  onClick={() =>
                    onChange(moveTrack(selected, index, index + 1))
                  }
                  type="button"
                >
                  Move down
                </button>
                <button
                  aria-label={`Remove ${track.title}`}
                  className="text-button"
                  onClick={() =>
                    onChange(selected.filter(({ id }) => id !== track.id))
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

      <div>
        <p className={styles.meta}>Published catalog tracks</p>
        {options.length === 0 ? (
          <p className={styles.emptyState}>
            No published tracks are available.
          </p>
        ) : availableToAdd.length === 0 ? (
          <p className={styles.emptyState}>
            Every published track is selected.
          </p>
        ) : (
          <ul className={styles.trackOptions}>
            {availableToAdd.map((track) => (
              <li className={styles.trackOption} key={track.id}>
                <div className={styles.trackIdentity}>
                  <span className={styles.trackTitle}>{track.title}</span>
                  {track.subtitle ? (
                    <span className={styles.meta}>{track.subtitle}</span>
                  ) : null}
                </div>
                <button
                  aria-label={`Add ${track.title}`}
                  className="button button-secondary"
                  onClick={() =>
                    onChange([
                      ...selected,
                      {
                        id: track.id,
                        title: track.title,
                        subtitle: track.subtitle,
                        available: true,
                      },
                    ])
                  }
                  type="button"
                >
                  Add track
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
