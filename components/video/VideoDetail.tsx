import Image from "next/image";
import type { PublicVideoDetailDTO } from "@/lib/video/types.ts";
import { TelemetryPageView } from "@/components/telemetry";
import { ExternalVideoConsent } from "./ExternalVideoConsent";
import { HostedVideoPlayer } from "./HostedVideoPlayer";
import styles from "./Video.module.css";

export function VideoDetail({
  video,
}: {
  readonly video: PublicVideoDetailDTO;
}) {
  return (
    <article className="page-frame">
      <TelemetryPageView
        eventName="video-view"
        resourceId={video.id}
        resourceType="video"
      />
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>Video</p>
        <h1>{video.title}</h1>
        {video.summary ? (
          <p className={styles.summary}>{video.summary}</p>
        ) : null}
      </header>
      <div className={styles.detail}>
        {video.delivery.posterHref ? (
          <Image
            alt=""
            className={styles.poster}
            height={720}
            src={video.delivery.posterHref}
            unoptimized
            width={1280}
          />
        ) : null}
        <section className={styles.detailSection}>
          <header className={styles.sectionHeading}>
            <p className={styles.eyebrow}>From the artist</p>
            <h2>Context</h2>
          </header>
          <p className={styles.context}>{video.artistContext}</p>
        </section>
        {video.credits.length > 0 ? (
          <section className={styles.detailSection}>
            <header className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Source and collaborators</p>
              <h2>Credits</h2>
            </header>
            <dl className={styles.creditList}>
              {video.credits.map((credit, index) => (
                <div key={`${credit.role}-${credit.name}-${index}`}>
                  <dt>{credit.role}</dt>
                  <dd>
                    <span>{credit.name}</span>
                    {credit.details ? <span>{credit.details}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section className={styles.detailSection}>
          <header className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Read before playback</p>
            <h2>Transcript</h2>
          </header>
          <div className={styles.transcriptList}>
            {video.transcripts.map((transcript) => (
              <section className={styles.transcript} key={transcript.id}>
                <h3>{transcript.language}</h3>
                <p className={styles.transcriptText}>
                  {transcript.transcriptText}
                </p>
              </section>
            ))}
          </div>
        </section>
        <section className={styles.detailSection}>
          <header className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Playback</p>
            <h2>Watch</h2>
          </header>
          {video.delivery.kind === "external" ? (
            <ExternalVideoConsent
              embedUrl={video.delivery.embedUrl}
              provider={video.delivery.provider}
              title={video.title}
              videoId={video.id}
            />
          ) : (
            <div className={styles.playerBoundary}>
              <p className={styles.consentCopy}>
                This artist-hosted video streams through a server-authorized
                media route.
              </p>
              <HostedVideoPlayer
                mediaHref={video.delivery.mediaHref}
                posterHref={video.delivery.posterHref}
                videoId={video.id}
              />
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
