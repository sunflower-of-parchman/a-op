import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  activeCustomerCondition,
  activeOwnerCondition,
  activePageEditorCondition,
  type SqlAuthorityCondition,
} from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import { prepareServerTelemetryEvent } from "./telemetry-server.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  CourseDraftInput,
  CourseProgressInput,
  CourseProgressView,
} from "@/lib/courses/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CourseAggregateRow {
  id: string;
  draft_revision_id: string;
  published_revision_id: string | null;
  publication_state: "draft" | "published" | "archived";
  revision: number;
}

interface RevisionNumberRow {
  revision: number;
}

interface CountRow {
  count: number;
}

interface ProgressRow {
  id: string;
  state: "in_progress" | "completed";
  completed_item_keys_json: string;
  last_item_key: string | null;
  started_at: string;
  completed_at: string | null;
  revision: number;
  updated_at: string;
}

interface LessonSnapshotRow {
  lesson_id: string;
  item_keys_json: string;
}

export interface CourseDraftResult {
  readonly courseId: string;
  readonly slug: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly version: number;
  readonly created: boolean;
  readonly publishedRevisionId: string | null;
}

export interface CoursePublishResult {
  readonly courseId: string;
  readonly slug: string;
  readonly publishedRevisionId: string;
  readonly version: number;
  readonly publicationState: "published";
}

export interface CourseUnpublishResult {
  readonly courseId: string;
  readonly slug: string;
  readonly version: number;
  readonly publicationState: "draft";
}

function notFound(): RuntimeError {
  return new RuntimeError("COURSE_NOT_FOUND", "The Course does not exist.", {
    status: 404,
    publicMessage: "That Course was not found.",
  });
}

function publicationBlocked(message: string): RuntimeError {
  return new RuntimeError("COURSE_PUBLICATION_BLOCKED", message, {
    status: 409,
    publicMessage:
      "Complete the Course structure, media, and access plan before publishing.",
  });
}

async function readAggregate(
  binding: D1Database,
  slug: string,
): Promise<CourseAggregateRow | null> {
  return binding
    .prepare(
      `SELECT id, draft_revision_id, published_revision_id,
              publication_state, revision
       FROM courses
       WHERE slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<CourseAggregateRow>();
}

async function nextRevision(
  binding: D1Database,
  courseId: string,
): Promise<number> {
  const row = await binding
    .prepare(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision
       FROM course_revisions
       WHERE course_id = ?1`,
    )
    .bind(courseId)
    .first<RevisionNumberRow>();
  return row?.revision ?? 1;
}

function courseDraftAuthority(
  actorUserId: string,
  slug: string,
  creating: boolean,
): SqlAuthorityCondition {
  return activePageEditorCondition(actorUserId, creating ? "*" : slug);
}

function prepareRevision(
  binding: D1Database,
  input: CourseDraftInput,
  courseId: string,
  revisionId: string,
  revision: number,
  actorUserId: string,
  authority: SqlAuthorityCondition,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT INTO course_revisions
        (id, course_id, revision, title, description, access_mode,
         access_plan_id, access_plan_revision, estimated_minutes,
         created_by_user_id)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
       WHERE EXISTS (SELECT 1 FROM courses WHERE id = ?2)
         AND ${authority.sql}`,
    )
    .bind(
      revisionId,
      courseId,
      revision,
      input.title,
      input.description,
      input.accessMode,
      input.accessPlanId,
      input.accessPlanRevision,
      input.estimatedMinutes,
      actorUserId,
      ...authority.bindings,
    );
}

function prepareNestedRevision(
  binding: D1Database,
  input: CourseDraftInput,
  revisionId: string,
  authority: SqlAuthorityCondition,
): readonly D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  input.sections.forEach((section, sectionIndex) => {
    const sectionId = `course_section_${crypto.randomUUID()}`;
    statements.push(
      binding
        .prepare(
          `INSERT INTO course_sections
            (id, course_revision_id, section_key, position, title, description)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6
           WHERE EXISTS (SELECT 1 FROM course_revisions WHERE id = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          sectionId,
          revisionId,
          section.sectionKey,
          sectionIndex + 1,
          section.title,
          section.description,
          ...authority.bindings,
        ),
    );
    section.lessons.forEach((lesson, lessonIndex) => {
      const lessonId = `lesson_${crypto.randomUUID()}`;
      statements.push(
        binding
          .prepare(
            `INSERT INTO lessons
              (id, course_revision_id, course_section_id, lesson_key, slug,
               position, title, summary, access_mode, estimated_minutes)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
             WHERE EXISTS (
               SELECT 1 FROM course_sections
               WHERE id = ?3 AND course_revision_id = ?2
             ) AND ${authority.sql}`,
          )
          .bind(
            lessonId,
            revisionId,
            sectionId,
            lesson.lessonKey,
            lesson.slug,
            lessonIndex + 1,
            lesson.title,
            lesson.summary,
            lesson.accessMode,
            lesson.estimatedMinutes,
            ...authority.bindings,
          ),
      );
      lesson.items.forEach((item, itemIndex) => {
        statements.push(
          binding
            .prepare(
              `INSERT INTO lesson_items
                (id, lesson_id, item_key, position, item_type, content_json,
                 media_derivative_id, alt_text, transcript_text)
               SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
               WHERE EXISTS (SELECT 1 FROM lessons WHERE id = ?2)
                 AND ${authority.sql}`,
            )
            .bind(
              `lesson_item_${crypto.randomUUID()}`,
              lessonId,
              item.itemKey,
              itemIndex + 1,
              item.itemType,
              JSON.stringify(item.content),
              item.mediaDerivativeId,
              item.altText,
              item.transcriptText,
              ...authority.bindings,
            ),
        );
      });
    });
  });
  return statements;
}

function cleanupRevision(
  binding: D1Database,
  courseId: string,
  revisionId: string,
  operationKey: string,
): D1PreparedStatement {
  return binding
    .prepare(
      `DELETE FROM course_revisions
       WHERE id = ?1
         AND NOT EXISTS (
           SELECT 1 FROM courses
           WHERE id = ?2
             AND draft_revision_id = ?1
             AND last_operation_key = ?3
         )`,
    )
    .bind(revisionId, courseId, operationKey);
}

function cleanupFailedCreate(
  binding: D1Database,
  courseId: string,
  operationKey: string,
): D1PreparedStatement {
  return binding
    .prepare(
      `DELETE FROM courses
       WHERE id = ?1 AND last_operation_key = ?2
         AND NOT EXISTS (
           SELECT 1 FROM course_revisions
           WHERE id = courses.draft_revision_id AND course_id = courses.id
         )`,
    )
    .bind(courseId, operationKey);
}

export async function saveCourseDraft(
  binding: D1Database,
  input: CourseDraftInput,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CourseDraftResult>> {
  const operation = "course.draft.save";
  const mutation = await prepareMutation<CourseDraftResult>(
    binding,
    operation,
    context,
    { expectedVersion, course: input },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const aggregate = await readAggregate(binding, input.slug);
  if (!aggregate && expectedVersion !== 0) throw staleMutation("Course draft");
  if (aggregate && aggregate.revision !== expectedVersion) {
    throw staleMutation("Course draft");
  }
  if (aggregate?.publication_state === "archived") {
    throw new RuntimeError(
      "COURSE_ARCHIVED",
      "An archived Course cannot be edited.",
      {
        status: 409,
        publicMessage: "Restore this Course before editing it.",
      },
    );
  }
  const courseId = aggregate?.id ?? `course_${crypto.randomUUID()}`;
  const revision = aggregate ? await nextRevision(binding, courseId) : 1;
  const revisionId = `course_revision_${revision}_${crypto.randomUUID()}`;
  const result: CourseDraftResult = Object.freeze({
    courseId,
    slug: input.slug,
    revisionId,
    revision,
    version: aggregate ? expectedVersion + 1 : 1,
    created: aggregate === null,
    publishedRevisionId: aggregate?.published_revision_id ?? null,
  });
  const authority = courseDraftAuthority(
    context.actorUserId,
    input.slug,
    aggregate === null,
  );
  const statements: D1PreparedStatement[] = [];
  let aggregateChangeIndex = 0;
  if (!aggregate) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO courses
            (id, slug, draft_revision_id, publication_state, revision,
             last_operation_key)
           SELECT ?1, ?2, ?3, 'draft', 1, ?4
           WHERE NOT EXISTS (SELECT 1 FROM courses WHERE slug = ?2)
             AND ${authority.sql}`,
        )
        .bind(
          courseId,
          input.slug,
          revisionId,
          mutation.namespacedKey,
          ...authority.bindings,
        ),
    );
    aggregateChangeIndex = 0;
  }
  statements.push(
    prepareRevision(
      binding,
      input,
      courseId,
      revisionId,
      revision,
      context.actorUserId,
      authority,
    ),
    ...prepareNestedRevision(binding, input, revisionId, authority),
  );
  if (aggregate) {
    aggregateChangeIndex = statements.length;
    statements.push(
      binding
        .prepare(
          `UPDATE courses
           SET draft_revision_id = ?1,
               revision = revision + 1,
               last_operation_key = ?2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?3 AND revision = ?4
             AND publication_state != 'archived'
             AND ${authority.sql}`,
        )
        .bind(
          revisionId,
          mutation.namespacedKey,
          courseId,
          expectedVersion,
          ...authority.bindings,
        ),
    );
  }
  statements.push(
    cleanupRevision(binding, courseId, revisionId, mutation.namespacedKey),
  );
  if (!aggregate) {
    statements.push(
      cleanupFailedCreate(binding, courseId, mutation.namespacedKey),
    );
  }
  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "course",
        subjectId: courseId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          revision,
          sections: input.sections.length,
          lessons: input.sections.reduce(
            (count, section) => count + section.lessons.length,
            0,
          ),
        },
        result: { ...result },
      },
      `EXISTS (
         SELECT 1 FROM courses
         WHERE id = ? AND slug = ? AND revision = ?
           AND draft_revision_id = ? AND last_operation_key = ?
       ) AND ${authority.sql}`,
      [
        courseId,
        input.slug,
        result.version,
        revisionId,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  );
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[aggregateChangeIndex]) !== 1) {
      throw staleMutation("Course draft");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

const MEDIA_PUBLICATION_VALIDITY = `NOT EXISTS (
  SELECT 1
  FROM lessons AS media_lesson
  JOIN lesson_items AS media_item ON media_item.lesson_id = media_lesson.id
  WHERE media_lesson.course_revision_id = course_revisions.id
    AND media_item.item_type IN ('image', 'audio', 'video', 'download')
    AND NOT EXISTS (
      SELECT 1
      FROM media_derivatives AS derivative
      JOIN media_objects AS source ON source.id = derivative.source_media_id
      WHERE derivative.id = media_item.media_derivative_id
        AND derivative.status = 'ready'
        AND derivative.approval_state = 'approved'
        AND derivative.object_key GLOB 'derivatives/*'
        AND derivative.content_type IS NOT NULL
        AND derivative.byte_length IS NOT NULL
        AND derivative.content_sha256 IS NOT NULL
        AND source.status = 'ready'
        AND source.approval_state = 'approved'
        AND source.content_sha256 IS NOT NULL
        AND (
          (media_item.item_type = 'image'
            AND derivative.content_type LIKE 'image/%'
            AND derivative.kind IN ('artwork', 'poster', 'thumbnail', 'other'))
          OR (media_item.item_type = 'audio'
            AND derivative.content_type LIKE 'audio/%'
            AND derivative.kind IN ('streaming', 'other'))
          OR (media_item.item_type = 'video'
            AND derivative.content_type LIKE 'video/%'
            AND derivative.kind IN ('streaming', 'other'))
          OR (media_item.item_type = 'download'
            AND derivative.kind IN ('download', 'document', 'other'))
        )
    )
)`;

function planItemHasAction(alias: string, action: string): string {
  return `EXISTS (
    SELECT 1 FROM json_each(${alias}.actions_json)
    WHERE json_each.value = '${action}'
  )`;
}

const COURSE_PLAN_COVERAGE = `(
  course_revisions.access_mode != 'protected'
  AND course_revisions.access_plan_id IS NULL
  AND course_revisions.access_plan_revision IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lessons AS protected_lesson
    WHERE protected_lesson.course_revision_id = course_revisions.id
      AND protected_lesson.access_mode = 'protected'
  )
) OR (
  course_revisions.access_mode = 'protected'
  AND EXISTS (
    SELECT 1
    FROM access_plans
    WHERE access_plans.id = course_revisions.access_plan_id
      AND access_plans.state = 'active'
      AND access_plans.revision = course_revisions.access_plan_revision
  )
  AND EXISTS (
    SELECT 1
    FROM access_plan_items AS course_plan_item
    WHERE course_plan_item.access_plan_id = course_revisions.access_plan_id
      AND course_plan_item.resource_type = 'course'
      AND course_plan_item.resource_id = courses.id
      AND ${planItemHasAction("course_plan_item", "view")}
      AND (
        NOT EXISTS (
          SELECT 1 FROM lessons AS inherited_stream_lesson
          JOIN lesson_items AS inherited_stream_item
            ON inherited_stream_item.lesson_id = inherited_stream_lesson.id
          WHERE inherited_stream_lesson.course_revision_id = course_revisions.id
            AND inherited_stream_lesson.access_mode IN ('inherit', 'protected')
            AND inherited_stream_item.item_type IN ('audio', 'video')
        ) OR ${planItemHasAction("course_plan_item", "stream")}
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM lessons AS inherited_download_lesson
          JOIN lesson_items AS inherited_download_item
            ON inherited_download_item.lesson_id = inherited_download_lesson.id
          WHERE inherited_download_lesson.course_revision_id = course_revisions.id
            AND inherited_download_lesson.access_mode IN ('inherit', 'protected')
            AND inherited_download_item.item_type = 'download'
        ) OR ${planItemHasAction("course_plan_item", "download")}
      )
  )
)`;

const COURSE_PUBLICATION_VALIDITY = `EXISTS (
  SELECT 1
  FROM course_revisions
  WHERE course_revisions.id = courses.draft_revision_id
    AND course_revisions.course_id = courses.id
    AND EXISTS (
      SELECT 1 FROM course_sections
      WHERE course_sections.course_revision_id = course_revisions.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM course_sections AS empty_section
      WHERE empty_section.course_revision_id = course_revisions.id
        AND NOT EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.course_section_id = empty_section.id
            AND lessons.course_revision_id = course_revisions.id
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM lessons AS empty_lesson
      WHERE empty_lesson.course_revision_id = course_revisions.id
        AND NOT EXISTS (
          SELECT 1 FROM lesson_items
          WHERE lesson_items.lesson_id = empty_lesson.id
        )
    )
    AND ${MEDIA_PUBLICATION_VALIDITY}
    AND (${COURSE_PLAN_COVERAGE})
)`;

async function assertPublicationReady(
  binding: D1Database,
  courseId: string,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT COUNT(*) AS count
       FROM courses
       WHERE id = ?1 AND ${COURSE_PUBLICATION_VALIDITY}`,
    )
    .bind(courseId)
    .first<CountRow>();
  if (row?.count !== 1) {
    throw publicationBlocked(
      "The Course draft is missing complete sections, lessons, items, approved media, or exact access-plan coverage.",
    );
  }
}

export async function publishCourse(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CoursePublishResult>> {
  const operation = "course.publish";
  const mutation = await prepareMutation<CoursePublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, slug);
  if (!aggregate) throw notFound();
  if (aggregate.revision !== expectedVersion)
    throw staleMutation("Course publication");
  if (aggregate.publication_state === "archived") {
    throw new RuntimeError(
      "COURSE_ARCHIVED",
      "An archived Course cannot be published.",
      {
        status: 409,
        publicMessage: "Restore this Course before publishing it.",
      },
    );
  }
  await assertPublicationReady(binding, aggregate.id);
  const result: CoursePublishResult = Object.freeze({
    courseId: aggregate.id,
    slug,
    publishedRevisionId: aggregate.draft_revision_id,
    version: expectedVersion + 1,
    publicationState: "published",
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE courses
         SET published_revision_id = draft_revision_id,
             publication_state = 'published',
             revision = revision + 1,
             last_operation_key = ?1,
             published_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3 AND publication_state != 'archived'
           AND ${COURSE_PUBLICATION_VALIDITY}
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
        subjectType: "course",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { publishedRevisionId: aggregate.draft_revision_id },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM courses
        WHERE id = ? AND revision = ? AND publication_state = 'published'
          AND published_revision_id = ? AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.version,
        aggregate.draft_revision_id,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1)
      throw staleMutation("Course publication");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function unpublishCourse(
  binding: D1Database,
  slug: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<CourseUnpublishResult>> {
  const operation = "course.unpublish";
  const mutation = await prepareMutation<CourseUnpublishResult>(
    binding,
    operation,
    context,
    { slug, expectedVersion },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const aggregate = await readAggregate(binding, slug);
  if (!aggregate) throw notFound();
  if (aggregate.revision !== expectedVersion)
    throw staleMutation("Course publication");
  if (aggregate.publication_state !== "published") {
    throw new RuntimeError(
      "COURSE_NOT_PUBLISHED",
      "The Course is not published.",
      {
        status: 409,
        publicMessage: "That Course is already unpublished.",
      },
    );
  }
  const result: CourseUnpublishResult = Object.freeze({
    courseId: aggregate.id,
    slug,
    version: expectedVersion + 1,
    publicationState: "draft",
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements = [
    binding
      .prepare(
        `UPDATE courses
         SET publication_state = 'draft',
             revision = revision + 1,
             last_operation_key = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3 AND publication_state = 'published'
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
        subjectType: "course",
        subjectId: aggregate.id,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM courses
        WHERE id = ? AND revision = ? AND publication_state = 'draft'
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        aggregate.id,
        result.version,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1)
      throw staleMutation("Course publication");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function parseItemKeys(value: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CourseReadError("Stored Course item keys are invalid.");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((key) => typeof key === "string")
  ) {
    throw new CourseReadError("Stored Course item keys are invalid.");
  }
  return parsed;
}

class CourseReadError extends Error {}

async function readLessonSnapshot(
  binding: D1Database,
  input: CourseProgressInput,
): Promise<LessonSnapshotRow | null> {
  return binding
    .prepare(
      `SELECT lessons.id AS lesson_id,
              COALESCE(json_group_array(lesson_items.item_key), '[]') AS item_keys_json
       FROM courses
       JOIN course_revisions
         ON course_revisions.id = courses.published_revision_id
        AND course_revisions.course_id = courses.id
       JOIN lessons
         ON lessons.course_revision_id = course_revisions.id
        AND lessons.lesson_key = ?3
       LEFT JOIN lesson_items ON lesson_items.lesson_id = lessons.id
       WHERE courses.id = ?1
         AND courses.publication_state = 'published'
         AND courses.published_revision_id = ?2
       GROUP BY lessons.id
       LIMIT 1`,
    )
    .bind(input.courseId, input.courseRevisionId, input.lessonKey)
    .first<LessonSnapshotRow>();
}

async function readProgressRow(
  binding: D1Database,
  userId: string,
  courseId: string,
  lessonKey: string,
): Promise<ProgressRow | null> {
  return binding
    .prepare(
      `SELECT id, state, completed_item_keys_json, last_item_key,
              started_at, completed_at, revision, updated_at
       FROM course_progress
       WHERE user_id = ?1 AND course_id = ?2 AND lesson_key = ?3
       LIMIT 1`,
    )
    .bind(userId, courseId, lessonKey)
    .first<ProgressRow>();
}

const PROGRESS_ACCESS_VALIDITY = `(
  (
    lessons.access_mode = 'public'
    OR (lessons.access_mode = 'inherit' AND course_revisions.access_mode = 'public')
    OR lessons.access_mode = 'account'
    OR (lessons.access_mode = 'inherit' AND course_revisions.access_mode = 'account')
  )
  OR (
    (
      lessons.access_mode = 'protected'
      OR (lessons.access_mode = 'inherit' AND course_revisions.access_mode = 'protected')
    )
    AND EXISTS (
      SELECT 1
      FROM entitlements AS progress_entitlement
      LEFT JOIN access_grants AS progress_grant
        ON progress_entitlement.source_type = 'grant'
       AND progress_grant.id = progress_entitlement.grant_id
       AND progress_entitlement.source_id = progress_grant.id
       AND progress_grant.grantee_user_id = progress_entitlement.user_id
      LEFT JOIN access_grant_sets AS progress_grant_set
        ON progress_grant_set.id = progress_grant.grant_set_id
       AND progress_grant_set.access_plan_id = progress_grant.access_plan_id
       AND progress_grant_set.grantee_user_id = progress_grant.grantee_user_id
      LEFT JOIN access_plan_items AS progress_plan_item
        ON progress_plan_item.id = progress_grant.access_plan_item_id
       AND progress_plan_item.access_plan_id = progress_grant.access_plan_id
       AND progress_plan_item.resource_type = progress_grant.resource_type
       AND progress_plan_item.resource_id = progress_grant.resource_id
      WHERE progress_entitlement.user_id = ?
        AND progress_entitlement.state = 'active'
        AND (progress_entitlement.starts_at IS NULL OR julianday(progress_entitlement.starts_at) <= julianday('now'))
        AND (progress_entitlement.expires_at IS NULL OR julianday(progress_entitlement.expires_at) > julianday('now'))
        AND (progress_entitlement.remaining_uses IS NULL OR progress_entitlement.remaining_uses > 0)
        AND EXISTS (
          SELECT 1 FROM json_each(progress_entitlement.actions_json)
          WHERE json_each.value = 'view'
        )
        AND (
          (progress_entitlement.resource_type = 'course'
            AND progress_entitlement.resource_id = courses.id)
          OR (progress_entitlement.resource_type = 'lesson'
            AND progress_entitlement.resource_id = lessons.id)
        )
        AND (
          progress_entitlement.source_type != 'grant'
          OR (
            progress_grant.id IS NOT NULL
            AND progress_grant.state = 'active'
            AND (progress_grant.starts_at IS NULL OR julianday(progress_grant.starts_at) <= julianday('now'))
            AND (progress_grant.expires_at IS NULL OR julianday(progress_grant.expires_at) > julianday('now'))
            AND (progress_grant.remaining_uses IS NULL OR progress_grant.remaining_uses > 0)
            AND EXISTS (
              SELECT 1 FROM json_each(progress_grant.actions_json)
              WHERE json_each.value = 'view'
            )
            AND (
              (
                progress_grant.grant_set_id IS NULL
                AND progress_grant.access_plan_id IS NULL
                AND progress_grant.access_plan_item_id IS NULL
              )
              OR (
                progress_grant_set.id IS NOT NULL
                AND progress_grant_set.state = 'active'
                AND (progress_grant_set.starts_at IS NULL OR julianday(progress_grant_set.starts_at) <= julianday('now'))
                AND (progress_grant_set.expires_at IS NULL OR julianday(progress_grant_set.expires_at) > julianday('now'))
                AND progress_plan_item.id IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM json_each(progress_plan_item.actions_json)
                  WHERE json_each.value = 'view'
                )
              )
            )
          )
        )
    )
  )
)`;

export async function saveCourseProgress(
  binding: D1Database,
  input: CourseProgressInput,
  expectedProgressRevision: number,
  context: MutationContext,
): Promise<MutationResult<CourseProgressView>> {
  const operation = "course.progress.save";
  const mutation = await prepareMutation<CourseProgressView>(
    binding,
    operation,
    context,
    { expectedProgressRevision, progress: input },
  );
  if (mutation.replayValue)
    return { value: mutation.replayValue, replayed: true };
  const [snapshot, existing] = await Promise.all([
    readLessonSnapshot(binding, input),
    readProgressRow(
      binding,
      context.actorUserId,
      input.courseId,
      input.lessonKey,
    ),
  ]);
  if (!snapshot) {
    throw new RuntimeError(
      "COURSE_REVISION_CHANGED",
      "The requested lesson is not part of the current published Course revision.",
      {
        status: 409,
        publicMessage:
          "This Course changed. Reload the lesson before saving progress.",
      },
    );
  }
  if (
    (!existing && expectedProgressRevision !== 0) ||
    (existing !== null && existing.revision !== expectedProgressRevision)
  ) {
    throw staleMutation("Course progress");
  }
  const itemKeys = parseItemKeys(snapshot.item_keys_json);
  const itemSet = new Set(itemKeys);
  if (itemKeys.length === 0)
    throw new CourseReadError(
      "A lesson must contain items before progress can be saved.",
    );
  if (
    input.completedItemKeys.some((key) => !itemSet.has(key)) ||
    (input.lastItemKey !== null && !itemSet.has(input.lastItemKey))
  ) {
    throw new RuntimeError(
      "COURSE_PROGRESS_INVALID",
      "Progress referenced an item outside the pinned published lesson.",
      {
        status: 400,
        publicMessage: "Reload this lesson before saving progress.",
      },
    );
  }
  const priorCurrentKeys = existing
    ? parseItemKeys(existing.completed_item_keys_json).filter((key) =>
        itemSet.has(key),
      )
    : [];
  if (priorCurrentKeys.some((key) => !input.completedItemKeys.includes(key))) {
    throw new RuntimeError(
      "COURSE_PROGRESS_REGRESSION",
      "Completed Course items cannot be removed.",
      { status: 409, publicMessage: "Completed lesson items remain complete." },
    );
  }
  const completedSet = new Set(input.completedItemKeys);
  if (
    input.state === "completed" &&
    itemKeys.some((key) => !completedSet.has(key))
  ) {
    throw new RuntimeError(
      "COURSE_COMPLETION_INCOMPLETE",
      "Every item must be complete before the lesson is complete.",
      { status: 409, publicMessage: "Complete each lesson item first." },
    );
  }
  if (
    existing?.state === "completed" &&
    input.state !== "completed" &&
    itemKeys.every((key) => priorCurrentKeys.includes(key))
  ) {
    throw new RuntimeError(
      "COURSE_COMPLETION_FINAL",
      "Completed lesson progress cannot return to in-progress.",
      { status: 409, publicMessage: "This lesson is already complete." },
    );
  }
  const now = new Date().toISOString();
  const progressId = existing?.id ?? `course_progress_${crypto.randomUUID()}`;
  const result: CourseProgressView = Object.freeze({
    id: progressId,
    courseId: input.courseId,
    lessonKey: input.lessonKey,
    state: input.state,
    completedItemKeys: Object.freeze([...input.completedItemKeys]),
    lastItemKey: input.lastItemKey,
    startedAt: existing?.started_at ?? now,
    completedAt:
      input.state === "completed" ? (existing?.completed_at ?? now) : null,
    revision: expectedProgressRevision + 1,
    updatedAt: now,
  });
  const authority = activeCustomerCondition(context.actorUserId);
  const lessonExists = `EXISTS (
    SELECT 1 FROM courses
    JOIN course_revisions
      ON course_revisions.id = courses.published_revision_id
     AND course_revisions.course_id = courses.id
    JOIN lessons ON lessons.course_revision_id = course_revisions.id
    WHERE courses.id = ?
      AND courses.publication_state = 'published'
      AND courses.published_revision_id = ?
      AND lessons.id = ?
      AND lessons.lesson_key = ?
      AND ${PROGRESS_ACCESS_VALIDITY}
  )`;
  let write: D1PreparedStatement;
  if (!existing) {
    write = binding
      .prepare(
        `INSERT INTO course_progress
          (id, user_id, course_id, lesson_key, state,
           completed_item_keys_json, last_item_key, started_at, completed_at,
           revision, last_operation_key, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?8, ?8
         WHERE NOT EXISTS (
           SELECT 1 FROM course_progress
           WHERE user_id = ?2 AND course_id = ?3 AND lesson_key = ?4
         ) AND ${lessonExists}
           AND ${authority.sql}`,
      )
      .bind(
        progressId,
        context.actorUserId,
        input.courseId,
        input.lessonKey,
        input.state,
        JSON.stringify(input.completedItemKeys),
        input.lastItemKey,
        now,
        result.completedAt,
        mutation.namespacedKey,
        input.courseId,
        input.courseRevisionId,
        snapshot.lesson_id,
        input.lessonKey,
        context.actorUserId,
        ...authority.bindings,
      );
  } else {
    write = binding
      .prepare(
        `UPDATE course_progress
         SET state = ?1,
             completed_item_keys_json = ?2,
             last_item_key = ?3,
             completed_at = ?4,
             revision = revision + 1,
             last_operation_key = ?5,
             updated_at = ?6
         WHERE id = ?7 AND user_id = ?8 AND course_id = ?9
           AND lesson_key = ?10 AND revision = ?11
           AND ${lessonExists}
           AND ${authority.sql}`,
      )
      .bind(
        input.state,
        JSON.stringify(input.completedItemKeys),
        input.lastItemKey,
        result.completedAt,
        mutation.namespacedKey,
        now,
        progressId,
        context.actorUserId,
        input.courseId,
        input.lessonKey,
        expectedProgressRevision,
        input.courseId,
        input.courseRevisionId,
        snapshot.lesson_id,
        input.lessonKey,
        context.actorUserId,
        ...authority.bindings,
      );
  }
  const statements = [
    write,
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "course-progress",
        subjectId: progressId,
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: {
          courseId: input.courseId,
          lessonKey: input.lessonKey,
          completedItems: input.completedItemKeys.length,
        },
        result: { ...result },
      },
      `EXISTS (
        SELECT 1 FROM course_progress
        WHERE id = ? AND user_id = ? AND revision = ?
          AND last_operation_key = ?
      ) AND ${authority.sql}`,
      [
        progressId,
        context.actorUserId,
        result.revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ],
    ),
  ];
  if (input.state === "completed" && existing?.state !== "completed") {
    statements.push(
      await prepareServerTelemetryEvent(binding, {
        eventName: "lesson-completed",
        resourceType: "lesson",
        resourceId: snapshot.lesson_id,
        sourceOperationKey: mutation.namespacedKey,
        userId: context.actorUserId,
        requestContext: context.telemetry,
        occurredAt: new Date(now),
        durableCondition: {
          sql: `EXISTS (
            SELECT 1 FROM course_progress
            WHERE id = ? AND user_id = ? AND state = 'completed'
              AND revision = ? AND last_operation_key = ?
          )`,
          bindings: [
            progressId,
            context.actorUserId,
            result.revision,
            mutation.namespacedKey,
          ],
        },
      }),
    );
  }
  try {
    const results = await runAtomicBatch(binding, statements);
    if (changedRows(results[0]) !== 1) throw staleMutation("Course progress");
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
