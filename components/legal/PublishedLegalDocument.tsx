import type { PublishedLegalDocumentDTO } from "@/lib/legal/index.ts";
import styles from "./LegalDocuments.module.css";

export function PublishedLegalDocument({
  document,
}: {
  readonly document: PublishedLegalDocumentDTO;
}) {
  return (
    <article className={`page-frame ${styles.publicDocument}`}>
      {document.introduction ? (
        <p className="intro-copy">{document.introduction}</p>
      ) : null}
      <section
        className={styles.publicBoundary}
        aria-label="Site legal boundary"
      >
        <p>
          This artist-reviewed document was prepared from an editable starter
          and explicitly approved before publication.
        </p>
        <p>
          Build Week commerce runs only in Stripe Test Mode. No real payment
          will be accepted and no money is moved. Stripe-hosted Test Checkout
          handles test payment entry; a-op does not collect or store
          payment-card fields.
        </p>
        <p>
          Current Sites guidance states that Sites does not support data
          residency or inference residency at launch. This applies to deployed
          Site code, D1 and R2 data and file storage, generated artifacts, and
          logs.
        </p>
      </section>
      <div className={styles.publicBody}>{document.bodyText}</div>
      <p className={styles.publicVersion}>
        Version {document.version} · approved {document.approvedAt} · published{" "}
        {document.publishedAt}
      </p>
    </article>
  );
}
