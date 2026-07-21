import { env } from "cloudflare:workers";
import type { Metadata } from "next";
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
    readPublicArtwork(env.DB, "media-about-profile-artwork", "Artist portrait"),
    readPublicMosaicImages(env.DB),
  ]);
  const isNeutralStarter = page?.revision.id === "page_about_revision_1";
  const bodyBlocks = isNeutralStarter
    ? []
    : (page?.revision.bodyText
        ?.split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean) ?? []);
  const introduction = isNeutralStarter
    ? ""
    : (page?.revision.introduction ?? "");
  const hasAboutCopy = introduction.length > 0 || bodyBlocks.length > 0;

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

        {hasAboutCopy ? (
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
        ) : null}
      </article>
    </>
  );
}
