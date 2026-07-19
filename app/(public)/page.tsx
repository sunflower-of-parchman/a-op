import { env } from "cloudflare:workers";
import Link from "next/link";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import {
  readActiveModuleKeys,
  readPublishedArtistRevision,
} from "@/db/site-read.ts";
import type { ModuleKey } from "@/lib/modules/index.ts";

const capabilities = [
  [
    "Music",
    "Publish releases and tracks, then stream them through your own site.",
  ],
  [
    "Access",
    "Give customers durable libraries, downloads, licenses, and artist-issued grants.",
  ],
  [
    "Support",
    "Run memberships and subscriptions with benefits, renewal dates, cancellations, and credits.",
  ],
  [
    "Publishing",
    "Share Courses, video, structured pages, What's New, and contact forms.",
  ],
] as const;

const commerceModuleKeys = new Set<ModuleKey>([
  "downloads",
  "licensing",
  "memberships",
  "subscriptions",
]);

export const dynamic = "force-dynamic";

export default async function Home() {
  const [artist, activeModules] = await Promise.all([
    readPublishedArtistRevision(env.DB),
    readActiveModuleKeys(env.DB),
  ]);

  if (!artist) return null;
  const commerceCatalogActive = activeModules.some((moduleKey) =>
    commerceModuleKeys.has(moduleKey),
  );

  return (
    <>
      <PublicPageHeader title={artist.displayName} variant="home" />

      <div className="page-frame home-content">
        <section className="split-section" aria-labelledby="music-first-title">
          <h2 id="music-first-title">{artist.headline}</h2>
          <div className="reading-column">
            <p className="intro-copy">{artist.introduction}</p>
            <div className="action-row">
              <Link className="button button-primary" href="/music">
                Browse music
              </Link>
              <Link className="button button-secondary" href="/about">
                About
              </Link>
            </div>
          </div>
        </section>

        {commerceCatalogActive ? (
          <section
            className="split-section"
            aria-labelledby="test-commerce-title"
          >
            <h2 id="test-commerce-title">Stripe Test Mode</h2>
            <div className="reading-column">
              <p className="intro-copy">No real payment will be accepted.</p>
              <p>
                Browse active test products and complete the simulated checkout
                through Stripe-hosted Test Checkout.
              </p>
              <div className="action-row">
                <Link className="button button-primary" href="/commerce">
                  Browse test products
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section
          className="capability-section"
          aria-labelledby="complete-title"
        >
          <div className="section-heading-row">
            <h2 id="complete-title">A complete starting point.</h2>
            <p>
              Streaming is ready. {activeModules.length} additional
              {activeModules.length === 1
                ? " capability is"
                : " capabilities are"}{" "}
              active for this installation.
            </p>
          </div>
          <div className="capability-list">
            {capabilities.map(([title, description], index) => (
              <article className="capability-item" key={title}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="split-section" aria-labelledby="owned-title">
          <h2 id="owned-title">Own the fork and the work.</h2>
          <div className="reading-column">
            <p className="intro-copy">{artist.footerText}</p>
            <p>
              Approved files live in Sites-provided R2, structured product state
              lives in Sites-provided D1, and material enters ChatGPT Work only
              when the artist deliberately shares it there.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
