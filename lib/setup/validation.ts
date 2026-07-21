import {
  MODULE_KEYS,
  getModuleDefinition,
  isModuleKey,
  type ModuleKey,
} from "../modules/registry.ts";
import { isSha256 } from "./canonical.ts";
import { SetupContractError, type SetupValidationIssue } from "./errors.ts";
import {
  EXTERNAL_ACTION_KINDS,
  NO_REAL_PAYMENT_STATEMENT,
  SETUP_PROPOSAL_SCHEMA_VERSION,
  SITES_SETUP_COMMERCE_ADAPTER,
  type AccessPlanProposal,
  type AccountsPublicationTopic,
  type ApprovedMediaKind,
  type ApprovedMediaReference,
  type ArtistTopic,
  type CapabilitiesNavigationTopic,
  type CatalogCollectionProposal,
  type CatalogReleaseProposal,
  type CatalogReleasesTopic,
  type CatalogTrackProposal,
  type ContactConsentTopic,
  type CourseLessonProposal,
  type CourseProposal,
  type CoursesVideoTopic,
  type CreditRuleProposal,
  type CreditsTopic,
  type CustomerAccessTopic,
  type EditorAccountProposal,
  type EditorialPostProposal,
  type EditorialPresentationTopic,
  type ExternalActionKind,
  type ExternalActionProposal,
  type GrantTemplateProposal,
  type LegalDraftProposal,
  type LicenseOptionProposal,
  type LicenseTermsProposal,
  type LicensingTopic,
  type MediaActionProposal,
  type MembershipPlanProposal,
  type MembershipsSubscriptionsTopic,
  type PrivacyTermsTopic,
  type PublicationIntent,
  type RightsMediaTopic,
  type SetupCommerceContract,
  type SetupNavigationItem,
  type SetupProposal,
  type SetupResourceType,
  type SetupStructuredTextBlock,
  type SetupTopics,
  type SourceChangeProposal,
  type StreamingDownloadsTopic,
  type SubscriptionPlanProposal,
  type TelemetryRetentionTopic,
  type TrackAvailabilityProposal,
  type UpdateEntryProposal,
  type VideoProposal,
  PAGE_HERO_KEYS,
} from "./types.ts";

const SAFE_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MACHINE_PATH =
  /(?:^|[\s("'=])(?:~(?:[/\\]|$)|[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|private|var|tmp|Volumes|root|etc|opt)(?:\/|$)|file:)/i;
const SECRET_VALUE =
  /\b(?:[psr]k_(?:test|live)_[A-Za-z0-9]{6,}|whsec_[A-Za-z0-9]{6,}|Bearer\s+[A-Za-z0-9._~+\/-]{8,})\b/i;
const PROVIDER_OBJECT_VALUE =
  /\b(?:cs_(?:test|live)|evt|cus|pi|pm|seti|sub|in|ch|src|tok)_[A-Za-z0-9]{6,}\b/;
const CHECKOUT_URL = /https:\/\/checkout\.stripe\.com\//i;
const FORBIDDEN_FIELD = new RegExp(
  `^(?:card(?:number)?|pan|${["c", "vc"].join("")}|${["c", "vv"].join("")}|securitycode|expiry|expiration|paymentmethod|paymenttoken|clientsecret|webhooksignature|webhookpayload|rawwebhook|rawevent|providerpayload|stripeobject|stripeevent|stripecustomer|checkoutsession)$`,
  "i",
);

function issue(
  issues: SetupValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: SetupValidationIssue[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    issue(issues, path, "object-required", "Use a JSON object.");
    return {};
  }

  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      issue(
        issues,
        `${path}.${key}`,
        "unknown-field",
        "Remove this unsupported field.",
      );
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      issue(
        issues,
        `${path}.${key}`,
        "required-field",
        "Provide this field explicitly.",
      );
    }
  }
  return value;
}

function text(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  options: { readonly max: number; readonly empty?: boolean },
): string {
  if (typeof value !== "string") {
    issue(issues, path, "string-required", "Use a string.");
    return "";
  }
  if ((!options.empty && value.length === 0) || value.length > options.max) {
    issue(
      issues,
      path,
      "string-length",
      `Use ${options.empty ? "at most" : "between 1 and"} ${options.max} characters.`,
    );
  }
  if (CONTROL.test(value)) {
    issue(issues, path, "control-character", "Remove control characters.");
  }
  return value;
}

function nullableText(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  max: number,
): string | null {
  return value === null ? null : text(value, path, issues, { max });
}

function stableKey(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  max = 80,
): string {
  const result = text(value, path, issues, { max });
  if (!SAFE_KEY.test(result)) {
    issue(
      issues,
      path,
      "stable-key",
      "Use lowercase words separated by single hyphens.",
    );
  }
  return result;
}

function booleanValue(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): boolean {
  if (typeof value !== "boolean") {
    issue(issues, path, "boolean-required", "Use true or false.");
    return false;
  }
  return value;
}

function integer(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    issue(
      issues,
      path,
      "integer-range",
      `Use an integer from ${minimum} through ${maximum}.`,
    );
    return minimum;
  }
  return value as number;
}

function literal<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: SetupValidationIssue[],
): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  issue(
    issues,
    path,
    "unsupported-value",
    `Use one of: ${allowed.join(", ")}.`,
  );
  return allowed[0]!;
}

function array(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  maximum = 500,
): unknown[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "array-required", "Use an array.");
    return [];
  }
  if (value.length > maximum) {
    issue(issues, path, "array-length", `Use at most ${maximum} entries.`);
  }
  return value;
}

function unique<T>(
  values: readonly T[],
  key: (value: T) => string,
  path: string,
  issues: SetupValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const identifier = key(value);
    if (seen.has(identifier)) {
      issue(
        issues,
        path,
        "duplicate-entry",
        "Each stable key must appear once.",
      );
    }
    seen.add(identifier);
  }
}

function stringSet(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  maximum = 100,
): readonly string[] {
  const result = array(value, path, issues, maximum).map((entry, index) =>
    stableKey(entry, `${path}[${index}]`, issues),
  );
  unique(result, (entry) => entry, path, issues);
  return Object.freeze([...result].sort());
}

function orderedKeyList(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  maximum = 100,
): readonly string[] {
  const result = array(value, path, issues, maximum).map((entry, index) =>
    stableKey(entry, `${path}[${index}]`, issues),
  );
  unique(result, (entry) => entry, path, issues);
  return Object.freeze(result);
}

function sameStringSets(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function textSet(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  maximum = 100,
  entryMaximum = 160,
): readonly string[] {
  const result = array(value, path, issues, maximum).map((entry, index) =>
    text(entry, `${path}[${index}]`, issues, { max: entryMaximum }),
  );
  unique(result, (entry) => entry, path, issues);
  return Object.freeze([...result].sort());
}

function nullableEmail(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string | null {
  if (value === null) return null;
  const result = text(value, path, issues, { max: 254 });
  if (!EMAIL.test(result)) {
    issue(issues, path, "email-format", "Use a complete public email address.");
  }
  return result;
}

function requiredEmail(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  const result = text(value, path, issues, { max: 254 });
  if (!EMAIL.test(result)) {
    issue(issues, path, "email-format", "Use a complete email address.");
  }
  return result;
}

function isUnsafeHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower === "0.0.0.0" ||
    lower === "::1"
  ) {
    return true;
  }
  const parts = lower.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return true;
  }
  return lower.includes(":");
}

function isSafePublicHttps(value: string): boolean {
  if (
    value.includes("\\") ||
    /\s/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      !isUnsafeHostname(url.hostname) &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

function safeUrl(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  allowInternal: boolean,
): string {
  const result = text(value, path, issues, { max: 2_048 });
  if (allowInternal && result.startsWith("/")) {
    if (
      !/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(result) ||
      result.includes("//") ||
      result.split("/").includes("..")
    ) {
      issue(issues, path, "unsafe-url", "Use a simple site-relative route.");
    }
    return result;
  }

  if (!isSafePublicHttps(result)) {
    issue(
      issues,
      path,
      "unsafe-url",
      "Use a public HTTPS URL without credentials.",
    );
  }
  return result;
}

function nullableUrl(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string | null {
  return value === null ? null : safeUrl(value, path, issues, false);
}

function isCardLike(value: string): boolean {
  const digits = value.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function scanForbidden(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): void {
  if (typeof value === "string") {
    if (MACHINE_PATH.test(value)) {
      issue(
        issues,
        path,
        "machine-path-rejected",
        "Reference an ignored local path alias instead of a machine path.",
      );
    }
    if (SECRET_VALUE.test(value)) {
      issue(
        issues,
        path,
        "secret-rejected",
        "Keep credentials in server-managed environment values.",
      );
    }
    if (PROVIDER_OBJECT_VALUE.test(value) || CHECKOUT_URL.test(value)) {
      issue(
        issues,
        path,
        "provider-payload-rejected",
        "Keep provider identifiers and payloads outside setup proposals.",
      );
    }
    if (/\b(?:http|javascript|vbscript):/i.test(value)) {
      issue(
        issues,
        path,
        "unsafe-url",
        "Use public HTTPS URLs without embedded credentials.",
      );
    }
    for (const match of value.matchAll(/https:\/\/[^\s<>"']+/gi)) {
      const candidate = match[0].replace(/[),.;!?]+$/, "");
      if (!isSafePublicHttps(candidate)) {
        issue(
          issues,
          path,
          "unsafe-url",
          "Use public HTTPS URLs without embedded credentials.",
        );
      }
    }
    if (isCardLike(value)) {
      issue(
        issues,
        path,
        "payment-card-rejected",
        "Payment-card data cannot enter a-op.",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanForbidden(entry, `${path}[${index}]`, issues),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_FIELD.test(key.replace(/[-_]/g, ""))) {
        issue(
          issues,
          `${path}.${key}`,
          "forbidden-field",
          "Payment and provider payload fields cannot enter a setup proposal.",
        );
      }
      scanForbidden(entry, `${path}.${key}`, issues);
    }
  }
}

function dateValue(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string | null {
  if (value === null) return null;
  const result = text(value, path, issues, { max: 10 });
  if (
    !ISO_DATE.test(result) ||
    Number.isNaN(Date.parse(`${result}T00:00:00Z`))
  ) {
    issue(issues, path, "date-format", "Use YYYY-MM-DD or null.");
  }
  return result;
}

export function validateIsoInstant(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  const result = text(value, path, issues, { max: 32 });
  if (!ISO_INSTANT.test(result) || Number.isNaN(Date.parse(result))) {
    issue(issues, path, "instant-format", "Use a UTC ISO 8601 timestamp.");
  }
  return result;
}

function currencyValue(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  const result = text(value, path, issues, { max: 3 });
  if (!CURRENCY.test(result)) {
    issue(
      issues,
      path,
      "currency-format",
      "Use a three-letter uppercase currency.",
    );
  }
  return result;
}

function parseArtist(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): ArtistTopic {
  const object = exactObject(
    value,
    [
      "artistKey",
      "publicName",
      "shortName",
      "headline",
      "description",
      "biography",
      "publicContactEmail",
      "publicContactUrl",
    ],
    path,
    issues,
  );
  return {
    artistKey: stableKey(object.artistKey, `${path}.artistKey`, issues),
    publicName: text(object.publicName, `${path}.publicName`, issues, {
      max: 160,
    }),
    shortName: nullableText(object.shortName, `${path}.shortName`, issues, 80),
    headline: text(object.headline, `${path}.headline`, issues, { max: 240 }),
    description: text(object.description, `${path}.description`, issues, {
      max: 2_000,
    }),
    biography: text(object.biography, `${path}.biography`, issues, {
      max: 20_000,
      empty: true,
    }),
    publicContactEmail: nullableEmail(
      object.publicContactEmail,
      `${path}.publicContactEmail`,
      issues,
    ),
    publicContactUrl: nullableUrl(
      object.publicContactUrl,
      `${path}.publicContactUrl`,
      issues,
    ),
  };
}

function parseNavigationItem(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): SetupNavigationItem {
  const object = exactObject(
    value,
    ["navigationKey", "label", "href", "order", "module"],
    path,
    issues,
  );
  let moduleKey: ModuleKey | null = null;
  if (object.module !== null) {
    if (!isModuleKey(object.module)) {
      issue(
        issues,
        `${path}.module`,
        "module-key",
        "Use an existing optional module key or null.",
      );
    } else moduleKey = object.module;
  }
  return {
    navigationKey: stableKey(
      object.navigationKey,
      `${path}.navigationKey`,
      issues,
    ),
    label: text(object.label, `${path}.label`, issues, { max: 80 }),
    href: safeUrl(object.href, `${path}.href`, issues, true),
    order: integer(object.order, `${path}.order`, issues, 0, 10_000),
    module: moduleKey,
  };
}

function parseCapabilities(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): CapabilitiesNavigationTopic {
  const object = exactObject(
    value,
    ["activeModules", "primaryNavigation", "footerNavigation"],
    path,
    issues,
  );
  const activeModules = array(
    object.activeModules,
    `${path}.activeModules`,
    issues,
    MODULE_KEYS.length,
  )
    .map((entry, index) => {
      if (!isModuleKey(entry)) {
        issue(
          issues,
          `${path}.activeModules[${index}]`,
          "module-key",
          "Use an existing optional module key.",
        );
        return null;
      }
      return entry;
    })
    .filter((entry): entry is ModuleKey => entry !== null);
  unique(activeModules, (entry) => entry, `${path}.activeModules`, issues);
  const sortedModules = MODULE_KEYS.filter((key) =>
    activeModules.includes(key),
  );
  const activeSet = new Set(sortedModules);
  for (const key of sortedModules) {
    for (const required of getModuleDefinition(key).requires) {
      if (!activeSet.has(required)) {
        issue(
          issues,
          `${path}.activeModules`,
          "module-dependency",
          `${key} requires ${required}.`,
        );
      }
    }
  }

  const parseItems = (field: "primaryNavigation" | "footerNavigation") => {
    const items = array(object[field], `${path}.${field}`, issues, 100).map(
      (entry, index) =>
        parseNavigationItem(entry, `${path}.${field}[${index}]`, issues),
    );
    unique(items, (item) => item.navigationKey, `${path}.${field}`, issues);
    for (const item of items) {
      if (item.module !== null && !activeSet.has(item.module)) {
        issue(
          issues,
          `${path}.${field}`,
          "inactive-navigation-module",
          "Navigation can reference only active modules.",
        );
      }
    }
    return Object.freeze(
      items.sort(
        (left, right) =>
          left.order - right.order ||
          left.navigationKey.localeCompare(right.navigationKey),
      ),
    );
  };

  return {
    activeModules: Object.freeze(sortedModules),
    primaryNavigation: parseItems("primaryNavigation"),
    footerNavigation: parseItems("footerNavigation"),
  };
}

function parseMediaReference(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): ApprovedMediaReference {
  const object = exactObject(
    value,
    ["mediaKey", "sourceAlias", "kind", "rights", "intendedUse", "attribution"],
    path,
    issues,
  );
  return {
    mediaKey: stableKey(object.mediaKey, `${path}.mediaKey`, issues),
    sourceAlias: stableKey(object.sourceAlias, `${path}.sourceAlias`, issues),
    kind: literal(
      object.kind,
      ["audio", "artwork", "image", "video", "document"] as const,
      `${path}.kind`,
      issues,
    ) as ApprovedMediaKind,
    rights: literal(
      object.rights,
      ["pending", "confirmed"] as const,
      `${path}.rights`,
      issues,
    ),
    intendedUse: literal(
      object.intendedUse,
      ["public", "protected"] as const,
      `${path}.intendedUse`,
      issues,
    ),
    attribution: nullableText(
      object.attribution,
      `${path}.attribution`,
      issues,
      1_000,
    ),
  };
}

function parseRightsMedia(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): RightsMediaTopic {
  const object = exactObject(value, ["rightsStatement", "media"], path, issues);
  const media = array(object.media, `${path}.media`, issues, 500).map(
    (entry, index) =>
      parseMediaReference(entry, `${path}.media[${index}]`, issues),
  );
  unique(media, (entry) => entry.mediaKey, `${path}.media`, issues);
  unique(media, (entry) => entry.sourceAlias, `${path}.media`, issues);
  return {
    rightsStatement: text(
      object.rightsStatement,
      `${path}.rightsStatement`,
      issues,
      { max: 4_000, empty: media.length === 0 },
    ),
    media: Object.freeze(
      media.sort((left, right) => left.mediaKey.localeCompare(right.mediaKey)),
    ),
  };
}

function parseTrack(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): CatalogTrackProposal {
  const object = exactObject(
    value,
    [
      "trackKey",
      "title",
      "versionLabel",
      ...(isRecord(value) && Object.hasOwn(value, "durationMs")
        ? ["durationMs"]
        : []),
      ...(isRecord(value) && Object.hasOwn(value, "meter") ? ["meter"] : []),
      ...(isRecord(value) && Object.hasOwn(value, "tempoBpm")
        ? ["tempoBpm"]
        : []),
      ...(isRecord(value) && Object.hasOwn(value, "musicalKey")
        ? ["musicalKey"]
        : []),
      ...(isRecord(value) && Object.hasOwn(value, "tags") ? ["tags"] : []),
      "releaseKey",
      "sequence",
      "mediaKey",
    ],
    path,
    issues,
  );
  return {
    trackKey: stableKey(object.trackKey, `${path}.trackKey`, issues),
    title: text(object.title, `${path}.title`, issues, { max: 240 }),
    versionLabel: nullableText(
      object.versionLabel,
      `${path}.versionLabel`,
      issues,
      160,
    ),
    durationMs:
      object.durationMs === undefined || object.durationMs === null
        ? null
        : integer(
            object.durationMs,
            `${path}.durationMs`,
            issues,
            0,
            86_400_000,
          ),
    meter:
      object.meter === undefined || object.meter === null
        ? null
        : text(object.meter, `${path}.meter`, issues, { max: 16 }),
    tempoBpm:
      object.tempoBpm === undefined || object.tempoBpm === null
        ? null
        : integer(object.tempoBpm, `${path}.tempoBpm`, issues, 1, 1000),
    musicalKey:
      object.musicalKey === undefined || object.musicalKey === null
        ? null
        : text(object.musicalKey, `${path}.musicalKey`, issues, { max: 32 }),
    tags:
      object.tags === undefined
        ? Object.freeze([])
        : textSet(object.tags, `${path}.tags`, issues, 100, 160),
    releaseKey:
      object.releaseKey === null
        ? null
        : stableKey(object.releaseKey, `${path}.releaseKey`, issues),
    sequence: integer(object.sequence, `${path}.sequence`, issues, 1, 10_000),
    mediaKey:
      object.mediaKey === null
        ? null
        : stableKey(object.mediaKey, `${path}.mediaKey`, issues),
  };
}

function parseRelease(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): CatalogReleaseProposal {
  const object = exactObject(
    value,
    [
      "releaseKey",
      "title",
      "releaseDate",
      "trackKeys",
      ...(isRecord(value) && Object.hasOwn(value, "artworkMediaKey")
        ? ["artworkMediaKey"]
        : []),
    ],
    path,
    issues,
  );
  return {
    releaseKey: stableKey(object.releaseKey, `${path}.releaseKey`, issues),
    title: text(object.title, `${path}.title`, issues, { max: 240 }),
    releaseDate: dateValue(object.releaseDate, `${path}.releaseDate`, issues),
    trackKeys: stringSet(object.trackKeys, `${path}.trackKeys`, issues),
    artworkMediaKey:
      object.artworkMediaKey === undefined || object.artworkMediaKey === null
        ? null
        : stableKey(object.artworkMediaKey, `${path}.artworkMediaKey`, issues),
  };
}

function parseCollection(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): CatalogCollectionProposal {
  const object = exactObject(
    value,
    [
      "collectionKey",
      "title",
      "trackKeys",
      ...(isRecord(value) && Object.hasOwn(value, "artworkMediaKey")
        ? ["artworkMediaKey"]
        : []),
    ],
    path,
    issues,
  );
  return {
    collectionKey: stableKey(
      object.collectionKey,
      `${path}.collectionKey`,
      issues,
    ),
    title: text(object.title, `${path}.title`, issues, { max: 240 }),
    trackKeys: stringSet(object.trackKeys, `${path}.trackKeys`, issues),
    artworkMediaKey:
      object.artworkMediaKey === undefined || object.artworkMediaKey === null
        ? null
        : stableKey(object.artworkMediaKey, `${path}.artworkMediaKey`, issues),
  };
}

function parseCatalog(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  mediaKeys: ReadonlySet<string>,
): CatalogReleasesTopic {
  const object = exactObject(
    value,
    ["tracks", "releases", "collections"],
    path,
    issues,
  );
  const tracks = array(object.tracks, `${path}.tracks`, issues).map(
    (entry, index) => parseTrack(entry, `${path}.tracks[${index}]`, issues),
  );
  const releases = array(object.releases, `${path}.releases`, issues).map(
    (entry, index) => parseRelease(entry, `${path}.releases[${index}]`, issues),
  );
  const collections = array(
    object.collections,
    `${path}.collections`,
    issues,
  ).map((entry, index) =>
    parseCollection(entry, `${path}.collections[${index}]`, issues),
  );
  unique(tracks, (entry) => entry.trackKey, `${path}.tracks`, issues);
  unique(releases, (entry) => entry.releaseKey, `${path}.releases`, issues);
  unique(
    collections,
    (entry) => entry.collectionKey,
    `${path}.collections`,
    issues,
  );
  const trackKeys = new Set(tracks.map((entry) => entry.trackKey));
  const releaseKeys = new Set(releases.map((entry) => entry.releaseKey));
  for (const track of tracks) {
    if (track.releaseKey !== null && !releaseKeys.has(track.releaseKey)) {
      issue(
        issues,
        `${path}.tracks`,
        "missing-release",
        "Every release key must exist in this proposal.",
      );
    }
    if (track.mediaKey !== null && !mediaKeys.has(track.mediaKey)) {
      issue(
        issues,
        `${path}.tracks`,
        "missing-media",
        "Every media key must exist in rights and media.",
      );
    }
  }
  for (const release of releases) {
    if (
      release.artworkMediaKey !== null &&
      !mediaKeys.has(release.artworkMediaKey)
    ) {
      issue(
        issues,
        `${path}.releases`,
        "missing-media",
        "Every artwork key must exist in rights and media.",
      );
    }
    for (const trackKey of release.trackKeys) {
      if (!trackKeys.has(trackKey)) {
        issue(
          issues,
          `${path}.releases`,
          "missing-track",
          "Every release track must exist in this proposal.",
        );
      }
    }
  }
  for (const collection of collections) {
    if (
      collection.artworkMediaKey !== null &&
      !mediaKeys.has(collection.artworkMediaKey)
    ) {
      issue(
        issues,
        `${path}.collections`,
        "missing-media",
        "Every artwork key must exist in rights and media.",
      );
    }
    for (const trackKey of collection.trackKeys) {
      if (!trackKeys.has(trackKey)) {
        issue(
          issues,
          `${path}.collections`,
          "missing-track",
          "Every collection track must exist in this proposal.",
        );
      }
    }
  }
  return {
    tracks: Object.freeze(
      tracks.sort((left, right) => left.trackKey.localeCompare(right.trackKey)),
    ),
    releases: Object.freeze(
      releases.sort((left, right) =>
        left.releaseKey.localeCompare(right.releaseKey),
      ),
    ),
    collections: Object.freeze(
      collections.sort((left, right) =>
        left.collectionKey.localeCompare(right.collectionKey),
      ),
    ),
  };
}

function parseAvailability(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  trackKeys: ReadonlySet<string>,
): StreamingDownloadsTopic {
  const object = exactObject(value, ["tracks"], path, issues);
  const tracks: TrackAvailabilityProposal[] = array(
    object.tracks,
    `${path}.tracks`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.tracks[${index}]`;
    const item = exactObject(
      entry,
      ["trackKey", "streaming", "download"],
      itemPath,
      issues,
    );
    return {
      trackKey: stableKey(item.trackKey, `${itemPath}.trackKey`, issues),
      streaming: literal(
        item.streaming,
        ["public", "account", "entitled", "disabled"] as const,
        `${itemPath}.streaming`,
        issues,
      ),
      download: literal(
        item.download,
        ["account", "entitled", "disabled"] as const,
        `${itemPath}.download`,
        issues,
      ),
    };
  });
  unique(tracks, (entry) => entry.trackKey, `${path}.tracks`, issues);
  for (const entry of tracks) {
    if (!trackKeys.has(entry.trackKey)) {
      issue(
        issues,
        `${path}.tracks`,
        "missing-track",
        "Every availability track must exist in the catalog.",
      );
    }
  }
  return {
    tracks: Object.freeze(
      tracks.sort((left, right) => left.trackKey.localeCompare(right.trackKey)),
    ),
  };
}

function parseAccess(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): CustomerAccessTopic {
  const object = exactObject(
    value,
    ["customerLibraries", "protectedDelivery", "accessPlans", "grantTemplates"],
    path,
    issues,
  );
  const accessPlans: AccessPlanProposal[] = array(
    object.accessPlans,
    `${path}.accessPlans`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.accessPlans[${index}]`;
    const item = exactObject(
      entry,
      ["accessPlanKey", "label", "resourceType", "resourceKeys", "accessMode"],
      itemPath,
      issues,
    );
    return {
      accessPlanKey: stableKey(
        item.accessPlanKey,
        `${itemPath}.accessPlanKey`,
        issues,
      ),
      label: text(item.label, `${itemPath}.label`, issues, { max: 160 }),
      resourceType: literal(
        item.resourceType,
        ["track", "course", "lesson", "video", "document"] as const,
        `${itemPath}.resourceType`,
        issues,
      ) as SetupResourceType,
      resourceKeys: stringSet(
        item.resourceKeys,
        `${itemPath}.resourceKeys`,
        issues,
      ),
      accessMode: literal(
        item.accessMode,
        ["account", "grant", "membership", "subscription", "license"] as const,
        `${itemPath}.accessMode`,
        issues,
      ),
    };
  });
  const grantTemplates: GrantTemplateProposal[] = array(
    object.grantTemplates,
    `${path}.grantTemplates`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.grantTemplates[${index}]`;
    const item = exactObject(
      entry,
      ["grantKey", "label", "accessPlanKey", "defaultDurationDays"],
      itemPath,
      issues,
    );
    return {
      grantKey: stableKey(item.grantKey, `${itemPath}.grantKey`, issues),
      label: text(item.label, `${itemPath}.label`, issues, { max: 160 }),
      accessPlanKey: stableKey(
        item.accessPlanKey,
        `${itemPath}.accessPlanKey`,
        issues,
      ),
      defaultDurationDays:
        item.defaultDurationDays === null
          ? null
          : integer(
              item.defaultDurationDays,
              `${itemPath}.defaultDurationDays`,
              issues,
              1,
              36_500,
            ),
    };
  });
  unique(
    accessPlans,
    (entry) => entry.accessPlanKey,
    `${path}.accessPlans`,
    issues,
  );
  unique(
    grantTemplates,
    (entry) => entry.grantKey,
    `${path}.grantTemplates`,
    issues,
  );
  const accessPlanKeys = new Set(
    accessPlans.map((entry) => entry.accessPlanKey),
  );
  for (const grant of grantTemplates) {
    if (!accessPlanKeys.has(grant.accessPlanKey)) {
      issue(
        issues,
        `${path}.grantTemplates`,
        "missing-access-plan",
        "Every grant template must use an access plan in this proposal.",
      );
    }
  }
  return {
    customerLibraries: booleanValue(
      object.customerLibraries,
      `${path}.customerLibraries`,
      issues,
    ),
    protectedDelivery: booleanValue(
      object.protectedDelivery,
      `${path}.protectedDelivery`,
      issues,
    ),
    accessPlans: Object.freeze(
      accessPlans.sort((left, right) =>
        left.accessPlanKey.localeCompare(right.accessPlanKey),
      ),
    ),
    grantTemplates: Object.freeze(
      grantTemplates.sort((left, right) =>
        left.grantKey.localeCompare(right.grantKey),
      ),
    ),
  };
}

function parseMembershipPlan(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): MembershipPlanProposal {
  const object = exactObject(
    value,
    [
      "planKey",
      "name",
      "description",
      "interval",
      "displayAmountMinor",
      "currency",
      "accessPlanKeys",
      "benefitKeys",
      "durationDays",
    ],
    path,
    issues,
  );
  return {
    planKey: stableKey(object.planKey, `${path}.planKey`, issues),
    name: text(object.name, `${path}.name`, issues, { max: 120 }),
    description: text(object.description, `${path}.description`, issues, {
      max: 2_000,
    }),
    interval: literal(
      object.interval,
      ["one-time", "month", "year"] as const,
      `${path}.interval`,
      issues,
    ),
    displayAmountMinor: integer(
      object.displayAmountMinor,
      `${path}.displayAmountMinor`,
      issues,
      1,
      100_000_000,
    ),
    currency: currencyValue(object.currency, `${path}.currency`, issues),
    accessPlanKeys: stringSet(
      object.accessPlanKeys,
      `${path}.accessPlanKeys`,
      issues,
    ),
    benefitKeys: stringSet(object.benefitKeys, `${path}.benefitKeys`, issues),
    durationDays:
      object.durationDays === null
        ? null
        : integer(
            object.durationDays,
            `${path}.durationDays`,
            issues,
            1,
            36_500,
          ),
  };
}

function parseSubscriptionPlan(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): SubscriptionPlanProposal {
  const object = exactObject(
    value,
    [
      "planKey",
      "membershipPlanKey",
      "name",
      "description",
      "billingInterval",
      "displayAmountMinor",
      "currency",
      "accessPlanKeys",
      "benefitKeys",
    ],
    path,
    issues,
  );
  return {
    planKey: stableKey(object.planKey, `${path}.planKey`, issues),
    membershipPlanKey: stableKey(
      object.membershipPlanKey,
      `${path}.membershipPlanKey`,
      issues,
    ),
    name: text(object.name, `${path}.name`, issues, { max: 120 }),
    description: text(object.description, `${path}.description`, issues, {
      max: 2_000,
    }),
    billingInterval: literal(
      object.billingInterval,
      ["month", "year"] as const,
      `${path}.billingInterval`,
      issues,
    ),
    displayAmountMinor: integer(
      object.displayAmountMinor,
      `${path}.displayAmountMinor`,
      issues,
      1,
      100_000_000,
    ),
    currency: currencyValue(object.currency, `${path}.currency`, issues),
    accessPlanKeys: stringSet(
      object.accessPlanKeys,
      `${path}.accessPlanKeys`,
      issues,
    ),
    benefitKeys: stringSet(object.benefitKeys, `${path}.benefitKeys`, issues),
  };
}

function parseMemberships(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  accessPlanKeys: ReadonlySet<string>,
): MembershipsSubscriptionsTopic {
  const object = exactObject(
    value,
    ["membershipPlans", "subscriptionPlans"],
    path,
    issues,
  );
  const membershipPlans = array(
    object.membershipPlans,
    `${path}.membershipPlans`,
    issues,
  ).map((entry, index) =>
    parseMembershipPlan(entry, `${path}.membershipPlans[${index}]`, issues),
  );
  const subscriptionPlans = array(
    object.subscriptionPlans,
    `${path}.subscriptionPlans`,
    issues,
  ).map((entry, index) =>
    parseSubscriptionPlan(entry, `${path}.subscriptionPlans[${index}]`, issues),
  );
  unique(
    membershipPlans,
    (entry) => entry.planKey,
    `${path}.membershipPlans`,
    issues,
  );
  unique(
    subscriptionPlans,
    (entry) => entry.planKey,
    `${path}.subscriptionPlans`,
    issues,
  );
  const allPlanKeys = [...membershipPlans, ...subscriptionPlans].map(
    (entry) => entry.planKey,
  );
  unique(allPlanKeys, (entry) => entry, path, issues);
  for (const plan of [...membershipPlans, ...subscriptionPlans]) {
    if (plan.accessPlanKeys.length > 1) {
      issue(
        issues,
        path,
        "ambiguous-access-plan",
        "Each membership benefit revision can reference at most one access plan.",
      );
    }
    for (const accessPlanKey of plan.accessPlanKeys) {
      if (!accessPlanKeys.has(accessPlanKey)) {
        issue(
          issues,
          path,
          "missing-access-plan",
          "Every membership and subscription access plan must exist in this proposal.",
        );
      }
    }
  }
  const membershipsByKey = new Map(
    membershipPlans.map((entry) => [entry.planKey, entry]),
  );
  for (const membership of membershipPlans) {
    if (membership.interval !== "one-time") {
      issue(
        issues,
        `${path}.membershipPlans`,
        "recurring-membership-product",
        "A membership product is one-time. Use a subscription plan for monthly or yearly billing.",
      );
    }
  }
  for (const subscription of subscriptionPlans) {
    const membership = membershipsByKey.get(subscription.membershipPlanKey);
    if (!membership) {
      issue(
        issues,
        `${path}.subscriptionPlans`,
        "missing-membership-plan",
        "Every subscription must reference a membership plan in this proposal.",
      );
      continue;
    }
    if (
      !sameStringSets(subscription.accessPlanKeys, membership.accessPlanKeys) ||
      !sameStringSets(subscription.benefitKeys, membership.benefitKeys)
    ) {
      issue(
        issues,
        `${path}.subscriptionPlans`,
        "membership-benefits-mismatch",
        "A subscription must repeat the exact access plans and benefits of its membership revision.",
      );
    }
  }
  return {
    membershipPlans: Object.freeze(
      membershipPlans.sort((left, right) =>
        left.planKey.localeCompare(right.planKey),
      ),
    ),
    subscriptionPlans: Object.freeze(
      subscriptionPlans.sort((left, right) =>
        left.planKey.localeCompare(right.planKey),
      ),
    ),
  };
}

function parseCreditRule(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): CreditRuleProposal {
  const object = exactObject(
    value,
    ["ruleKey", "planKey", "amount", "cadence"],
    path,
    issues,
  );
  return {
    ruleKey: stableKey(object.ruleKey, `${path}.ruleKey`, issues),
    planKey: stableKey(object.planKey, `${path}.planKey`, issues),
    amount: integer(object.amount, `${path}.amount`, issues, 1, 1_000_000),
    cadence: literal(
      object.cadence,
      ["once", "month", "year"] as const,
      `${path}.cadence`,
      issues,
    ),
  };
}

function parseCredits(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  planKeys: ReadonlySet<string>,
): CreditsTopic {
  const object = exactObject(
    value,
    ["downloadCreditRules", "licenseCreditRules"],
    path,
    issues,
  );
  const parseRules = (field: "downloadCreditRules" | "licenseCreditRules") => {
    const rules = array(object[field], `${path}.${field}`, issues).map(
      (entry, index) =>
        parseCreditRule(entry, `${path}.${field}[${index}]`, issues),
    );
    unique(rules, (entry) => entry.ruleKey, `${path}.${field}`, issues);
    unique(rules, (entry) => entry.planKey, `${path}.${field}`, issues);
    for (const rule of rules) {
      if (!planKeys.has(rule.planKey)) {
        issue(
          issues,
          `${path}.${field}`,
          "missing-plan",
          "Every credit rule must reference a plan in this proposal.",
        );
      }
    }
    return Object.freeze(
      rules.sort((left, right) => left.ruleKey.localeCompare(right.ruleKey)),
    );
  };
  return {
    downloadCreditRules: parseRules("downloadCreditRules"),
    licenseCreditRules: parseRules("licenseCreditRules"),
  };
}

function parseLicensing(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  trackKeys: ReadonlySet<string>,
): LicensingTopic {
  const object = exactObject(value, ["terms", "options"], path, issues);
  const terms: LicenseTermsProposal[] = array(
    object.terms,
    `${path}.terms`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.terms[${index}]`;
    const item = exactObject(
      entry,
      ["termsKey", "title", "body", "version"],
      itemPath,
      issues,
    );
    return {
      termsKey: stableKey(item.termsKey, `${itemPath}.termsKey`, issues),
      title: text(item.title, `${itemPath}.title`, issues, { max: 240 }),
      body: text(item.body, `${itemPath}.body`, issues, { max: 100_000 }),
      version: integer(
        item.version,
        `${itemPath}.version`,
        issues,
        1,
        1_000_000,
      ),
    };
  });
  const options: LicenseOptionProposal[] = array(
    object.options,
    `${path}.options`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.options[${index}]`;
    const item = exactObject(
      entry,
      [
        "optionKey",
        "trackKey",
        "label",
        "termsKey",
        "uses",
        "usageCategory",
        "allowedMedia",
        "audienceLabel",
        "maxAudience",
        "distributionLabel",
        "maxCopies",
        "termMonths",
        "territory",
        "attributionRequired",
        "attributionText",
        "exclusive",
        "requiresApproval",
        "licenseCreditCost",
        "includesTrackDownload",
        "displayAmountMinor",
        "currency",
      ],
      itemPath,
      issues,
    );
    return {
      optionKey: stableKey(item.optionKey, `${itemPath}.optionKey`, issues),
      trackKey: stableKey(item.trackKey, `${itemPath}.trackKey`, issues),
      label: text(item.label, `${itemPath}.label`, issues, { max: 160 }),
      termsKey: stableKey(item.termsKey, `${itemPath}.termsKey`, issues),
      uses: text(item.uses, `${itemPath}.uses`, issues, { max: 4_000 }),
      usageCategory: text(
        item.usageCategory,
        `${itemPath}.usageCategory`,
        issues,
        { max: 120 },
      ),
      allowedMedia: textSet(
        item.allowedMedia,
        `${itemPath}.allowedMedia`,
        issues,
        32,
        120,
      ),
      audienceLabel: nullableText(
        item.audienceLabel,
        `${itemPath}.audienceLabel`,
        issues,
        160,
      ),
      maxAudience:
        item.maxAudience === null
          ? null
          : integer(
              item.maxAudience,
              `${itemPath}.maxAudience`,
              issues,
              1,
              1_000_000_000,
            ),
      distributionLabel: nullableText(
        item.distributionLabel,
        `${itemPath}.distributionLabel`,
        issues,
        160,
      ),
      maxCopies:
        item.maxCopies === null
          ? null
          : integer(
              item.maxCopies,
              `${itemPath}.maxCopies`,
              issues,
              1,
              1_000_000_000,
            ),
      termMonths:
        item.termMonths === null
          ? null
          : integer(
              item.termMonths,
              `${itemPath}.termMonths`,
              issues,
              1,
              1_200,
            ),
      territory: text(item.territory, `${itemPath}.territory`, issues, {
        max: 160,
      }),
      attributionRequired: booleanValue(
        item.attributionRequired,
        `${itemPath}.attributionRequired`,
        issues,
      ),
      attributionText: nullableText(
        item.attributionText,
        `${itemPath}.attributionText`,
        issues,
        1_000,
      ),
      exclusive: booleanValue(item.exclusive, `${itemPath}.exclusive`, issues),
      requiresApproval: booleanValue(
        item.requiresApproval,
        `${itemPath}.requiresApproval`,
        issues,
      ),
      licenseCreditCost: integer(
        item.licenseCreditCost,
        `${itemPath}.licenseCreditCost`,
        issues,
        1,
        1_000_000,
      ),
      includesTrackDownload: booleanValue(
        item.includesTrackDownload,
        `${itemPath}.includesTrackDownload`,
        issues,
      ),
      displayAmountMinor: integer(
        item.displayAmountMinor,
        `${itemPath}.displayAmountMinor`,
        issues,
        1,
        100_000_000,
      ),
      currency: currencyValue(item.currency, `${itemPath}.currency`, issues),
    };
  });
  unique(terms, (entry) => entry.termsKey, `${path}.terms`, issues);
  unique(options, (entry) => entry.optionKey, `${path}.options`, issues);
  const termKeys = new Set(terms.map((entry) => entry.termsKey));
  for (const option of options) {
    if (!trackKeys.has(option.trackKey))
      issue(
        issues,
        `${path}.options`,
        "missing-track",
        "Every license option must use a catalog track.",
      );
    if (!termKeys.has(option.termsKey))
      issue(
        issues,
        `${path}.options`,
        "missing-terms",
        "Every license option must use a terms version in this proposal.",
      );
    if (option.attributionRequired && option.attributionText === null) {
      issue(
        issues,
        `${path}.options`,
        "attribution-text-required",
        "An attribution-required license option must include its exact attribution text.",
      );
    }
  }
  for (const term of terms) {
    if (!options.some((option) => option.termsKey === term.termsKey)) {
      issue(
        issues,
        `${path}.terms`,
        "license-options-required",
        "Every license terms version must include at least one complete option.",
      );
    }
  }
  return {
    terms: Object.freeze(
      terms.sort((left, right) => left.termsKey.localeCompare(right.termsKey)),
    ),
    options: Object.freeze(
      options.sort((left, right) =>
        left.optionKey.localeCompare(right.optionKey),
      ),
    ),
  };
}

function parseCoursesVideo(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  mediaKeys: ReadonlySet<string>,
  accessPlanKeys: ReadonlySet<string>,
): CoursesVideoTopic {
  const object = exactObject(value, ["courses", "videos"], path, issues);
  const courses: CourseProposal[] = array(
    object.courses,
    `${path}.courses`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.courses[${index}]`;
    const item = exactObject(
      entry,
      ["courseKey", "title", "summary", "accessPlanKey", "lessons"],
      itemPath,
      issues,
    );
    const lessons: CourseLessonProposal[] = array(
      item.lessons,
      `${itemPath}.lessons`,
      issues,
    ).map((lesson, lessonIndex) => {
      const lessonPath = `${itemPath}.lessons[${lessonIndex}]`;
      const lessonObject = exactObject(
        lesson,
        ["lessonKey", "title", "summary", "mediaKeys"],
        lessonPath,
        issues,
      );
      const lessonMediaKeys = orderedKeyList(
        lessonObject.mediaKeys,
        `${lessonPath}.mediaKeys`,
        issues,
      );
      for (const mediaKey of lessonMediaKeys) {
        if (!mediaKeys.has(mediaKey))
          issue(
            issues,
            `${lessonPath}.mediaKeys`,
            "missing-media",
            "Every lesson media key must exist in rights and media.",
          );
      }
      return {
        lessonKey: stableKey(
          lessonObject.lessonKey,
          `${lessonPath}.lessonKey`,
          issues,
        ),
        title: text(lessonObject.title, `${lessonPath}.title`, issues, {
          max: 240,
        }),
        summary: text(lessonObject.summary, `${lessonPath}.summary`, issues, {
          max: 4_000,
          empty: true,
        }),
        mediaKeys: lessonMediaKeys,
      };
    });
    unique(
      lessons,
      (lesson) => lesson.lessonKey,
      `${itemPath}.lessons`,
      issues,
    );
    const accessPlanKey =
      item.accessPlanKey === null
        ? null
        : stableKey(item.accessPlanKey, `${itemPath}.accessPlanKey`, issues);
    if (accessPlanKey !== null && !accessPlanKeys.has(accessPlanKey))
      issue(
        issues,
        `${itemPath}.accessPlanKey`,
        "missing-access-plan",
        "The Course access plan must exist in this proposal.",
      );
    return {
      courseKey: stableKey(item.courseKey, `${itemPath}.courseKey`, issues),
      title: text(item.title, `${itemPath}.title`, issues, { max: 240 }),
      summary: text(item.summary, `${itemPath}.summary`, issues, {
        max: 4_000,
        empty: true,
      }),
      accessPlanKey,
      lessons: Object.freeze(lessons),
    };
  });
  const videos: VideoProposal[] = array(
    object.videos,
    `${path}.videos`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.videos[${index}]`;
    const item = exactObject(
      entry,
      [
        "videoKey",
        "title",
        "summary",
        "mediaKey",
        "transcript",
        "externalEmbedUrl",
        "consentRequired",
      ],
      itemPath,
      issues,
    );
    const mediaKey =
      item.mediaKey === null
        ? null
        : stableKey(item.mediaKey, `${itemPath}.mediaKey`, issues);
    if (mediaKey !== null && !mediaKeys.has(mediaKey))
      issue(
        issues,
        `${itemPath}.mediaKey`,
        "missing-media",
        "Every video media key must exist in rights and media.",
      );
    const externalEmbedUrl = nullableUrl(
      item.externalEmbedUrl,
      `${itemPath}.externalEmbedUrl`,
      issues,
    );
    const consentRequired = booleanValue(
      item.consentRequired,
      `${itemPath}.consentRequired`,
      issues,
    );
    if (externalEmbedUrl !== null && !consentRequired)
      issue(
        issues,
        `${itemPath}.consentRequired`,
        "consent-required",
        "External video embeds require consent.",
      );
    return {
      videoKey: stableKey(item.videoKey, `${itemPath}.videoKey`, issues),
      title: text(item.title, `${itemPath}.title`, issues, { max: 240 }),
      summary: text(item.summary, `${itemPath}.summary`, issues, {
        max: 4_000,
        empty: true,
      }),
      mediaKey,
      transcript: nullableText(
        item.transcript,
        `${itemPath}.transcript`,
        issues,
        100_000,
      ),
      externalEmbedUrl,
      consentRequired,
    };
  });
  unique(courses, (entry) => entry.courseKey, `${path}.courses`, issues);
  unique(videos, (entry) => entry.videoKey, `${path}.videos`, issues);
  return {
    courses: Object.freeze(
      courses.sort((left, right) =>
        left.courseKey.localeCompare(right.courseKey),
      ),
    ),
    videos: Object.freeze(
      videos.sort((left, right) => left.videoKey.localeCompare(right.videoKey)),
    ),
  };
}

function parseSetupBody(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): readonly SetupStructuredTextBlock[] {
  return Object.freeze(
    array(value, path, issues, 128).map((entry, index) => {
      const itemPath = `${path}[${index}]`;
      const item = exactObject(entry, ["type", "text"], itemPath, issues);
      return Object.freeze({
        type: literal(
          item.type,
          ["heading", "paragraph", "quote"] as const,
          `${itemPath}.type`,
          issues,
        ),
        text: text(item.text, `${itemPath}.text`, issues, { max: 8_000 }),
      });
    }),
  );
}

function parseEditorialPresentation(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  mediaByKey: ReadonlyMap<string, ApprovedMediaReference>,
): EditorialPresentationTopic {
  const object = exactObject(
    value,
    ["posts", "updates", "about", "pageHeroes"],
    path,
    issues,
  );
  const posts: EditorialPostProposal[] = array(
    object.posts,
    `${path}.posts`,
    issues,
    200,
  ).map((entry, index) => {
    const itemPath = `${path}.posts[${index}]`;
    const item = exactObject(
      entry,
      ["postKey", "title", "excerpt", "body", "publication"],
      itemPath,
      issues,
    );
    const body = parseSetupBody(item.body, `${itemPath}.body`, issues);
    if (body.length === 0) {
      issue(
        issues,
        `${itemPath}.body`,
        "editorial-body-required",
        "Every editorial post needs at least one authored text block.",
      );
    }
    return {
      postKey: stableKey(item.postKey, `${itemPath}.postKey`, issues),
      title: text(item.title, `${itemPath}.title`, issues, { max: 160 }),
      excerpt: text(item.excerpt, `${itemPath}.excerpt`, issues, {
        max: 2_000,
        empty: true,
      }),
      body,
      publication: literal(
        item.publication,
        ["draft", "publish"] as const,
        `${itemPath}.publication`,
        issues,
      ),
    };
  });
  const updates: UpdateEntryProposal[] = array(
    object.updates,
    `${path}.updates`,
    issues,
    200,
  ).map((entry, index) => {
    const itemPath = `${path}.updates[${index}]`;
    const item = exactObject(
      entry,
      ["updateKey", "title", "summary", "body", "audience", "publication"],
      itemPath,
      issues,
    );
    const body = parseSetupBody(item.body, `${itemPath}.body`, issues);
    if (body.length === 0) {
      issue(
        issues,
        `${itemPath}.body`,
        "update-body-required",
        "Every What's New entry needs at least one authored text block.",
      );
    }
    return {
      updateKey: stableKey(item.updateKey, `${itemPath}.updateKey`, issues),
      title: text(item.title, `${itemPath}.title`, issues, { max: 160 }),
      summary: text(item.summary, `${itemPath}.summary`, issues, {
        max: 2_000,
        empty: true,
      }),
      body,
      audience: literal(
        item.audience,
        ["public", "account"] as const,
        `${itemPath}.audience`,
        issues,
      ),
      publication: literal(
        item.publication,
        ["draft", "publish"] as const,
        `${itemPath}.publication`,
        issues,
      ),
    };
  });
  const aboutObject = exactObject(
    object.about,
    ["title", "introduction", "bodyText", "publication"],
    `${path}.about`,
    issues,
  );
  const pageHeroes = array(
    object.pageHeroes,
    `${path}.pageHeroes`,
    issues,
    PAGE_HERO_KEYS.length,
  ).map((entry, index) => {
    const itemPath = `${path}.pageHeroes[${index}]`;
    const item = exactObject(
      entry,
      ["pageKey", "mediaKey", "altText"],
      itemPath,
      issues,
    );
    const mediaKey = stableKey(item.mediaKey, `${itemPath}.mediaKey`, issues);
    const media = mediaByKey.get(mediaKey);
    if (
      !media ||
      (media.kind !== "image" && media.kind !== "artwork") ||
      media.rights !== "confirmed"
    ) {
      issue(
        issues,
        `${itemPath}.mediaKey`,
        "page-hero-media-invalid",
        "Page hero media must reference one confirmed image in rights and media.",
      );
    }
    return {
      pageKey: literal(
        item.pageKey,
        PAGE_HERO_KEYS,
        `${itemPath}.pageKey`,
        issues,
      ),
      mediaKey,
      altText: text(item.altText, `${itemPath}.altText`, issues, { max: 500 }),
    };
  });
  unique(posts, (entry) => entry.postKey, `${path}.posts`, issues);
  unique(updates, (entry) => entry.updateKey, `${path}.updates`, issues);
  unique(pageHeroes, (entry) => entry.pageKey, `${path}.pageHeroes`, issues);
  return {
    posts: Object.freeze(
      posts.sort((left, right) => left.postKey.localeCompare(right.postKey)),
    ),
    updates: Object.freeze(
      updates.sort((left, right) =>
        left.updateKey.localeCompare(right.updateKey),
      ),
    ),
    about: Object.freeze({
      title: text(aboutObject.title, `${path}.about.title`, issues, {
        max: 240,
      }),
      introduction: text(
        aboutObject.introduction,
        `${path}.about.introduction`,
        issues,
        { max: 4_000 },
      ),
      bodyText: text(aboutObject.bodyText, `${path}.about.bodyText`, issues, {
        max: 100_000,
        empty: true,
      }),
      publication: literal(
        aboutObject.publication,
        ["draft", "publish"] as const,
        `${path}.about.publication`,
        issues,
      ),
    }),
    pageHeroes: Object.freeze(
      pageHeroes.sort((left, right) =>
        left.pageKey.localeCompare(right.pageKey),
      ),
    ),
  };
}

function parseContact(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): ContactConsentTopic {
  const object = exactObject(
    value,
    ["enabled", "publicEmail", "invitation", "consentText", "categories"],
    path,
    issues,
  );
  const enabled = booleanValue(object.enabled, `${path}.enabled`, issues);
  const categories = array(
    object.categories,
    `${path}.categories`,
    issues,
    50,
  ).map((entry, index) =>
    text(entry, `${path}.categories[${index}]`, issues, { max: 80 }),
  );
  unique(categories, (entry) => entry, `${path}.categories`, issues);
  const consentText = text(object.consentText, `${path}.consentText`, issues, {
    max: 4_000,
    empty: !enabled,
  });
  if (enabled && consentText.length === 0)
    issue(
      issues,
      `${path}.consentText`,
      "consent-required",
      "Enabled contact requires consent language.",
    );
  return {
    enabled,
    publicEmail: nullableEmail(
      object.publicEmail,
      `${path}.publicEmail`,
      issues,
    ),
    invitation: text(object.invitation, `${path}.invitation`, issues, {
      max: 2_000,
      empty: !enabled,
    }),
    consentText,
    categories: Object.freeze([...categories].sort()),
  };
}

function parseTelemetry(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): TelemetryRetentionTopic {
  const object = exactObject(
    value,
    [
      "enabled",
      "collectionMode",
      "retentionDays",
      "meaningfulListenSeconds",
      "firstPartyOnly",
    ],
    path,
    issues,
  );
  const enabled = booleanValue(object.enabled, `${path}.enabled`, issues);
  const collectionMode = literal(
    object.collectionMode,
    ["disabled", "consent-required"] as const,
    `${path}.collectionMode`,
    issues,
  );
  if (enabled && collectionMode === "disabled")
    issue(
      issues,
      `${path}.collectionMode`,
      "telemetry-mode",
      "Enabled telemetry uses consent-required collection.",
    );
  if (!enabled && collectionMode !== "disabled")
    issue(
      issues,
      `${path}.collectionMode`,
      "telemetry-mode",
      "Inactive telemetry uses disabled collection.",
    );
  if (object.firstPartyOnly !== true)
    issue(
      issues,
      `${path}.firstPartyOnly`,
      "first-party-required",
      "Telemetry must remain first-party only.",
    );
  return {
    enabled,
    collectionMode,
    retentionDays: integer(
      object.retentionDays,
      `${path}.retentionDays`,
      issues,
      1,
      365,
    ),
    meaningfulListenSeconds: integer(
      object.meaningfulListenSeconds,
      `${path}.meaningfulListenSeconds`,
      issues,
      1,
      3_600,
    ),
    firstPartyOnly: true,
  };
}

function parseLegalDraft(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): LegalDraftProposal {
  const object = exactObject(value, ["title", "body", "action"], path, issues);
  return {
    title: text(object.title, `${path}.title`, issues, { max: 240 }),
    body: text(object.body, `${path}.body`, issues, { max: 100_000 }),
    action: literal(
      object.action,
      ["save-draft"] as const,
      `${path}.action`,
      issues,
    ),
  };
}

function parsePrivacyTerms(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): PrivacyTermsTopic {
  const object = exactObject(
    value,
    ["privacy", "terms", "artistReviewRequired"],
    path,
    issues,
  );
  if (object.artistReviewRequired !== true)
    issue(
      issues,
      `${path}.artistReviewRequired`,
      "artist-review-required",
      "Legal documents require artist review.",
    );
  return {
    privacy: parseLegalDraft(object.privacy, `${path}.privacy`, issues),
    terms: parseLegalDraft(object.terms, `${path}.terms`, issues),
    artistReviewRequired: true,
  };
}

function parsePublication(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): PublicationIntent {
  const object = exactObject(
    value,
    ["artist", "navigation", "catalog", "content", "media"],
    path,
    issues,
  );
  return {
    artist: literal(
      object.artist,
      ["draft", "publish"] as const,
      `${path}.artist`,
      issues,
    ),
    navigation: literal(
      object.navigation,
      ["draft", "publish"] as const,
      `${path}.navigation`,
      issues,
    ),
    catalog: literal(
      object.catalog,
      ["draft", "publish"] as const,
      `${path}.catalog`,
      issues,
    ),
    content: literal(
      object.content,
      ["draft", "publish"] as const,
      `${path}.content`,
      issues,
    ),
    media: literal(
      object.media,
      ["prepare-only", "publish-approved"] as const,
      `${path}.media`,
      issues,
    ),
  };
}

function parseAccountsPublication(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): AccountsPublicationTopic {
  const object = exactObject(
    value,
    [
      "ownerStrategy",
      "ownerAcknowledgement",
      "editorAccountAliases",
      "publication",
      "externalPublication",
    ],
    path,
    issues,
  );
  const editorAccountAliases: EditorAccountProposal[] = array(
    object.editorAccountAliases,
    `${path}.editorAccountAliases`,
    issues,
  ).map((entry, index) => {
    const itemPath = `${path}.editorAccountAliases[${index}]`;
    const item = exactObject(
      entry,
      ["email", "displayName", "permissionKey", "scopeId"],
      itemPath,
      issues,
    );
    const scopeId =
      item.scopeId === "*"
        ? "*"
        : stableKey(item.scopeId, `${itemPath}.scopeId`, issues);
    return {
      email: requiredEmail(item.email, `${itemPath}.email`, issues),
      displayName: text(item.displayName, `${itemPath}.displayName`, issues, {
        max: 160,
      }),
      permissionKey: literal(
        item.permissionKey,
        ["pages.write", "catalog.write", "media.write"] as const,
        `${itemPath}.permissionKey`,
        issues,
      ),
      scopeId,
    };
  });
  unique(
    editorAccountAliases,
    (entry) =>
      `${entry.email.toLowerCase()}\n${entry.permissionKey}\n${entry.scopeId}`,
    `${path}.editorAccountAliases`,
    issues,
  );

  return {
    ownerStrategy: literal(
      object.ownerStrategy,
      ["authenticated-requester"] as const,
      `${path}.ownerStrategy`,
      issues,
    ),
    ownerAcknowledgement: literal(
      object.ownerAcknowledgement,
      ["pending", "artist-authorized"] as const,
      `${path}.ownerAcknowledgement`,
      issues,
    ),
    editorAccountAliases: Object.freeze(
      editorAccountAliases.sort((left, right) =>
        `${left.email.toLowerCase()}\n${left.permissionKey}\n${left.scopeId}`.localeCompare(
          `${right.email.toLowerCase()}\n${right.permissionKey}\n${right.scopeId}`,
        ),
      ),
    ),
    publication: parsePublication(
      object.publication,
      `${path}.publication`,
      issues,
    ),
    externalPublication: literal(
      object.externalPublication,
      ["approval-required"] as const,
      `${path}.externalPublication`,
      issues,
    ),
  };
}

function parseCommerce(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): SetupCommerceContract {
  const object = exactObject(
    value,
    ["adapter", "stripeEnvironment", "livemode", "journey", "statement"],
    path,
    issues,
  );
  if (object.adapter !== SITES_SETUP_COMMERCE_ADAPTER)
    issue(
      issues,
      `${path}.adapter`,
      "commerce-adapter",
      "Sites commerce is permanently stripe-test-simulation.",
    );
  if (object.stripeEnvironment !== "test")
    issue(
      issues,
      `${path}.stripeEnvironment`,
      "stripe-environment",
      "The Sites Stripe environment must be test.",
    );
  if (object.livemode !== false)
    issue(
      issues,
      `${path}.livemode`,
      "live-mode-rejected",
      "Live mode is disabled for Sites.",
    );
  if (object.statement !== NO_REAL_PAYMENT_STATEMENT)
    issue(
      issues,
      `${path}.statement`,
      "test-mode-statement",
      `Use the exact statement: ${NO_REAL_PAYMENT_STATEMENT}`,
    );
  return {
    adapter: SITES_SETUP_COMMERCE_ADAPTER,
    stripeEnvironment: "test",
    livemode: false,
    journey: literal(
      object.journey,
      ["inactive", "active"] as const,
      `${path}.journey`,
      issues,
    ),
    statement: NO_REAL_PAYMENT_STATEMENT,
  };
}

function parseMediaActions(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  mediaByKey: ReadonlyMap<string, ApprovedMediaReference>,
): readonly MediaActionProposal[] {
  const actions: MediaActionProposal[] = array(value, path, issues).map(
    (entry, index) => {
      const itemPath = `${path}[${index}]`;
      const item = exactObject(
        entry,
        [
          "actionId",
          "mediaKey",
          "sourceAlias",
          "operation",
          "derivatives",
          "requiresArtistApproval",
        ],
        itemPath,
        issues,
      );
      const mediaKey = stableKey(item.mediaKey, `${itemPath}.mediaKey`, issues);
      const sourceAlias = stableKey(
        item.sourceAlias,
        `${itemPath}.sourceAlias`,
        issues,
      );
      const operation = literal(
        item.operation,
        ["inspect-and-prepare", "publish-approved"] as const,
        `${itemPath}.operation`,
        issues,
      );
      const derivatives = array(
        item.derivatives,
        `${itemPath}.derivatives`,
        issues,
        6,
      ).map((derivative, derivativeIndex) =>
        literal(
          derivative,
          [
            "stream",
            "download",
            "waveform",
            "artwork",
            "poster",
            "thumbnail",
            "transcript",
          ] as const,
          `${itemPath}.derivatives[${derivativeIndex}]`,
          issues,
        ),
      );
      unique(
        derivatives,
        (derivative) => derivative,
        `${itemPath}.derivatives`,
        issues,
      );
      if (item.requiresArtistApproval !== true)
        issue(
          issues,
          `${itemPath}.requiresArtistApproval`,
          "artist-approval-required",
          "Media actions require artist approval.",
        );
      const media = mediaByKey.get(mediaKey);
      if (!media || media.sourceAlias !== sourceAlias)
        issue(
          issues,
          itemPath,
          "missing-media",
          "Media actions must reference one approved alias in rights and media.",
        );
      if (operation === "publish-approved" && media?.rights !== "confirmed")
        issue(
          issues,
          itemPath,
          "rights-confirmation-required",
          "Publishing media requires confirmed rights.",
        );
      return {
        actionId: stableKey(item.actionId, `${itemPath}.actionId`, issues),
        mediaKey,
        sourceAlias,
        operation,
        derivatives: Object.freeze([...derivatives].sort()),
        requiresArtistApproval: true,
      };
    },
  );
  unique(actions, (action) => action.actionId, path, issues);
  return Object.freeze(
    actions.sort((left, right) => left.actionId.localeCompare(right.actionId)),
  );
}

function parseSourceChanges(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): readonly SourceChangeProposal[] {
  const changes: SourceChangeProposal[] = array(value, path, issues, 100).map(
    (entry, index) => {
      const itemPath = `${path}[${index}]`;
      const item = exactObject(
        entry,
        ["changeId", "scope", "summary", "requestedByArtist"],
        itemPath,
        issues,
      );
      if (item.requestedByArtist !== true)
        issue(
          issues,
          `${itemPath}.requestedByArtist`,
          "artist-request-required",
          "Source changes must be requested by the artist.",
        );
      return {
        changeId: stableKey(item.changeId, `${itemPath}.changeId`, issues),
        scope: literal(
          item.scope,
          [
            "visual-system",
            "page-structure",
            "navigation",
            "nomenclature",
            "module-code",
            "new-capability",
          ] as const,
          `${itemPath}.scope`,
          issues,
        ),
        summary: text(item.summary, `${itemPath}.summary`, issues, {
          max: 2_000,
        }),
        requestedByArtist: true,
      };
    },
  );
  unique(changes, (change) => change.changeId, path, issues);
  return Object.freeze(
    changes.sort((left, right) => left.changeId.localeCompare(right.changeId)),
  );
}

function safeExternalTarget(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
): string {
  const result = text(value, path, issues, { max: 2_048 });
  if (result === "site" || result === "repository") return result;
  if (/^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63}$/i.test(result))
    return result;
  return safeUrl(result, path, issues, false);
}

function parseExternalActions(
  value: unknown,
  path: string,
  issues: SetupValidationIssue[],
  mediaByKey: ReadonlyMap<string, ApprovedMediaReference>,
  mediaActions: readonly MediaActionProposal[],
): readonly ExternalActionProposal[] {
  const actions: ExternalActionProposal[] = array(value, path, issues, 50).map(
    (entry, index) => {
      const itemPath = `${path}[${index}]`;
      const item = exactObject(
        entry,
        ["actionId", "kind", "summary", "target", "approval"],
        itemPath,
        issues,
      );
      if (item.approval !== "michael-action-specific")
        issue(
          issues,
          `${itemPath}.approval`,
          "external-approval-required",
          "External actions require Michael's action-specific approval.",
        );
      const kind = literal(
        item.kind,
        EXTERNAL_ACTION_KINDS,
        `${itemPath}.kind`,
        issues,
      ) as ExternalActionKind;
      const target =
        kind === "public-media-upload"
          ? stableKey(item.target, `${itemPath}.target`, issues)
          : safeExternalTarget(item.target, `${itemPath}.target`, issues);
      if (kind === "public-media-upload") {
        const media = mediaByKey.get(target);
        const hasPublicationAction = mediaActions.some(
          (action) =>
            action.mediaKey === target &&
            action.operation === "publish-approved",
        );
        if (
          !media ||
          media.rights !== "confirmed" ||
          media.intendedUse !== "public" ||
          !hasPublicationAction
        ) {
          issue(
            issues,
            `${itemPath}.target`,
            "public-media-target-mismatch",
            "A public media upload must target the exact confirmed public media item with a publish-approved media action.",
          );
        }
      }
      return {
        actionId: stableKey(item.actionId, `${itemPath}.actionId`, issues),
        kind,
        summary: text(item.summary, `${itemPath}.summary`, issues, {
          max: 2_000,
        }),
        target,
        approval: "michael-action-specific",
      };
    },
  );
  unique(actions, (action) => action.actionId, path, issues);
  return Object.freeze(
    actions.sort((left, right) => left.actionId.localeCompare(right.actionId)),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>))
      deepFreeze(entry);
  }
  return value;
}

export function validateSetupProposal(value: unknown): SetupProposal {
  const issues: SetupValidationIssue[] = [];
  scanForbidden(value, "$", issues);
  const object = exactObject(
    value,
    [
      "schemaVersion",
      "proposalId",
      "createdAt",
      "sourceStateFingerprint",
      "commerce",
      "topics",
      "mediaActions",
      "sourceChanges",
      "externalActions",
    ],
    "$",
    issues,
  );
  if (object.schemaVersion !== SETUP_PROPOSAL_SCHEMA_VERSION)
    issue(
      issues,
      "$.schemaVersion",
      "schema-version",
      `Use ${SETUP_PROPOSAL_SCHEMA_VERSION}.`,
    );
  const proposalId = stableKey(object.proposalId, "$.proposalId", issues);
  const createdAt = validateIsoInstant(object.createdAt, "$.createdAt", issues);
  if (!isSha256(object.sourceStateFingerprint))
    issue(
      issues,
      "$.sourceStateFingerprint",
      "source-fingerprint",
      "Use a canonical sha256 fingerprint from the current server-owned source state.",
    );
  const topicsObject = exactObject(
    object.topics,
    [
      "artist",
      "capabilitiesNavigation",
      "rightsMedia",
      "catalogReleases",
      "streamingDownloads",
      "customerAccess",
      "membershipsSubscriptions",
      "credits",
      "licensing",
      "coursesVideo",
      "editorialPresentation",
      "contactConsent",
      "telemetryRetention",
      "privacyTerms",
      "accountsPublication",
    ],
    "$.topics",
    issues,
  );

  const artist = parseArtist(topicsObject.artist, "$.topics.artist", issues);
  const capabilitiesNavigation = parseCapabilities(
    topicsObject.capabilitiesNavigation,
    "$.topics.capabilitiesNavigation",
    issues,
  );
  const rightsMedia = parseRightsMedia(
    topicsObject.rightsMedia,
    "$.topics.rightsMedia",
    issues,
  );
  const mediaByKey = new Map(
    rightsMedia.media.map((entry) => [entry.mediaKey, entry]),
  );
  const catalogReleases = parseCatalog(
    topicsObject.catalogReleases,
    "$.topics.catalogReleases",
    issues,
    new Set(mediaByKey.keys()),
  );
  const trackKeys = new Set(
    catalogReleases.tracks.map((entry) => entry.trackKey),
  );
  const streamingDownloads = parseAvailability(
    topicsObject.streamingDownloads,
    "$.topics.streamingDownloads",
    issues,
    trackKeys,
  );
  const availabilityKeys = new Set(
    streamingDownloads.tracks.map((entry) => entry.trackKey),
  );
  for (const track of catalogReleases.tracks) {
    if (track.mediaKey === null) continue;
    const media = mediaByKey.get(track.mediaKey);
    if (media?.kind !== "audio") {
      issue(
        issues,
        "$.topics.catalogReleases.tracks",
        "track-media-kind",
        "Track media must reference an approved audio source.",
      );
    }
    if (media?.rights !== "confirmed") {
      issue(
        issues,
        "$.topics.catalogReleases.tracks",
        "track-media-rights",
        "Track media rights must be confirmed before binding published media.",
      );
    }
    if (!availabilityKeys.has(track.trackKey)) {
      issue(
        issues,
        "$.topics.streamingDownloads.tracks",
        "track-availability-required",
        "Every catalog media link needs an exact streaming and download availability declaration.",
      );
    }
  }
  const customerAccess = parseAccess(
    topicsObject.customerAccess,
    "$.topics.customerAccess",
    issues,
  );
  const accessPlanKeys = new Set(
    customerAccess.accessPlans.map((entry) => entry.accessPlanKey),
  );
  const membershipsSubscriptions = parseMemberships(
    topicsObject.membershipsSubscriptions,
    "$.topics.membershipsSubscriptions",
    issues,
    accessPlanKeys,
  );
  const membershipPlanKeys = new Set([
    ...membershipsSubscriptions.membershipPlans.map((entry) => entry.planKey),
    ...membershipsSubscriptions.subscriptionPlans.map((entry) => entry.planKey),
  ]);
  const credits = parseCredits(
    topicsObject.credits,
    "$.topics.credits",
    issues,
    membershipPlanKeys,
  );
  const oneTimeMembershipPlanKeys = new Set(
    membershipsSubscriptions.membershipPlans.map((entry) => entry.planKey),
  );
  for (const rule of [
    ...credits.downloadCreditRules,
    ...credits.licenseCreditRules,
  ]) {
    if (
      oneTimeMembershipPlanKeys.has(rule.planKey) &&
      rule.cadence !== "once"
    ) {
      issue(
        issues,
        "$.topics.credits",
        "credit-cadence-mismatch",
        "A one-time membership credit rule must use the once cadence.",
      );
    }
  }
  const subscriptionMembershipByKey = new Map(
    membershipsSubscriptions.subscriptionPlans.map((entry) => [
      entry.planKey,
      entry.membershipPlanKey,
    ]),
  );
  for (const rules of [
    credits.downloadCreditRules,
    credits.licenseCreditRules,
  ]) {
    const byPlan = new Map(rules.map((rule) => [rule.planKey, rule]));
    for (const rule of rules) {
      const membershipPlanKey = subscriptionMembershipByKey.get(rule.planKey);
      if (!membershipPlanKey) continue;
      const membershipRule = byPlan.get(membershipPlanKey);
      if (!membershipRule || membershipRule.amount !== rule.amount) {
        issue(
          issues,
          "$.topics.credits",
          "subscription-credit-benefit-mismatch",
          "A subscription credit rule must match the exact one-time credit benefit on its membership revision.",
        );
      }
    }
  }
  const licensing = parseLicensing(
    topicsObject.licensing,
    "$.topics.licensing",
    issues,
    trackKeys,
  );
  const coursesVideo = parseCoursesVideo(
    topicsObject.coursesVideo,
    "$.topics.coursesVideo",
    issues,
    new Set(mediaByKey.keys()),
    accessPlanKeys,
  );
  const editorialPresentation = parseEditorialPresentation(
    topicsObject.editorialPresentation,
    "$.topics.editorialPresentation",
    issues,
    mediaByKey,
  );
  for (const course of coursesVideo.courses) {
    for (const lesson of course.lessons) {
      for (const mediaKey of lesson.mediaKeys) {
        if (mediaByKey.get(mediaKey)?.rights !== "confirmed") {
          issue(
            issues,
            "$.topics.coursesVideo.courses",
            "course-media-rights",
            "Course media rights must be confirmed before binding published media.",
          );
        }
      }
    }
  }
  for (const video of coursesVideo.videos) {
    if (video.mediaKey !== null && video.transcript === null) {
      issue(
        issues,
        "$.topics.coursesVideo.videos",
        "video-transcript-required",
        "Every artist-hosted video needs an artist-approved transcript.",
      );
    }
    if (video.mediaKey !== null) {
      const media = mediaByKey.get(video.mediaKey);
      if (media?.kind !== "video") {
        issue(
          issues,
          "$.topics.coursesVideo.videos",
          "video-media-kind",
          "Artist-hosted video must reference an approved video source.",
        );
      }
      if (media?.rights !== "confirmed") {
        issue(
          issues,
          "$.topics.coursesVideo.videos",
          "video-media-rights",
          "Artist-hosted video rights must be confirmed before binding published media.",
        );
      }
      if (video.externalEmbedUrl !== null || video.consentRequired) {
        issue(
          issues,
          "$.topics.coursesVideo.videos",
          "hosted-video-shape",
          "Artist-hosted video uses its approved media key without an external embed or external consent gate.",
        );
      }
    } else if (video.externalEmbedUrl === null || !video.consentRequired) {
      issue(
        issues,
        "$.topics.coursesVideo.videos",
        "external-video-shape",
        "External video requires a consent-gated HTTPS embed URL.",
      );
    }
  }
  const contactConsent = parseContact(
    topicsObject.contactConsent,
    "$.topics.contactConsent",
    issues,
  );
  const telemetryRetention = parseTelemetry(
    topicsObject.telemetryRetention,
    "$.topics.telemetryRetention",
    issues,
  );
  const privacyTerms = parsePrivacyTerms(
    topicsObject.privacyTerms,
    "$.topics.privacyTerms",
    issues,
  );
  const accountsPublication = parseAccountsPublication(
    topicsObject.accountsPublication,
    "$.topics.accountsPublication",
    issues,
  );
  if (
    accountsPublication.publication.content !== "publish" &&
    (editorialPresentation.posts.some(
      ({ publication }) => publication === "publish",
    ) ||
      editorialPresentation.updates.some(
        ({ publication }) => publication === "publish",
      ) ||
      editorialPresentation.about.publication === "publish")
  ) {
    issue(
      issues,
      "$.topics.accountsPublication.publication.content",
      "editorial-publication-mismatch",
      "Publishing editorial content requires the approved content publication intent.",
    );
  }
  const commerce = parseCommerce(object.commerce, "$.commerce", issues);
  const activeModules = new Set(capabilitiesNavigation.activeModules);
  const heroModule = new Map([
    ["courses", "courses"],
    ["videos", "video"],
    ["membership", "memberships"],
    ["licensing", "licensing"],
  ] as const);
  for (const hero of editorialPresentation.pageHeroes) {
    const moduleKey = heroModule.get(hero.pageKey);
    if (moduleKey && !activeModules.has(moduleKey)) {
      issue(
        issues,
        "$.topics.editorialPresentation.pageHeroes",
        "inactive-page-hero",
        `Activate ${moduleKey} before assigning its page hero.`,
      );
    }
  }

  const moduleFacts: readonly [boolean, ModuleKey, string][] = [
    [
      customerAccess.customerLibraries,
      "customer-library",
      "customer libraries",
    ],
    [
      streamingDownloads.tracks.some((entry) => entry.download !== "disabled"),
      "downloads",
      "downloads",
    ],
    [
      membershipsSubscriptions.membershipPlans.length > 0,
      "memberships",
      "membership plans",
    ],
    [
      membershipsSubscriptions.subscriptionPlans.length > 0,
      "subscriptions",
      "subscription plans",
    ],
    [licensing.options.length > 0, "licensing", "license options"],
    [coursesVideo.courses.length > 0, "courses", "Courses"],
    [coursesVideo.videos.length > 0, "video", "video"],
    [
      editorialPresentation.posts.length > 0 ||
        editorialPresentation.updates.length > 0,
      "whats-new",
      "editorial posts and What's New entries",
    ],
    [contactConsent.enabled, "contact", "contact"],
    [telemetryRetention.enabled, "telemetry", "telemetry"],
  ];
  for (const [present, module, label] of moduleFacts) {
    if (present && !activeModules.has(module))
      issue(
        issues,
        "$.topics.capabilitiesNavigation.activeModules",
        "inactive-module-content",
        `Activate ${module} before proposing ${label}.`,
      );
  }
  if (
    commerce.journey === "active" &&
    !["downloads", "licensing", "memberships", "subscriptions"].some((key) =>
      activeModules.has(key as ModuleKey),
    )
  ) {
    issue(
      issues,
      "$.commerce.journey",
      "commerce-module-required",
      "An active simulated commerce journey requires downloads, licensing, memberships, or subscriptions.",
    );
  }

  const topics: SetupTopics = {
    artist,
    capabilitiesNavigation,
    rightsMedia,
    catalogReleases,
    streamingDownloads,
    customerAccess,
    membershipsSubscriptions,
    credits,
    licensing,
    coursesVideo,
    editorialPresentation,
    contactConsent,
    telemetryRetention,
    privacyTerms,
    accountsPublication,
  };
  const mediaActions = parseMediaActions(
    object.mediaActions,
    "$.mediaActions",
    issues,
    mediaByKey,
  );
  if (
    accountsPublication.publication.media === "publish-approved" &&
    mediaActions.some((action) => action.operation !== "publish-approved")
  ) {
    issue(
      issues,
      "$.topics.accountsPublication.publication.media",
      "media-publication-mismatch",
      "Publishing media requires publish-approved media actions.",
    );
  }
  const sourceChanges = parseSourceChanges(
    object.sourceChanges,
    "$.sourceChanges",
    issues,
  );
  const externalActions = parseExternalActions(
    object.externalActions,
    "$.externalActions",
    issues,
    mediaByKey,
    mediaActions,
  );

  if (issues.length > 0) {
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      `The setup proposal has ${issues.length} validation issue${issues.length === 1 ? "" : "s"}.`,
      issues,
    );
  }

  return deepFreeze({
    schemaVersion: SETUP_PROPOSAL_SCHEMA_VERSION,
    proposalId,
    createdAt,
    sourceStateFingerprint: object.sourceStateFingerprint as string,
    commerce,
    topics,
    mediaActions,
    sourceChanges,
    externalActions,
  });
}
