import { env } from "cloudflare:workers";
import Link from "next/link";
import {
  readPublishedArtistRevision,
  readPublicNavigationSnapshot,
} from "@/db/site-read.ts";

export async function SiteFooter() {
  const [artist, navigation] = await Promise.all([
    readPublishedArtistRevision(env.DB),
    readPublicNavigationSnapshot(env.DB, "footer"),
  ]);

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__boundary">
          <p>
            {artist?.footerText ??
              "Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data."}
          </p>
          <p>
            Files live in Sites-provided R2. Structured Site state lives in
            Sites-provided D1. Ordinary Site operation makes no model request.
            Material enters ChatGPT Work only when the artist deliberately
            shares it there.
          </p>
        </div>

        <nav className="site-footer__navigation" aria-label="Footer navigation">
          <ul className="site-footer__links">
            {(navigation?.items ?? []).map((item) => (
              <li key={item.href}>
                {item.external ? (
                  <a href={item.href}>{item.label}</a>
                ) : (
                  <Link href={item.href}>{item.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

export default SiteFooter;
