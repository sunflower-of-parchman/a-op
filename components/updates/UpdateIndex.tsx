import Link from "next/link";
import type { PublishedUpdateDTO } from "@/lib/updates/types.ts";
import styles from "./Updates.module.css";

function publishedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function actionLabel(update: PublishedUpdateDTO): string {
  if (update.resource?.type === "page" || /essay/i.test(update.title)) {
    return "Read essay";
  }
  if (update.resource?.type === "video") return "Watch now";
  return "Read update";
}

export function UpdateIndex({
  updates,
  unreadCount,
  accountView = false,
}: {
  readonly updates: readonly PublishedUpdateDTO[];
  readonly unreadCount: number | null;
  readonly accountView?: boolean;
}) {
  return (
    <section
      className={accountView ? styles.content : `${styles.content} page-frame`}
      aria-label="Published updates"
    >
      {unreadCount !== null ? (
        <p className={styles.unreadStatus}>
          {unreadCount === 0
            ? "All available updates are read."
            : `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`}
        </p>
      ) : null}
      {updates.length === 0 ? (
        <p className={styles.empty}>No updates are available yet.</p>
      ) : (
        <ol className={styles.list}>
          {updates.map((update) => (
            <li
              className={`${styles.card} ${unreadCount !== null && !update.read ? styles.cardUnread : ""}`}
              key={update.id}
            >
              <article>
                <header className={styles.cardHeader}>
                  <h2>
                    <Link href={`/whats-new/${update.slug}`}>
                      {update.title}
                    </Link>
                  </h2>
                  <time dateTime={update.publishedAt}>
                    {publishedDate(update.publishedAt)}
                  </time>
                </header>
                <p className={styles.cardSummary}>{update.summary}</p>
                <div className={styles.cardFooter}>
                  {unreadCount !== null && !update.read ? (
                    <span className={styles.unreadMarker}>Unread</span>
                  ) : null}
                  <Link
                    className={styles.textLink}
                    href={`/whats-new/${update.slug}`}
                  >
                    {actionLabel(update)}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
