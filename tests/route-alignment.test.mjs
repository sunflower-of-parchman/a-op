import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CAPABILITY_REGISTRY,
  MODULE_KEYS,
  resolveAccountNavigation,
  resolveAdministrationNavigation,
  resolveModuleNavigation,
} from "../lib/modules/index.ts";

const appDirectory = fileURLToPath(new URL("../app", import.meta.url));
const platformRoutes = new Set([
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
]);
const futurePlaceholderFiles = new Set(["admin/[section]/page.tsx"]);

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(target);
      return entry.name === "page.tsx" || entry.name === "route.ts"
        ? [target]
        : [];
    }),
  );
  return files.flat();
}

function filesystemRoute(file) {
  const directory = path.relative(appDirectory, path.dirname(file));
  const segments = directory
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .map((segment) => {
      const dynamic = /^\[([^\]]+)\]$/.exec(segment);
      return dynamic ? `:${dynamic[1]}` : segment;
    });
  return `/${segments.join("/")}`;
}

function routeSegments(route) {
  return route.split("/").filter(Boolean);
}

function routesMatch(declaredRoute, sourceRoute) {
  const declared = routeSegments(declaredRoute);
  const source = routeSegments(sourceRoute);
  return (
    declared.length === source.length &&
    declared.every(
      (segment, index) =>
        segment.startsWith(":") ||
        source[index].startsWith(":") ||
        segment === source[index],
    )
  );
}

const applicationRoutes = new Set(
  (await routeFiles(appDirectory))
    .filter(
      (file) =>
        !futurePlaceholderFiles.has(
          path.relative(appDirectory, file).split(path.sep).join("/"),
        ),
    )
    .map(filesystemRoute),
);

function assertRouteResolves(route, context) {
  const resolved =
    platformRoutes.has(route) ||
    [...applicationRoutes].some((source) => routesMatch(route, source));
  assert.equal(
    resolved,
    true,
    `${context} declares ${route}, but no application or platform route resolves it.`,
  );
}

test("every capability route and navigation link resolves to a real surface", () => {
  for (const capability of CAPABILITY_REGISTRY) {
    for (const [surface, routes] of [
      ["public", capability.publicRoutes],
      ["account", capability.accountRoutes],
      ["administration", capability.adminRoutes],
    ]) {
      for (const route of routes) {
        assertRouteResolves(route, `${capability.key} ${surface}`);
      }
    }

    for (const navigation of [
      ...capability.publicNavigation,
      ...capability.adminNavigation,
    ]) {
      assertRouteResolves(navigation.href, navigation.id);
    }
  }
});

test("generated customer and administration navigation is unique and resolvable", () => {
  const account = resolveAccountNavigation(MODULE_KEYS, true);
  const owner = resolveAdministrationNavigation(MODULE_KEYS, true);
  const editor = resolveAdministrationNavigation(MODULE_KEYS, false);

  for (const [surface, items] of [
    ["account", account],
    ["owner administration", owner],
    ["editor administration", editor],
  ]) {
    assert.equal(
      new Set(items.map(({ href }) => href)).size,
      items.length,
      `${surface} navigation must collapse consolidated routes.`,
    );
    for (const item of items) assertRouteResolves(item.href, surface);
  }

  assert.deepEqual(
    account.filter(({ href }) => href === "/account/memberships"),
    [{ href: "/account/memberships", label: "Memberships" }],
  );
  assert.equal(
    account.some(({ href }) => href === "/account/whats-new"),
    false,
  );
  assert.deepEqual(owner, [
    { href: "/admin", label: "Metrics" },
    { href: "/admin/contact", label: "Inquiries" },
    { href: "/admin/courses", label: "Courses" },
    { href: "/admin/whats-new", label: "What's New" },
    { href: "/admin/videos", label: "Videos" },
    { href: "/admin/access", label: "Entitlements" },
  ]);
  assert.deepEqual(editor, [
    { href: "/admin", label: "Metrics" },
    { href: "/admin/courses", label: "Courses" },
    { href: "/admin/whats-new", label: "What's New" },
    { href: "/admin/videos", label: "Videos" },
  ]);
});

test("active commerce capability routes expose the simulated catalog", () => {
  for (const moduleKey of [
    "downloads",
    "licensing",
    "memberships",
    "subscriptions",
  ]) {
    const capability = CAPABILITY_REGISTRY.find(({ key }) => key === moduleKey);
    assert.ok(capability?.publicRoutes.includes("/commerce"));
  }

  assert.deepEqual(
    resolveModuleNavigation(["memberships"], "public").find(
      ({ id }) => id === "public.membership",
    ),
    {
      id: "public.membership",
      label: "Membership",
      href: "/membership",
      order: 50,
    },
  );

  const routesByCapability = new Map(
    CAPABILITY_REGISTRY.map((capability) => [capability.key, capability]),
  );
  assert.deepEqual(routesByCapability.get("downloads")?.accountRoutes, [
    "/account/access",
  ]);
  assert.deepEqual(routesByCapability.get("downloads")?.adminRoutes, [
    "/admin/access",
  ]);
  assert.deepEqual(routesByCapability.get("customer-library")?.adminRoutes, [
    "/admin/customers",
  ]);
  assert.deepEqual(routesByCapability.get("memberships")?.accountRoutes, [
    "/account/memberships",
  ]);
  assert.deepEqual(routesByCapability.get("subscriptions")?.accountRoutes, [
    "/account/memberships",
  ]);
  assert.deepEqual(routesByCapability.get("subscriptions")?.adminRoutes, [
    "/admin/memberships",
  ]);
});

test("public home leaves capability discovery to the active navigation", async () => {
  const [home, header] = await Promise.all([
    readFile(new URL("../app/(public)/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/public/SiteHeader.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(home, /return <div \/>/);
  assert.match(header, /readPublicNavigationSnapshot\(env\.DB, "primary"\)/);
  assert.match(header, /navigation\?\.items/);
});
