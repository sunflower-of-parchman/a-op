import Link from "next/link";
import type { PublishedUpdateDTO } from "@/lib/updates/types.ts";
import { TelemetryPageView } from "@/components/telemetry";
import { StructuredBody } from "./StructuredBody";
import { UpdateReadReceipt } from "./UpdateReadReceipt";
import styles from "./Updates.module.css";

export function UpdateDetail({
  update,
  recordRead,
}: {
  readonly update: PublishedUpdateDTO;
  readonly recordRead: boolean;
}) {
  return (
    <article className="page-frame">
      <TelemetryPageView
        eventName="update-view"
        resourceId={update.id}
        resourceType="update"
      />
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>What&apos;s New</p>
        <h1>{update.title}</h1>
        {update.summary ? (
          <p className={styles.summary}>{update.summary}</p>
        ) : null}
      </header>
      <div className={styles.detail}>
        {recordRead ? (
          <UpdateReadReceipt initiallyRead={update.read} updateId={update.id} />
        ) : null}
        <StructuredBody blocks={update.body} />
        {update.resource ? (
          <aside className={styles.resourceBoundary}>
            <p className={styles.eyebrow}>Linked activity</p>
            <Link className={styles.resourceLink} href={update.resource.href}>
              {update.resource.label}
            </Link>
          </aside>
        ) : null}
      </div>
    </article>
  );
}
