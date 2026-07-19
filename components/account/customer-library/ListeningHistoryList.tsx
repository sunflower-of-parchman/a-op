import type { PlayerTrackDTO } from "@/lib/catalog/public-dto.ts";
import type { ListeningHistoryDTO } from "@/lib/customer-library/types.ts";
import { ResumeListeningButton } from "./ResumeListeningButton";
import styles from "./CustomerLibrary.module.css";

export interface ListeningHistoryListProps {
  readonly history: readonly ListeningHistoryDTO[];
}

function timeLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function dateLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function availablePlayerTrack(
  item: ListeningHistoryDTO,
): PlayerTrackDTO | null {
  const { track } = item;
  if (
    !track.available ||
    !track.slug ||
    !track.href ||
    !track.title ||
    !track.streamUrl
  ) {
    return null;
  }
  return {
    id: track.id,
    slug: track.slug,
    href: track.href,
    title: track.title,
    subtitle: track.subtitle,
    durationMs: track.durationMs,
    streamUrl: track.streamUrl,
  };
}

export function ListeningHistoryList({ history }: ListeningHistoryListProps) {
  if (history.length === 0) {
    return <p className={styles.emptyState}>No listening history yet.</p>;
  }

  return (
    <ol className={styles.rows}>
      {history.map((item) => {
        const playerTrack = availablePlayerTrack(item);
        const currentTitle = item.track.title;
        const titleChanged =
          item.track.available &&
          currentTitle !== null &&
          currentTitle !== item.listenedRevision.title;
        return (
          <li className={styles.row} key={item.id}>
            <div className={styles.rowBody}>
              <span className={styles.rowTitle}>
                {item.listenedRevision.title}
              </span>
              {item.listenedRevision.subtitle ? (
                <span className={styles.meta}>
                  {item.listenedRevision.subtitle}
                </span>
              ) : null}
              <span className={styles.meta}>
                Last listened {dateLabel(item.lastListenedAt)} · Position{" "}
                {timeLabel(item.positionMs)} · {item.meaningfulListenCount}{" "}
                meaningful listen
                {item.meaningfulListenCount === 1 ? "" : "s"}
              </span>
              {item.track.available && item.track.href && currentTitle ? (
                <span className={styles.availability} data-available="true">
                  Available now as{" "}
                  <a href={item.track.href}>
                    {titleChanged ? currentTitle : item.listenedRevision.title}
                  </a>
                  .
                </span>
              ) : (
                <span className={styles.availability} data-available="false">
                  This track is no longer available in the current catalog.
                </span>
              )}
            </div>
            <div className={styles.actions}>
              {playerTrack && item.resumePositionMs !== null ? (
                <ResumeListeningButton
                  historyRevision={item.revision}
                  resumePositionMs={item.resumePositionMs}
                  track={playerTrack}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
