import type {
  CatalogAccessMode,
  CatalogCreditInput,
} from "@/lib/catalog/types.ts";

import styles from "./CatalogAdmin.module.css";

export interface DraftPreviewFact {
  readonly label: string;
  readonly value: string;
}

export interface DraftPreviewTrack {
  readonly title: string;
  readonly detail?: string;
}

export function catalogAccessModeLabel(value: CatalogAccessMode): string {
  switch (value) {
    case "public":
      return "Public";
    case "account":
      return "Signed-in account";
    case "protected":
      return "Protected access";
    case "unavailable":
      return "Unavailable";
  }
}

export function CatalogDraftPreview({
  availability,
  credits,
  description,
  facts,
  id,
  noun,
  subtitle,
  tags,
  title,
  tracks,
}: {
  readonly availability: readonly DraftPreviewFact[];
  readonly credits: readonly CatalogCreditInput[];
  readonly description: string;
  readonly facts: readonly DraftPreviewFact[];
  readonly id: string;
  readonly noun: "collection" | "release" | "track";
  readonly subtitle?: string;
  readonly tags: readonly string[];
  readonly title: string;
  readonly tracks?: readonly DraftPreviewTrack[];
}) {
  const titleId = `${id}-title`;
  const visibleTitle = title.trim() || `${noun} title not entered`;
  const visibleSubtitle = subtitle?.trim() ?? "";
  const visibleDescription = description.trim();

  return (
    <section
      aria-labelledby={titleId}
      className={styles.preview}
      data-private-draft-preview=""
    >
      <header className={styles.previewHeader}>
        <p className="eyebrow">Private draft preview</p>
        <h3 id={titleId}>{visibleTitle}</h3>
        {visibleSubtitle ? (
          <p className={styles.previewSubtitle}>{visibleSubtitle}</p>
        ) : null}
        <p className={styles.previewNote}>
          This view reflects the current form. It does not change published
          music.
        </p>
      </header>

      <div className={styles.previewBody}>
        <p className={styles.previewDescription}>
          {visibleDescription || "No description entered."}
        </p>

        <section className={styles.previewSection} aria-label="Draft details">
          <h4>Details</h4>
          <dl className={styles.previewFacts}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className={styles.previewSection}
          aria-label="Draft availability"
        >
          <h4>Availability</h4>
          <dl className={styles.previewFacts}>
            {availability.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {tracks !== undefined ? (
          <section
            className={styles.previewSection}
            aria-label="Draft track order"
          >
            <h4>Track order</h4>
            {tracks.length === 0 ? (
              <p className={styles.previewEmpty}>No tracks selected.</p>
            ) : (
              <ol className={styles.previewOrderedList}>
                {tracks.map((track, index) => (
                  <li key={`${track.title}-${index}`}>
                    <span>{track.title}</span>
                    {track.detail ? <small>{track.detail}</small> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}

        <section className={styles.previewSection} aria-label="Draft tags">
          <h4>Tags</h4>
          <p className={styles.previewTags}>
            {tags.length > 0 ? tags.join(" · ") : "No tags entered."}
          </p>
        </section>

        <section className={styles.previewSection} aria-label="Draft credits">
          <h4>Credits</h4>
          {credits.length === 0 ? (
            <p className={styles.previewEmpty}>No credits entered.</p>
          ) : (
            <ol className={styles.previewOrderedList}>
              {credits.map((credit, index) => (
                <li key={index}>
                  <span>{credit.name.trim() || "Name not entered"}</span>
                  <small>
                    {credit.role.trim() || "Role not entered"}
                    {credit.details.trim() ? ` · ${credit.details.trim()}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
