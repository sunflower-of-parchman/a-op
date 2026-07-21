import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/public/PublicInfoPage.module.css";
import { PageHero } from "@/components/public/PageHero";
import { readPublicArtwork } from "@/db/public-media.ts";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import { readPublishedPageBySlug } from "@/db/site-read.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
};

export default async function AboutPage() {
  const [page, portrait, mosaicImages] = await Promise.all([
    readPublishedPageBySlug(env.DB, "about"),
    readPublicArtwork(
      env.DB,
      "media-about-profile-artwork",
      "Portrait of Michael Wall",
    ),
    readPublicMosaicImages(env.DB),
  ]);
  const bodyBlocks =
    page?.revision.bodyText
      ?.split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean) ?? [];
  const introduction = page?.revision.introduction ?? "";

  return (
    <>
      <PageHero
        hero={null}
        mosaicImages={mosaicImages}
        title={page?.revision.title ?? "About"}
      />
      <article className={`${styles.page} ${styles.aboutPage}`}>
        {portrait ? (
          <img
            alt={portrait.alt}
            className={styles.aboutPortrait}
            src={portrait.url}
          />
        ) : null}

        <div className={styles.aboutCopy}>
          {introduction ? <p className="intro-copy">{introduction}</p> : null}
          {bodyBlocks.length > 0 ? (
            <div className={styles.prose}>
              {bodyBlocks.map((block, index) =>
                block.startsWith("## ") ? (
                  <h2 key={`${index}-${block}`}>{block.slice(3)}</h2>
                ) : (
                  <p key={`${index}-${block}`}>{block}</p>
                ),
              )}
            </div>
          ) : null}
        </div>

        <nav className={styles.linkDirectory} aria-label="Explore this site">
          <Link href="/music">Music</Link>
          <Link href="/courses">Courses</Link>
          <Link href="/licensing">Licensing</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </article>
    </>
  );
}
