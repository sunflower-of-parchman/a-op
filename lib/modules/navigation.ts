import { MODULE_REGISTRY, type ModuleKey } from "./registry.ts";

export interface ApplicationNavigationItem {
  readonly href: string;
  readonly label: string;
}

const ACCOUNT_NAVIGATION_EXCLUDED_MODULE_KEYS = new Set<ModuleKey>([
  "whats-new",
]);

function accountRouteLabel(
  route: string,
  moduleLabel: string,
  routeCount: number,
): string {
  if (routeCount === 1) return moduleLabel;
  const segment = route.split("/").filter(Boolean).at(-1) ?? moduleLabel;
  return segment
    .split("-")
    .map((word, index) =>
      index === 0 ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word,
    )
    .join(" ");
}

function uniqueByHref(
  items: readonly ApplicationNavigationItem[],
): readonly ApplicationNavigationItem[] {
  const seen = new Set<string>();
  return Object.freeze(
    items.filter(({ href }) => {
      if (seen.has(href)) return false;
      seen.add(href);
      return true;
    }),
  );
}

export function resolveAccountNavigation(
  activeModules: readonly ModuleKey[],
  customerActive: boolean,
): readonly ApplicationNavigationItem[] {
  const activeSet = new Set(activeModules);
  const moduleNavigation = customerActive
    ? MODULE_REGISTRY.filter(
        ({ key }) =>
          activeSet.has(key) &&
          !ACCOUNT_NAVIGATION_EXCLUDED_MODULE_KEYS.has(key),
      ).flatMap(({ accountRoutes, label }) =>
        accountRoutes.map((href) => ({
          href,
          label: accountRouteLabel(href, label, accountRoutes.length),
        })),
      )
    : [];

  return uniqueByHref([
    { href: "/account", label: "Overview" },
    { href: "/account/profile", label: "Profile" },
    ...(customerActive
      ? [
          { href: "/account/access", label: "Access" },
          { href: "/account/orders", label: "Orders" },
          { href: "/account/credits", label: "Credits" },
        ]
      : []),
    ...moduleNavigation,
  ]);
}

export function resolveAdministrationNavigation(
  activeModules: readonly ModuleKey[],
  owner: boolean,
): readonly ApplicationNavigationItem[] {
  const activeSet = new Set(activeModules);

  return uniqueByHref([
    { href: "/admin", label: "Metrics" },
    ...(owner && activeSet.has("contact")
      ? [{ href: "/admin/contact", label: "Inquiries" }]
      : []),
    ...(activeSet.has("courses")
      ? [{ href: "/admin/courses", label: "Courses" }]
      : []),
    ...(activeSet.has("whats-new")
      ? [{ href: "/admin/whats-new", label: "What's New" }]
      : []),
    ...(activeSet.has("video")
      ? [{ href: "/admin/videos", label: "Videos" }]
      : []),
    ...(owner ? [{ href: "/admin/access", label: "Entitlements" }] : []),
  ]);
}
