"use client";

import Link from "next/link";
import { useState } from "react";
import type { PublicVideoDetailDTO } from "@/lib/video/types.ts";
import { EmptyVideoPlayer } from "./EmptyVideoPlayer";
import { ExternalVideoConsent } from "./ExternalVideoConsent";
import { HostedVideoPlayer } from "./HostedVideoPlayer";
import styles from "./Video.module.css";

const PREVIEW_VIDEO_COUNT = 4;

function formattedDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthLabel = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][Number(month) - 1];
  return `${monthLabel} ${Number(day)}, ${year}`;
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

function Player({
  consented,
  onConsent,
  video,
}: {
  readonly consented: boolean;
  readonly onConsent: () => void;
  readonly video: PublicVideoDetailDTO | null;
}) {
  if (!video) return <EmptyVideoPlayer />;

  if (video.delivery.kind === "external") {
    return (
      <ExternalVideoConsent
        embedUrl={video.delivery.embedUrl}
        provider={video.delivery.provider}
        title={video.title}
        videoId={video.id}
        posterHref={video.delivery.posterHref}
        consented={consented}
        onConsent={onConsent}
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
  onSelect,
  videos,
}: {
  readonly activeVideo: PublicVideoDetailDTO;
  readonly onSelect: (video: PublicVideoDetailDTO) => void;
  readonly videos: readonly PublicVideoDetailDTO[];
}) {
  return (
    <ol className={styles.playlist}>
      {videos.map((video) => (
        <li key={video.id}>
          <button
            aria-current={video.id === activeVideo.id ? "true" : undefined}
            className={styles.playlistRow}
            onClick={() => onSelect(video)}
            type="button"
          >
            <VideoThumbnail video={video} />
            <span className={styles.playlistCopy}>
              <strong>{video.title}</strong>
              <span>{formattedDate(video.publishedAt)}</span>
              {video.summary ? <span>{video.summary}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function VideoThumbnail({ video }: { readonly video: PublicVideoDetailDTO }) {
  const posterHref = video.delivery.posterHref;

  return posterHref ? (
    // The self-hosted poster route keeps provider requests out of the browser.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className={styles.playlistArtwork} src={posterHref} />
  ) : (
    <span aria-hidden="true" className={styles.playlistArtwork} />
  );
}

export function VideoIndex({
  activeVideo,
  previewSelection,
  videos,
}: {
  readonly activeVideo: PublicVideoDetailDTO | null;
  readonly previewSelection: string | null;
  readonly videos: readonly PublicVideoDetailDTO[];
}) {
  const empty = videos.length === 0;
  const [selectedId, setSelectedId] = useState(activeVideo?.id ?? null);
  const [externalConsent, setExternalConsent] = useState(false);
  const selectedVideo =
    videos.find((video) => video.id === selectedId) ?? activeVideo;
  const previewMatch = /^preview-([1-4])$/.exec(previewSelection ?? "");
  const selectedPreview = previewMatch ? Number(previewMatch[1]) : 1;
  const watchLink = selectedVideo ? externalWatchLink(selectedVideo) : null;

  function selectVideo(video: PublicVideoDetailDTO) {
    setSelectedId(video.id);
    window.history.replaceState(
      null,
      "",
      `/videos?video=${encodeURIComponent(video.slug)}`,
    );
  }

  return (
    <main className={`${styles.viewingRoom} page-frame`}>
      <section className={styles.nowPlaying} aria-label="Now playing">
        <Player
          consented={externalConsent}
          onConsent={() => setExternalConsent(true)}
          video={selectedVideo}
        />
        <div className={styles.nowPlayingCopy}>
          <p>Now Playing</p>
          <h2>{selectedVideo?.title ?? "Title"}</h2>
          <p>{selectedVideo?.summary || "Subheading"}</p>
          <p>
            {selectedVideo ? formattedDate(selectedVideo.publishedAt) : "Date"}
          </p>
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
        ) : selectedVideo ? (
          <PublishedPlaylist
            activeVideo={selectedVideo}
            onSelect={selectVideo}
            videos={videos}
          />
        ) : null}
      </section>
    </main>
  );
}
