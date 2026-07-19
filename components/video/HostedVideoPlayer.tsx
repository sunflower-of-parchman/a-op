"use client";

import { useRef } from "react";
import { useTelemetry } from "@/components/telemetry";
import styles from "./Video.module.css";

export function HostedVideoPlayer({
  mediaHref,
  posterHref,
  videoId,
}: {
  readonly mediaHref: string;
  readonly posterHref: string | null;
  readonly videoId: string;
}) {
  const playbackRecorded = useRef(false);
  const { configuration, record } = useTelemetry();

  return (
    <video
      className={styles.hostedPlayer}
      controls
      onPlay={() => {
        if (playbackRecorded.current || !configuration.collecting) return;
        playbackRecorded.current = true;
        void record({
          eventName: "video-playback-start",
          resourceType: "video",
          resourceId: videoId,
        });
      }}
      playsInline
      poster={posterHref ?? undefined}
      preload="none"
      src={mediaHref}
    />
  );
}
