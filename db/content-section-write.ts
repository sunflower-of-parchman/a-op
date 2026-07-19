import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  ContentSectionDraftInput,
  ContentSectionPublicationState,
} from "@/lib/content-sections/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface ContentSectionAggregateRow {
  id: string;
  draft_revision_id: string;
  published_revision_id: string | null;
  publication_state: ContentSectionPublicationState;
  version: number;
  draft_revision: number;
}

interface RevisionNumberRow {
  revision: number;
}

interface ExistsRow {
  present: number;
}

export interface ContentSectionDraftResult {
  readonly sectionId: string;
  readonly sectionKey: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly version: number;
  readonly created: boolean;
  readonly publicationState: "draft" | "published";
  readonly publishedRevisionId: string | null;
}

export interface ContentSectionPublishResult {
  readonly sectionId: string;
  readonly sectionKey: string;
  readonly publishedRevisionId: string;
  readonly publishedRevision: number;
  readonly version: number;
  readonly publicationState: "published";
}

export interface ContentSectionArchiveResult {
  readonly sectionId: string;
  readonly sectionKey: string;
  readonly draftRevisionId: string;
  readonly version: number;
  readonly publicationState: "archived";
}

async function readAggregate(
  binding: D1Database,
  sectionKey: string,
): Promise<ContentSectionAggregateRow | null> {
  return binding
    .prepare(
      `SELECT
         section.id,
         section.draft_revision_id,
         section.published_revision_id,
         section.publication_state,
         section.version,
         draft.revision AS draft_revision
       FROM content_sections AS section
       JOIN content_section_revisions AS draft
         ON draft.id = section.draft_revision_id
        AND draft.content_section_id = section.id
       WHERE section.section_key = ?1
       LIMIT 1`,
    )
    .bind(sectionKey)
    .first<ContentSectionAggregateRow>();
}

async function nextRevision(
  binding: D1Database,
  sectionId: string,
): Promise<number> {
  const row = await binding
    .prepare(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
       FROM content_section_revisions
       WHERE content_section_id = ?1`,
    )
    .bind(sectionId)
    .first<RevisionNumberRow>();
  return row?.revision ?? 1;
}

function requireMutable(
  aggregate: ContentSectionAggregateRow,
): asserts aggregate is ContentSectionAggregateRow & {
  publication_state: "draft" | "published";
} {
  if (aggregate.publication_state !== "archived") return;
  throw new RuntimeError(
    "CONTENT_SECTION_ARCHIVED",
    "An archived content section is immutable.",
    {
      status: 409,
      publicMessage: "Archived content sections remain frozen.",
    },
  );
}

function notFound(): never {
  throw new RuntimeError(
    "CONTENT_SECTION_NOT_FOUND",
    "The content section does not exist.",
    { status: 404, publicMessage: "That content section was not found." },
  );
}

const PUBLISHED_PAGE_REFERENCE_CONDITION = `NOT EXISTS (
  SELECT 1
  FROM page_revision_sections AS published_page_section
  JOIN pages AS published_page
    ON published_page.published_revision_id =
       published_page_section.page_revision_id
   AND published_page.publication_state = 'published'
  WHERE published_page_section.content_section_id = section.id
)`;

async function isReferencedByPublishedPage(
  binding: D1Database,
  sectionId: string,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT 1 AS present
       FROM page_revision_sections AS published_page_section
       JOIN pages AS published_page
         ON published_page.published_revision_id =
            published_page_section.page_revision_id
        AND published_page.publication_state = 'published'
       WHERE published_page_section.content_section_id = ?1
       LIMIT 1`,
    )
    .bind(sectionId)
    .first<ExistsRow>();
  return row?.present === 1;
}

function sectionInUse(): never {
  throw new RuntimeError(
    "CONTENT_SECTION_IN_USE",
    "A currently published page references this content section.",
    {
      status: 409,
      publicMessage:
        "This section is used by a published page and cannot be archived.",
    },
  );
}

export async function saveContentSectionDraft(
  binding: D1Database,
  input: ContentSectionDraftInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<ContentSectionDraftResult>> {
  const operation = "content-section.draft.save";
  const mutation = await prepareMutation<ContentSectionDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, ...input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, input.sectionKey);
  if (!aggregate && expectedVersion !== 0) {
    throw staleMutation("content section draft");
  }
  if (aggregate && aggregate.version !== expectedVersion) {
    throw staleMutation("content section draft");
  }
  if (aggregate) requireMutable(aggregate);

  const sectionId = aggregate?.id ?? `content_section_${crypto.randomUUID()}`;
  const revision = aggregate ? await nextRevision(binding, sectionId) : 1;
  const revisionId = `content_section_revision_${crypto.randomUUID()}`;
  const result: ContentSectionDraftResult = Object.freeze({
    sectionId,
    sectionKey: input.sectionKey,
    revisionId,
    revision,
    version: aggregate ? expectedVersion + 1 : 1,
    created: aggregate === null,
    publicationState: aggregate?.publication_state ?? "draft",
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  });
  const authority = activeOwnerCondition(context.actorUserId);

  let statements: D1PreparedStatement[];
  let sectionChangeIndex: number;
  let revisionChangeIndex: number;
  if (!aggregate) {
    statements = [
      binding
        .prepare(
          `INSERT INTO content_sections
            (id, section_key, draft_revision_id, publication_state, version,
             last_operation_key)
           SELECT ?1, ?2, ?3, 'draft', 1, ?4
           WHERE NOT EXISTS (
             SELECT 1 FROM content_sections WHERE section_key = ?2
           )
             AND ${authority.sql}`,
        )
        .bind(
          sectionId,
          input.sectionKey,
          revisionId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
      binding
        .prepare(
          `INSERT INTO content_section_revisions
            (id, content_section_id, revision, kind, heading, body_text,
             created_by_user_id)
           SELECT ?1, section.id, 1, ?2, ?3, ?4, ?5
           FROM content_sections AS section
           WHERE section.id = ?6
             AND section.section_key = ?7
             AND section.version = 1
             AND section.draft_revision_id = ?1
             AND section.publication_state = 'draft'
             AND section.last_operation_key = ?8
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          input.kind,
          input.heading,
          input.bodyText,
          context.actorUserId,
          sectionId,
          input.sectionKey,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    ];
    sectionChangeIndex = 0;
    revisionChangeIndex = 1;
  } else {
    statements = [
      binding
        .prepare(
          `INSERT INTO content_section_revisions
            (id, content_section_id, revision, kind, heading, body_text,
             created_by_user_id)
           SELECT ?1, section.id, ?2, ?3, ?4, ?5, ?6
           FROM content_sections AS section
           WHERE section.id = ?7
             AND section.section_key = ?8
             AND section.version = ?9
             AND section.draft_revision_id = ?10
             AND section.publication_state != 'archived'
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          revision,
          input.kind,
          input.heading,
          input.bodyText,
          context.actorUserId,
          sectionId,
          input.sectionKey,
          expectedVersion,
          aggregate.draft_revision_id,
          ...authority.bindings,
        ),
      binding
        .prepare(
          `UPDATE content_sections AS section
           SET draft_revision_id = ?1,
               version = version + 1,
               last_operation_key = ?2,
               updated_at = CURRENT_TIMESTAMP
           WHERE section.id = ?3
             AND section.section_key = ?4
             AND section.version = ?5
             AND section.draft_revision_id = ?6
             AND section.publication_state != 'archived'
             AND EXISTS (
               SELECT 1 FROM content_section_revisions AS exact_draft
               WHERE exact_draft.id = ?7
                 AND exact_draft.content_section_id = section.id
                 AND exact_draft.revision = ?8
             )
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          sectionId,
          input.sectionKey,
          expectedVersion,
          aggregate.draft_revision_id,
          revisionId,
          revision,
          ...authority.bindings,
        ),
    ];
    revisionChangeIndex = 0;
    sectionChangeIndex = 1;
  }

  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "content-section",
        subjectId: sectionId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          revision,
          created: aggregate === null,
          kind: input.kind,
          heading: input.heading,
          bodyLength: input.bodyText.length,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1
        FROM content_sections AS section
        JOIN content_section_revisions AS exact_draft
          ON exact_draft.id = section.draft_revision_id
         AND exact_draft.content_section_id = section.id
        WHERE section.id = ?
          AND section.section_key = ?
          AND section.version = ?
          AND section.draft_revision_id = ?
          AND section.publication_state != 'archived'
          AND section.last_operation_key = ?
          AND exact_draft.revision = ?
      ) AND ${authority.sql}`,
      [
        sectionId,
        input.sectionKey,
        result.version,
        revisionId,
        mutation.namespacedKey,
        revision,
        ...authority.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      changedRows(results[sectionChangeIndex]) !== 1 ||
      changedRows(results[revisionChangeIndex]) !== 1
    ) {
      throw staleMutation("content section draft");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function publishContentSection(
  binding: D1Database,
  sectionKey: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<ContentSectionPublishResult>> {
  const operation = "content-section.publish";
  const mutation = await prepareMutation<ContentSectionPublishResult>(
    binding,
    operation,
    context,
    { sectionKey, expectedVersion },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, sectionKey);
  if (!aggregate) notFound();
  if (aggregate.version !== expectedVersion) {
    throw staleMutation("content section publication");
  }
  requireMutable(aggregate);

  const result: ContentSectionPublishResult = Object.freeze({
    sectionId: aggregate.id,
    sectionKey,
    publishedRevisionId: aggregate.draft_revision_id,
    publishedRevision: aggregate.draft_revision,
    version: expectedVersion + 1,
    publicationState: "published",
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE content_sections AS section
         SET published_revision_id = ?1,
             publication_state = 'published',
             version = version + 1,
             last_operation_key = ?2,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE section.id = ?3
           AND section.section_key = ?4
           AND section.version = ?5
           AND section.draft_revision_id = ?1
           AND section.publication_state != 'archived'
           AND EXISTS (
             SELECT 1 FROM content_section_revisions AS exact_draft
             WHERE exact_draft.id = ?1
               AND exact_draft.content_section_id = section.id
               AND exact_draft.revision = ?6
           )
           AND ${authority.sql}`,
      )
      .bind(
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        aggregate.id,
        sectionKey,
        expectedVersion,
        aggregate.draft_revision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "content-section",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { publishedRevision: aggregate.draft_revision },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1
        FROM content_sections AS section
        JOIN content_section_revisions AS exact_draft
          ON exact_draft.id = section.draft_revision_id
         AND exact_draft.content_section_id = section.id
        WHERE section.id = ?
          AND section.section_key = ?
          AND section.version = ?
          AND section.publication_state = 'published'
          AND section.draft_revision_id = ?
          AND section.published_revision_id = ?
          AND section.last_operation_key = ?
          AND exact_draft.revision = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        sectionKey,
        result.version,
        aggregate.draft_revision_id,
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        aggregate.draft_revision,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("content section publication");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function archiveContentSection(
  binding: D1Database,
  sectionKey: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<ContentSectionArchiveResult>> {
  const operation = "content-section.archive";
  const mutation = await prepareMutation<ContentSectionArchiveResult>(
    binding,
    operation,
    context,
    { sectionKey, expectedVersion },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const aggregate = await readAggregate(binding, sectionKey);
  if (!aggregate) notFound();
  if (aggregate.version !== expectedVersion) {
    throw staleMutation("content section archive");
  }
  requireMutable(aggregate);
  if (await isReferencedByPublishedPage(binding, aggregate.id)) {
    sectionInUse();
  }

  const result: ContentSectionArchiveResult = Object.freeze({
    sectionId: aggregate.id,
    sectionKey,
    draftRevisionId: aggregate.draft_revision_id,
    version: expectedVersion + 1,
    publicationState: "archived",
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE content_sections AS section
         SET publication_state = 'archived',
             version = version + 1,
             last_operation_key = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE section.id = ?2
           AND section.section_key = ?3
           AND section.version = ?4
           AND section.draft_revision_id = ?5
           AND section.publication_state != 'archived'
           AND EXISTS (
             SELECT 1 FROM content_section_revisions AS exact_draft
             WHERE exact_draft.id = ?5
               AND exact_draft.content_section_id = section.id
               AND exact_draft.revision = ?6
           )
           AND ${PUBLISHED_PAGE_REFERENCE_CONDITION}
           AND ${authority.sql}`,
      )
      .bind(
        mutation.namespacedKey,
        aggregate.id,
        sectionKey,
        expectedVersion,
        aggregate.draft_revision_id,
        aggregate.draft_revision,
        ...authority.bindings,
      ),
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "content-section",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          draftRevision: aggregate.draft_revision,
          publishedRevisionPreserved: aggregate.published_revision_id !== null,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1
        FROM content_sections AS section
        JOIN content_section_revisions AS exact_draft
          ON exact_draft.id = section.draft_revision_id
         AND exact_draft.content_section_id = section.id
        WHERE section.id = ?
          AND section.section_key = ?
          AND section.version = ?
          AND section.publication_state = 'archived'
          AND section.draft_revision_id = ?
          AND section.last_operation_key = ?
          AND exact_draft.revision = ?
          AND ${PUBLISHED_PAGE_REFERENCE_CONDITION}
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        sectionKey,
        result.version,
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        aggregate.draft_revision,
        ...authority.bindings,
      ],
    ),
  ];

  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw staleMutation("content section archive");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
