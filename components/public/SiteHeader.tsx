import { env } from "cloudflare:workers";
import Link from "next/link";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  PublicNavigation,
  type PublicNavigationItem,
} from "@/components/public/PublicNavigation";
import {
  readActiveModuleKeys,
  readPublishedArtistRevision,
  readPublicNavigationSnapshot,
} from "@/db/site-read.ts";
import { countUnreadUpdates } from "@/db/updates-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

const FOOTER_ONLY_ROUTES = new Set(["/about", "/contact", "/whats-new"]);

export async function SiteHeader() {
  const [artist, navigation, authenticatedUser, activeModules] =
    await Promise.all([
      readPublishedArtistRevision(env.DB),
      readPublicNavigationSnapshot(env.DB, "primary"),
      getChatGPTUser(),
      readActiveModuleKeys(env.DB),
    ]);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const unreadUpdates =
    activeModules.includes("whats-new") && identity?.roles.includes("customer")
      ? await countUnreadUpdates(env.DB, identity.userId)
      : 0;
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
          unreadUpdates={unreadUpdates}
        />
      </div>
    </header>
  );
}

export default SiteHeader;
