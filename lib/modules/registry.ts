export const CORE_CAPABILITY_KEYS = Object.freeze([
  "music",
  "catalog",
  "streaming",
  "identity",
  "access",
  "administration",
] as const);

export type CoreCapabilityKey = (typeof CORE_CAPABILITY_KEYS)[number];

/**
 * These are the activatable module keys recorded in artist state. Core
 * capabilities are source-owned and implicitly active, so they never need an
 * activation row.
 */
export const MODULE_KEYS = Object.freeze([
  "downloads",
  "customer-library",
  "licensing",
  "memberships",
  "subscriptions",
  "courses",
  "video",
  "whats-new",
  "contact",
  "telemetry",
] as const);

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type CapabilityKey = CoreCapabilityKey | ModuleKey;

export const CAPABILITY_KEYS = Object.freeze([
  ...CORE_CAPABILITY_KEYS,
  ...MODULE_KEYS,
] as const);

export interface ModuleNavigationItem {
  /** A stable identifier for artist navigation overrides. */
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly order: number;
}

interface CapabilitySurfaces {
  readonly publicRoutes: readonly string[];
  readonly accountRoutes: readonly string[];
  readonly adminRoutes: readonly string[];
  readonly publicNavigation: readonly ModuleNavigationItem[];
  readonly adminNavigation: readonly ModuleNavigationItem[];
  readonly setupTopics: readonly string[];
  readonly backgroundJobs: readonly string[];
  readonly telemetryEvents: readonly string[];
}

export interface CoreCapabilityDefinition extends CapabilitySurfaces {
  readonly key: CoreCapabilityKey;
  readonly label: string;
  readonly kind: "core";
  readonly deactivatable: false;
  readonly requires: readonly CoreCapabilityKey[];
}

export interface ModuleDefinition extends CapabilitySurfaces {
  readonly key: ModuleKey;
  readonly label: string;
  readonly kind: "optional";
  readonly deactivatable: true;
  /** Other artist-activatable modules that must be active. */
  readonly requires: readonly ModuleKey[];
  /** Always-on application contracts used by this module. */
  readonly coreRequirements: readonly CoreCapabilityKey[];
}

export type CapabilityDefinition = CoreCapabilityDefinition | ModuleDefinition;

function freezeStrings<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeNavigation(
  items: readonly ModuleNavigationItem[],
): readonly ModuleNavigationItem[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

function defineCoreCapability(
  definition: CoreCapabilityDefinition,
): CoreCapabilityDefinition {
  return Object.freeze({
    ...definition,
    requires: freezeStrings(definition.requires),
    publicRoutes: freezeStrings(definition.publicRoutes),
    accountRoutes: freezeStrings(definition.accountRoutes),
    adminRoutes: freezeStrings(definition.adminRoutes),
    publicNavigation: freezeNavigation(definition.publicNavigation),
    adminNavigation: freezeNavigation(definition.adminNavigation),
    setupTopics: freezeStrings(definition.setupTopics),
    backgroundJobs: freezeStrings(definition.backgroundJobs),
    telemetryEvents: freezeStrings(definition.telemetryEvents),
  });
}

function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return Object.freeze({
    ...definition,
    requires: freezeStrings(definition.requires),
    coreRequirements: freezeStrings(definition.coreRequirements),
    publicRoutes: freezeStrings(definition.publicRoutes),
    accountRoutes: freezeStrings(definition.accountRoutes),
    adminRoutes: freezeStrings(definition.adminRoutes),
    publicNavigation: freezeNavigation(definition.publicNavigation),
    adminNavigation: freezeNavigation(definition.adminNavigation),
    setupTopics: freezeStrings(definition.setupTopics),
    backgroundJobs: freezeStrings(definition.backgroundJobs),
    telemetryEvents: freezeStrings(definition.telemetryEvents),
  });
}

export const CORE_CAPABILITY_REGISTRY = Object.freeze([
  defineCoreCapability({
    key: "music",
    label: "Music",
    kind: "core",
    deactivatable: false,
    requires: [],
    publicRoutes: [
      "/music",
      "/music/releases/:slug",
      "/music/tracks/:slug",
      "/music/collections/:slug",
    ],
    accountRoutes: [],
    adminRoutes: ["/admin/music"],
    publicNavigation: [
      { id: "public.music", label: "Music", href: "/music", order: 10 },
    ],
    adminNavigation: [
      { id: "admin.music", label: "Music", href: "/admin/music", order: 40 },
    ],
    setupTopics: ["artist", "music"],
    backgroundJobs: [],
    telemetryEvents: ["music-view"],
  }),
  defineCoreCapability({
    key: "catalog",
    label: "Catalog",
    kind: "core",
    deactivatable: false,
    requires: ["music"],
    publicRoutes: [],
    accountRoutes: [],
    adminRoutes: ["/admin/music"],
    publicNavigation: [],
    adminNavigation: [],
    setupTopics: ["catalog", "rights"],
    backgroundJobs: ["prepare-media"],
    telemetryEvents: ["release-view", "track-view"],
  }),
  defineCoreCapability({
    key: "streaming",
    label: "Streaming",
    kind: "core",
    deactivatable: false,
    requires: ["catalog", "access"],
    publicRoutes: ["/api/media/tracks/:trackId/stream"],
    accountRoutes: [],
    adminRoutes: ["/admin/music"],
    publicNavigation: [],
    adminNavigation: [],
    setupTopics: ["streaming", "availability"],
    backgroundJobs: ["prepare-streaming-derivative"],
    telemetryEvents: ["playback-start", "meaningful-listen"],
  }),
  defineCoreCapability({
    key: "identity",
    label: "Identity",
    kind: "core",
    deactivatable: false,
    requires: [],
    publicRoutes: ["/signin-with-chatgpt", "/signout-with-chatgpt"],
    accountRoutes: ["/account/profile"],
    adminRoutes: ["/admin/customers", "/admin/editors"],
    publicNavigation: [],
    adminNavigation: [
      {
        id: "admin.customers",
        label: "Customers",
        href: "/admin/customers",
        order: 50,
      },
    ],
    setupTopics: ["owner", "editors", "customer-identity"],
    backgroundJobs: [],
    telemetryEvents: [],
  }),
  defineCoreCapability({
    key: "access",
    label: "Access",
    kind: "core",
    deactivatable: false,
    requires: ["identity"],
    publicRoutes: [],
    accountRoutes: ["/account/access"],
    adminRoutes: ["/admin/access"],
    publicNavigation: [],
    adminNavigation: [
      {
        id: "admin.access",
        label: "Access",
        href: "/admin/access",
        order: 60,
      },
    ],
    setupTopics: ["access", "delivery"],
    backgroundJobs: [],
    telemetryEvents: ["protected-resource-delivered"],
  }),
  defineCoreCapability({
    key: "administration",
    label: "Administration",
    kind: "core",
    deactivatable: false,
    requires: ["identity", "access"],
    publicRoutes: ["/about", "/privacy", "/terms", "/faq"],
    accountRoutes: ["/account"],
    adminRoutes: [
      "/admin",
      "/admin/artist",
      "/admin/pages",
      "/admin/legal",
      "/admin/operations",
    ],
    publicNavigation: [
      { id: "public.about", label: "About", href: "/about", order: 20 },
    ],
    adminNavigation: [
      {
        id: "admin.overview",
        label: "Overview",
        href: "/admin",
        order: 10,
      },
      {
        id: "admin.artist",
        label: "Artist",
        href: "/admin/artist",
        order: 20,
      },
      {
        id: "admin.pages",
        label: "Pages",
        href: "/admin/pages",
        order: 30,
      },
      {
        id: "admin.legal",
        label: "Privacy & terms",
        href: "/admin/legal",
        order: 160,
      },
      {
        id: "admin.operations",
        label: "Operations",
        href: "/admin/operations",
        order: 170,
      },
    ],
    setupTopics: ["artist", "navigation", "pages", "privacy", "terms"],
    backgroundJobs: [],
    telemetryEvents: [],
  }),
] satisfies readonly CoreCapabilityDefinition[]);

export const MODULE_REGISTRY = Object.freeze([
  defineModule({
    key: "downloads",
    label: "Downloads",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["catalog", "identity", "access"],
    publicRoutes: ["/commerce"],
    accountRoutes: ["/account/access"],
    adminRoutes: ["/admin/access"],
    publicNavigation: [],
    adminNavigation: [
      {
        id: "admin.downloads",
        label: "Downloads",
        href: "/admin/access",
        order: 70,
      },
    ],
    setupTopics: ["downloads", "delivery"],
    backgroundJobs: ["prepare-download-derivative"],
    telemetryEvents: ["download-delivered"],
  }),
  defineModule({
    key: "customer-library",
    label: "Customer library",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["catalog", "identity", "access"],
    publicRoutes: [],
    accountRoutes: [
      "/account/library",
      "/account/favorites",
      "/account/playlists",
      "/account/listening-history",
    ],
    adminRoutes: ["/admin/customers"],
    publicNavigation: [],
    adminNavigation: [],
    setupTopics: ["customer-library"],
    backgroundJobs: [],
    telemetryEvents: ["favorite-saved", "playlist-updated"],
  }),
  defineModule({
    key: "licensing",
    label: "Licensing",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["catalog", "identity", "access"],
    publicRoutes: ["/licensing", "/commerce"],
    accountRoutes: ["/account/licenses"],
    adminRoutes: ["/admin/licensing"],
    publicNavigation: [
      {
        id: "public.licensing",
        label: "Licensing",
        href: "/licensing",
        order: 60,
      },
    ],
    adminNavigation: [
      {
        id: "admin.licensing",
        label: "Licensing",
        href: "/admin/licensing",
        order: 80,
      },
    ],
    setupTopics: ["licensing", "license-terms"],
    backgroundJobs: ["render-license-document"],
    telemetryEvents: ["licensing-view", "license-issued"],
  }),
  defineModule({
    key: "memberships",
    label: "Memberships",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["identity", "access"],
    publicRoutes: ["/membership", "/commerce"],
    accountRoutes: ["/account/memberships"],
    adminRoutes: ["/admin/memberships"],
    publicNavigation: [
      {
        id: "public.membership",
        label: "Membership",
        href: "/membership",
        order: 50,
      },
    ],
    adminNavigation: [
      {
        id: "admin.memberships",
        label: "Memberships",
        href: "/admin/memberships",
        order: 90,
      },
    ],
    setupTopics: ["memberships", "benefits"],
    backgroundJobs: [],
    telemetryEvents: ["membership-view", "membership-activated"],
  }),
  defineModule({
    key: "subscriptions",
    label: "Subscriptions",
    kind: "optional",
    deactivatable: true,
    requires: ["memberships"],
    coreRequirements: ["identity", "access"],
    publicRoutes: ["/commerce"],
    accountRoutes: ["/account/memberships"],
    adminRoutes: ["/admin/memberships"],
    publicNavigation: [],
    adminNavigation: [
      {
        id: "admin.subscriptions",
        label: "Subscriptions",
        href: "/admin/memberships",
        order: 100,
      },
    ],
    setupTopics: ["subscriptions", "renewals", "cancellations"],
    backgroundJobs: ["apply-subscription-boundary"],
    telemetryEvents: ["subscription-activated", "subscription-canceled"],
  }),
  defineModule({
    key: "courses",
    label: "Courses",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["identity", "access"],
    publicRoutes: [
      "/courses",
      "/courses/:courseSlug",
      "/courses/:courseSlug/:lessonSlug",
    ],
    accountRoutes: ["/account/courses"],
    adminRoutes: ["/admin/courses"],
    publicNavigation: [
      {
        id: "public.courses",
        label: "Courses",
        href: "/courses",
        order: 30,
      },
    ],
    adminNavigation: [
      {
        id: "admin.courses",
        label: "Courses",
        href: "/admin/courses",
        order: 110,
      },
    ],
    setupTopics: ["courses", "course-access"],
    backgroundJobs: [],
    telemetryEvents: ["course-view", "lesson-completed"],
  }),
  defineModule({
    key: "video",
    label: "Video",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["administration"],
    publicRoutes: ["/videos", "/videos/:slug"],
    accountRoutes: [],
    adminRoutes: ["/admin/videos"],
    publicNavigation: [
      {
        id: "public.videos",
        label: "Videos",
        href: "/videos",
        order: 40,
      },
    ],
    adminNavigation: [
      {
        id: "admin.videos",
        label: "Videos",
        href: "/admin/videos",
        order: 120,
      },
    ],
    setupTopics: ["video", "video-rights", "external-video-privacy"],
    backgroundJobs: ["prepare-video-derivative"],
    telemetryEvents: ["video-view", "video-playback-start"],
  }),
  defineModule({
    key: "whats-new",
    label: "What's New",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["identity", "administration"],
    publicRoutes: ["/whats-new", "/whats-new/:slug"],
    accountRoutes: ["/account/whats-new"],
    adminRoutes: ["/admin/whats-new"],
    publicNavigation: [
      {
        id: "public.whats-new",
        label: "What's New",
        href: "/whats-new",
        order: 80,
      },
    ],
    adminNavigation: [
      {
        id: "admin.whats-new",
        label: "What's New",
        href: "/admin/whats-new",
        order: 130,
      },
    ],
    setupTopics: ["whats-new"],
    backgroundJobs: [],
    telemetryEvents: ["update-view", "update-read"],
  }),
  defineModule({
    key: "contact",
    label: "Contact",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["administration"],
    publicRoutes: ["/contact"],
    accountRoutes: [],
    adminRoutes: ["/admin/contact"],
    publicNavigation: [
      {
        id: "public.contact",
        label: "Contact",
        href: "/contact",
        order: 70,
      },
    ],
    adminNavigation: [
      {
        id: "admin.contact",
        label: "Contact",
        href: "/admin/contact",
        order: 140,
      },
    ],
    setupTopics: ["contact", "contact-consent"],
    backgroundJobs: ["deliver-contact-inquiry"],
    telemetryEvents: ["contact-view", "contact-submitted"],
  }),
  defineModule({
    key: "telemetry",
    label: "Telemetry",
    kind: "optional",
    deactivatable: true,
    requires: [],
    coreRequirements: ["administration"],
    publicRoutes: [],
    accountRoutes: [],
    adminRoutes: ["/admin/telemetry"],
    publicNavigation: [],
    adminNavigation: [
      {
        id: "admin.telemetry",
        label: "Telemetry",
        href: "/admin/telemetry",
        order: 150,
      },
    ],
    setupTopics: ["telemetry", "consent", "retention"],
    backgroundJobs: ["aggregate-telemetry", "prune-telemetry"],
    telemetryEvents: [],
  }),
] satisfies readonly ModuleDefinition[]);

export const CAPABILITY_REGISTRY = Object.freeze([
  ...CORE_CAPABILITY_REGISTRY,
  ...MODULE_REGISTRY,
] satisfies readonly CapabilityDefinition[]);

const coreCapabilityKeySet = new Set<string>(CORE_CAPABILITY_KEYS);
const moduleKeySet = new Set<string>(MODULE_KEYS);
const capabilityByKey = new Map(
  CAPABILITY_REGISTRY.map((definition) => [definition.key, definition]),
);

export function isCoreCapabilityKey(
  value: unknown,
): value is CoreCapabilityKey {
  return typeof value === "string" && coreCapabilityKeySet.has(value);
}

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && moduleKeySet.has(value);
}

export function isCapabilityKey(value: unknown): value is CapabilityKey {
  return isCoreCapabilityKey(value) || isModuleKey(value);
}

export function getCapabilityDefinition(
  key: CapabilityKey,
): CapabilityDefinition {
  return capabilityByKey.get(key)!;
}

export function getModuleDefinition(key: ModuleKey): ModuleDefinition {
  return capabilityByKey.get(key)! as ModuleDefinition;
}

export function resolveActiveCapabilities(
  activeModules: readonly ModuleKey[],
): readonly CapabilityKey[] {
  const activeModuleSet = new Set(activeModules);
  return Object.freeze(
    CAPABILITY_KEYS.filter(
      (key) => isCoreCapabilityKey(key) || activeModuleSet.has(key),
    ),
  );
}

export type NavigationSurface = "public" | "admin";

function compareNavigationItems(
  left: ModuleNavigationItem,
  right: ModuleNavigationItem,
): number {
  if (left.order !== right.order) return left.order - right.order;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function resolveModuleNavigation(
  activeModules: readonly ModuleKey[],
  surface: NavigationSurface,
): readonly ModuleNavigationItem[] {
  const activeCapabilities = new Set(resolveActiveCapabilities(activeModules));
  const field = surface === "public" ? "publicNavigation" : "adminNavigation";
  const seenHrefs = new Set<string>();

  return Object.freeze(
    CAPABILITY_REGISTRY.filter(({ key }) => activeCapabilities.has(key))
      .flatMap((definition) => definition[field])
      .sort(compareNavigationItems)
      .filter(({ href }) => {
        if (seenHrefs.has(href)) return false;
        seenHrefs.add(href);
        return true;
      }),
  );
}
