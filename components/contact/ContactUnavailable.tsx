import styles from "./Contact.module.css";

export function ContactUnavailable() {
  return (
    <section className={styles.section} aria-label="Contact form status">
      <div className={styles.headingGroup}>
        <p>
          The artist is preparing this contact form. It will appear here after
          the artist publishes the inquiry categories and exact consent
          language.
        </p>
      </div>
      <p className={styles.empty}>
        No inquiry can be submitted until that published form is active.
      </p>
    </section>
  );
}
