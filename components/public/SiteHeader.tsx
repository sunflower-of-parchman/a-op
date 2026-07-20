import { env } from "cloudflare:workers";
import Link from "next/link";
import {
  PublicNavigation,
  type PublicNavigationItem,
} from "@/components/public/PublicNavigation";
import {
  readPublishedArtistRevision,
  readPublicNavigationSnapshot,
} from "@/db/site-read.ts";

const FOOTER_ONLY_ROUTES = new Set(["/about", "/contact", "/whats-new"]);

export async function SiteHeader() {
  const [artist, navigation] = await Promise.all([
    readPublishedArtistRevision(env.DB),
    readPublicNavigationSnapshot(env.DB, "primary"),
  ]);
  const productName = artist?.displayName ?? "a-op";
  const navigationItems: PublicNavigationItem[] = (navigation?.items ?? [])
    .filter(({ href }) => !FOOTER_ONLY_ROUTES.has(href))
    .map(({ id, href, label }) => ({
      id,
      href,
      label,
    }));
  const accountHref = "/account";
  const loginHref = "/login";

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          className="site-wordmark"
          href="/"
          aria-label={`${productName} home`}
        >
          {productName}
        </Link>

        <PublicNavigation
          accountHref={accountHref}
          items={navigationItems}
          loginHref={loginHref}
        />
      </div>
    </header>
  );
}

export default SiteHeader;
