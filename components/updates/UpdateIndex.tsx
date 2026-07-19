import Link from "next/link";
import type { PublishedUpdateDTO } from "@/lib/updates/types.ts";
import styles from "./Updates.module.css";

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
    >
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Published by the artist</p>
        <h2>
          {accountView
            ? "Your update feed"
            : "Music and activity in one place."}
        </h2>
        <p>
          Updates connect directly to the artist&apos;s catalog, Courses,
          videos, and published pages.
        </p>
      </header>
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
            <li className={styles.row} key={update.id}>
              <div className={styles.rowIdentity}>
                <p className={styles.eyebrow}>
                  {unreadCount === null
                    ? "Public update"
                    : update.read
                      ? "Read"
                      : update.audience === "account"
                        ? "Unread · Account"
                        : "Unread"}
                </p>
                <h2>
                  <Link href={`/whats-new/${update.slug}`}>{update.title}</Link>
                </h2>
              </div>
              <p className={styles.summary}>{update.summary}</p>
              <Link
                className={styles.textLink}
                href={`/whats-new/${update.slug}`}
              >
                Read update
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
