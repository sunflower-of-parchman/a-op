import { env } from "cloudflare:workers";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  readPublishedArtistRevision,
  readPublicNavigationSnapshot,
  type NavigationItem,
} from "@/db/site-read.ts";

type FooterItem = Pick<NavigationItem, "id" | "label" | "href" | "external">;

const FOOTER_GROUPS = Object.freeze([
  Object.freeze({ label: "Explore", keys: ["music", "videos"] }),
  Object.freeze({ label: "Membership", keys: ["membership", "licensing"] }),
  Object.freeze({ label: "Courses", keys: ["courses"] }),
  Object.freeze({ label: "Support", keys: ["about", "contact", "faq"] }),
  Object.freeze({ label: "Connect", keys: ["whats-new"] }),
]);

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
  const [artist, footerNavigation, primaryNavigation] = await Promise.all([
    readPublishedArtistRevision(env.DB),
    readPublicNavigationSnapshot(env.DB, "footer"),
    readPublicNavigationSnapshot(env.DB, "primary"),
  ]);
  const footerItems = (footerNavigation?.items ?? []).filter(
    (item) =>
      item.label !== "GitHub repository" &&
      item.href !== "https://github.com/sunflower-of-parchman/a-op",
  );
  const legalItems = footerItems.filter((item) =>
    new Set(["/privacy", "/terms"]).has(item.href),
  );
  const configuredDirectoryItems = footerItems.filter(
    (item) => !legalItems.some(({ id }) => id === item.id),
  );
  const directoryItems = [
    ...(primaryNavigation?.items ?? []),
    ...configuredDirectoryItems,
  ].filter(
    (item, index, items) =>
      items.findIndex(({ itemKey }) => itemKey === item.itemKey) === index,
  );
  const groups = FOOTER_GROUPS.map((group) => ({
    label: group.label,
    items: group.keys
      .map((key) => directoryItems.find(({ itemKey }) => itemKey === key))
      .filter((item): item is NavigationItem => item !== undefined),
  })).filter(({ items }) => items.length > 0);
  const copyrightName = artist?.displayName ?? "a-op";

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__directory">
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
        </div>
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
