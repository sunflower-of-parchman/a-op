import styles from "./Contact.module.css";

export function ContactUnavailable() {
  return (
    <section className={styles.section} aria-label="Contact form status">
      <p className={styles.empty}>No contact form is published.</p>
    </section>
  );
}
