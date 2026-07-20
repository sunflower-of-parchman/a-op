import styles from "./Music.module.css";

export function TrackColumnHeader() {
  return (
    <div aria-hidden="true" className={styles.trackColumnHeader}>
      <span />
      <div>
        <span>Tempo</span>
        <span>Meter</span>
        <span>Key</span>
      </div>
      <span />
      <span />
    </div>
  );
}
