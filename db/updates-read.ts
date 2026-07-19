import { activeCustomerCondition } from "./authority-guards.ts";
import type {
  AdminUpdateDTO,
  PublishedUpdateDTO,
  StructuredTextBlock,
  UpdateAudience,
  UpdateResourceLinkDTO,
  UpdateResourceType,
} from "@/lib/updates/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface UpdateRow {
  id: unknown;
  slug: unknown;
  title: unknown;
  summary: unknown;
  body_json: unknown;
  audience: unknown;
  resource_type: unknown;
  resource_id: unknown;
  state: unknown;
  published_at: unknown;
  revision: unknown;
  updated_at: unknown;
  read_id: unknown;
}

interface ResourceRow {
  slug: unknown;
  title: unknown;
}

interface CountRow {
  count: number;
}

export class UpdateReadIntegrityError extends Error {
  override readonly name = "UpdateReadIntegrityError";
}

function integrity(message: string): never {
  throw new UpdateReadIntegrityError(message);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") integrity(`D1 returned invalid ${label}.`);
  return value;
}

function nonBlank(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.trim().length === 0) integrity(`D1 returned blank ${label}.`);
  return result;
}

function slug(value: unknown): string {
  const result = nonBlank(value, "update slug");
  if (!SAFE_SLUG.test(result)) integrity("D1 returned an unsafe update slug.");
  return result;
}

function integer(value: unknown, label: string): number {
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

function audience(value: unknown): UpdateAudience {
  if (value !== "public" && value !== "account") {
    integrity("D1 returned invalid update audience.");
  }
  return value;
}

function resourceType(value: unknown): UpdateResourceType | null {
  if (value === null) return null;
  if (
    value !== "track" &&
    value !== "release" &&
    value !== "collection" &&
    value !== "course" &&
    value !== "video" &&
    value !== "page" &&
    value !== "license" &&
    value !== "membership" &&
    value !== "subscription" &&
    value !== "order"
  ) {
    integrity("D1 returned invalid update resource type.");
  }
  return value;
}

function body(value: unknown): readonly StructuredTextBlock[] {
  if (typeof value !== "string") integrity("D1 returned invalid update body.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid update body JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 128) {
    integrity("D1 returned invalid update body.");
  }
  return Object.freeze(
    parsed.map((candidate) => {
      if (
        candidate === null ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return integrity("D1 returned invalid update body block.");
      }
      const block = candidate as Record<string, unknown>;
      if (
        block.type !== "heading" &&
        block.type !== "paragraph" &&
        block.type !== "quote"
      ) {
        return integrity("D1 returned invalid update body block type.");
      }
      return Object.freeze({
        type: block.type,
        text: nonBlank(block.text, "update body text"),
      });
    }),
  );
}

async function requireCustomer(
  binding: D1Database,
  userId: string,
): Promise<void> {
  if (!SAFE_ID.test(userId)) {
    throw new TypeError(
      "Customer user ID must be a safe application identifier.",
    );
  }
  const condition = activeCustomerCondition(userId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${condition.sql}`)
    .bind(...condition.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "UPDATE_CUSTOMER_REQUIRED",
    "Update account state requires an active customer authority record.",
    { status: 403, publicMessage: "That update feed is not available." },
  );
}

async function readResourceLink(
  binding: D1Database,
  type: UpdateResourceType | null,
  rawResourceId: unknown,
  customerUserId: string | null,
): Promise<UpdateResourceLinkDTO | null> {
  if (type === null) {
    if (rawResourceId !== null)
      integrity("D1 returned an incomplete update link.");
    return null;
  }
  const resourceId = id(rawResourceId, "update resource ID");
  if (type === "order") {
    if (customerUserId === null) return null;
    const customerAuthority = activeCustomerCondition(customerUserId);
    const order = await binding
      .prepare(
        `SELECT orders.id AS slug,
                COALESCE(
                  (SELECT order_items.product_name
                   FROM order_items
                   WHERE order_items.order_id = orders.id
                   ORDER BY order_items.id LIMIT 1),
                  'Test order'
                ) AS title
         FROM orders
         WHERE orders.id = ?1 AND orders.customer_user_id = ?2
           AND orders.status = 'fulfilled'
           AND orders.stripe_environment = 'test' AND orders.livemode = 0
           AND ${customerAuthority.sql}
         LIMIT 1`,
      )
      .bind(resourceId, customerUserId, ...customerAuthority.bindings)
      .first<ResourceRow>();
    if (!order) return null;
    return Object.freeze({
      type,
      id: resourceId,
      label: nonBlank(order.title, "update order title"),
      href: "/account/orders",
    });
  }
  const queries: Readonly<Record<UpdateResourceType, string>> = {
    track: `SELECT track.slug, revision.title
            FROM tracks AS track
            JOIN track_revisions AS revision
              ON revision.id = track.published_revision_id
            WHERE track.id = ?1 AND track.publication_state = 'published'`,
    release: `SELECT release_record.slug, revision.title
              FROM releases AS release_record
              JOIN release_revisions AS revision
                ON revision.id = release_record.published_revision_id
              WHERE release_record.id = ?1
                AND release_record.publication_state = 'published'`,
    collection: `SELECT collection.slug, revision.title
                 FROM collections AS collection
                 JOIN collection_revisions AS revision
                   ON revision.id = collection.published_revision_id
                 WHERE collection.id = ?1
                   AND collection.publication_state = 'published'`,
    course: `SELECT course.slug, revision.title
             FROM courses AS course
             JOIN course_revisions AS revision
               ON revision.id = course.published_revision_id
             WHERE course.id = ?1 AND course.publication_state = 'published'
               AND EXISTS (
                 SELECT 1 FROM artist_modules
                 WHERE module_key = 'courses' AND active = 1
               )`,
    video: `SELECT video.slug, revision.title
            FROM videos AS video
            JOIN video_revisions AS revision
              ON revision.id = video.published_revision_id
            WHERE video.id = ?1 AND video.publication_state = 'published'
              AND EXISTS (
                SELECT 1 FROM artist_modules
                WHERE module_key = 'video' AND active = 1
              )`,
    page: `SELECT page.slug, revision.title
           FROM pages AS page
           JOIN page_revisions AS revision
             ON revision.id = page.published_revision_id
           WHERE page.id = ?1 AND page.publication_state = 'published'
             AND (
               page.module_key IS NULL
               OR EXISTS (
                 SELECT 1 FROM artist_modules
                 WHERE module_key = page.module_key AND active = 1
               )
             )`,
    license: `SELECT offer.slug,
                     track_revision.title || ' · ' || option_record.label AS title
              FROM license_offers AS offer
              JOIN tracks AS track
                ON track.id = offer.track_id
               AND track.published_revision_id = offer.track_revision_id
               AND track.publication_state = 'published'
              JOIN track_revisions AS track_revision
                ON track_revision.id = offer.track_revision_id
               AND track_revision.track_id = offer.track_id
              JOIN license_options AS option_record
                ON option_record.id = offer.license_option_id
               AND option_record.license_terms_version_id = offer.license_terms_version_id
              WHERE offer.id = ?1 AND offer.state = 'active'
                AND EXISTS (
                  SELECT 1 FROM artist_modules
                  WHERE module_key = 'licensing' AND active = 1
                )`,
    membership: `SELECT plan.slug, revision.name AS title
                 FROM membership_plans AS plan
                 JOIN membership_plan_revisions AS revision
                   ON revision.membership_plan_id = plan.id
                  AND revision.revision = plan.current_revision
                 WHERE plan.id = ?1 AND plan.state = 'active'
                   AND EXISTS (
                     SELECT 1 FROM artist_modules
                     WHERE module_key = 'memberships' AND active = 1
                   )`,
    subscription: `SELECT plan.slug, plan.name AS title
                   FROM subscription_plans AS plan
                   WHERE plan.id = ?1 AND plan.state = 'active'
                     AND EXISTS (
                       SELECT 1 FROM artist_modules
                       WHERE module_key = 'memberships' AND active = 1
                     )
                     AND EXISTS (
                       SELECT 1 FROM artist_modules
                       WHERE module_key = 'subscriptions' AND active = 1
                     )`,
    order: "SELECT NULL AS slug, NULL AS title WHERE 0",
  };
  const row = await binding
    .prepare(`${queries[type]} LIMIT 1`)
    .bind(resourceId)
    .first<ResourceRow>();
  if (!row) return null;
  const resourceSlug = slug(row.slug);
  const hrefPrefix: Readonly<Record<UpdateResourceType, string>> = {
    track: "/music/tracks/",
    release: "/music/releases/",
    collection: "/music/collections/",
    course: "/courses/",
    video: "/videos/",
    page: "/",
    license: "/licensing#offer-",
    membership: "/commerce#membership-",
    subscription: "/commerce#subscription-",
    order: "/account/orders#order-",
  };
  return Object.freeze({
    type,
    id: resourceId,
    label: nonBlank(row.title, "update resource title"),
    href: `${hrefPrefix[type]}${encodeURIComponent(resourceSlug)}`,
  });
}

async function mapPublished(
  binding: D1Database,
  row: UpdateRow,
  customerUserId: string | null,
): Promise<PublishedUpdateDTO> {
  const type = resourceType(row.resource_type);
  return Object.freeze({
    id: id(row.id, "update ID"),
    slug: slug(row.slug),
    title: nonBlank(row.title, "update title"),
    summary: string(row.summary, "update summary"),
    body: body(row.body_json),
    audience: audience(row.audience),
    resource: await readResourceLink(
      binding,
      type,
      row.resource_id,
      customerUserId,
    ),
    publishedAt: timestamp(row.published_at, "update publication time"),
    revision: integer(row.revision, "update revision"),
    read: row.read_id !== null,
  });
}

const UPDATE_SELECT = `
  SELECT update_record.id, update_record.slug, update_record.title,
         update_record.summary, update_record.body_json,
         update_record.audience, update_record.resource_type,
         update_record.resource_id, update_record.state,
         update_record.published_at, update_record.revision,
         update_record.updated_at, update_read.id AS read_id
  FROM updates AS update_record
  LEFT JOIN update_reads AS update_read
    ON update_read.update_id = update_record.id
   AND update_read.user_id = ?1`;

export async function listPublishedUpdates(
  binding: D1Database,
  customerUserId: string | null,
): Promise<readonly PublishedUpdateDTO[]> {
  if (customerUserId !== null) await requireCustomer(binding, customerUserId);
  const customerAuthority =
    customerUserId === null ? null : activeCustomerCondition(customerUserId);
  const result = await binding
    .prepare(
      `${UPDATE_SELECT}
       WHERE update_record.state = 'published'
         AND (
           update_record.resource_type IS NOT 'order'
           OR (
             update_record.audience = 'account'
             AND EXISTS (
               SELECT 1 FROM orders AS scoped_order
               WHERE scoped_order.id = update_record.resource_id
                 AND scoped_order.customer_user_id = ?1
                 AND scoped_order.status = 'fulfilled'
                 AND scoped_order.stripe_environment = 'test'
                 AND scoped_order.livemode = 0
             )
           )
         )
         AND (
           update_record.audience = 'public'
           OR (
             update_record.audience = 'account'
             AND ${customerAuthority?.sql ?? "0"}
           )
         )
       ORDER BY update_record.published_at DESC, update_record.id
       LIMIT 200`,
    )
    .bind(customerUserId, ...(customerAuthority?.bindings ?? []))
    .all<UpdateRow>();
  if (!result.success)
    integrity("D1 did not return the published update feed.");
  return Object.freeze(
    await Promise.all(
      result.results.map((row) => mapPublished(binding, row, customerUserId)),
    ),
  );
}

export async function readPublishedUpdateBySlug(
  binding: D1Database,
  rawSlug: string,
  customerUserId: string | null,
): Promise<PublishedUpdateDTO | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  if (customerUserId !== null) await requireCustomer(binding, customerUserId);
  const customerAuthority =
    customerUserId === null ? null : activeCustomerCondition(customerUserId);
  const row = await binding
    .prepare(
      `${UPDATE_SELECT}
       WHERE update_record.slug = ?2
         AND update_record.state = 'published'
         AND (
           update_record.resource_type IS NOT 'order'
           OR (
             update_record.audience = 'account'
             AND EXISTS (
               SELECT 1 FROM orders AS scoped_order
               WHERE scoped_order.id = update_record.resource_id
                 AND scoped_order.customer_user_id = ?1
                 AND scoped_order.status = 'fulfilled'
                 AND scoped_order.stripe_environment = 'test'
                 AND scoped_order.livemode = 0
             )
           )
         )
         AND (
           update_record.audience = 'public'
           OR (
             update_record.audience = 'account'
             AND ${customerAuthority?.sql ?? "0"}
           )
         )
       LIMIT 1`,
    )
    .bind(customerUserId, rawSlug, ...(customerAuthority?.bindings ?? []))
    .first<UpdateRow>();
  return row ? mapPublished(binding, row, customerUserId) : null;
}

export async function countUnreadUpdates(
  binding: D1Database,
  customerUserId: string,
): Promise<number> {
  await requireCustomer(binding, customerUserId);
  const customerAuthority = activeCustomerCondition(customerUserId);
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM updates AS update_record
       WHERE update_record.state = 'published'
         AND (
           update_record.resource_type IS NOT 'order'
           OR EXISTS (
             SELECT 1 FROM orders AS scoped_order
             WHERE scoped_order.id = update_record.resource_id
               AND scoped_order.customer_user_id = ?1
               AND scoped_order.status = 'fulfilled'
               AND scoped_order.stripe_environment = 'test'
               AND scoped_order.livemode = 0
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM update_reads AS update_read
           WHERE update_read.update_id = update_record.id
             AND update_read.user_id = ?1
         )
         AND ${customerAuthority.sql}`,
    )
    .bind(customerUserId, ...customerAuthority.bindings)
    .first<CountRow>();
  if (!Number.isSafeInteger(row?.count) || (row?.count ?? -1) < 0) {
    integrity("D1 returned invalid unread update count.");
  }
  return row!.count;
}

function mapAdmin(row: UpdateRow): AdminUpdateDTO {
  const type = resourceType(row.resource_type);
  const resourceId =
    type === null ? null : id(row.resource_id, "update resource ID");
  const rowState = row.state;
  if (
    rowState !== "draft" &&
    rowState !== "published" &&
    rowState !== "archived"
  ) {
    integrity("D1 returned invalid update state.");
  }
  return Object.freeze({
    id: id(row.id, "update ID"),
    slug: slug(row.slug),
    title: nonBlank(row.title, "update title"),
    summary: string(row.summary, "update summary"),
    body: body(row.body_json),
    audience: audience(row.audience),
    resource:
      type === null || resourceId === null
        ? null
        : Object.freeze({ type, id: resourceId }),
    state: rowState,
    publishedAt: nullableTimestamp(row.published_at, "update publication time"),
    revision: integer(row.revision, "update revision"),
    updatedAt: timestamp(row.updated_at, "update modification time"),
  });
}

const ADMIN_SELECT = `
  SELECT id, slug, title, summary, body_json, audience, resource_type,
         resource_id, state, published_at, revision, updated_at,
         NULL AS read_id
  FROM updates`;

export async function listAdminUpdates(
  binding: D1Database,
): Promise<readonly AdminUpdateDTO[]> {
  const result = await binding
    .prepare(`${ADMIN_SELECT} ORDER BY updated_at DESC, id LIMIT 200`)
    .all<UpdateRow>();
  if (!result.success) integrity("D1 did not return update administration.");
  return Object.freeze(result.results.map(mapAdmin));
}

export async function readAdminUpdateBySlug(
  binding: D1Database,
  rawSlug: string,
): Promise<AdminUpdateDTO | null> {
  if (!SAFE_SLUG.test(rawSlug)) return null;
  const row = await binding
    .prepare(`${ADMIN_SELECT} WHERE slug = ?1 LIMIT 1`)
    .bind(rawSlug)
    .first<UpdateRow>();
  return row ? mapAdmin(row) : null;
}
