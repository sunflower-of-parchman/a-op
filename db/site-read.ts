import {
  MODULE_KEYS,
  isModuleKey,
  validateModuleSelection,
  type ModuleKey,
} from "../lib/modules/index.ts";
import {
  isEditorPermissionKey,
  type EditorPermissionKey,
} from "../lib/auth/editor-permissions.ts";
import { isFrameworkPreviewActive } from "../lib/modules/framework-preview.ts";
import { activePageEditorCondition } from "./authority-guards.ts";

export type SiteRevisionView = "draft" | "published";
export type NavigationSetId = "primary" | "footer";
export type NavigationAudience = "administration" | "public";
export type PageKind = "standard" | "legal" | "system";
export type PagePublicationState = "draft" | "published" | "archived";
export type InstallationStatus = "pending" | "active";
export type { EditorPermissionKey } from "../lib/auth/editor-permissions.ts";

export class SiteReadIntegrityError extends Error {
  override readonly name = "SiteReadIntegrityError";
}

export interface ArtistRevision {
  readonly artistConfigId: string;
  readonly id: string;
  readonly revision: number;
  readonly displayName: string;
  readonly siteTitle: string;
  readonly headline: string;
  readonly introduction: string;
  readonly footerText: string;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
  readonly configVersion: number;
  readonly publishedAt: string | null;
}

export interface ArtistModuleState {
  readonly moduleKey: ModuleKey;
  readonly active: boolean;
  readonly revision: number;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly activatedAt: string | null;
  readonly deactivatedAt: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NavigationItem {
  readonly id: string;
  readonly itemKey: string;
  readonly label: string;
  readonly href: string;
  readonly position: number;
  readonly moduleKey: ModuleKey | null;
  readonly external: boolean;
}

export interface NavigationSnapshot {
  readonly setId: NavigationSetId;
  readonly label: string;
  readonly view: SiteRevisionView;
  readonly version: number;
  readonly revision: number;
  readonly publishedAt: string | null;
  readonly items: readonly NavigationItem[];
}

export interface PublishedPage {
  readonly id: string;
  readonly slug: string;
  readonly moduleKey: ModuleKey | null;
  readonly kind: PageKind;
  readonly publishedAt: string;
  readonly revision: {
    readonly id: string;
    readonly revision: number;
    readonly title: string;
    readonly introduction: string;
    readonly bodyText: string;
    readonly sections: readonly PageContentSection[];
    readonly createdByUserId: string | null;
    readonly createdAt: string;
  };
}

export interface PageRevisionSummary {
  readonly id: string;
  readonly revision: number;
  readonly title: string;
  readonly createdAt: string;
}

export interface AdminPageSummary {
  readonly id: string;
  readonly slug: string;
  readonly moduleKey: ModuleKey | null;
  readonly kind: PageKind;
  readonly publicationState: PagePublicationState;
  readonly version: number;
  readonly draft: PageRevisionSummary;
  readonly published: PageRevisionSummary | null;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface AdminPageDraft {
  readonly id: string;
  readonly slug: string;
  readonly moduleKey: ModuleKey | null;
  readonly kind: PageKind;
  readonly publicationState: PagePublicationState;
  readonly version: number;
  readonly publishedRevisionId: string | null;
  readonly revision: {
    readonly id: string;
    readonly revision: number;
    readonly title: string;
    readonly introduction: string;
    readonly bodyText: string;
    readonly sections: readonly PageContentSection[];
    readonly createdByUserId: string | null;
    readonly createdAt: string;
  };
}

export interface PageContentSection {
  readonly id: string;
  readonly sectionKey: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly position: number;
  readonly kind: "prose" | "quote" | "callout";
  readonly heading: string;
  readonly bodyText: string;
}

export interface ActiveEditor {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly assignedAt: string;
  readonly permissions: readonly ActiveEditorPermission[];
}

export interface InstallationState {
  readonly id: "installation";
  readonly status: InstallationStatus;
  readonly ownerUserId: string | null;
  readonly schemaVersion: number;
  readonly bootstrapCompletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ActiveEditorPermission {
  readonly id: string;
  readonly userId: string;
  readonly permissionKey: EditorPermissionKey;
  readonly scopeId: string;
  readonly assignedByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ArtistRevisionRow {
  artist_config_id: string;
  config_version: number;
  published_at: string | null;
  revision_id: string;
  revision: number;
  display_name: string;
  site_title: string;
  headline: string;
  introduction: string;
  footer_text: string;
  created_by_user_id: string | null;
  created_at: string;
}

interface ArtistModuleRow {
  module_key: string;
  active: number;
  revision: number;
  settings_json: string;
  activated_at: string | null;
  deactivated_at: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface NavigationRow {
  set_id: string;
  set_label: string;
  draft_version: number;
  published_version: number | null;
  set_revision: number;
  published_at: string | null;
  item_id: string | null;
  item_key: string | null;
  item_label: string | null;
  href: string | null;
  position: number | null;
  module_key: string | null;
  external: number | null;
  module_active: number | null;
}

interface PublishedPageRow {
  page_id: string;
  slug: string;
  module_key: string | null;
  kind: string;
  published_at: string | null;
  module_active: number | null;
  revision_id: string;
  revision: number;
  title: string;
  introduction: string;
  body_text: string;
  created_by_user_id: string | null;
  revision_created_at: string;
}

interface PageContentSectionRow {
  id: string;
  section_key: string;
  revision_id: string;
  revision: number;
  position: number;
  kind: string;
  heading: string;
  body_text: string;
}

interface PublishedPageWithSectionRow extends PublishedPageRow {
  section_id: string | null;
  section_key: string | null;
  section_revision_id: string | null;
  section_revision: number | null;
  section_position: number | null;
  section_kind: string | null;
  section_heading: string | null;
  section_body_text: string | null;
}

interface AdminPageWithSectionRow extends PublishedPageWithSectionRow {
  publication_state: string;
  page_version: number;
  published_revision_id: string | null;
}

interface AdminPageSummaryRow {
  page_id: string;
  slug: string;
  module_key: string | null;
  kind: string;
  publication_state: string;
  page_version: number;
  draft_id: string | null;
  draft_revision: number | null;
  draft_title: string | null;
  draft_created_at: string | null;
  published_id: string | null;
  published_revision: number | null;
  published_title: string | null;
  published_created_at: string | null;
  updated_at: string;
  published_at: string | null;
}

interface InstallationStateRow {
  id: string;
  status: string;
  owner_user_id: string | null;
  schema_version: number;
  bootstrap_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ActiveEditorPermissionRow {
  id: string;
  user_id: string;
  permission_key: string;
  scope_id: string;
  assigned_by_user_id: string;
  created_at: string;
  updated_at: string;
}

interface ActiveEditorRow extends ActiveEditorPermissionRow {
  email: string;
  display_name: string;
  assigned_at: string;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const SAFE_ITEM_KEY = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function integrity(message: string): never {
  throw new SiteReadIntegrityError(message);
}

function requireSafeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new TypeError(`${label} must be a safe application identifier.`);
  }
  return value;
}

function readSafeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function requireSlug(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SLUG.test(value)) {
    throw new TypeError("Page slug must be a normalized route segment.");
  }
  return value;
}

function isNormalizedSlug(value: unknown): value is string {
  return typeof value === "string" && SAFE_SLUG.test(value);
}

function readSlug(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SLUG.test(value)) {
    return integrity("D1 returned an invalid page slug.");
  }
  return value;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function readNonBlankString(value: unknown, label: string): string {
  const text = readString(value, label);
  if (text.trim().length === 0) {
    return integrity(`D1 returned an empty ${label}.`);
  }
  return text;
}

function readNullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : readNonBlankString(value, label);
}

function readPositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function readNonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value as number;
}

function readBooleanInteger(value: unknown, label: string): boolean {
  if (value !== 0 && value !== 1) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value === 1;
}

function readModuleKey(value: unknown, label: string): ModuleKey {
  if (!isModuleKey(value)) {
    return integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function readNullableModuleKey(
  value: unknown,
  label: string,
): ModuleKey | null {
  return value === null ? null : readModuleKey(value, label);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readSettings(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "string") {
    return integrity("D1 returned invalid module settings JSON.");
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isPlainRecord(parsed)) throw new TypeError();
    return Object.freeze(parsed);
  } catch {
    return integrity("D1 returned invalid module settings JSON.");
  }
}

function readPageKind(value: unknown): PageKind {
  if (value !== "standard" && value !== "legal" && value !== "system") {
    return integrity("D1 returned an invalid page kind.");
  }
  return value;
}

function readContentSectionKind(value: unknown): PageContentSection["kind"] {
  if (value !== "prose" && value !== "quote" && value !== "callout") {
    return integrity("D1 returned an invalid content-section kind.");
  }
  return value;
}

function mapPageContentSectionRow(
  row: PageContentSectionRow,
): PageContentSection {
  return Object.freeze({
    id: readSafeId(row.id, "content-section ID"),
    sectionKey: readSlug(row.section_key),
    revisionId: readSafeId(row.revision_id, "content-section revision ID"),
    revision: readPositiveInteger(row.revision, "content-section revision"),
    position: readPositiveInteger(row.position, "content-section position"),
    kind: readContentSectionKind(row.kind),
    heading: readString(row.heading, "content-section heading"),
    bodyText: readNonBlankString(row.body_text, "content-section body"),
  });
}

function mapJoinedPageSections(
  rows: readonly PublishedPageWithSectionRow[],
  pageRevisionId: unknown,
): readonly PageContentSection[] {
  return Object.freeze(
    rows.flatMap((sectionRow) => {
      if (sectionRow.revision_id !== pageRevisionId) {
        integrity("D1 returned mixed page revisions.");
      }
      if (sectionRow.section_id === null) {
        if (
          sectionRow.section_key !== null ||
          sectionRow.section_revision_id !== null ||
          sectionRow.section_revision !== null ||
          sectionRow.section_position !== null ||
          sectionRow.section_kind !== null ||
          sectionRow.section_heading !== null ||
          sectionRow.section_body_text !== null
        ) {
          integrity("D1 returned an incomplete content section.");
        }
        return [];
      }
      return [
        mapPageContentSectionRow({
          id: sectionRow.section_id,
          section_key: sectionRow.section_key,
          revision_id: sectionRow.section_revision_id,
          revision: sectionRow.section_revision,
          position: sectionRow.section_position,
          kind: sectionRow.section_kind,
          heading: sectionRow.section_heading,
          body_text: sectionRow.section_body_text,
        } as PageContentSectionRow),
      ];
    }),
  );
}

function readPublicationState(value: unknown): PagePublicationState {
  if (value !== "draft" && value !== "published" && value !== "archived") {
    return integrity("D1 returned an invalid page publication state.");
  }
  return value;
}

function readEditorPermissionKey(value: unknown): EditorPermissionKey {
  if (!isEditorPermissionKey(value)) {
    return integrity("D1 returned an invalid editor permission key.");
  }
  return value;
}

function readEditorScope(value: unknown): string {
  return value === "*" ? "*" : readSafeId(value, "editor permission scope ID");
}

function readNavigationHref(value: unknown, external: boolean): string {
  const href = readNonBlankString(value, "navigation href");
  if (/\s|[\\\u0000-\u001f\u007f]/.test(href)) {
    return integrity("D1 returned an unsafe navigation href.");
  }

  if (!external) {
    if (!href.startsWith("/") || href.startsWith("//")) {
      return integrity("D1 returned an invalid internal navigation href.");
    }
    return href;
  }

  try {
    if (new URL(href).protocol !== "https:") throw new TypeError();
  } catch {
    return integrity("D1 returned an invalid external navigation href.");
  }
  return href;
}

function mapArtistRevision(row: ArtistRevisionRow): ArtistRevision {
  return Object.freeze({
    artistConfigId: readSafeId(row.artist_config_id, "artist config ID"),
    id: readSafeId(row.revision_id, "artist revision ID"),
    revision: readPositiveInteger(row.revision, "artist revision number"),
    displayName: readNonBlankString(row.display_name, "artist display name"),
    siteTitle: readNonBlankString(row.site_title, "site title"),
    headline: readString(row.headline, "artist headline"),
    introduction: readString(row.introduction, "artist introduction"),
    footerText: readString(row.footer_text, "artist footer text"),
    createdByUserId:
      row.created_by_user_id === null
        ? null
        : readSafeId(row.created_by_user_id, "artist revision creator ID"),
    createdAt: readNonBlankString(
      row.created_at,
      "artist revision creation timestamp",
    ),
    configVersion: readPositiveInteger(
      row.config_version,
      "artist config version",
    ),
    publishedAt: readNullableTimestamp(
      row.published_at,
      "artist publication timestamp",
    ),
  });
}

function mapArtistModule(row: ArtistModuleRow): ArtistModuleState {
  return Object.freeze({
    moduleKey: readModuleKey(row.module_key, "artist module key"),
    active: readBooleanInteger(row.active, "artist module active state"),
    revision: readPositiveInteger(row.revision, "artist module revision"),
    settings: readSettings(row.settings_json),
    activatedAt: readNullableTimestamp(
      row.activated_at,
      "module activation timestamp",
    ),
    deactivatedAt: readNullableTimestamp(
      row.deactivated_at,
      "module deactivation timestamp",
    ),
    updatedByUserId:
      row.updated_by_user_id === null
        ? null
        : readSafeId(row.updated_by_user_id, "module updater ID"),
    createdAt: readNonBlankString(row.created_at, "module creation timestamp"),
    updatedAt: readNonBlankString(row.updated_at, "module update timestamp"),
  });
}

function readNavigationSetId(value: unknown): NavigationSetId {
  if (value !== "primary" && value !== "footer") {
    throw new TypeError("Navigation set must be primary or footer.");
  }
  return value;
}

function readRevisionView(value: unknown): SiteRevisionView {
  if (value !== "draft" && value !== "published") {
    throw new TypeError("Site revision view must be draft or published.");
  }
  return value;
}

function readNavigationAudience(value: unknown): NavigationAudience {
  if (value !== "administration" && value !== "public") {
    throw new TypeError(
      "Navigation audience must be administration or public.",
    );
  }
  return value;
}

function mapNavigationItem(row: NavigationRow): NavigationItem {
  if (
    row.item_id === null ||
    row.item_key === null ||
    row.item_label === null ||
    row.href === null ||
    row.position === null ||
    row.external === null
  ) {
    return integrity("D1 returned an incomplete navigation item.");
  }

  const external = readBooleanInteger(
    row.external,
    "navigation external state",
  );
  if (!SAFE_ITEM_KEY.test(row.item_key)) {
    return integrity("D1 returned an invalid navigation item key.");
  }

  return Object.freeze({
    id: readSafeId(row.item_id, "navigation item ID"),
    itemKey: row.item_key,
    label: readNonBlankString(row.item_label, "navigation item label"),
    href: readNavigationHref(row.href, external),
    position: readNonnegativeInteger(row.position, "navigation item position"),
    moduleKey: readNullableModuleKey(row.module_key, "navigation module key"),
    external,
  });
}

function mapPageRevisionSummary(
  id: unknown,
  revision: unknown,
  title: unknown,
  createdAt: unknown,
  label: string,
): PageRevisionSummary {
  if (
    id === null ||
    revision === null ||
    title === null ||
    createdAt === null
  ) {
    return integrity(`D1 returned an incomplete ${label} page revision.`);
  }

  return Object.freeze({
    id: readSafeId(id, `${label} page revision ID`),
    revision: readPositiveInteger(revision, `${label} page revision number`),
    title: readNonBlankString(title, `${label} page revision title`),
    createdAt: readNonBlankString(
      createdAt,
      `${label} page revision creation timestamp`,
    ),
  });
}

/** Reads the singleton artist configuration at its draft or published pointer. */
export async function readArtistRevision(
  binding: D1Database,
  view: SiteRevisionView,
): Promise<ArtistRevision | null> {
  const requestedView = readRevisionView(view);
  const row = await binding
    .prepare(
      `SELECT
        artist_config.id AS artist_config_id,
        artist_config.version AS config_version,
        artist_config.published_at AS published_at,
        artist_config_revisions.id AS revision_id,
        artist_config_revisions.revision AS revision,
        artist_config_revisions.display_name AS display_name,
        artist_config_revisions.site_title AS site_title,
        artist_config_revisions.headline AS headline,
        artist_config_revisions.introduction AS introduction,
        artist_config_revisions.footer_text AS footer_text,
        artist_config_revisions.created_by_user_id AS created_by_user_id,
        artist_config_revisions.created_at AS created_at
       FROM artist_config
       JOIN artist_config_revisions
         ON artist_config_revisions.artist_config_id = artist_config.id
        AND artist_config_revisions.id = CASE
          WHEN ?1 = 'draft' THEN artist_config.draft_revision_id
          ELSE artist_config.published_revision_id
        END
       WHERE artist_config.id = 'artist'
         AND (?1 = 'draft' OR artist_config.published_revision_id IS NOT NULL)`,
    )
    .bind(requestedView)
    .first<ArtistRevisionRow>();

  return row ? mapArtistRevision(row) : null;
}

export function readDraftArtistRevision(
  binding: D1Database,
): Promise<ArtistRevision | null> {
  return readArtistRevision(binding, "draft");
}

export function readPublishedArtistRevision(
  binding: D1Database,
): Promise<ArtistRevision | null> {
  return readArtistRevision(binding, "published");
}

/** Reads and validates every durable optional-module row. */
export async function readArtistModules(
  binding: D1Database,
): Promise<readonly ArtistModuleState[]> {
  const result = await binding
    .prepare(
      `SELECT
        module_key,
        active,
        revision,
        settings_json,
        activated_at,
        deactivated_at,
        updated_by_user_id,
        created_at,
        updated_at
       FROM artist_modules
       ORDER BY module_key`,
    )
    .all<ArtistModuleRow>();

  const byKey = new Map<ModuleKey, ArtistModuleState>();
  for (const row of result.results) {
    const moduleState = mapArtistModule(row);
    if (byKey.has(moduleState.moduleKey)) {
      integrity(
        `D1 returned duplicate module state for ${moduleState.moduleKey}.`,
      );
    }
    byKey.set(moduleState.moduleKey, moduleState);
  }

  const modules = MODULE_KEYS.flatMap((key) => {
    const moduleState = byKey.get(key);
    return moduleState ? [moduleState] : [];
  });
  const selection = validateModuleSelection(
    modules.filter(({ active }) => active).map(({ moduleKey }) => moduleKey),
  );
  if (!selection.ok) {
    integrity("D1 returned an invalid active module dependency state.");
  }

  return Object.freeze(modules);
}

export async function readActiveModuleKeys(
  binding: D1Database,
): Promise<readonly ModuleKey[]> {
  const modules = await readArtistModules(binding);
  return Object.freeze(
    modules.filter(({ active }) => active).map(({ moduleKey }) => moduleKey),
  );
}

/**
 * Reads one versioned navigation set. Public snapshots omit items linked to an
 * inactive or missing optional-module row.
 */
export async function readNavigationSnapshot(
  binding: D1Database,
  setId: NavigationSetId,
  view: SiteRevisionView,
  audience: NavigationAudience = "administration",
): Promise<NavigationSnapshot | null> {
  const requestedSet = readNavigationSetId(setId);
  const requestedView = readRevisionView(view);
  const requestedAudience = readNavigationAudience(audience);
  const result = await binding
    .prepare(
      `SELECT
        navigation_sets.id AS set_id,
        navigation_sets.label AS set_label,
        navigation_sets.draft_version AS draft_version,
        navigation_sets.published_version AS published_version,
        navigation_sets.revision AS set_revision,
        navigation_sets.published_at AS published_at,
        navigation_items.id AS item_id,
        navigation_items.item_key AS item_key,
        navigation_items.label AS item_label,
        navigation_items.href AS href,
        navigation_items.position AS position,
        navigation_items.module_key AS module_key,
        navigation_items.external AS external,
        artist_modules.active AS module_active
       FROM navigation_sets
       LEFT JOIN navigation_items
         ON navigation_items.navigation_set_id = navigation_sets.id
        AND navigation_items.version = CASE
          WHEN ?2 = 'draft' THEN navigation_sets.draft_version
          ELSE navigation_sets.published_version
        END
       LEFT JOIN artist_modules
         ON artist_modules.module_key = navigation_items.module_key
       WHERE navigation_sets.id = ?1
       ORDER BY navigation_items.position, navigation_items.item_key`,
    )
    .bind(requestedSet, requestedView)
    .all<NavigationRow>();

  const first = result.results[0];
  if (!first) return null;
  if (first.set_id !== requestedSet) {
    integrity("D1 returned the wrong navigation set.");
  }

  const draftVersion = readPositiveInteger(
    first.draft_version,
    "navigation draft version",
  );
  const publishedVersion =
    first.published_version === null
      ? null
      : readPositiveInteger(
          first.published_version,
          "navigation published version",
        );
  const version = requestedView === "draft" ? draftVersion : publishedVersion;
  if (version === null) return null;

  const items: NavigationItem[] = [];
  const seenIds = new Set<string>();
  for (const row of result.results) {
    if (row.set_id !== requestedSet) {
      integrity("D1 returned mixed navigation sets.");
    }
    if (row.item_id === null) continue;

    const item = mapNavigationItem(row);
    if (seenIds.has(item.id)) {
      integrity("D1 returned a duplicate navigation item.");
    }
    seenIds.add(item.id);

    if (item.moduleKey !== null) {
      const active =
        row.module_active === null
          ? false
          : readBooleanInteger(
              row.module_active,
              "navigation module active state",
            );
      if (requestedAudience === "public" && !active) continue;
    }
    items.push(item);
  }

  return Object.freeze({
    setId: requestedSet,
    label: readNonBlankString(first.set_label, "navigation set label"),
    view: requestedView,
    version,
    revision: readPositiveInteger(
      first.set_revision,
      "navigation set revision",
    ),
    publishedAt: readNullableTimestamp(
      first.published_at,
      "navigation publication timestamp",
    ),
    items: Object.freeze(items),
  });
}

export async function readPublicNavigationSnapshot(
  binding: D1Database,
  setId: NavigationSetId,
): Promise<NavigationSnapshot | null> {
  const audience = (await isFrameworkPreviewActive(binding))
    ? "administration"
    : "public";
  return readNavigationSnapshot(binding, setId, "published", audience);
}

/** Reads only a published page whose linked optional module is active. */
export async function readPublishedPageBySlug(
  binding: D1Database,
  slug: string,
): Promise<PublishedPage | null> {
  if (!isNormalizedSlug(slug)) return null;
  const normalizedSlug = slug;
  const result = await binding
    .prepare(
      `SELECT
        pages.id AS page_id,
        pages.slug AS slug,
        page_revisions.module_key AS module_key,
        page_revisions.kind AS kind,
        pages.published_at AS published_at,
        artist_modules.active AS module_active,
        page_revisions.id AS revision_id,
        page_revisions.revision AS revision,
        page_revisions.title AS title,
        page_revisions.introduction AS introduction,
        page_revisions.body_text AS body_text,
        page_revisions.created_by_user_id AS created_by_user_id,
        page_revisions.created_at AS revision_created_at,
        content_sections.id AS section_id,
        content_sections.section_key AS section_key,
        content_section_revisions.id AS section_revision_id,
        content_section_revisions.revision AS section_revision,
        page_revision_sections.position AS section_position,
        content_section_revisions.kind AS section_kind,
        content_section_revisions.heading AS section_heading,
        content_section_revisions.body_text AS section_body_text
       FROM pages
       JOIN page_revisions
         ON page_revisions.page_id = pages.id
        AND page_revisions.id = pages.published_revision_id
       LEFT JOIN artist_modules
         ON artist_modules.module_key = page_revisions.module_key
       LEFT JOIN page_revision_sections
         ON page_revision_sections.page_revision_id = page_revisions.id
       LEFT JOIN content_sections
         ON content_sections.id = page_revision_sections.content_section_id
       LEFT JOIN content_section_revisions
         ON content_section_revisions.id =
              page_revision_sections.content_section_revision_id
        AND content_section_revisions.content_section_id = content_sections.id
       WHERE pages.slug = ?1
         AND pages.publication_state = 'published'
         AND pages.published_revision_id IS NOT NULL
         AND (
           page_revisions.module_key IS NULL
           OR artist_modules.active = 1
         )
       ORDER BY page_revision_sections.position, page_revision_sections.id`,
    )
    .bind(normalizedSlug)
    .all<PublishedPageWithSectionRow>();

  const row = result.results[0];
  if (!row) return null;
  const moduleKey = readNullableModuleKey(row.module_key, "page module key");
  if (moduleKey !== null)
    readBooleanInteger(row.module_active, "page module active state");
  if (row.published_at === null) {
    integrity("D1 returned a published page without a publication timestamp.");
  }
  const sections = mapJoinedPageSections(result.results, row.revision_id);

  return Object.freeze({
    id: readSafeId(row.page_id, "page ID"),
    slug: readSlug(row.slug),
    moduleKey,
    kind: readPageKind(row.kind),
    publishedAt: readNonBlankString(
      row.published_at,
      "page publication timestamp",
    ),
    revision: Object.freeze({
      id: readSafeId(row.revision_id, "published page revision ID"),
      revision: readPositiveInteger(
        row.revision,
        "published page revision number",
      ),
      title: readNonBlankString(row.title, "published page title"),
      introduction: readString(row.introduction, "published page introduction"),
      bodyText: readString(row.body_text, "published page body"),
      sections,
      createdByUserId:
        row.created_by_user_id === null
          ? null
          : readSafeId(row.created_by_user_id, "page revision creator ID"),
      createdAt: readNonBlankString(
        row.revision_created_at,
        "page revision creation timestamp",
      ),
    }),
  });
}

/** Reads every page with its draft and optional published revision pointers. */
export async function readAdminPageSummaries(
  binding: D1Database,
): Promise<readonly AdminPageSummary[]> {
  const result = await binding
    .prepare(
      `SELECT
        pages.id AS page_id,
        pages.slug AS slug,
        draft.module_key AS module_key,
        draft.kind AS kind,
        pages.publication_state AS publication_state,
        pages.version AS page_version,
        draft.id AS draft_id,
        draft.revision AS draft_revision,
        draft.title AS draft_title,
        draft.created_at AS draft_created_at,
        published.id AS published_id,
        published.revision AS published_revision,
        published.title AS published_title,
        published.created_at AS published_created_at,
        pages.updated_at AS updated_at,
        pages.published_at AS published_at
       FROM pages
       LEFT JOIN page_revisions AS draft
         ON draft.page_id = pages.id
        AND draft.id = pages.draft_revision_id
       LEFT JOIN page_revisions AS published
         ON published.page_id = pages.id
        AND published.id = pages.published_revision_id
       ORDER BY pages.slug`,
    )
    .all<AdminPageSummaryRow>();

  return Object.freeze(
    result.results.map((row) => {
      const publicationState = readPublicationState(row.publication_state);
      const published =
        row.published_id === null &&
        row.published_revision === null &&
        row.published_title === null &&
        row.published_created_at === null
          ? null
          : mapPageRevisionSummary(
              row.published_id,
              row.published_revision,
              row.published_title,
              row.published_created_at,
              "published",
            );

      if (publicationState === "published" && published === null) {
        integrity("D1 returned a published page without a published revision.");
      }

      return Object.freeze({
        id: readSafeId(row.page_id, "page ID"),
        slug: readSlug(row.slug),
        moduleKey: readNullableModuleKey(row.module_key, "page module key"),
        kind: readPageKind(row.kind),
        publicationState,
        version: readPositiveInteger(row.page_version, "page version"),
        draft: mapPageRevisionSummary(
          row.draft_id,
          row.draft_revision,
          row.draft_title,
          row.draft_created_at,
          "draft",
        ),
        published,
        updatedAt: readNonBlankString(row.updated_at, "page update timestamp"),
        publishedAt: readNullableTimestamp(
          row.published_at,
          "page publication timestamp",
        ),
      });
    }),
  );
}

/** Reads one draft page revision for an authorized administration surface. */
export async function readAdminPageDraftBySlug(
  binding: D1Database,
  slug: string,
  actorUserId: string,
): Promise<AdminPageDraft | null> {
  const normalizedSlug = requireSlug(slug);
  const authority = activePageEditorCondition(actorUserId, normalizedSlug);
  const result = await binding
    .prepare(
      `SELECT
        pages.id AS page_id,
        pages.slug AS slug,
        page_revisions.module_key AS module_key,
        page_revisions.kind AS kind,
        pages.publication_state AS publication_state,
        pages.version AS page_version,
        pages.published_revision_id AS published_revision_id,
        page_revisions.id AS revision_id,
        page_revisions.revision AS revision,
        page_revisions.title AS title,
        page_revisions.introduction AS introduction,
        page_revisions.body_text AS body_text,
        page_revisions.created_by_user_id AS created_by_user_id,
        page_revisions.created_at AS revision_created_at,
        NULL AS module_active,
        content_sections.id AS section_id,
        content_sections.section_key AS section_key,
        content_section_revisions.id AS section_revision_id,
        content_section_revisions.revision AS section_revision,
        page_revision_sections.position AS section_position,
        content_section_revisions.kind AS section_kind,
        content_section_revisions.heading AS section_heading,
        content_section_revisions.body_text AS section_body_text
       FROM pages
       JOIN page_revisions
         ON page_revisions.page_id = pages.id
        AND page_revisions.id = pages.draft_revision_id
       LEFT JOIN page_revision_sections
         ON page_revision_sections.page_revision_id = page_revisions.id
       LEFT JOIN content_sections
         ON content_sections.id = page_revision_sections.content_section_id
       LEFT JOIN content_section_revisions
         ON content_section_revisions.id =
              page_revision_sections.content_section_revision_id
        AND content_section_revisions.content_section_id = content_sections.id
       WHERE pages.slug = ?1
         AND ${authority.sql}
       ORDER BY page_revision_sections.position, page_revision_sections.id`,
    )
    .bind(normalizedSlug, ...authority.bindings)
    .all<AdminPageWithSectionRow>();
  const row = result.results[0];
  if (!row) return null;
  const sections = mapJoinedPageSections(result.results, row.revision_id);

  return Object.freeze({
    id: readSafeId(row.page_id, "page ID"),
    slug: readSlug(row.slug),
    moduleKey: readNullableModuleKey(row.module_key, "page module key"),
    kind: readPageKind(row.kind),
    publicationState: readPublicationState(row.publication_state),
    version: readPositiveInteger(row.page_version, "page version"),
    publishedRevisionId:
      row.published_revision_id === null
        ? null
        : readSafeId(row.published_revision_id, "published revision ID"),
    revision: Object.freeze({
      id: readSafeId(row.revision_id, "draft page revision ID"),
      revision: readPositiveInteger(row.revision, "draft page revision number"),
      title: readNonBlankString(row.title, "draft page title"),
      introduction: readString(row.introduction, "draft page introduction"),
      bodyText: readString(row.body_text, "draft page body"),
      sections,
      createdByUserId:
        row.created_by_user_id === null
          ? null
          : readSafeId(row.created_by_user_id, "draft page creator ID"),
      createdAt: readNonBlankString(
        row.revision_created_at,
        "draft page creation timestamp",
      ),
    }),
  });
}

/** Reads active editor identities and their current page scopes for owners. */
export async function readActiveEditors(
  binding: D1Database,
): Promise<readonly ActiveEditor[]> {
  const result = await binding
    .prepare(
      `SELECT
        users.id AS user_id,
        users.email AS email,
        profiles.display_name AS display_name,
        role_assignments.created_at AS assigned_at,
        editor_permissions.id AS id,
        editor_permissions.permission_key AS permission_key,
        editor_permissions.scope_id AS scope_id,
        editor_permissions.assigned_by_user_id AS assigned_by_user_id,
        editor_permissions.created_at AS created_at,
        editor_permissions.updated_at AS updated_at
       FROM users
       JOIN profiles ON profiles.user_id = users.id
       JOIN role_assignments
         ON role_assignments.user_id = users.id
        AND role_assignments.role_key = 'editor'
        AND role_assignments.revoked_at IS NULL
       LEFT JOIN editor_permissions
         ON editor_permissions.user_id = users.id
        AND editor_permissions.revoked_at IS NULL
       WHERE users.status = 'active'
       ORDER BY profiles.display_name, users.id, editor_permissions.scope_id`,
    )
    .all<ActiveEditorRow>();

  const editors = new Map<string, ActiveEditor>();
  for (const row of result.results) {
    const userId = readSafeId(row.user_id, "editor user ID");
    const permission =
      row.id === null
        ? null
        : Object.freeze({
            id: readSafeId(row.id, "editor permission ID"),
            userId,
            permissionKey: readEditorPermissionKey(row.permission_key),
            scopeId: readEditorScope(row.scope_id),
            assignedByUserId: readSafeId(
              row.assigned_by_user_id,
              "editor permission assigner ID",
            ),
            createdAt: readNonBlankString(
              row.created_at,
              "editor permission creation timestamp",
            ),
            updatedAt: readNonBlankString(
              row.updated_at,
              "editor permission update timestamp",
            ),
          });
    const existing = editors.get(userId);
    if (existing) {
      if (permission) {
        editors.set(
          userId,
          Object.freeze({
            ...existing,
            permissions: Object.freeze([...existing.permissions, permission]),
          }),
        );
      }
      continue;
    }

    editors.set(
      userId,
      Object.freeze({
        userId,
        email: readNonBlankString(row.email, "editor email"),
        displayName: readNonBlankString(
          row.display_name,
          "editor display name",
        ),
        assignedAt: readNonBlankString(
          row.assigned_at,
          "editor assignment timestamp",
        ),
        permissions: Object.freeze(permission ? [permission] : []),
      }),
    );
  }

  return Object.freeze([...editors.values()]);
}

/** Reads the one installation record seeded by the M2 migration. */
export async function readInstallationState(
  binding: D1Database,
): Promise<InstallationState | null> {
  const row = await binding
    .prepare(
      `SELECT
        id,
        status,
        owner_user_id,
        schema_version,
        bootstrap_completed_at,
        created_at,
        updated_at
       FROM installation_state
       WHERE id = 'installation'`,
    )
    .first<InstallationStateRow>();

  if (!row) return null;
  if (row.id !== "installation") {
    integrity("D1 returned an invalid installation state ID.");
  }
  if (row.status !== "pending" && row.status !== "active") {
    integrity("D1 returned an invalid installation status.");
  }

  return Object.freeze({
    id: "installation",
    status: row.status,
    ownerUserId:
      row.owner_user_id === null
        ? null
        : readSafeId(row.owner_user_id, "installation owner ID"),
    schemaVersion: readPositiveInteger(
      row.schema_version,
      "installation schema version",
    ),
    bootstrapCompletedAt: readNullableTimestamp(
      row.bootstrap_completed_at,
      "installation bootstrap timestamp",
    ),
    createdAt: readNonBlankString(
      row.created_at,
      "installation creation timestamp",
    ),
    updatedAt: readNonBlankString(
      row.updated_at,
      "installation update timestamp",
    ),
  });
}

/**
 * Reads unrevoked permissions only when the user and their editor assignment
 * are both active. Revoked or stale authority is therefore absent by default.
 */
export async function readActiveEditorPermissions(
  binding: D1Database,
  userId: string,
): Promise<readonly ActiveEditorPermission[]> {
  const requestedUserId = requireSafeId(userId, "Editor user ID");
  const result = await binding
    .prepare(
      `SELECT DISTINCT
        editor_permissions.id AS id,
        editor_permissions.user_id AS user_id,
        editor_permissions.permission_key AS permission_key,
        editor_permissions.scope_id AS scope_id,
        editor_permissions.assigned_by_user_id AS assigned_by_user_id,
        editor_permissions.created_at AS created_at,
        editor_permissions.updated_at AS updated_at
       FROM editor_permissions
       JOIN users
         ON users.id = editor_permissions.user_id
        AND users.status = 'active'
       JOIN role_assignments
         ON role_assignments.user_id = editor_permissions.user_id
        AND role_assignments.role_key = 'editor'
        AND role_assignments.revoked_at IS NULL
       WHERE editor_permissions.user_id = ?1
         AND editor_permissions.revoked_at IS NULL
       ORDER BY editor_permissions.permission_key, editor_permissions.scope_id`,
    )
    .bind(requestedUserId)
    .all<ActiveEditorPermissionRow>();

  return Object.freeze(
    result.results.map((row) => {
      if (row.user_id !== requestedUserId) {
        integrity("D1 returned an editor permission for the wrong user.");
      }
      const permissionKey = readEditorPermissionKey(row.permission_key);
      const scopeId = readEditorScope(row.scope_id);

      return Object.freeze({
        id: readSafeId(row.id, "editor permission ID"),
        userId: requestedUserId,
        permissionKey,
        scopeId,
        assignedByUserId: readSafeId(
          row.assigned_by_user_id,
          "editor permission assigner ID",
        ),
        createdAt: readNonBlankString(
          row.created_at,
          "editor permission creation timestamp",
        ),
        updatedAt: readNonBlankString(
          row.updated_at,
          "editor permission update timestamp",
        ),
      });
    }),
  );
}
