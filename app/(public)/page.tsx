import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { CourseCards } from "@/components/courses";
import { MediaMosaic } from "@/components/public/MediaMosaic";
import { ExternalVideoConsent } from "@/components/video/ExternalVideoConsent";
import { readPublicMusicIndex } from "@/db/catalog-read.ts";
import { readPublishedCourseIndex } from "@/db/course-read.ts";
import { readPublicArtwork } from "@/db/public-media.ts";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import {
  readPublishedArtistRevision,
  readPublishedPageBySlug,
} from "@/db/site-read.ts";
import {
  listPublishedVideos,
  readPublishedVideoBySlug,
} from "@/db/video-read.ts";
import styles from "./Home.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

export default async function Home() {
  const [artist, music, courses, videos, about, portrait, mosaicImages] =
    await Promise.all([
      readPublishedArtistRevision(env.DB),
      readPublicMusicIndex(env.DB, { kind: "release", sort: "newest" }),
      readPublishedCourseIndex(env.DB, null, new Date().toISOString()),
      listPublishedVideos(env.DB),
      readPublishedPageBySlug(env.DB, "about"),
      readPublicArtwork(
        env.DB,
        "media-about-profile-artwork",
        "Artist portrait",
      ),
      readPublicMosaicImages(env.DB),
    ]);
  const latestRelease =
    music.items.find((item) => item.kind === "release") ?? null;
  const activeVideo = videos[0]
    ? await readPublishedVideoBySlug(env.DB, videos[0].slug)
    : null;
  const artworkEntries = await Promise.all(
    courses.map(
      async (course) =>
        [
          course.slug,
          await readPublicArtwork(
            env.DB,
            `media-course-${course.slug}-artwork`,
            `${course.title} course artwork`,
          ),
        ] as const,
    ),
  );
  const displayName = artist?.displayName ?? "Artist";

  return (
    <main className={styles.home}>
      <MediaMosaic images={mosaicImages} title={displayName} variant="home" />

      {latestRelease ? (
        <section
          className={`${styles.section} page-frame`}
          aria-labelledby="home-music"
        >
          <header className={styles.sectionHeading}>
            <h2 id="home-music">Music</h2>
          </header>
          <div className={styles.releaseFeature}>
            {latestRelease.artwork ? (
              <img
                alt={latestRelease.artwork.alt}
                className={styles.releaseArtwork}
                src={latestRelease.artwork.url}
              />
            ) : null}
            <div className={styles.releaseCopy}>
              <h3>{latestRelease.title}</h3>
              {latestRelease.description ? (
                <p>{latestRelease.description}</p>
              ) : null}
              {latestRelease.trackCount ? (
                <p>{latestRelease.trackCount} tracks</p>
              ) : null}
              <div className={styles.actions}>
                <Link
                  className="button button-primary"
                  href={latestRelease.href}
                >
                  Listen
                </Link>
                <Link href="/music">Browse Music</Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {courses.length > 0 ? (
        <section
          className={`${styles.section} page-frame`}
          aria-labelledby="home-courses"
        >
          <header className={styles.sectionHeading}>
            <h2 id="home-courses">Courses</h2>
          </header>
          <CourseCards
            artworkBySlug={Object.fromEntries(artworkEntries)}
            courses={courses.slice(0, 2)}
          />
          <Link className={styles.browseLink} href="/courses">
            Browse Courses
          </Link>
        </section>
      ) : null}

      {activeVideo ? (
        <section
          className={`${styles.section} page-frame`}
          aria-labelledby="home-videos"
        >
          <header className={styles.sectionHeading}>
            <h2 id="home-videos">Videos</h2>
          </header>
          <div className={styles.videoFeature}>
            <div className={styles.videoPlayer}>
              {activeVideo.delivery.kind === "external" ? (
                <ExternalVideoConsent
                  embedUrl={activeVideo.delivery.embedUrl}
                  provider={activeVideo.delivery.provider}
                  title={activeVideo.title}
                  videoId={activeVideo.id}
                />
              ) : (
                <video
                  controls
                  poster={activeVideo.delivery.posterHref ?? undefined}
                >
                  <source src={activeVideo.delivery.mediaHref} />
                </video>
              )}
            </div>
            <div className={styles.videoCopy}>
              <h3>{activeVideo.title}</h3>
              {activeVideo.summary ? <p>{activeVideo.summary}</p> : null}
              <ul className={styles.videoList}>
                {videos.slice(1, 4).map((video) => (
                  <li key={video.id}>
                    <Link
                      href={`/videos?video=${encodeURIComponent(video.slug)}`}
                    >
                      {video.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link className={styles.browseLink} href="/videos">
                Browse Videos
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {about ? (
        <section
          className={`${styles.section} page-frame`}
          aria-labelledby="home-about"
        >
          <div className={styles.aboutFeature}>
            {portrait ? (
              <img
                alt={portrait.alt}
                className={styles.portrait}
                src={portrait.url}
              />
            ) : null}
            <div className={styles.aboutCopy}>
              <h2 id="home-about">About</h2>
              {about.revision.introduction ? (
                <p>{about.revision.introduction}</p>
              ) : null}
              <Link href="/about">About {displayName}</Link>
            </div>
          </div>
        </section>
      ) : null}

      <section
        className={`${styles.section} page-frame`}
        aria-label="Membership and licensing"
      >
        <div className={styles.pathways}>
          <Link href="/membership">
            <span>Membership</span>
          </Link>
          <Link href="/licensing">
            <span>Licensing</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
