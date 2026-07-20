"use client";

import { useState } from "react";
import styles from "./Video.module.css";

export function EmptyVideoPlayer() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={styles.emptyPlayer} data-playing={String(playing)}>
      <span>Video</span>
      <button
        aria-label={playing ? "Pause Video" : "Play Video"}
        aria-pressed={playing}
        className={styles.emptyPlayerControl}
        onClick={() => setPlaying((current) => !current)}
        type="button"
      >
        {playing ? (
          <span aria-hidden="true" className={styles.pauseIcon}>
            <i />
            <i />
          </span>
        ) : (
          <span aria-hidden="true" className={styles.playIcon} />
        )}
      </button>
    </div>
  );
}
