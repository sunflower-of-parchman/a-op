import {
  activeOwnerCondition,
  activePageEditorCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import type {
  AdminContentSectionDTO,
  ContentSectionKind,
  ContentSectionPublicationState,
  ContentSectionRevisionDTO,
  PublishedContentSectionOptionDTO,
} from "@/lib/content-sections/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SECTION_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface AdminContentSectionRow {
  section_id: unknown;
  section_key: unknown;
  version: unknown;
  publication_state: unknown;
  published_at: unknown;
  section_created_at: unknown;
  section_updated_at: unknown;
  draft_id: unknown;
  draft_revision: unknown;
  draft_kind: unknown;
  draft_heading: unknown;
  draft_body_text: unknown;
  draft_created_at: unknown;
  published_id: unknown;
  published_revision: unknown;
  published_kind: unknown;
  published_heading: unknown;
  published_body_text: unknown;
  published_created_at: unknown;
}

interface PublishedOptionRow {
  section_id: unknown;
  section_key: unknown;
  revision_id: unknown;
  revision: unknown;
  kind: unknown;
  heading: unknown;
}

interface OwnerBarrierRow {
  allowed: number;
}

export interface ContentSectionAdminWorkspaceDTO {
  readonly sections: readonly AdminContentSectionDTO[];
  readonly publishedOptions: readonly PublishedContentSectionOptionDTO[];
}

export class ContentSectionReadIntegrityError extends Error {
  override readonly name = "ContentSectionReadIntegrityError";
}

function integrity(message: string): never {
  throw new ContentSectionReadIntegrityError(message);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an invalid ${label}.`);
  }
  return value;
}

function sectionKey(value: unknown): string {
  if (typeof value !== "string" || !SECTION_KEY.test(value)) {
    integrity("D1 returned an invalid content section key.");
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned invalid ${label}.`);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const result = text(value, label);
  if (result.trim().length === 0) integrity(`D1 returned blank ${label}.`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function kind(value: unknown): ContentSectionKind {
  if (value !== "prose" && value !== "quote" && value !== "callout") {
    integrity("D1 returned an invalid content section kind.");
  }
  return value;
}

function publicationState(value: unknown): ContentSectionPublicationState {
  if (value !== "draft" && value !== "published" && value !== "archived") {
    integrity("D1 returned an invalid content section publication state.");
  }
  return value;
}

function revision(
  row: AdminContentSectionRow,
  prefix: "draft" | "published",
): ContentSectionRevisionDTO {
  return Object.freeze({
    id: id(row[`${prefix}_id`], `${prefix} content section revision ID`),
    revision: positiveInteger(
      row[`${prefix}_revision`],
      `${prefix} content section revision`,
    ),
    kind: kind(row[`${prefix}_kind`]),
    heading: text(row[`${prefix}_heading`], `${prefix} section heading`),
    bodyText: nonBlank(row[`${prefix}_body_text`], `${prefix} section body`),
    createdAt: timestamp(
      row[`${prefix}_created_at`],
      `${prefix} section creation time`,
    ),
  });
}

function mapAdmin(row: AdminContentSectionRow): AdminContentSectionDTO {
  const state = publicationState(row.publication_state);
  const published =
    row.published_id === null ? null : revision(row, "published");
  const publishedAt = nullableTimestamp(
    row.published_at,
    "content section publication time",
  );
  if ((published === null) !== (publishedAt === null)) {
    integrity("D1 returned incomplete content section publication state.");
  }
  if (state === "published" && published === null) {
    integrity("D1 returned a published section without a frozen revision.");
  }
  return Object.freeze({
    id: id(row.section_id, "content section ID"),
    sectionKey: sectionKey(row.section_key),
    version: positiveInteger(row.version, "content section version"),
    publicationState: state,
    draft: revision(row, "draft"),
    published,
    publishedAt,
    createdAt: timestamp(
      row.section_created_at,
      "content section creation time",
    ),
    updatedAt: timestamp(row.section_updated_at, "content section update time"),
  });
}

const ADMIN_SELECT = `
  SELECT
    section.id AS section_id,
    section.section_key,
    section.version,
    section.publication_state,
    section.published_at,
    section.created_at AS section_created_at,
    section.updated_at AS section_updated_at,
    draft.id AS draft_id,
    draft.revision AS draft_revision,
    draft.kind AS draft_kind,
    draft.heading AS draft_heading,
    draft.body_text AS draft_body_text,
    draft.created_at AS draft_created_at,
    published.id AS published_id,
    published.revision AS published_revision,
    published.kind AS published_kind,
    published.heading AS published_heading,
    published.body_text AS published_body_text,
    published.created_at AS published_created_at
  FROM content_sections AS section
  JOIN content_section_revisions AS draft
    ON draft.id = section.draft_revision_id
   AND draft.content_section_id = section.id
  LEFT JOIN content_section_revisions AS published
    ON published.id = section.published_revision_id
   AND published.content_section_id = section.id`;

export async function listAdminContentSections(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly AdminContentSectionDTO[]> {
  const authority = activeOwnerCondition(actorUserId);
  const result = await binding
    .prepare(
      `${ADMIN_SELECT}
       WHERE ${authority.sql}
       ORDER BY section.section_key ASC`,
    )
    .bind(...authority.bindings)
    .all<AdminContentSectionRow>();
  return Object.freeze(result.results.map(mapAdmin));
}

export async function readAdminContentSectionByKey(
  binding: D1Database,
  key: string,
  actorUserId: string,
): Promise<AdminContentSectionDTO | null> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(
      `${ADMIN_SELECT}
       WHERE section.section_key = ?1
         AND ${authority.sql}
       LIMIT 1`,
    )
    .bind(key, ...authority.bindings)
    .first<AdminContentSectionRow>();
  return row ? mapAdmin(row) : null;
}

async function readPublishedOptions(
  binding: D1Database,
  authority: SqlAuthorityCondition,
): Promise<readonly PublishedContentSectionOptionDTO[]> {
  const result = await binding
    .prepare(
      `SELECT
         section.id AS section_id,
         section.section_key,
         published.id AS revision_id,
         published.revision,
         published.kind,
         published.heading
       FROM content_sections AS section
       JOIN content_section_revisions AS published
         ON published.id = section.published_revision_id
        AND published.content_section_id = section.id
       WHERE section.publication_state = 'published'
         AND ${authority.sql}
       ORDER BY section.section_key ASC`,
    )
    .bind(...authority.bindings)
    .all<PublishedOptionRow>();
  return Object.freeze(
    result.results.map((row) => {
      const key = sectionKey(row.section_key);
      const heading = text(row.heading, "published section heading");
      return Object.freeze({
        sectionId: id(row.section_id, "content section ID"),
        sectionKey: key,
        revisionId: id(row.revision_id, "published section revision ID"),
        revision: positiveInteger(
          row.revision,
          "published content section revision",
        ),
        kind: kind(row.kind),
        heading,
        label: heading.trim().length > 0 ? heading : key,
      });
    }),
  );
}

export async function listPublishedContentSectionOptions(
  binding: D1Database,
  actorUserId: string,
): Promise<readonly PublishedContentSectionOptionDTO[]> {
  return readPublishedOptions(binding, activeOwnerCondition(actorUserId));
}

export async function listPageCompositionContentSectionOptions(
  binding: D1Database,
  actorUserId: string,
  pageScopeId: string,
): Promise<readonly PublishedContentSectionOptionDTO[]> {
  return readPublishedOptions(
    binding,
    activePageEditorCondition(actorUserId, pageScopeId),
  );
}

async function requireFinalOwnerBarrier(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<OwnerBarrierRow>();
  if (row?.allowed === 1) return;
  throw new RuntimeError(
    "CONTENT_SECTION_OWNER_REQUIRED",
    "Content section administration requires live owner authority.",
    {
      status: 403,
      publicMessage: "This account cannot read content section drafts.",
    },
  );
}

export async function readContentSectionAdminWorkspace(
  binding: D1Database,
  actorUserId: string,
): Promise<ContentSectionAdminWorkspaceDTO> {
  const [sections, publishedOptions] = await Promise.all([
    listAdminContentSections(binding, actorUserId),
    listPublishedContentSectionOptions(binding, actorUserId),
  ]);
  await requireFinalOwnerBarrier(binding, actorUserId);
  return Object.freeze({ sections, publishedOptions });
}
