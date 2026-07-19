import { env } from "cloudflare:workers";
import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  readPublishedArtistRevision,
  readPublicNavigationSnapshot,
} from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export async function SiteHeader() {
  const [authenticatedUser, artist, navigation] = await Promise.all([
    getChatGPTUser(),
    readPublishedArtistRevision(env.DB),
    readPublicNavigationSnapshot(env.DB, "primary"),
  ]);
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const canAdminister = hasApplicationRole(identity, "owner", "editor");
  const productName = artist?.displayName ?? "a-op";

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

        <nav className="site-navigation" aria-label="Primary navigation">
          <ul className="site-navigation__list">
            {(navigation?.items ?? []).map((item) => (
              <li key={item.id}>
                <Link className="site-navigation__link" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
            {canAdminister ? (
              <li>
                <Link className="site-navigation__link" href="/admin">
                  Admin
                </Link>
              </li>
            ) : null}
            <li>
              <Link
                className="site-navigation__link"
                href={authenticatedUser ? "/account" : chatGPTSignInPath("/")}
              >
                {authenticatedUser ? "Account" : "Sign in"}
              </Link>
            </li>
          </ul>
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

export default SiteHeader;
