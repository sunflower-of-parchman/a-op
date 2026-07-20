import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/public/PublicInfoPage.module.css";
import { readPublishedPageBySlug } from "@/db/site-read.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  description:
    "About the musician, their work, and this artist-owned platform.",
};

export default async function AboutPage() {
  const page = await readPublishedPageBySlug(env.DB, "about");
  const introduction =
    page?.revision.introduction ??
    "This is an artist-owned home for music, direct access, and the work around it.";

  return (
    <article className={styles.page}>
      <header className={styles.heading}>
        <h1>{page?.revision.title ?? "About"}</h1>
        <p className="intro-copy">{introduction}</p>
      </header>

      {page?.revision.bodyText ? (
        <p className={styles.prose}>{page.revision.bodyText}</p>
      ) : null}

      <div className={styles.sectionGrid}>
        <section className={styles.section}>
          <h2>Music</h2>
          <p>
            Releases, tracks, streaming, downloads, and licensing live in one
            catalog controlled by the artist.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Direct access</h2>
          <p>
            Customer accounts can hold favorites, playlists, purchases,
            licenses, memberships, subscriptions, and Courses in the same place.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Artist owned</h2>
          <p>
            The artist controls their fork, deployment, content, data, customer
            relationship, and artist-specific changes.
          </p>
        </section>
      </div>

      <nav className={styles.linkDirectory} aria-label="Explore this site">
        <Link href="/music">Music</Link>
        <Link href="/courses">Courses</Link>
        <Link href="/licensing">Licensing</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </article>
  );
}
