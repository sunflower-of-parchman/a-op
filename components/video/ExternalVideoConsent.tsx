"use client";

import { useRef, useState } from "react";
import { useTelemetry } from "@/components/telemetry";
import type { ExternalVideoProvider } from "@/lib/video/types.ts";
import styles from "./Video.module.css";

export function ExternalVideoConsent({
  provider,
  embedUrl,
  title,
  videoId,
}: {
  readonly provider: ExternalVideoProvider;
  readonly embedUrl: string;
  readonly title: string;
  readonly videoId?: string | null;
}) {
  const [consented, setConsented] = useState(false);
  const playbackRecorded = useRef(false);
  const { configuration, record } = useTelemetry();
  const providerLabel =
    provider === "youtube"
      ? "YouTube"
      : provider === "vimeo"
        ? "Vimeo"
        : "the external provider";

  if (!consented) {
    return (
      <div className={styles.playerBoundary}>
        <p className={styles.consentCopy}>
          The external player is off. Loading it connects your browser to{" "}
          {providerLabel}, which may receive network and browser information
          under its own policy.
        </p>
        <button
          className={styles.consentAction}
          onClick={() => setConsented(true)}
          type="button"
        >
          Load external player
        </button>
      </div>
    );
  }

  return (
    <div className={styles.playerBoundary}>
      <p className={styles.consentCopy}>
        External player loaded after your choice.
      </p>
      <iframe
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        className={styles.externalPlayer}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        src={embedUrl}
        title={`${title} external video player`}
        onLoad={() => {
          if (!videoId || playbackRecorded.current || !configuration.collecting)
            return;
          playbackRecorded.current = true;
          void record({
            eventName: "video-playback-start",
            resourceType: "video",
            resourceId: videoId,
          });
        }}
      />
    </div>
  );
}
