import { MODULE_REGISTRY, type ModuleKey } from "./registry.ts";

export interface ApplicationNavigationItem {
  readonly href: string;
  readonly label: string;
}

const EDITOR_MODULE_KEYS = new Set<ModuleKey>([
  "courses",
  "video",
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
    ? MODULE_REGISTRY.filter(({ key }) => activeSet.has(key)).flatMap(
        ({ accountRoutes, label }) =>
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
  const moduleNavigation = MODULE_REGISTRY.filter(
    ({ key, adminRoutes }) =>
      activeSet.has(key) &&
      adminRoutes.length > 0 &&
      (owner || EDITOR_MODULE_KEYS.has(key)),
  ).map(({ adminRoutes, label }) => ({
    href: adminRoutes[0],
    label,
  }));

  return uniqueByHref([
    { href: "/admin", label: "Overview" },
    { href: "/admin/music", label: "Music" },
    ...(owner
      ? [
          { href: "/admin/artist", label: "Artist & modules" },
          { href: "/admin/editors", label: "Editors" },
          { href: "/admin/access", label: "Access" },
          { href: "/admin/customers", label: "Customers" },
          { href: "/admin/commerce", label: "Commerce" },
          { href: "/admin/credits", label: "Credits" },
        ]
      : []),
    { href: "/admin/pages", label: "Pages" },
    ...(owner
      ? [{ href: "/admin/content-sections", label: "Content sections" }]
      : []),
    ...moduleNavigation,
    ...(owner
      ? [
          { href: "/admin/legal", label: "Privacy & terms" },
          { href: "/admin/setup", label: "Setup & portability" },
          { href: "/admin/operations", label: "Operations" },
        ]
      : []),
  ]);
}
