import type {
  CourseAccessMode,
  LessonAccessMode,
  LessonItemType,
} from "@/lib/courses/types.ts";

export interface CourseLessonMediaDeliveryRecord {
  readonly courseId: string;
  readonly courseSlug: string;
  readonly courseRevisionId: string;
  readonly courseAccessMode: CourseAccessMode;
  readonly lessonId: string;
  readonly lessonSlug: string;
  readonly lessonAccessMode: LessonAccessMode;
  readonly itemKey: string;
  readonly itemType: Extract<
    LessonItemType,
    "image" | "audio" | "video" | "download"
  >;
  readonly derivativeId: string;
  readonly sourceMediaId: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly filename: string | null;
}

interface DeliveryRow {
  course_id: string;
  course_slug: string;
  course_revision_id: string;
  course_access_mode: string;
  lesson_id: string;
  lesson_slug: string;
  lesson_access_mode: string;
  item_key: string;
  item_type: string;
  derivative_id: string;
  source_media_id: string;
  object_key: string;
  content_type: string;
  byte_length: number;
  filename: string | null;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PRIVATE_KEY = /^derivatives\/[a-z0-9][a-z0-9._/-]{0,499}$/i;
const SAFE_FILENAME = /^[^/\\\u0000-\u001f\u007f]{1,120}$/;

function id(value: string, label: string): string {
  if (!SAFE_ID.test(value)) throw new Error(`D1 returned an unsafe ${label}.`);
  return value;
}

function slug(value: string, label: string): string {
  if (!SAFE_SLUG.test(value))
    throw new Error(`D1 returned an unsafe ${label}.`);
  return value;
}

function key(value: string): string {
  if (!SAFE_KEY.test(value))
    throw new Error("D1 returned an unsafe lesson item key.");
  return value;
}

function privateKey(value: string): string {
  if (!PRIVATE_KEY.test(value) || value.includes("..")) {
    throw new Error("D1 returned an unsafe private media key.");
  }
  return value;
}

function byteLength(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("D1 returned an invalid media byte length.");
  }
  return value;
}

function contentType(value: string): string {
  try {
    const headers = new Headers();
    headers.set("content-type", value);
    const normalized = headers.get("content-type");
    if (!normalized) throw new Error();
    return normalized;
  } catch {
    throw new Error("D1 returned an invalid media content type.");
  }
}

function courseAccessMode(value: string): CourseAccessMode {
  if (value !== "public" && value !== "account" && value !== "protected") {
    throw new Error("D1 returned an invalid Course access mode.");
  }
  return value;
}

function lessonAccessMode(value: string): LessonAccessMode {
  if (
    value !== "inherit" &&
    value !== "public" &&
    value !== "account" &&
    value !== "protected"
  ) {
    throw new Error("D1 returned an invalid lesson access mode.");
  }
  return value;
}

function lessonItemType(
  value: string,
): CourseLessonMediaDeliveryRecord["itemType"] {
  if (
    value !== "image" &&
    value !== "audio" &&
    value !== "video" &&
    value !== "download"
  ) {
    throw new Error("D1 returned an invalid media lesson item type.");
  }
  return value;
}

export async function readCourseLessonMediaDelivery(
  binding: D1Database,
  input: {
    readonly courseSlug: string;
    readonly lessonSlug: string;
    readonly itemKey: string;
    readonly courseRevisionId: string;
  },
): Promise<CourseLessonMediaDeliveryRecord | null> {
  if (
    !SAFE_SLUG.test(input.courseSlug) ||
    !SAFE_SLUG.test(input.lessonSlug) ||
    !SAFE_KEY.test(input.itemKey) ||
    !SAFE_ID.test(input.courseRevisionId)
  ) {
    return null;
  }
  const row = await binding
    .prepare(
      `SELECT
         courses.id AS course_id,
         courses.slug AS course_slug,
         course_revisions.id AS course_revision_id,
         course_revisions.access_mode AS course_access_mode,
         lessons.id AS lesson_id,
         lessons.slug AS lesson_slug,
         lessons.access_mode AS lesson_access_mode,
         lesson_items.item_key,
         lesson_items.item_type,
         derivative.id AS derivative_id,
         derivative.source_media_id,
         derivative.object_key,
         derivative.content_type,
         derivative.byte_length,
         json_extract(lesson_items.content_json, '$.filename') AS filename
       FROM courses
       JOIN course_revisions
         ON course_revisions.id = courses.published_revision_id
        AND course_revisions.course_id = courses.id
       JOIN lessons
         ON lessons.course_revision_id = course_revisions.id
        AND lessons.slug = ?2
       JOIN lesson_items
         ON lesson_items.lesson_id = lessons.id
        AND lesson_items.item_key = ?3
       JOIN media_derivatives AS derivative
         ON derivative.id = lesson_items.media_derivative_id
       JOIN media_objects AS source
         ON source.id = derivative.source_media_id
       WHERE courses.slug = ?1
         AND courses.publication_state = 'published'
         AND courses.published_revision_id = ?4
         AND lesson_items.item_type IN ('image', 'audio', 'video', 'download')
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type IS NOT NULL
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_sha256 IS NOT NULL
       LIMIT 1`,
    )
    .bind(
      input.courseSlug,
      input.lessonSlug,
      input.itemKey,
      input.courseRevisionId,
    )
    .first<DeliveryRow>();
  if (!row) return null;
  const filename = row.filename;
  if (filename !== null && !SAFE_FILENAME.test(filename)) {
    throw new Error("D1 returned an unsafe lesson download filename.");
  }
  return Object.freeze({
    courseId: id(row.course_id, "Course ID"),
    courseSlug: slug(row.course_slug, "Course slug"),
    courseRevisionId: id(row.course_revision_id, "Course revision ID"),
    courseAccessMode: courseAccessMode(row.course_access_mode),
    lessonId: id(row.lesson_id, "lesson ID"),
    lessonSlug: slug(row.lesson_slug, "lesson slug"),
    lessonAccessMode: lessonAccessMode(row.lesson_access_mode),
    itemKey: key(row.item_key),
    itemType: lessonItemType(row.item_type),
    derivativeId: id(row.derivative_id, "media derivative ID"),
    sourceMediaId: id(row.source_media_id, "media source ID"),
    objectKey: privateKey(row.object_key),
    contentType: contentType(row.content_type),
    byteLength: byteLength(row.byte_length),
    filename,
  });
}
