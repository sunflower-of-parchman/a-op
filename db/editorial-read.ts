import type {
  AdminEditorialPostDTO,
  PublishedEditorialPostDTO,
  StructuredTextBlock,
} from "@/lib/updates/types.ts";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

interface EditorialRow {
  id: unknown;
  slug: unknown;
  title: unknown;
  excerpt: unknown;
  body_json: unknown;
  state: unknown;
  published_at: unknown;
  revision: unknown;
  updated_at: unknown;
}

function invalid(label: string): never {
  throw new Error(`D1 returned invalid editorial ${label}.`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") invalid(label);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.trim().length === 0) invalid(label);
  return result;
}

function id(value: unknown): string {
  const result = nonBlank(value, "ID");
  if (!SAFE_ID.test(result)) invalid("ID");
  return result;
}

function slug(value: unknown): string {
  const result = nonBlank(value, "slug");
  if (!SAFE_SLUG.test(result)) invalid("slug");
  return result;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    invalid(label);
  }
  return value;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    invalid("revision");
  return value as number;
}

function body(value: unknown): readonly StructuredTextBlock[] {
  if (typeof value !== "string") invalid("body");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return invalid("body JSON");
  }
  if (!Array.isArray(parsed) || parsed.length < 1) invalid("body");
  return Object.freeze(
    parsed.map((candidate) => {
      if (
        candidate === null ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return invalid("body block");
      }
      const block = candidate as Record<string, unknown>;
      if (
        block.type !== "heading" &&
        block.type !== "paragraph" &&
        block.type !== "quote"
      ) {
        return invalid("body block type");
      }
      return Object.freeze({
        type: block.type,
        text: nonBlank(block.text, "body block text"),
      });
    }),
  );
}

function mapPublished(row: EditorialRow): PublishedEditorialPostDTO {
  return Object.freeze({
    id: id(row.id),
    slug: slug(row.slug),
    title: nonBlank(row.title, "title"),
    excerpt: string(row.excerpt, "excerpt"),
    body: body(row.body_json),
    publishedAt: timestamp(row.published_at, "publication time"),
    revision: integer(row.revision),
  });
}

function mapAdmin(row: EditorialRow): AdminEditorialPostDTO {
  if (
    row.state !== "draft" &&
    row.state !== "published" &&
    row.state !== "archived"
  ) {
    invalid("state");
  }
  return Object.freeze({
    id: id(row.id),
    slug: slug(row.slug),
    title: nonBlank(row.title, "title"),
    excerpt: string(row.excerpt, "excerpt"),
    body: body(row.body_json),
    state: row.state,
    publishedAt: nullableTimestamp(row.published_at, "publication time"),
    revision: integer(row.revision),
    updatedAt: timestamp(row.updated_at, "modification time"),
  });
}

const SELECT = `SELECT id, slug, title, excerpt, body_json, state,
                       published_at, revision, updated_at
                FROM editorial_posts`;

export async function listPublishedEditorialPosts(
  binding: D1Database,
): Promise<readonly PublishedEditorialPostDTO[]> {
  const result = await binding
    .prepare(
      `${SELECT} WHERE state = 'published'
       ORDER BY published_at DESC, id LIMIT 200`,
    )
    .all<EditorialRow>();
  if (!result.success) invalid("index");
  return Object.freeze(result.results.map(mapPublished));
}

export async function readPublishedEditorialPostBySlug(
  binding: D1Database,
  rawSlug: string,
): Promise<PublishedEditorialPostDTO | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  const row = await binding
    .prepare(`${SELECT} WHERE slug = ?1 AND state = 'published' LIMIT 1`)
    .bind(rawSlug)
    .first<EditorialRow>();
  return row ? mapPublished(row) : null;
}

export async function listAdminEditorialPosts(
  binding: D1Database,
): Promise<readonly AdminEditorialPostDTO[]> {
  const result = await binding
    .prepare(`${SELECT} ORDER BY updated_at DESC, id LIMIT 200`)
    .all<EditorialRow>();
  if (!result.success) invalid("administration");
  return Object.freeze(result.results.map(mapAdmin));
}

export async function readAdminEditorialPostBySlug(
  binding: D1Database,
  rawSlug: string,
): Promise<AdminEditorialPostDTO | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  const row = await binding
    .prepare(`${SELECT} WHERE slug = ?1 LIMIT 1`)
    .bind(rawSlug)
    .first<EditorialRow>();
  return row ? mapAdmin(row) : null;
}
