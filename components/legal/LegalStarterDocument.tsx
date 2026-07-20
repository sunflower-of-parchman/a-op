import type { LegalDocumentStarter } from "@/lib/legal/public-starters.ts";
import styles from "./LegalDocuments.module.css";

export function LegalStarterDocument({
  document,
}: {
  readonly document: LegalDocumentStarter;
}) {
  return (
    <article className={`page-frame ${styles.publicDocument}`}>
      <header className={styles.publicHeading}>
        <h1>{document.title}</h1>
        <p className="intro-copy">{document.introduction}</p>
      </header>
      <section className={styles.publicStarterNotice}>
        <h2>Editable starter</h2>
        <p>
          This installation has not published an artist-approved version yet.
          This template is product guidance, not legal advice or the artist’s
          final policy.
        </p>
      </section>
      <div className={styles.publicBody}>{document.bodyText}</div>
    </article>
  );
}
