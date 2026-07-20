import { env } from "cloudflare:workers";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  readPublishedArtistRevision,
  readPublicNavigationSnapshot,
  type NavigationItem,
} from "@/db/site-read.ts";

type FooterItem = Pick<NavigationItem, "id" | "label" | "href" | "external">;

const ROUTE_GROUPS = {
  explore: new Set(["/music", "/videos", "/whats-new"]),
  membership: new Set(["/membership", "/licensing"]),
  learn: new Set(["/courses"]),
  support: new Set(["/about", "/contact"]),
} as const;

const KNOWN_PRIMARY_ROUTES = new Set(
  Object.values(ROUTE_GROUPS).flatMap((routes) => [...routes]),
);

function linkItems(
  items: readonly NavigationItem[],
  routes: ReadonlySet<string>,
): FooterItem[] {
  return items.filter((item) => routes.has(item.href));
}

function FooterLink({ item }: { readonly item: FooterItem }) {
  if (item.external) {
    return (
      <a
        className="site-footer__link"
        href={item.href}
        rel="noreferrer"
        target="_blank"
      >
        {item.label}
      </a>
    );
  }

  return (
    <Link className="site-footer__link" href={item.href}>
      {item.label}
    </Link>
  );
}

export async function SiteFooter() {
  const [artist, primaryNavigation, footerNavigation] = await Promise.all([
    readPublishedArtistRevision(env.DB),
    readPublicNavigationSnapshot(env.DB, "primary"),
    readPublicNavigationSnapshot(env.DB, "footer"),
  ]);
  const primaryItems = primaryNavigation?.items ?? [];
  const footerItems = (footerNavigation?.items ?? []).filter(
    (item) =>
      item.label !== "GitHub repository" &&
      item.href !== "https://github.com/sunflower-of-parchman/a-op",
  );
  const legalItems = footerItems.filter((item) =>
    new Set(["/privacy", "/terms"]).has(item.href),
  );
  const faqItems = footerItems.filter((item) => item.href === "/faq");
  const connectItems = footerItems.filter(
    (item) => !new Set(["/privacy", "/terms", "/faq"]).has(item.href),
  );
  const groups = [
    {
      label: "Explore",
      items: [
        ...linkItems(primaryItems, ROUTE_GROUPS.explore),
        ...primaryItems.filter((item) => !KNOWN_PRIMARY_ROUTES.has(item.href)),
      ],
    },
    {
      label: "Membership",
      items: [
        ...linkItems(primaryItems, ROUTE_GROUPS.membership),
        {
          id: "footer-account",
          label: "Account",
          href: "/account",
          external: false,
        },
      ],
    },
    {
      label: "Courses",
      items: linkItems(primaryItems, ROUTE_GROUPS.learn),
    },
    {
      label: "Support",
      items: [...linkItems(primaryItems, ROUTE_GROUPS.support), ...faqItems],
    },
    ...(connectItems.length > 0
      ? [{ label: "Connect", items: connectItems }]
      : []),
  ].filter(({ items }) => items.length > 0);
  const copyrightName = artist?.displayName ?? "a-op";

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav className="site-footer__directory" aria-label="Footer navigation">
          {groups.map((group) => (
            <section className="site-footer__group" key={group.label}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <FooterLink item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className="site-footer__bottom">
          <nav aria-label="Legal">
            <ul className="site-footer__utility-links">
              {legalItems.map((item) => (
                <li key={item.id}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="site-footer__signature">
            <p>
              © {new Date().getUTCFullYear()} {copyrightName}
            </p>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
