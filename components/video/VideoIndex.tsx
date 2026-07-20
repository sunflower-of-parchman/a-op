import Link from "next/link";
import type {
  PublicVideoDetailDTO,
  PublicVideoSummaryDTO,
} from "@/lib/video/types.ts";
import { EmptyVideoPlayer } from "./EmptyVideoPlayer";
import { ExternalVideoConsent } from "./ExternalVideoConsent";
import { HostedVideoPlayer } from "./HostedVideoPlayer";
import styles from "./Video.module.css";

const PREVIEW_VIDEO_COUNT = 4;

function formattedDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function externalWatchLink(video: PublicVideoDetailDTO): {
  href: string;
  label: string;
} | null {
  if (video.delivery.kind !== "external") return null;

  try {
    const embed = new URL(video.delivery.embedUrl);
    const id = embed.pathname.split("/").filter(Boolean).at(-1);
    if (!id) return null;

    if (video.delivery.provider === "youtube") {
      return {
        href: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        label: "Watch on YouTube",
      };
    }
    if (video.delivery.provider === "vimeo") {
      return {
        href: `https://vimeo.com/${encodeURIComponent(id)}`,
        label: "Watch on Vimeo",
      };
    }
    return { href: embed.toString(), label: "Watch externally" };
  } catch {
    return null;
  }
}

function Player({ video }: { readonly video: PublicVideoDetailDTO | null }) {
  if (!video) return <EmptyVideoPlayer />;

  if (video.delivery.kind === "external") {
    return (
      <ExternalVideoConsent
        embedUrl={video.delivery.embedUrl}
        provider={video.delivery.provider}
        title={video.title}
        videoId={video.id}
      />
    );
  }

  return (
    <HostedVideoPlayer
      mediaHref={video.delivery.mediaHref}
      posterHref={video.delivery.posterHref}
      videoId={video.id}
    />
  );
}

function PreviewPlaylist({ selected }: { readonly selected: number }) {
  return (
    <ol className={styles.playlist}>
      {Array.from({ length: PREVIEW_VIDEO_COUNT }, (_, index) => {
        const videoNumber = index + 1;
        const active = videoNumber === selected;
        return (
          <li key={videoNumber}>
            <Link
              aria-current={active ? "true" : undefined}
              className={styles.playlistRow}
              href={`/videos?video=preview-${videoNumber}`}
            >
              <span aria-hidden="true" className={styles.playlistArtwork} />
              <span className={styles.playlistCopy}>
                <strong>Title</strong>
                <span>Date</span>
                <span>Subheading</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function PublishedPlaylist({
  activeVideo,
  videos,
}: {
  readonly activeVideo: PublicVideoDetailDTO;
  readonly videos: readonly PublicVideoSummaryDTO[];
}) {
  return (
    <ol className={styles.playlist}>
      {videos.map((video) => (
        <li key={video.id}>
          <Link
            aria-current={video.id === activeVideo.id ? "true" : undefined}
            className={styles.playlistRow}
            href={`/videos?video=${encodeURIComponent(video.slug)}`}
          >
            <span aria-hidden="true" className={styles.playlistArtwork} />
            <span className={styles.playlistCopy}>
              <strong>{video.title}</strong>
              <span>{formattedDate(video.publishedAt)}</span>
              {video.summary ? <span>{video.summary}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function VideoIndex({
  activeVideo,
  previewSelection,
  videos,
}: {
  readonly activeVideo: PublicVideoDetailDTO | null;
  readonly previewSelection: string | null;
  readonly videos: readonly PublicVideoSummaryDTO[];
}) {
  const empty = videos.length === 0;
  const previewMatch = /^preview-([1-4])$/.exec(previewSelection ?? "");
  const selectedPreview = previewMatch ? Number(previewMatch[1]) : 1;
  const watchLink = activeVideo ? externalWatchLink(activeVideo) : null;

  return (
    <main className={`${styles.viewingRoom} page-frame`}>
      <h1 className="sr-only">Videos</h1>
      <section className={styles.nowPlaying} aria-label="Now playing">
        <Player video={activeVideo} />
        <div className={styles.nowPlayingCopy}>
          <p>Now Playing</p>
          <h2>{activeVideo?.title ?? "Title"}</h2>
          <p>{activeVideo?.summary || "Subheading"}</p>
          <p>{activeVideo ? formattedDate(activeVideo.publishedAt) : "Date"}</p>
          {watchLink ? (
            <a href={watchLink.href} rel="noreferrer" target="_blank">
              {watchLink.label}
            </a>
          ) : empty ? (
            <span aria-disabled="true" className={styles.disabledWatchLink}>
              Watch on YouTube
            </span>
          ) : null}
        </div>
      </section>

      <section
        className={styles.playlistRegion}
        aria-labelledby="playlist-title"
      >
        <header className={styles.playlistHeader}>
          <h2 id="playlist-title">Playlist</h2>
          <p>{empty ? PREVIEW_VIDEO_COUNT : videos.length} videos</p>
        </header>
        {empty ? (
          <PreviewPlaylist selected={selectedPreview} />
        ) : activeVideo ? (
          <PublishedPlaylist activeVideo={activeVideo} videos={videos} />
        ) : null}
      </section>
    </main>
  );
}
