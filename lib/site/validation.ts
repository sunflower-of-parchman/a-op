import { isModuleKey, type ModuleKey } from "../modules/index.ts";
import {
  isEditorPermissionKey,
  type EditorPermissionKey,
} from "../auth/editor-permissions.ts";

export const SITE_INPUT_LIMITS = Object.freeze({
  displayName: 120,
  siteTitle: 120,
  headline: 240,
  introduction: 2_000,
  footerText: 1_000,
  navigationItemsPerSet: 32,
  navigationItemKey: 64,
  navigationLabel: 80,
  navigationHref: 2_048,
  navigationPosition: 999,
  slug: 80,
  pageTitle: 160,
  pageIntroduction: 2_000,
  pageBodyText: 50_000,
  pageSections: 32,
  moduleSettingsBytes: 8_192,
  moduleSettingsDepth: 8,
  moduleSettingsEntries: 256,
  moduleSettingsKey: 64,
  email: 254,
  idempotencyKeyMin: 8,
  idempotencyKeyMax: 128,
} as const);

export const SITE_VALIDATION_ISSUE_CODES = Object.freeze({
  INPUT_OBJECT_REQUIRED: "site-input-object-required",
  INPUT_LIST_REQUIRED: "site-input-list-required",
  FIELD_REQUIRED: "site-field-required",
  FIELD_TYPE_INVALID: "site-field-type-invalid",
  FIELD_TOO_LONG: "site-field-too-long",
  FIELD_VALUE_INVALID: "site-field-value-invalid",
  SLUG_INVALID: "site-slug-invalid",
  MODULE_KEY_INVALID: "site-module-key-invalid",
  NAVIGATION_SET_DUPLICATE: "site-navigation-set-duplicate",
  NAVIGATION_SET_MISSING: "site-navigation-set-missing",
  NAVIGATION_ITEM_KEY_DUPLICATE: "site-navigation-item-key-duplicate",
  NAVIGATION_POSITION_DUPLICATE: "site-navigation-position-duplicate",
  NAVIGATION_MUSIC_REQUIRED: "site-navigation-music-required",
  NAVIGATION_INTERNAL_HREF_INVALID: "site-navigation-internal-href-invalid",
  NAVIGATION_EXTERNAL_HREF_INVALID: "site-navigation-external-href-invalid",
  SETTINGS_JSON_INVALID: "site-settings-json-invalid",
  SETTINGS_OBJECT_REQUIRED: "site-settings-object-required",
  SETTINGS_LIMIT_EXCEEDED: "site-settings-limit-exceeded",
  EMAIL_INVALID: "site-email-invalid",
  EDITOR_PERMISSION_INVALID: "site-editor-permission-invalid",
  EDITOR_SCOPE_INVALID: "site-editor-scope-invalid",
  IDEMPOTENCY_KEY_INVALID: "site-idempotency-key-invalid",
} as const);

export type SiteValidationIssueCode =
  (typeof SITE_VALIDATION_ISSUE_CODES)[keyof typeof SITE_VALIDATION_ISSUE_CODES];

export interface SiteValidationIssue {
  readonly code: SiteValidationIssueCode;
  readonly field: string;
  readonly message: string;
}

export interface ValidSiteInput<T> {
  readonly ok: true;
  readonly value: T;
}

export interface InvalidSiteInput {
  readonly ok: false;
  readonly issues: readonly SiteValidationIssue[];
}

export type SiteValidationResult<T> = ValidSiteInput<T> | InvalidSiteInput;

export interface ArtistRevisionInput {
  readonly displayName: string;
  readonly siteTitle: string;
  readonly headline: string;
  readonly introduction: string;
  readonly footerText: string;
}

export type NavigationSetId = "primary" | "footer";

export interface NavigationItemInput {
  readonly itemKey: string;
  readonly label: string;
  readonly href: string;
  readonly position: number;
  readonly moduleKey: ModuleKey | null;
  readonly external: boolean;
}

export interface NavigationSetInput {
  readonly id: NavigationSetId;
  readonly items: readonly NavigationItemInput[];
}

export type NavigationSnapshotInput = readonly [
  NavigationSetInput,
  NavigationSetInput,
];

export type PageKind = "standard" | "legal" | "system";

export interface PageDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
  readonly sectionRevisionIds: readonly string[];
  readonly moduleKey: ModuleKey | null;
  readonly kind: PageKind;
}

export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
export type ModuleSettingsInput = JsonObject;

export interface EditorAssignmentInput {
  readonly email: string;
  readonly displayName: string;
  readonly permissionKey: EditorPermissionKey;
  readonly scopeId: "*" | string;
}

export interface IdempotencyInput {
  readonly idempotencyKey: string;
}

const NAVIGATION_SET_IDS = Object.freeze([
  "primary",
  "footer",
] as const satisfies readonly NavigationSetId[]);
const PAGE_KINDS = new Set<PageKind>(["standard", "legal", "system"]);
const ITEM_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  code: SiteValidationIssueCode,
  field: string,
  message: string,
): SiteValidationIssue {
  return Object.freeze({ code, field, message });
}

function invalid(issues: readonly SiteValidationIssue[]): InvalidSiteInput {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([...issues]),
  });
}

function valid<T>(value: T): ValidSiteInput<T> {
  return Object.freeze({ ok: true, value });
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function readText(
  record: Record<string, unknown>,
  field: string,
  limit: number,
  issues: SiteValidationIssue[],
  options: {
    readonly allowEmpty?: boolean;
    readonly issueField?: string;
  } = {},
): string | null {
  const candidate = record[field];
  const issueField = options.issueField ?? field;
  if (typeof candidate !== "string") {
    issues.push(
      issue(
        candidate === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        issueField,
        candidate === undefined
          ? `Field "${issueField}" is required.`
          : `Field "${issueField}" must be a string.`,
      ),
    );
    return null;
  }

  const normalized = normalizeLineEndings(candidate);
  if (!options.allowEmpty && normalized.length === 0) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED,
        issueField,
        `Field "${issueField}" is required.`,
      ),
    );
    return null;
  }

  if (normalized.length > limit) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.FIELD_TOO_LONG,
        issueField,
        `Field "${issueField}" must contain at most ${limit} characters.`,
      ),
    );
    return null;
  }

  return normalized;
}

function normalizeSlug(candidate: string): string {
  return candidate.trim().toLowerCase();
}

function readSlug(
  value: unknown,
  field: string,
  issues: SiteValidationIssue[],
  issueCode: SiteValidationIssueCode = SITE_VALIDATION_ISSUE_CODES.SLUG_INVALID,
): string | null {
  if (typeof value !== "string") {
    issues.push(
      issue(
        value === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        field,
        value === undefined
          ? `Field "${field}" is required.`
          : `Field "${field}" must be a string.`,
      ),
    );
    return null;
  }

  const normalized = normalizeSlug(value);
  if (
    normalized.length === 0 ||
    normalized.length > SITE_INPUT_LIMITS.slug ||
    !SLUG_PATTERN.test(normalized)
  ) {
    issues.push(
      issue(
        issueCode,
        field,
        `Field "${field}" must be a lowercase, hyphen-separated slug of at most ${SITE_INPUT_LIMITS.slug} characters.`,
      ),
    );
    return null;
  }

  return normalized;
}

function readModuleKey(
  value: unknown,
  field: string,
  issues: SiteValidationIssue[],
): ModuleKey | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isModuleKey(value)) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.MODULE_KEY_INVALID,
        field,
        `Field "${field}" must be null or a supported optional module key.`,
      ),
    );
    return null;
  }
  return value;
}

export function validateArtistRevisionInput(
  input: unknown,
): SiteValidationResult<ArtistRevisionInput> {
  if (!isPlainRecord(input)) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.INPUT_OBJECT_REQUIRED,
        "artist",
        "Artist revision input must be an object.",
      ),
    ]);
  }

  const issues: SiteValidationIssue[] = [];
  const displayName = readText(
    input,
    "displayName",
    SITE_INPUT_LIMITS.displayName,
    issues,
  );
  const siteTitle = readText(
    input,
    "siteTitle",
    SITE_INPUT_LIMITS.siteTitle,
    issues,
  );
  const headline = readText(
    input,
    "headline",
    SITE_INPUT_LIMITS.headline,
    issues,
    { allowEmpty: true },
  );
  const introduction = readText(
    input,
    "introduction",
    SITE_INPUT_LIMITS.introduction,
    issues,
    { allowEmpty: true },
  );
  const footerText = readText(
    input,
    "footerText",
    SITE_INPUT_LIMITS.footerText,
    issues,
    { allowEmpty: true },
  );

  if (issues.length > 0) return invalid(issues);

  return valid(
    Object.freeze({
      displayName: displayName!,
      siteTitle: siteTitle!,
      headline: headline!,
      introduction: introduction!,
      footerText: footerText!,
    }),
  );
}

function readInternalHref(
  candidate: string,
  field: string,
  issues: SiteValidationIssue[],
): string | null {
  const value = candidate.trim();
  const rejectedEncoding = /%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i;
  const containsUnsafeCharacters = /[\u0000-\u0020\u007f\\]/;

  if (
    value.length === 0 ||
    value.length > SITE_INPUT_LIMITS.navigationHref ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    containsUnsafeCharacters.test(value) ||
    rejectedEncoding.test(value)
  ) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.NAVIGATION_INTERNAL_HREF_INVALID,
        field,
        `Field "${field}" must be a safe same-site absolute path.`,
      ),
    );
    return null;
  }

  try {
    const rawPath = value.split(/[?#]/, 1)[0];
    const rawSegments = rawPath
      .split("/")
      .map((segment) => decodeURIComponent(segment));
    if (rawSegments.some((segment) => segment === "." || segment === "..")) {
      throw new Error("path traversal");
    }

    const parsed = new URL(value, "https://a-op.invalid");
    if (
      parsed.origin !== "https://a-op.invalid" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      throw new Error("cross-origin path");
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.NAVIGATION_INTERNAL_HREF_INVALID,
        field,
        `Field "${field}" must be a safe same-site absolute path.`,
      ),
    );
    return null;
  }
}

function readExternalHref(
  candidate: string,
  field: string,
  issues: SiteValidationIssue[],
): string | null {
  const value = candidate.trim();
  if (
    value.length === 0 ||
    value.length > SITE_INPUT_LIMITS.navigationHref ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  ) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.NAVIGATION_EXTERNAL_HREF_INVALID,
        field,
        `Field "${field}" must be an absolute HTTPS URL.`,
      ),
    );
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.length === 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      throw new Error("unsafe external URL");
    }
    return parsed.href;
  } catch {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.NAVIGATION_EXTERNAL_HREF_INVALID,
        field,
        `Field "${field}" must be an absolute HTTPS URL.`,
      ),
    );
    return null;
  }
}

function readNavigationItem(
  value: unknown,
  field: string,
  issues: SiteValidationIssue[],
): NavigationItemInput | null {
  if (!isPlainRecord(value)) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.INPUT_OBJECT_REQUIRED,
        field,
        `Field "${field}" must be a navigation item object.`,
      ),
    );
    return null;
  }

  const itemIssuesBefore = issues.length;
  const rawItemKey = readText(
    value,
    "itemKey",
    SITE_INPUT_LIMITS.navigationItemKey,
    issues,
    { issueField: `${field}.itemKey` },
  );
  let itemKey: string | null = null;
  if (rawItemKey !== null) {
    itemKey = rawItemKey.toLowerCase();
    if (!ITEM_KEY_PATTERN.test(itemKey)) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
          `${field}.itemKey`,
          `Field "${field}.itemKey" must use lowercase letters, numbers, dots, hyphens, or underscores.`,
        ),
      );
      itemKey = null;
    }
  }

  const label = readText(
    value,
    "label",
    SITE_INPUT_LIMITS.navigationLabel,
    issues,
    { issueField: `${field}.label` },
  );

  let external: boolean | null = null;
  if (typeof value.external !== "boolean") {
    issues.push(
      issue(
        value.external === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        `${field}.external`,
        value.external === undefined
          ? `Field "${field}.external" is required.`
          : `Field "${field}.external" must be a boolean.`,
      ),
    );
  } else {
    external = value.external;
  }

  let href: string | null = null;
  if (typeof value.href !== "string") {
    issues.push(
      issue(
        value.href === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        `${field}.href`,
        value.href === undefined
          ? `Field "${field}.href" is required.`
          : `Field "${field}.href" must be a string.`,
      ),
    );
  } else if (external !== null) {
    href = external
      ? readExternalHref(value.href, `${field}.href`, issues)
      : readInternalHref(value.href, `${field}.href`, issues);
  }

  let position: number | null = null;
  if (
    typeof value.position !== "number" ||
    !Number.isSafeInteger(value.position)
  ) {
    issues.push(
      issue(
        value.position === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        `${field}.position`,
        value.position === undefined
          ? `Field "${field}.position" is required.`
          : `Field "${field}.position" must be an integer.`,
      ),
    );
  } else if (
    value.position < 0 ||
    value.position > SITE_INPUT_LIMITS.navigationPosition
  ) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
        `${field}.position`,
        `Field "${field}.position" must be between 0 and ${SITE_INPUT_LIMITS.navigationPosition}.`,
      ),
    );
  } else {
    position = value.position;
  }

  const moduleKey = readModuleKey(
    value.moduleKey,
    `${field}.moduleKey`,
    issues,
  );

  if (issues.length > itemIssuesBefore) return null;

  return Object.freeze({
    itemKey: itemKey!,
    label: label!,
    href: href!,
    position: position!,
    moduleKey,
    external: external!,
  });
}

export function validateNavigationSnapshotInput(
  input: unknown,
): SiteValidationResult<NavigationSnapshotInput> {
  if (!Array.isArray(input)) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.INPUT_LIST_REQUIRED,
        "navigation",
        "Navigation snapshot input must be an array.",
      ),
    ]);
  }

  const issues: SiteValidationIssue[] = [];
  const sets = new Map<NavigationSetId, NavigationSetInput>();

  input.forEach((candidate, setIndex) => {
    const setField = `navigation[${setIndex}]`;
    if (!isPlainRecord(candidate)) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.INPUT_OBJECT_REQUIRED,
          setField,
          `Field "${setField}" must be a navigation set object.`,
        ),
      );
      return;
    }

    if (candidate.id !== "primary" && candidate.id !== "footer") {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
          `${setField}.id`,
          `Field "${setField}.id" must be "primary" or "footer".`,
        ),
      );
      return;
    }

    const setId = candidate.id;
    if (sets.has(setId)) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.NAVIGATION_SET_DUPLICATE,
          `${setField}.id`,
          `Navigation set "${setId}" may appear only once.`,
        ),
      );
      return;
    }

    if (!Array.isArray(candidate.items)) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.INPUT_LIST_REQUIRED,
          `${setField}.items`,
          `Field "${setField}.items" must be an array.`,
        ),
      );
      return;
    }

    if (candidate.items.length > SITE_INPUT_LIMITS.navigationItemsPerSet) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.FIELD_TOO_LONG,
          `${setField}.items`,
          `Field "${setField}.items" may contain at most ${SITE_INPUT_LIMITS.navigationItemsPerSet} items.`,
        ),
      );
      return;
    }

    const itemKeys = new Set<string>();
    const positions = new Set<number>();
    const items: NavigationItemInput[] = [];

    candidate.items.forEach((itemCandidate, itemIndex) => {
      const itemField = `${setField}.items[${itemIndex}]`;
      const item = readNavigationItem(itemCandidate, itemField, issues);
      if (item === null) return;

      if (itemKeys.has(item.itemKey)) {
        issues.push(
          issue(
            SITE_VALIDATION_ISSUE_CODES.NAVIGATION_ITEM_KEY_DUPLICATE,
            `${itemField}.itemKey`,
            `Navigation item key "${item.itemKey}" may appear only once in set "${setId}".`,
          ),
        );
      } else {
        itemKeys.add(item.itemKey);
      }

      if (positions.has(item.position)) {
        issues.push(
          issue(
            SITE_VALIDATION_ISSUE_CODES.NAVIGATION_POSITION_DUPLICATE,
            `${itemField}.position`,
            `Navigation position ${item.position} may appear only once in set "${setId}".`,
          ),
        );
      } else {
        positions.add(item.position);
      }

      items.push(item);
    });

    const sortedItems = Object.freeze(
      [...items].sort((left, right) => {
        if (left.position !== right.position)
          return left.position - right.position;
        return left.itemKey.localeCompare(right.itemKey);
      }),
    );
    sets.set(setId, Object.freeze({ id: setId, items: sortedItems }));
  });

  for (const setId of NAVIGATION_SET_IDS) {
    if (!sets.has(setId)) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.NAVIGATION_SET_MISSING,
          "navigation",
          `Navigation snapshot must include the "${setId}" set.`,
        ),
      );
    }
  }

  const primary = sets.get("primary");
  if (
    primary !== undefined &&
    !primary.items.some(
      (item) => item.external === false && item.href === "/music",
    )
  ) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.NAVIGATION_MUSIC_REQUIRED,
        "navigation.primary.items",
        'Primary navigation must include the same-site path "/music".',
      ),
    );
  }

  if (issues.length > 0) return invalid(issues);

  return valid(
    Object.freeze([
      sets.get("primary")!,
      sets.get("footer")!,
    ]) as NavigationSnapshotInput,
  );
}

export function validatePageDraftInput(
  input: unknown,
): SiteValidationResult<PageDraftInput> {
  if (!isPlainRecord(input)) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.INPUT_OBJECT_REQUIRED,
        "page",
        "Page draft input must be an object.",
      ),
    ]);
  }

  const issues: SiteValidationIssue[] = [];
  const supportedFields = new Set([
    "slug",
    "title",
    "introduction",
    "bodyText",
    "sectionRevisionIds",
    "moduleKey",
    "kind",
  ]);
  for (const field of Object.keys(input)) {
    if (!supportedFields.has(field)) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
          field,
          `Field "${field}" is not supported.`,
        ),
      );
    }
  }
  const slug = readSlug(input.slug, "slug", issues);
  const title = readText(input, "title", SITE_INPUT_LIMITS.pageTitle, issues);
  const introduction = readText(
    input,
    "introduction",
    SITE_INPUT_LIMITS.pageIntroduction,
    issues,
    { allowEmpty: true },
  );
  const bodyText = readText(
    input,
    "bodyText",
    SITE_INPUT_LIMITS.pageBodyText,
    issues,
    { allowEmpty: true },
  );
  const moduleKey = readModuleKey(input.moduleKey, "moduleKey", issues);
  const sectionRevisionIds: string[] = [];
  const rawSectionRevisionIds = input.sectionRevisionIds ?? [];
  if (
    !Array.isArray(rawSectionRevisionIds) ||
    rawSectionRevisionIds.length > SITE_INPUT_LIMITS.pageSections
  ) {
    issues.push(
      issue(
        Array.isArray(rawSectionRevisionIds)
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_TOO_LONG
          : SITE_VALIDATION_ISSUE_CODES.INPUT_LIST_REQUIRED,
        "sectionRevisionIds",
        `Field "sectionRevisionIds" must be an array of at most ${SITE_INPUT_LIMITS.pageSections} revision IDs.`,
      ),
    );
  } else {
    const seen = new Set<string>();
    for (const [index, value] of rawSectionRevisionIds.entries()) {
      if (typeof value !== "string" || !ITEM_KEY_PATTERN.test(value)) {
        issues.push(
          issue(
            SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
            `sectionRevisionIds[${index}]`,
            "Each content-section revision ID must be a safe application identifier.",
          ),
        );
        continue;
      }
      if (seen.has(value)) {
        issues.push(
          issue(
            SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
            `sectionRevisionIds[${index}]`,
            "Each content-section revision may appear once per page revision.",
          ),
        );
        continue;
      }
      seen.add(value);
      sectionRevisionIds.push(value);
    }
  }

  let kind: PageKind | null = null;
  if (typeof input.kind !== "string") {
    issues.push(
      issue(
        input.kind === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        "kind",
        input.kind === undefined
          ? 'Field "kind" is required.'
          : 'Field "kind" must be a string.',
      ),
    );
  } else if (!PAGE_KINDS.has(input.kind as PageKind)) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.FIELD_VALUE_INVALID,
        "kind",
        'Field "kind" must be "standard", "legal", or "system".',
      ),
    );
  } else {
    kind = input.kind as PageKind;
  }

  if (issues.length > 0) return invalid(issues);

  return valid(
    Object.freeze({
      slug: slug!,
      title: title!,
      introduction: introduction!,
      bodyText: bodyText!,
      sectionRevisionIds: Object.freeze(sectionRevisionIds),
      moduleKey,
      kind: kind!,
    }),
  );
}

interface JsonReadState {
  entries: number;
  readonly stack: WeakSet<object>;
}

function pushJsonIssue(
  issues: SiteValidationIssue[],
  code: SiteValidationIssueCode,
  field: string,
  message: string,
): null {
  issues.push(issue(code, field, message));
  return null;
}

function readJsonValue(
  value: unknown,
  field: string,
  depth: number,
  state: JsonReadState,
  issues: SiteValidationIssue[],
): JsonValue | null {
  if (depth > SITE_INPUT_LIMITS.moduleSettingsDepth) {
    return pushJsonIssue(
      issues,
      SITE_VALIDATION_ISSUE_CODES.SETTINGS_LIMIT_EXCEEDED,
      field,
      `Module settings may be nested at most ${SITE_INPUT_LIMITS.moduleSettingsDepth} levels.`,
    );
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : pushJsonIssue(
          issues,
          SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
          field,
          `Field "${field}" must contain only finite JSON numbers.`,
        );
  }
  if (typeof value !== "object") {
    return pushJsonIssue(
      issues,
      SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
      field,
      `Field "${field}" must contain only JSON values.`,
    );
  }

  if (state.stack.has(value)) {
    return pushJsonIssue(
      issues,
      SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
      field,
      "Module settings must not contain circular references.",
    );
  }
  state.stack.add(value);

  if (Array.isArray(value)) {
    state.entries += value.length;
    if (state.entries > SITE_INPUT_LIMITS.moduleSettingsEntries) {
      state.stack.delete(value);
      return pushJsonIssue(
        issues,
        SITE_VALIDATION_ISSUE_CODES.SETTINGS_LIMIT_EXCEEDED,
        field,
        `Module settings may contain at most ${SITE_INPUT_LIMITS.moduleSettingsEntries} entries.`,
      );
    }

    const result: JsonValue[] = [];
    value.forEach((entry, index) => {
      const parsed = readJsonValue(
        entry,
        `${field}[${index}]`,
        depth + 1,
        state,
        issues,
      );
      if (parsed !== null || entry === null) result.push(parsed);
    });
    state.stack.delete(value);
    return Object.freeze(result);
  }

  if (!isPlainRecord(value)) {
    state.stack.delete(value);
    return pushJsonIssue(
      issues,
      SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
      field,
      `Field "${field}" must contain only plain JSON objects and arrays.`,
    );
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    state.stack.delete(value);
    return pushJsonIssue(
      issues,
      SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
      field,
      `Field "${field}" must contain only string JSON keys.`,
    );
  }

  const keys = (ownKeys as string[]).sort();
  state.entries += keys.length;
  if (state.entries > SITE_INPUT_LIMITS.moduleSettingsEntries) {
    state.stack.delete(value);
    return pushJsonIssue(
      issues,
      SITE_VALIDATION_ISSUE_CODES.SETTINGS_LIMIT_EXCEEDED,
      field,
      `Module settings may contain at most ${SITE_INPUT_LIMITS.moduleSettingsEntries} entries.`,
    );
  }

  const result: Record<string, JsonValue> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      FORBIDDEN_JSON_KEYS.has(key) ||
      key.length === 0 ||
      key.length > SITE_INPUT_LIMITS.moduleSettingsKey ||
      /[\u0000-\u001f\u007f]/.test(key) ||
      descriptor === undefined ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.SETTINGS_JSON_INVALID,
          `${field}.${key}`,
          `Module setting key "${key}" is not safe JSON input.`,
        ),
      );
      continue;
    }

    const parsed = readJsonValue(
      descriptor.value,
      `${field}.${key}`,
      depth + 1,
      state,
      issues,
    );
    if (parsed !== null || descriptor.value === null) result[key] = parsed;
  }

  state.stack.delete(value);
  return Object.freeze(result);
}

export function validateModuleSettingsInput(
  input: unknown,
): SiteValidationResult<ModuleSettingsInput> {
  if (input === undefined) return valid(Object.freeze({}));
  if (!isPlainRecord(input)) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.SETTINGS_OBJECT_REQUIRED,
        "settings",
        "Module settings must be a JSON object when included.",
      ),
    ]);
  }

  const issues: SiteValidationIssue[] = [];
  const parsed = readJsonValue(
    input,
    "settings",
    0,
    { entries: 0, stack: new WeakSet<object>() },
    issues,
  );

  if (issues.length > 0 || parsed === null || Array.isArray(parsed)) {
    return invalid(issues);
  }

  const encoded = JSON.stringify(parsed);
  if (
    new TextEncoder().encode(encoded).byteLength >
    SITE_INPUT_LIMITS.moduleSettingsBytes
  ) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.SETTINGS_LIMIT_EXCEEDED,
        "settings",
        `Module settings must encode to at most ${SITE_INPUT_LIMITS.moduleSettingsBytes} bytes.`,
      ),
    ]);
  }

  return valid(parsed as ModuleSettingsInput);
}

function isValidEmail(value: string): boolean {
  const atIndex = value.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === value.length - 1) return false;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  ) {
    return false;
  }

  if (domain.length > 253 || !domain.includes(".")) return false;
  return domain
    .split(".")
    .every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );
}

export function validateEditorAssignmentInput(
  input: unknown,
): SiteValidationResult<EditorAssignmentInput> {
  if (!isPlainRecord(input)) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.INPUT_OBJECT_REQUIRED,
        "editor",
        "Editor assignment input must be an object.",
      ),
    ]);
  }

  const issues: SiteValidationIssue[] = [];
  let email: string | null = null;
  if (typeof input.email !== "string") {
    issues.push(
      issue(
        input.email === undefined
          ? SITE_VALIDATION_ISSUE_CODES.FIELD_REQUIRED
          : SITE_VALIDATION_ISSUE_CODES.FIELD_TYPE_INVALID,
        "email",
        input.email === undefined
          ? 'Field "email" is required.'
          : 'Field "email" must be a string.',
      ),
    );
  } else {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (
      normalizedEmail.length > SITE_INPUT_LIMITS.email ||
      !isValidEmail(normalizedEmail)
    ) {
      issues.push(
        issue(
          SITE_VALIDATION_ISSUE_CODES.EMAIL_INVALID,
          "email",
          'Field "email" must be a valid email address.',
        ),
      );
    } else {
      email = normalizedEmail;
    }
  }

  const displayName = readText(
    input,
    "displayName",
    SITE_INPUT_LIMITS.displayName,
    issues,
  );

  const permissionKey = input.permissionKey ?? "pages.write";
  if (!isEditorPermissionKey(permissionKey)) {
    issues.push(
      issue(
        SITE_VALIDATION_ISSUE_CODES.EDITOR_PERMISSION_INVALID,
        "permissionKey",
        'Editor permission must be "pages.write", "catalog.write", or "media.write".',
      ),
    );
  }

  let scopeId: string | null = null;
  if (input.scopeId === "*") {
    scopeId = "*";
  } else {
    scopeId = readSlug(
      input.scopeId,
      "scopeId",
      issues,
      SITE_VALIDATION_ISSUE_CODES.EDITOR_SCOPE_INVALID,
    );
  }

  if (issues.length > 0) return invalid(issues);

  return valid(
    Object.freeze({
      email: email!,
      displayName: displayName!,
      permissionKey: permissionKey as EditorPermissionKey,
      scopeId: scopeId!,
    }),
  );
}

export function validateIdempotencyKey(
  input: unknown,
): SiteValidationResult<IdempotencyInput> {
  if (
    typeof input !== "string" ||
    input.length < SITE_INPUT_LIMITS.idempotencyKeyMin ||
    input.length > SITE_INPUT_LIMITS.idempotencyKeyMax ||
    !IDEMPOTENCY_KEY_PATTERN.test(input)
  ) {
    return invalid([
      issue(
        SITE_VALIDATION_ISSUE_CODES.IDEMPOTENCY_KEY_INVALID,
        "idempotencyKey",
        `Idempotency key must contain ${SITE_INPUT_LIMITS.idempotencyKeyMin}-${SITE_INPUT_LIMITS.idempotencyKeyMax} safe ASCII letters, numbers, dots, underscores, colons, or hyphens, beginning with a letter or number.`,
      ),
    ]);
  }

  return valid(Object.freeze({ idempotencyKey: input }));
}
