import Link from "next/link";
import type {
  AdminContentSectionDTO,
  PublishedContentSectionOptionDTO,
} from "@/lib/content-sections/types.ts";
import styles from "./ContentSections.module.css";

export function ContentSectionLibrary({
  sections,
  publishedOptions,
}: {
  readonly sections: readonly AdminContentSectionDTO[];
  readonly publishedOptions: readonly PublishedContentSectionOptionDTO[];
}) {
  return (
    <div className={styles.library}>
      <header className={styles.headingGroup}>
        <p className={styles.eyebrow}>Reusable page composition</p>
        <h2>Content sections</h2>
        <p>
          Sections keep one stable key while every save creates an immutable
          revision. Pages can select from {publishedOptions.length} currently
          published {publishedOptions.length === 1 ? "option" : "options"}.
        </p>
      </header>

      <div className={styles.actions}>
        <Link
          className="button button-primary"
          href="/admin/content-sections/new"
        >
          Add content section
        </Link>
        <Link className="button button-secondary" href="/admin/pages">
          Open pages
        </Link>
      </div>

      {sections.length === 0 ? (
        <p className={styles.empty}>
          No reusable content sections have been created.
        </p>
      ) : (
        <div className={styles.rows}>
          {sections.map((section) => (
            <article className={styles.row} key={section.id}>
              <div className={styles.rowIdentity}>
                <p className={styles.eyebrow}>{section.sectionKey}</p>
                <h3>{section.draft.heading || section.sectionKey}</h3>
              </div>
              <dl className={styles.rowFacts}>
                <div>
                  <dt>Current draft</dt>
                  <dd>
                    Revision {section.draft.revision} · {section.draft.kind}
                  </dd>
                </div>
                <div>
                  <dt>Publication</dt>
                  <dd>
                    {section.publicationState}
                    {section.published
                      ? ` · revision ${section.published.revision}`
                      : " · no published revision"}
                  </dd>
                </div>
              </dl>
              <Link
                className="text-link"
                href={`/admin/content-sections/${encodeURIComponent(
                  section.sectionKey,
                )}`}
              >
                Open
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
