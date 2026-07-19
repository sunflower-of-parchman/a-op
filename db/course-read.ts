import {
  courseAccessView,
  decideCourseAccess,
  decideCourseLessonAccess,
} from "@/lib/courses/access.ts";
import type {
  AdminCourseAccessPlanOption,
  AdminCourseDraft,
  AdminCourseMediaOption,
  AdminCourseSummary,
  CourseAccessMode,
  CourseItemView,
  CourseLessonInput,
  CourseLessonView,
  CourseProgressView,
  CourseSectionInput,
  CourseSectionView,
  CustomerCourseProgressSummary,
  LessonAccessMode,
  LessonItemContentInput,
  LessonItemInput,
  LessonItemType,
  PublishedCourseLessonView,
  PublishedCourseSummary,
  PublishedCourseView,
} from "@/lib/courses/types.ts";
import type { ApplicationIdentity } from "@/lib/auth/application-identity.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const COURSE_MODES = new Set<CourseAccessMode>([
  "public",
  "account",
  "protected",
]);
const LESSON_MODES = new Set<LessonAccessMode>([
  "inherit",
  "public",
  "account",
  "protected",
]);
const ITEM_TYPES = new Set<LessonItemType>([
  "text",
  "prompt",
  "image",
  "audio",
  "video",
  "download",
]);

export class CourseReadIntegrityError extends Error {
  override readonly name = "CourseReadIntegrityError";
}

function integrity(message: string): never {
  throw new CourseReadIntegrityError(message);
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function inputSlug(value: string): string | null {
  return typeof value === "string" && SAFE_SLUG.test(value) ? value : null;
}

function safeSlug(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_SLUG.test(value)) {
    integrity(`D1 returned an unsafe ${label}.`);
  }
  return value;
}

function safeKey(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_KEY.test(value)) {
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
  if (result.trim() !== result || result.length === 0) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return value as number;
}

function nullablePositiveInteger(value: unknown, label: string): number | null {
  return value === null ? null : positiveInteger(value, label);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    integrity(`D1 returned invalid ${label}.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function courseMode(value: unknown): CourseAccessMode {
  if (
    typeof value !== "string" ||
    !COURSE_MODES.has(value as CourseAccessMode)
  ) {
    integrity("D1 returned invalid Course access mode.");
  }
  return value as CourseAccessMode;
}

function lessonMode(value: unknown): LessonAccessMode {
  if (
    typeof value !== "string" ||
    !LESSON_MODES.has(value as LessonAccessMode)
  ) {
    integrity("D1 returned invalid lesson access mode.");
  }
  return value as LessonAccessMode;
}

function itemType(value: unknown): LessonItemType {
  if (typeof value !== "string" || !ITEM_TYPES.has(value as LessonItemType)) {
    integrity("D1 returned invalid lesson item type.");
  }
  return value as LessonItemType;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function itemContent(value: unknown): LessonItemContentInput {
  if (typeof value !== "string")
    integrity("D1 returned invalid lesson content JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid lesson content JSON.");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).text !== "string" ||
    typeof (parsed as Record<string, unknown>).caption !== "string" ||
    ((parsed as Record<string, unknown>).filename !== null &&
      typeof (parsed as Record<string, unknown>).filename !== "string")
  ) {
    integrity("D1 returned invalid lesson item content.");
  }
  const content = parsed as {
    text: string;
    caption: string;
    filename: string | null;
  };
  return Object.freeze({ ...content });
}

interface CourseRow {
  [key: string]: unknown;
  course_id: unknown;
  slug: unknown;
  publication_state: unknown;
  version: unknown;
  draft_revision_id: unknown;
  published_revision_id: unknown;
  published_at: unknown;
  updated_at: unknown;
  revision_id: unknown;
  revision: unknown;
  title: unknown;
  description: unknown;
  access_mode: unknown;
  access_plan_id: unknown;
  access_plan_revision: unknown;
  estimated_minutes: unknown;
  lesson_count?: unknown;
}

interface SectionRow {
  [key: string]: unknown;
  section_id: unknown;
  section_key: unknown;
  position: unknown;
  title: unknown;
  description: unknown;
}

interface LessonRow {
  [key: string]: unknown;
  lesson_id: unknown;
  section_id: unknown;
  lesson_key: unknown;
  slug: unknown;
  position: unknown;
  title: unknown;
  summary: unknown;
  access_mode: unknown;
  estimated_minutes: unknown;
}

interface ItemRow {
  [key: string]: unknown;
  item_id: unknown;
  lesson_id: unknown;
  item_key: unknown;
  position: unknown;
  item_type: unknown;
  content_json: unknown;
  media_derivative_id: unknown;
  alt_text: unknown;
  transcript_text: unknown;
}

interface ProgressRow {
  [key: string]: unknown;
  id: unknown;
  course_id: unknown;
  lesson_key: unknown;
  state: unknown;
  completed_item_keys_json: unknown;
  last_item_key: unknown;
  started_at: unknown;
  completed_at: unknown;
  revision: unknown;
  updated_at: unknown;
}

const COURSE_COLUMNS = `
  courses.id AS course_id,
  courses.slug,
  courses.publication_state,
  courses.revision AS version,
  courses.draft_revision_id,
  courses.published_revision_id,
  courses.published_at,
  courses.updated_at,
  course_revisions.id AS revision_id,
  course_revisions.revision,
  course_revisions.title,
  course_revisions.description,
  course_revisions.access_mode,
  course_revisions.access_plan_id,
  course_revisions.access_plan_revision,
  course_revisions.estimated_minutes`;

const COURSE_SELECT = `SELECT${COURSE_COLUMNS}
 FROM courses
 JOIN course_revisions
   ON course_revisions.course_id = courses.id`;

async function readSections(
  binding: D1Database,
  courseRevisionId: string,
): Promise<readonly SectionRow[]> {
  const result = await binding
    .prepare(
      `SELECT id AS section_id, section_key, position, title, description
       FROM course_sections
       WHERE course_revision_id = ?1
       ORDER BY position ASC, id ASC`,
    )
    .bind(courseRevisionId)
    .all<SectionRow>();
  return result.results;
}

async function readLessons(
  binding: D1Database,
  courseRevisionId: string,
): Promise<readonly LessonRow[]> {
  const result = await binding
    .prepare(
      `SELECT id AS lesson_id, course_section_id AS section_id,
              lesson_key, slug, position, title, summary, access_mode,
              estimated_minutes
       FROM lessons
       WHERE course_revision_id = ?1
       ORDER BY course_section_id ASC, position ASC, id ASC`,
    )
    .bind(courseRevisionId)
    .all<LessonRow>();
  return result.results;
}

async function readItems(
  binding: D1Database,
  lessonId: string,
): Promise<readonly ItemRow[]> {
  const result = await binding
    .prepare(
      `SELECT id AS item_id, lesson_id, item_key, position, item_type,
              content_json, media_derivative_id, alt_text, transcript_text
       FROM lesson_items
       WHERE lesson_id = ?1
       ORDER BY position ASC, id ASC`,
    )
    .bind(lessonId)
    .all<ItemRow>();
  return result.results;
}

function parseItem(
  row: ItemRow,
  mediaUrl: string | null,
  includeDerivativeId = false,
): CourseItemView {
  return Object.freeze({
    id: safeId(row.item_id, "lesson-item ID"),
    itemKey: safeKey(row.item_key, "lesson-item key"),
    position: positiveInteger(row.position, "lesson-item position"),
    itemType: itemType(row.item_type),
    content: itemContent(row.content_json),
    mediaDerivativeId:
      !includeDerivativeId || row.media_derivative_id === null
        ? null
        : safeId(row.media_derivative_id, "lesson media derivative ID"),
    altText: nullableString(row.alt_text, "lesson item alt text"),
    transcriptText: nullableString(
      row.transcript_text,
      "lesson item transcript",
    ),
    mediaUrl,
  });
}

function progressItems(value: unknown): readonly string[] {
  if (typeof value !== "string")
    integrity("D1 returned invalid Course progress JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    return integrity("D1 returned invalid Course progress JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((key) => typeof key === "string" && SAFE_KEY.test(key))
  ) {
    integrity("D1 returned invalid completed Course item keys.");
  }
  return Object.freeze([...(parsed as string[])]);
}

function parseProgress(
  row: ProgressRow,
  currentItemKeys?: ReadonlySet<string>,
): CourseProgressView {
  const rawCompleted = progressItems(row.completed_item_keys_json);
  const completedItemKeys = currentItemKeys
    ? rawCompleted.filter((key) => currentItemKeys.has(key))
    : rawCompleted;
  const rawLastItemKey =
    row.last_item_key === null
      ? null
      : safeKey(row.last_item_key, "last Course item key");
  const lastItemKey =
    rawLastItemKey && (!currentItemKeys || currentItemKeys.has(rawLastItemKey))
      ? rawLastItemKey
      : null;
  const storedState = row.state;
  if (storedState !== "in_progress" && storedState !== "completed") {
    integrity("D1 returned invalid Course progress state.");
  }
  const currentRevisionIsComplete = currentItemKeys
    ? currentItemKeys.size > 0 &&
      [...currentItemKeys].every((key) => completedItemKeys.includes(key))
    : storedState === "completed";
  const state =
    storedState === "completed" && !currentRevisionIsComplete
      ? "in_progress"
      : storedState;
  return Object.freeze({
    id: safeId(row.id, "Course progress ID"),
    courseId: safeId(row.course_id, "Course progress Course ID"),
    lessonKey: safeKey(row.lesson_key, "Course progress lesson key"),
    state,
    completedItemKeys: Object.freeze(completedItemKeys),
    lastItemKey,
    startedAt: timestamp(row.started_at, "Course progress start time"),
    completedAt:
      state === "completed"
        ? nullableTimestamp(row.completed_at, "Course progress completion time")
        : null,
    revision: positiveInteger(row.revision, "Course progress revision"),
    updatedAt: timestamp(row.updated_at, "Course progress update time"),
  });
}

async function readProgress(
  binding: D1Database,
  userId: string,
  courseId: string,
  lessonKey: string,
  currentItemKeys?: ReadonlySet<string>,
): Promise<CourseProgressView | null> {
  const row = await binding
    .prepare(
      `SELECT id, course_id, lesson_key, state, completed_item_keys_json,
              last_item_key, started_at, completed_at, revision, updated_at
       FROM course_progress
       WHERE user_id = ?1 AND course_id = ?2 AND lesson_key = ?3
       LIMIT 1`,
    )
    .bind(userId, courseId, lessonKey)
    .first<ProgressRow>();
  return row ? parseProgress(row, currentItemKeys) : null;
}

function publishedSummaryBase(row: CourseRow) {
  return {
    id: safeId(row.course_id, "Course ID"),
    slug: safeSlug(row.slug, "Course slug"),
    revisionId: safeId(row.revision_id, "Course revision ID"),
    revision: positiveInteger(row.revision, "Course revision"),
    title: nonBlank(row.title, "Course title"),
    description: string(row.description, "Course description"),
    accessMode: courseMode(row.access_mode),
    estimatedMinutes: nullablePositiveInteger(
      row.estimated_minutes,
      "Course estimate",
    ),
    publishedAt: timestamp(row.published_at, "Course publication time"),
  } as const;
}

export async function readPublishedCourseIndex(
  binding: D1Database,
  identity: ApplicationIdentity | null,
  now: string,
): Promise<readonly PublishedCourseSummary[]> {
  const result = await binding
    .prepare(
      `SELECT${COURSE_COLUMNS},
         (SELECT COUNT(*) FROM lessons
          WHERE lessons.course_revision_id = course_revisions.id) AS lesson_count
       FROM courses
       JOIN course_revisions
         ON course_revisions.course_id = courses.id
       WHERE courses.publication_state = 'published'
         AND courses.published_revision_id = course_revisions.id
       ORDER BY courses.published_at DESC, courses.slug ASC`,
    )
    .all<CourseRow>();
  return Promise.all(
    result.results.map(async (row) => {
      const base = publishedSummaryBase(row);
      const decision = await decideCourseAccess({
        binding,
        identity,
        courseId: base.id,
        courseSlug: base.slug,
        courseAccessMode: base.accessMode,
        now,
      });
      return Object.freeze({
        ...base,
        lessonCount:
          Number.isSafeInteger(row.lesson_count) &&
          (row.lesson_count as number) >= 0
            ? (row.lesson_count as number)
            : integrity("D1 returned invalid Course lesson count."),
        access: courseAccessView(decision),
      });
    }),
  );
}

async function readPublishedCourseRow(
  binding: D1Database,
  slug: string,
): Promise<CourseRow | null> {
  if (!inputSlug(slug)) return null;
  return binding
    .prepare(
      `${COURSE_SELECT}
       WHERE courses.slug = ?1
         AND courses.publication_state = 'published'
         AND courses.published_revision_id = course_revisions.id
       LIMIT 1`,
    )
    .bind(slug)
    .first<CourseRow>();
}

export async function readPublishedCourse(
  binding: D1Database,
  slug: string,
  identity: ApplicationIdentity | null,
  now: string,
): Promise<PublishedCourseView | null> {
  const row = await readPublishedCourseRow(binding, slug);
  if (!row) return null;
  const base = publishedSummaryBase(row);
  const [sections, lessons, courseDecision] = await Promise.all([
    readSections(binding, base.revisionId),
    readLessons(binding, base.revisionId),
    decideCourseAccess({
      binding,
      identity,
      courseId: base.id,
      courseSlug: base.slug,
      courseAccessMode: base.accessMode,
      now,
    }),
  ]);
  const lessonViews = await Promise.all(
    lessons.map(async (lessonRow): Promise<CourseLessonView> => {
      const id = safeId(lessonRow.lesson_id, "lesson ID");
      const accessMode = lessonMode(lessonRow.access_mode);
      const effectiveAccessMode =
        accessMode === "inherit" ? base.accessMode : accessMode;
      const decision = await decideCourseLessonAccess({
        binding,
        identity,
        courseId: base.id,
        courseSlug: base.slug,
        courseAccessMode: base.accessMode,
        lessonId: id,
        lessonAccessMode: accessMode,
        now,
      });
      return Object.freeze({
        id,
        lessonKey: safeKey(lessonRow.lesson_key, "lesson key"),
        slug: safeSlug(lessonRow.slug, "lesson slug"),
        position: positiveInteger(lessonRow.position, "lesson position"),
        title: nonBlank(lessonRow.title, "lesson title"),
        summary: string(lessonRow.summary, "lesson summary"),
        accessMode,
        effectiveAccessMode,
        estimatedMinutes: nullablePositiveInteger(
          lessonRow.estimated_minutes,
          "lesson estimate",
        ),
        access: courseAccessView(decision),
        items: Object.freeze([]),
      });
    }),
  );
  const sectionsView = sections.map((sectionRow): CourseSectionView => {
    const sectionId = safeId(sectionRow.section_id, "Course section ID");
    return Object.freeze({
      id: sectionId,
      sectionKey: safeKey(sectionRow.section_key, "Course section key"),
      position: positiveInteger(sectionRow.position, "Course section position"),
      title: nonBlank(sectionRow.title, "Course section title"),
      description: string(sectionRow.description, "Course section description"),
      lessons: Object.freeze(
        lessonViews.filter(
          (_lesson, index) =>
            safeId(lessons[index].section_id, "lesson section ID") ===
            sectionId,
        ),
      ),
    });
  });
  return Object.freeze({
    ...base,
    access: courseAccessView(courseDecision),
    sections: Object.freeze(sectionsView),
  });
}

export async function readPublishedCourseLesson(
  binding: D1Database,
  courseSlug: string,
  lessonSlug: string,
  identity: ApplicationIdentity | null,
  now: string,
): Promise<PublishedCourseLessonView | null> {
  const course = await readPublishedCourse(binding, courseSlug, identity, now);
  if (!course || !inputSlug(lessonSlug)) return null;
  let selectedSection: CourseSectionView | null = null;
  let lesson: CourseLessonView | null = null;
  for (const section of course.sections) {
    const candidate = section.lessons.find(
      (entry) => entry.slug === lessonSlug,
    );
    if (candidate) {
      selectedSection = section;
      lesson = candidate;
      break;
    }
  }
  if (!selectedSection || !lesson) return null;
  const items = lesson.access.allowed
    ? (await readItems(binding, lesson.id)).map((row) =>
        parseItem(
          row,
          row.media_derivative_id === null
            ? null
            : `/api/courses/${course.slug}/${lesson!.slug}/media/${safeKey(
                row.item_key,
                "lesson-item key",
              )}?revision=${encodeURIComponent(course.revisionId)}`,
        ),
      )
    : [];
  const lessonWithItems = Object.freeze({
    ...lesson,
    items: Object.freeze(items),
  });
  const currentItemKeys = new Set(items.map(({ itemKey }) => itemKey));
  const progress =
    identity?.roles.includes("customer") && lesson.access.allowed
      ? await readProgress(
          binding,
          identity.userId,
          course.id,
          lesson.lessonKey,
          currentItemKeys,
        )
      : null;
  return Object.freeze({
    course: Object.freeze({
      id: course.id,
      slug: course.slug,
      revisionId: course.revisionId,
      revision: course.revision,
      title: course.title,
      description: course.description,
      accessMode: course.accessMode,
      estimatedMinutes: course.estimatedMinutes,
      publishedAt: course.publishedAt,
      access: course.access,
    }),
    section: Object.freeze({
      id: selectedSection.id,
      sectionKey: selectedSection.sectionKey,
      position: selectedSection.position,
      title: selectedSection.title,
      description: selectedSection.description,
    }),
    lesson: lessonWithItems,
    access: lesson.access,
    progress,
  });
}

function parseAdminItem(row: ItemRow): LessonItemInput {
  const parsed = parseItem(row, null, true);
  return Object.freeze({
    itemKey: parsed.itemKey,
    itemType: parsed.itemType,
    content: parsed.content,
    mediaDerivativeId: parsed.mediaDerivativeId,
    altText: parsed.altText,
    transcriptText: parsed.transcriptText,
  });
}

export async function readAdminCourseIndex(
  binding: D1Database,
  scopes: readonly string[] | null,
): Promise<readonly AdminCourseSummary[]> {
  if (scopes !== null && scopes.length === 0) return [];
  const filter =
    scopes === null || scopes.includes("*")
      ? "1 = 1"
      : `courses.slug IN (${scopes.map(() => "?").join(", ")})`;
  const result = await binding
    .prepare(
      `${COURSE_SELECT}
       WHERE course_revisions.id = courses.draft_revision_id
         AND ${filter}
       ORDER BY courses.updated_at DESC, courses.slug ASC`,
    )
    .bind(...(scopes === null || scopes.includes("*") ? [] : scopes))
    .all<CourseRow>();
  return Object.freeze(
    result.results.map((row) => {
      const publicationState = row.publication_state;
      if (
        publicationState !== "draft" &&
        publicationState !== "published" &&
        publicationState !== "archived"
      ) {
        integrity("D1 returned invalid Course publication state.");
      }
      return Object.freeze({
        id: safeId(row.course_id, "Course ID"),
        slug: safeSlug(row.slug, "Course slug"),
        title: nonBlank(row.title, "Course title"),
        publicationState,
        accessMode: courseMode(row.access_mode),
        version: positiveInteger(row.version, "Course version"),
        draftRevision: positiveInteger(row.revision, "Course draft revision"),
        publishedRevisionId:
          row.published_revision_id === null
            ? null
            : safeId(row.published_revision_id, "published Course revision ID"),
        updatedAt: timestamp(row.updated_at, "Course update time"),
        publishedAt: nullableTimestamp(
          row.published_at,
          "Course publication time",
        ),
      });
    }),
  );
}

export async function readAdminCourseDraft(
  binding: D1Database,
  slug: string,
): Promise<AdminCourseDraft | null> {
  if (!inputSlug(slug)) return null;
  const row = await binding
    .prepare(
      `${COURSE_SELECT}
       WHERE courses.slug = ?1
         AND course_revisions.id = courses.draft_revision_id
       LIMIT 1`,
    )
    .bind(slug)
    .first<CourseRow>();
  if (!row) return null;
  const revisionId = safeId(row.revision_id, "Course revision ID");
  const [sectionRows, lessonRows] = await Promise.all([
    readSections(binding, revisionId),
    readLessons(binding, revisionId),
  ]);
  const lessonsBySection = new Map<string, CourseLessonInput[]>();
  for (const lessonRow of lessonRows) {
    const lessonId = safeId(lessonRow.lesson_id, "lesson ID");
    const itemRows = await readItems(binding, lessonId);
    const sectionId = safeId(lessonRow.section_id, "lesson section ID");
    const list = lessonsBySection.get(sectionId) ?? [];
    list.push(
      Object.freeze({
        lessonKey: safeKey(lessonRow.lesson_key, "lesson key"),
        slug: safeSlug(lessonRow.slug, "lesson slug"),
        title: nonBlank(lessonRow.title, "lesson title"),
        summary: string(lessonRow.summary, "lesson summary"),
        accessMode: lessonMode(lessonRow.access_mode),
        estimatedMinutes: nullablePositiveInteger(
          lessonRow.estimated_minutes,
          "lesson estimate",
        ),
        items: Object.freeze(itemRows.map(parseAdminItem)),
      }),
    );
    lessonsBySection.set(sectionId, list);
  }
  const sections: readonly CourseSectionInput[] = Object.freeze(
    sectionRows.map((sectionRow) => {
      const sectionId = safeId(sectionRow.section_id, "Course section ID");
      return Object.freeze({
        sectionKey: safeKey(sectionRow.section_key, "Course section key"),
        title: nonBlank(sectionRow.title, "Course section title"),
        description: string(
          sectionRow.description,
          "Course section description",
        ),
        lessons: Object.freeze(lessonsBySection.get(sectionId) ?? []),
      });
    }),
  );
  const publicationState = row.publication_state;
  if (
    publicationState !== "draft" &&
    publicationState !== "published" &&
    publicationState !== "archived"
  ) {
    integrity("D1 returned invalid Course publication state.");
  }
  const accessPlanId =
    row.access_plan_id === null
      ? null
      : safeId(row.access_plan_id, "Course access-plan ID");
  const accessPlanRevision =
    row.access_plan_revision === null
      ? null
      : positiveInteger(
          row.access_plan_revision,
          "Course access-plan revision",
        );
  if ((accessPlanId === null) !== (accessPlanRevision === null)) {
    integrity("D1 returned an incomplete Course access-plan snapshot.");
  }
  const publishedRevisionId =
    row.published_revision_id === null
      ? null
      : safeId(row.published_revision_id, "published Course revision ID");
  return Object.freeze({
    id: safeId(row.course_id, "Course ID"),
    slug: safeSlug(row.slug, "Course slug"),
    title: nonBlank(row.title, "Course title"),
    description: string(row.description, "Course description"),
    accessMode: courseMode(row.access_mode),
    accessPlanId,
    accessPlanRevision,
    estimatedMinutes: nullablePositiveInteger(
      row.estimated_minutes,
      "Course estimate",
    ),
    sections,
    revisionId,
    revision: positiveInteger(row.revision, "Course revision"),
    version: positiveInteger(row.version, "Course version"),
    publicationState,
    publishedRevisionId,
    draftIsPublished: publishedRevisionId === revisionId,
  });
}

export async function readAdminCourseMediaOptions(
  binding: D1Database,
): Promise<readonly AdminCourseMediaOption[]> {
  const result = await binding
    .prepare(
      `SELECT derivative.id, derivative.kind, derivative.content_type,
              derivative.source_media_id
       FROM media_derivatives AS derivative
       JOIN media_objects AS source ON source.id = derivative.source_media_id
       WHERE derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type IS NOT NULL
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_sha256 IS NOT NULL
       ORDER BY derivative.kind ASC, derivative.id ASC`,
    )
    .all<{
      id: unknown;
      kind: unknown;
      content_type: unknown;
      source_media_id: unknown;
    }>();
  return Object.freeze(
    result.results.map((row) =>
      Object.freeze({
        id: safeId(row.id, "media derivative ID"),
        kind: nonBlank(row.kind, "media derivative kind"),
        contentType: nonBlank(
          row.content_type,
          "media derivative content type",
        ),
        sourceMediaId: safeId(row.source_media_id, "media source ID"),
      }),
    ),
  );
}

export async function readAdminCourseAccessPlans(
  binding: D1Database,
): Promise<readonly AdminCourseAccessPlanOption[]> {
  const result = await binding
    .prepare(
      `SELECT id, name, revision, state
       FROM access_plans
       ORDER BY state ASC, name ASC, id ASC`,
    )
    .all<{ id: unknown; name: unknown; revision: unknown; state: unknown }>();
  return Object.freeze(
    result.results.map((row) => {
      if (row.state !== "active" && row.state !== "archived") {
        integrity("D1 returned invalid access-plan state.");
      }
      return Object.freeze({
        id: safeId(row.id, "access-plan ID"),
        name: nonBlank(row.name, "access-plan name"),
        revision: positiveInteger(row.revision, "access-plan revision"),
        state: row.state,
      });
    }),
  );
}

export async function readCustomerCourseProgress(
  binding: D1Database,
  identity: ApplicationIdentity,
  now: string,
): Promise<readonly CustomerCourseProgressSummary[]> {
  const courses = await readPublishedCourseIndex(binding, identity, now);
  const result: CustomerCourseProgressSummary[] = [];
  for (const summary of courses) {
    const course = await readPublishedCourse(
      binding,
      summary.slug,
      identity,
      now,
    );
    if (!course) continue;
    const lessonEntries = course.sections.flatMap((section) => section.lessons);
    const progressResult = await binding
      .prepare(
        `SELECT id, course_id, lesson_key, state, completed_item_keys_json,
                last_item_key, started_at, completed_at, revision, updated_at
         FROM course_progress
         WHERE user_id = ?1 AND course_id = ?2
         ORDER BY updated_at DESC, rowid DESC`,
      )
      .bind(identity.userId, course.id)
      .all<ProgressRow>();
    const itemResult = await binding
      .prepare(
        `SELECT lessons.lesson_key, lesson_items.item_key
         FROM lessons
         JOIN lesson_items ON lesson_items.lesson_id = lessons.id
         WHERE lessons.course_revision_id = ?1
         ORDER BY lessons.position ASC, lesson_items.position ASC`,
      )
      .bind(summary.revisionId)
      .all<{ lesson_key: unknown; item_key: unknown }>();
    const itemKeysByLesson = new Map<string, Set<string>>();
    for (const row of itemResult.results) {
      const lessonKey = safeKey(row.lesson_key, "lesson progress key");
      const itemKey = safeKey(row.item_key, "lesson progress item key");
      const keys = itemKeysByLesson.get(lessonKey) ?? new Set<string>();
      keys.add(itemKey);
      itemKeysByLesson.set(lessonKey, keys);
    }
    const progressRows = progressResult.results.map((row) => {
      const lessonKey = safeKey(row.lesson_key, "Course progress lesson key");
      return parseProgress(row, itemKeysByLesson.get(lessonKey) ?? new Set());
    });
    const currentLessonKeys = new Set(
      lessonEntries.map(({ lessonKey }) => lessonKey),
    );
    const currentProgress = progressRows.filter(({ lessonKey }) =>
      currentLessonKeys.has(lessonKey),
    );
    const latest = currentProgress.find(
      ({ lastItemKey, state }) =>
        state === "in_progress" && lastItemKey !== null,
    );
    const resumeLesson = latest
      ? lessonEntries.find(({ lessonKey }) => lessonKey === latest.lessonKey)
      : null;
    result.push(
      Object.freeze({
        course: summary,
        completedLessons: currentProgress.filter(
          ({ state }) => state === "completed",
        ).length,
        startedLessons: currentProgress.length,
        totalLessons: lessonEntries.length,
        resumeHref:
          resumeLesson && latest?.lastItemKey
            ? `/courses/${summary.slug}/${resumeLesson.slug}#item-${latest.lastItemKey}`
            : null,
        resumeLabel: resumeLesson ? resumeLesson.title : null,
      }),
    );
  }
  return Object.freeze(result);
}
