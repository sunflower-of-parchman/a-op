import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeOwnerCondition,
  activePageEditorCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type { ModuleKey } from "@/lib/modules/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export type PageKind = "standard" | "legal" | "system";

export interface PageDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
  readonly sectionRevisionIds?: readonly string[];
  readonly moduleKey: ModuleKey | null;
  readonly kind: PageKind;
}

interface PageAggregateRow {
  id: string;
  draft_revision_id: string;
  published_revision_id: string | null;
  publication_state: "draft" | "published" | "archived";
  version: number;
  draft_module_key: ModuleKey | null;
  draft_kind: PageKind;
}

interface RevisionNumberRow {
  revision: number;
}

function prepareRequiredPageAuditEvent(
  binding: D1Database,
  input: Parameters<typeof prepareConditionalAuditEvent>[1],
  conditionSql: string,
  conditionBindings: readonly (null | number | string)[],
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, request_fingerprint, request_id, details_json,
         result_json)
       VALUES (?, ?, CASE WHEN (${conditionSql}) THEN ? ELSE NULL END,
               ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id ?? `audit_${crypto.randomUUID()}`,
      input.actorUserId,
      ...conditionBindings,
      input.action,
      input.subjectType,
      input.subjectId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.requestId,
      JSON.stringify(input.details ?? {}),
      JSON.stringify(input.result),
    );
}

function requiredAuditGuardFailed(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:NOT NULL|not-null).*audit_events\.action|audit_events\.action.*(?:NOT NULL|not-null)/i.test(
      error.message,
    )
  );
}

export interface PageDraftResult {
  readonly pageId: string;
  readonly slug: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly version: number;
  readonly created: boolean;
  readonly publishedRevisionId: string | null;
}

export interface PagePublishResult {
  readonly pageId: string;
  readonly slug: string;
  readonly publishedRevisionId: string;
  readonly version: number;
  readonly publicationState: "published";
}

export interface PageUnpublishResult {
  readonly pageId: string;
  readonly slug: string;
  readonly version: number;
  readonly publicationState: "draft";
}

async function readPageAggregate(
  binding: D1Database,
  slug: string,
): Promise<PageAggregateRow | null> {
  return binding
    .prepare(
      `SELECT pages.id, pages.draft_revision_id, pages.published_revision_id,
              pages.publication_state, pages.version,
              draft.module_key AS draft_module_key,
              draft.kind AS draft_kind
       FROM pages
       JOIN page_revisions AS draft ON draft.id = pages.draft_revision_id
       WHERE pages.slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<PageAggregateRow>();
}

async function nextPageRevision(
  binding: D1Database,
  pageId: string,
): Promise<number> {
  const row = await binding
    .prepare(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
       FROM page_revisions
       WHERE page_id = ?1`,
    )
    .bind(pageId)
    .first<RevisionNumberRow>();
  return row?.revision ?? 1;
}

export async function savePageDraft(
  binding: D1Database,
  input: PageDraftInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<PageDraftResult>> {
  const operation = "page.draft.save";
  const mutation = await prepareMutation<PageDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readPageAggregate(binding, input.slug);
  if (!aggregate && expectedVersion !== 0) throw staleMutation("page draft");
  if (aggregate && aggregate.version !== expectedVersion) {
    throw staleMutation("page draft");
  }
  if (aggregate?.publication_state === "archived") {
    throw new RuntimeError(
      "PAGE_ARCHIVED",
      "An archived page cannot be edited.",
      {
        status: 409,
        publicMessage: "Restore this page before editing it.",
      },
    );
  }

  const sectionRevisionIds = Object.freeze([
    ...(input.sectionRevisionIds ?? []),
  ]);
  const pageId = aggregate?.id ?? `page_${input.slug}_${crypto.randomUUID()}`;
  const revision = aggregate ? await nextPageRevision(binding, pageId) : 1;
  const revisionId = `page_revision_${revision}_${crypto.randomUUID()}`;
  const result: PageDraftResult = {
    pageId,
    slug: input.slug,
    revisionId,
    revision,
    version: aggregate ? expectedVersion + 1 : 1,
    created: aggregate === null,
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  };
  const pageAuthority = activePageEditorCondition(
    context.actorUserId,
    input.slug,
  );
  const ownerAuthority = activeOwnerCondition(context.actorUserId);
  const structuralChange = aggregate
    ? aggregate.draft_module_key !== input.moduleKey ||
      aggregate.draft_kind !== input.kind
    : input.moduleKey !== null || input.kind !== "standard";
  const structuralAuthority = structuralChange
    ? ownerAuthority
    : { sql: "1 = 1", bindings: [] as readonly string[] };
  let statements: D1PreparedStatement[];
  let aggregateChangeIndex: number;
  if (!aggregate) {
    statements = [
      binding
        .prepare(
          `INSERT INTO pages
            (id, slug, module_key, kind, draft_revision_id,
             publication_state, version, last_operation_key)
           SELECT ?1, ?2, ?3, ?4, ?5, 'draft', 1, ?6
           WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = ?2)
             AND ${pageAuthority.sql}
             AND ${structuralAuthority.sql}`,
        )
        .bind(
          pageId,
          input.slug,
          input.moduleKey,
          input.kind,
          revisionId,
          mutation.namespacedKey,
          ...pageAuthority.bindings,
          ...structuralAuthority.bindings,
        ),
      binding
        .prepare(
          `INSERT INTO page_revisions
            (id, page_id, revision, module_key, kind, title, introduction,
             body_text, created_by_user_id)
           SELECT ?1, id, 1, ?2, ?3, ?4, ?5, ?6, ?7
           FROM pages
           WHERE id = ?8 AND version = 1 AND draft_revision_id = ?1
             AND last_operation_key = ?9
             AND ${pageAuthority.sql}`,
        )
        .bind(
          revisionId,
          input.moduleKey,
          input.kind,
          input.title,
          input.introduction,
          input.bodyText,
          context.actorUserId,
          pageId,
          mutation.namespacedKey,
          ...pageAuthority.bindings,
        ),
    ];
    aggregateChangeIndex = 0;
  } else {
    statements = [
      binding
        .prepare(
          `INSERT INTO page_revisions
            (id, page_id, revision, module_key, kind, title, introduction,
             body_text, created_by_user_id)
           SELECT ?1, id, ?2, ?3, ?4, ?5, ?6, ?7, ?8
           FROM pages
           WHERE id = ?9 AND version = ?10 AND draft_revision_id = ?11
             AND ${pageAuthority.sql}
             AND ${structuralAuthority.sql}`,
        )
        .bind(
          revisionId,
          revision,
          input.moduleKey,
          input.kind,
          input.title,
          input.introduction,
          input.bodyText,
          context.actorUserId,
          pageId,
          expectedVersion,
          aggregate.draft_revision_id,
          ...pageAuthority.bindings,
          ...structuralAuthority.bindings,
        ),
      binding
        .prepare(
          `UPDATE pages
           SET draft_revision_id = ?1,
               version = version + 1,
               last_operation_key = ?2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?3 AND version = ?4 AND draft_revision_id = ?5
             AND ${pageAuthority.sql}
             AND ${structuralAuthority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          pageId,
          expectedVersion,
          aggregate.draft_revision_id,
          ...pageAuthority.bindings,
          ...structuralAuthority.bindings,
        ),
    ];
    aggregateChangeIndex = 1;
  }

  const sectionStatementStart = statements.length;
  sectionRevisionIds.forEach((sectionRevisionId, index) => {
    statements.push(
      binding
        .prepare(
          `INSERT INTO page_revision_sections
            (id, page_revision_id, position, content_section_id,
             content_section_revision_id)
           SELECT ?1, ?2, ?3, section.id, section_revision.id
           FROM content_section_revisions AS section_revision
           JOIN content_sections AS section
             ON section.id = section_revision.content_section_id
            AND section.published_revision_id = section_revision.id
            AND section.publication_state = 'published'
           WHERE section_revision.id = ?4
             AND EXISTS (
               SELECT 1 FROM page_revisions
               WHERE id = ?2 AND page_id = ?5 AND revision = ?6
             )
             AND ${pageAuthority.sql}`,
        )
        .bind(
          `page_revision_section_${crypto.randomUUID()}`,
          revisionId,
          index + 1,
          sectionRevisionId,
          pageId,
          revision,
          ...pageAuthority.bindings,
        ),
    );
  });

  statements.push(
    prepareRequiredPageAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "page",
        subjectId: pageId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { revision, created: aggregate === null },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM pages
        WHERE id = ? AND slug = ? AND version = ? AND draft_revision_id = ?
          AND last_operation_key = ?
      ) AND (
        SELECT COUNT(*) FROM page_revision_sections
        WHERE page_revision_id = ?
      ) = ? AND NOT EXISTS (
        SELECT 1
        FROM page_revision_sections AS linked_section
        JOIN content_sections AS section
          ON section.id = linked_section.content_section_id
        WHERE linked_section.page_revision_id = ?
          AND (
            section.publication_state != 'published'
            OR section.published_revision_id !=
               linked_section.content_section_revision_id
          )
      ) AND ${pageAuthority.sql}`,
      [
        pageId,
        input.slug,
        result.version,
        revisionId,
        mutation.namespacedKey,
        revisionId,
        sectionRevisionIds.length,
        revisionId,
        ...pageAuthority.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[aggregateChangeIndex]) !== 1) {
      throw staleMutation("page draft");
    }
    for (let index = 0; index < sectionRevisionIds.length; index += 1) {
      if (changedRows(results[sectionStatementStart + index]) !== 1) {
        throw staleMutation("page content section");
      }
    }
    return { value: result, replayed: false };
  } catch (error) {
    try {
      return await replayAfterMutationFailure(binding, mutation, error);
    } catch (replayError) {
      if (requiredAuditGuardFailed(replayError)) {
        throw staleMutation("page content section");
      }
      throw replayError;
    }
  }
}

export async function publishPage(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<PagePublishResult>> {
  const operation = "page.publish";
  const mutation = await prepareMutation<PagePublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readPageAggregate(binding, slug);
  if (!aggregate) {
    throw new RuntimeError("PAGE_NOT_FOUND", "Page does not exist.", {
      status: 404,
      publicMessage: "That page was not found.",
    });
  }
  if (aggregate.version !== expectedVersion) {
    throw staleMutation("page publication");
  }
  if (aggregate.publication_state === "archived") {
    throw new RuntimeError(
      "PAGE_ARCHIVED",
      "An archived page cannot be published.",
      { status: 409, publicMessage: "Restore this page before publishing it." },
    );
  }

  const result: PagePublishResult = {
    pageId: aggregate.id,
    slug,
    publishedRevisionId: aggregate.draft_revision_id,
    version: expectedVersion + 1,
    publicationState: "published",
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE pages
         SET published_revision_id = draft_revision_id,
             module_key = (
               SELECT module_key FROM page_revisions
               WHERE id = pages.draft_revision_id
             ),
             kind = (
               SELECT kind FROM page_revisions
               WHERE id = pages.draft_revision_id
             ),
             publication_state = 'published',
             version = version + 1,
             last_operation_key = ?1,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND version = ?3 AND publication_state != 'archived'
           AND NOT EXISTS (
             SELECT 1
             FROM page_revision_sections AS linked_section
             LEFT JOIN content_sections AS section
               ON section.id = linked_section.content_section_id
             WHERE linked_section.page_revision_id = pages.draft_revision_id
               AND (
                 section.id IS NULL
                 OR section.publication_state != 'published'
                 OR section.published_revision_id !=
                    linked_section.content_section_revision_id
               )
           )
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "page",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {},
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM pages
        WHERE id = ? AND version = ? AND publication_state = 'published'
          AND published_revision_id = ?
          AND last_operation_key = ?
          AND NOT EXISTS (
            SELECT 1
            FROM page_revision_sections AS linked_section
            LEFT JOIN content_sections AS section
              ON section.id = linked_section.content_section_id
            WHERE linked_section.page_revision_id = pages.published_revision_id
              AND (
                section.id IS NULL
                OR section.publication_state != 'published'
                OR section.published_revision_id !=
                   linked_section.content_section_revision_id
              )
          )
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        expectedVersion + 1,
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) {
      throw staleMutation("page publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function unpublishPage(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<PageUnpublishResult>> {
  const operation = "page.unpublish";
  const mutation = await prepareMutation<PageUnpublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readPageAggregate(binding, slug);
  if (!aggregate) {
    throw new RuntimeError("PAGE_NOT_FOUND", "Page does not exist.", {
      status: 404,
      publicMessage: "That page was not found.",
    });
  }
  if (aggregate.version !== expectedVersion) {
    throw staleMutation("page publication");
  }
  const result: PageUnpublishResult = {
    pageId: aggregate.id,
    slug,
    version: expectedVersion + 1,
    publicationState: "draft",
  };
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE pages
         SET publication_state = 'draft',
             version = version + 1,
             last_operation_key = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND version = ?3 AND publication_state = 'published'
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        expectedVersion,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "page",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { publishedRevisionPreserved: true },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM pages
        WHERE id = ? AND version = ? AND publication_state = 'draft'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        expectedVersion + 1,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) {
      throw staleMutation("page publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
