"use client";

import { useRef, useState } from "react";
import { useTelemetry } from "@/components/telemetry";
import type { ExternalVideoProvider } from "@/lib/video/types.ts";
import styles from "./Video.module.css";

export function ExternalVideoConsent({
  embedUrl,
  title,
  videoId,
  posterHref,
  consented: controlledConsent,
  onConsent,
}: {
  readonly provider: ExternalVideoProvider;
  readonly embedUrl: string;
  readonly title: string;
  readonly videoId?: string | null;
  readonly posterHref?: string | null;
  readonly consented?: boolean;
  readonly onConsent?: () => void;
}) {
  const [localConsent, setLocalConsent] = useState(false);
  const consented = controlledConsent ?? localConsent;
  const playbackRecorded = useRef(false);
  const { configuration, record } = useTelemetry();
  if (!consented) {
    return (
      <div className={styles.playerBoundary}>
        {posterHref ? (
          // Posters are delivered by the Site's same-origin media boundary.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className={styles.consentPoster} src={posterHref} />
        ) : null}
        <button
          className={styles.consentAction}
          onClick={() => {
            setLocalConsent(true);
            onConsent?.();
          }}
          type="button"
        >
          <span aria-hidden="true" className={styles.consentPlayIcon} />
          <span>Play {title}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.playerBoundary}>
      <iframe
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        className={styles.externalPlayer}
        referrerPolicy="strict-origin-when-cross-origin"
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
