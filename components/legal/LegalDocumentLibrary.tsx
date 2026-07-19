import Link from "next/link";
import type { LegalAdminWorkspaceDTO } from "@/lib/legal/index.ts";
import styles from "./LegalDocuments.module.css";

export function LegalDocumentLibrary({
  workspace,
}: {
  readonly workspace: LegalAdminWorkspaceDTO;
}) {
  return (
    <div className={styles.library}>
      <header className={styles.headingGroup}>
        <p className={styles.eyebrow}>Artist-reviewed legal starters</p>
        <h2>Privacy and terms</h2>
        <p>
          Guided setup records the installation’s actual capabilities and
          services. Every save creates an immutable version. The owner reviews,
          explicitly approves, and then publishes the exact draft.
        </p>
        <p className={styles.caution}>
          These editable starters support the artist’s review process and are
          not legal advice.
        </p>
      </header>

      <section className={styles.boundary} aria-labelledby="legal-boundary">
        <h3 id="legal-boundary">Permanent Build Week facts</h3>
        <p>
          Commerce runs in Stripe Test Mode only. No real payment will be
          accepted and no money is moved. Current Sites guidance states that
          Sites does not support data residency or inference residency at
          launch, including deployed code, D1 and R2 storage, generated
          artifacts, and logs.
        </p>
      </section>

      <div className={styles.rows}>
        {workspace.documents.map((document) => (
          <article className={styles.row} key={document.id}>
            <div className={styles.rowIdentity}>
              <p className={styles.eyebrow}>{document.id}</p>
              <h3>{document.title}</h3>
            </div>
            <dl className={styles.rowFacts}>
              <div>
                <dt>Current draft</dt>
                <dd>Version {document.draft.version}</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>
                  {document.approved
                    ? `Version ${document.approved.version}`
                    : "Waiting for owner review"}
                </dd>
              </div>
              <div>
                <dt>Public</dt>
                <dd>
                  {document.published
                    ? `Version ${document.published.version}`
                    : "Existing page fallback"}
                </dd>
              </div>
            </dl>
            <Link className="text-link" href={`/admin/legal/${document.id}`}>
              Review document
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
