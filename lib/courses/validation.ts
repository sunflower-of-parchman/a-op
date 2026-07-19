import {
  COURSE_ACCESS_MODES,
  LESSON_ACCESS_MODES,
  LESSON_ITEM_TYPES,
  type CourseAccessMode,
  type CourseDraftInput,
  type CourseLessonInput,
  type CourseProgressInput,
  type CourseSectionInput,
  type LessonAccessMode,
  type LessonItemContentInput,
  type LessonItemInput,
  type LessonItemType,
} from "./types.ts";

export const COURSE_INPUT_LIMITS = Object.freeze({
  slug: 80,
  key: 64,
  title: 160,
  description: 8_000,
  summary: 2_000,
  itemText: 30_000,
  caption: 1_000,
  filename: 120,
  altText: 1_000,
  transcript: 50_000,
  sections: 24,
  lessonsPerSection: 48,
  itemsPerLesson: 96,
  estimatedMinutes: 10_000,
} as const);

export interface CourseValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type CourseValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly CourseValidationIssue[] };

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SAFE_KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_FILENAME = /^[^/\\\u0000-\u001f\u007f]{1,120}$/;
const COURSE_ACCESS_SET = new Set<string>(COURSE_ACCESS_MODES);
const LESSON_ACCESS_SET = new Set<string>(LESSON_ACCESS_MODES);
const ITEM_TYPE_SET = new Set<string>(LESSON_ITEM_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function issue(
  issues: CourseValidationIssue[],
  field: string,
  message: string,
): void {
  issues.push(Object.freeze({ field, message }));
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
  issues: CourseValidationIssue[],
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!set.has(key))
      issue(issues, `${field}.${key}`, "Field is not supported.");
  }
}

function text(
  value: unknown,
  field: string,
  limit: number,
  issues: CourseValidationIssue[],
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    issue(issues, field, "A string is required.");
    return null;
  }
  const normalized = normalizeText(value);
  if (!allowEmpty && normalized.length === 0) {
    issue(issues, field, "A value is required.");
    return null;
  }
  if (normalized.length > limit) {
    issue(issues, field, `Use at most ${limit} characters.`);
    return null;
  }
  return normalized;
}

function nullableText(
  value: unknown,
  field: string,
  limit: number,
  issues: CourseValidationIssue[],
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field, limit, issues);
}

function normalizedKey(
  value: unknown,
  field: string,
  pattern: RegExp,
  limit: number,
  issues: CourseValidationIssue[],
): string | null {
  if (typeof value !== "string") {
    issue(issues, field, "A stable key is required.");
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length > limit || !pattern.test(normalized)) {
    issue(issues, field, "Use a normalized lowercase route-safe value.");
    return null;
  }
  return normalized;
}

function optionalPositiveInteger(
  value: unknown,
  field: string,
  issues: CourseValidationIssue[],
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0 ||
    (value as number) > COURSE_INPUT_LIMITS.estimatedMinutes
  ) {
    issue(
      issues,
      field,
      "Use a positive whole number within the supported range.",
    );
    return null;
  }
  return value as number;
}

function content(
  value: unknown,
  type: LessonItemType,
  field: string,
  issues: CourseValidationIssue[],
): LessonItemContentInput | null {
  if (!isRecord(value)) {
    issue(issues, field, "Item content must be an object.");
    return null;
  }
  exactKeys(value, ["text", "caption", "filename"], field, issues);
  const textValue = text(
    value.text ?? "",
    `${field}.text`,
    COURSE_INPUT_LIMITS.itemText,
    issues,
    type !== "text" && type !== "prompt",
  );
  const caption = text(
    value.caption ?? "",
    `${field}.caption`,
    COURSE_INPUT_LIMITS.caption,
    issues,
    true,
  );
  const filename = nullableText(
    value.filename,
    `${field}.filename`,
    COURSE_INPUT_LIMITS.filename,
    issues,
  );
  if (filename !== null && !SAFE_FILENAME.test(filename)) {
    issue(
      issues,
      `${field}.filename`,
      "Use a filename without paths or control characters.",
    );
  }
  if (type === "download" && filename === null) {
    issue(issues, `${field}.filename`, "A download filename is required.");
  }
  if (type !== "download" && filename !== null) {
    issue(
      issues,
      `${field}.filename`,
      "Only download items accept a filename.",
    );
  }
  return textValue === null || caption === null
    ? null
    : Object.freeze({ text: textValue, caption, filename });
}

function item(
  value: unknown,
  field: string,
  issues: CourseValidationIssue[],
): LessonItemInput | null {
  if (!isRecord(value)) {
    issue(issues, field, "Lesson item must be an object.");
    return null;
  }
  exactKeys(
    value,
    [
      "itemKey",
      "itemType",
      "content",
      "mediaDerivativeId",
      "altText",
      "transcriptText",
    ],
    field,
    issues,
  );
  const itemKey = normalizedKey(
    value.itemKey,
    `${field}.itemKey`,
    SAFE_KEY,
    COURSE_INPUT_LIMITS.key,
    issues,
  );
  const itemType = ITEM_TYPE_SET.has(String(value.itemType))
    ? (value.itemType as LessonItemType)
    : null;
  if (!itemType)
    issue(issues, `${field}.itemType`, "Choose a supported lesson item type.");
  const parsedContent = itemType
    ? content(value.content, itemType, `${field}.content`, issues)
    : null;
  const mediaDerivativeId =
    value.mediaDerivativeId === null || value.mediaDerivativeId === undefined
      ? null
      : typeof value.mediaDerivativeId === "string" &&
          SAFE_ID.test(value.mediaDerivativeId)
        ? value.mediaDerivativeId
        : null;
  if (
    value.mediaDerivativeId !== null &&
    value.mediaDerivativeId !== undefined &&
    mediaDerivativeId === null
  ) {
    issue(
      issues,
      `${field}.mediaDerivativeId`,
      "Use a safe media derivative identifier.",
    );
  }
  const altText = nullableText(
    value.altText,
    `${field}.altText`,
    COURSE_INPUT_LIMITS.altText,
    issues,
  );
  const transcriptText = nullableText(
    value.transcriptText,
    `${field}.transcriptText`,
    COURSE_INPUT_LIMITS.transcript,
    issues,
  );
  if (itemType === "text" || itemType === "prompt") {
    if (mediaDerivativeId !== null) {
      issue(
        issues,
        `${field}.mediaDerivativeId`,
        "Text items do not reference media.",
      );
    }
  } else if (itemType && mediaDerivativeId === null) {
    issue(
      issues,
      `${field}.mediaDerivativeId`,
      "A media derivative is required.",
    );
  }
  if (itemType === "image" && altText === null) {
    issue(issues, `${field}.altText`, "Image alt text is required.");
  }
  if (
    (itemType === "audio" || itemType === "video") &&
    transcriptText === null
  ) {
    issue(
      issues,
      `${field}.transcriptText`,
      "A transcript is required for audio and video.",
    );
  }
  return itemKey && itemType && parsedContent
    ? Object.freeze({
        itemKey,
        itemType,
        content: parsedContent,
        mediaDerivativeId,
        altText,
        transcriptText,
      })
    : null;
}

function lesson(
  value: unknown,
  field: string,
  issues: CourseValidationIssue[],
): CourseLessonInput | null {
  if (!isRecord(value)) {
    issue(issues, field, "Lesson must be an object.");
    return null;
  }
  exactKeys(
    value,
    [
      "lessonKey",
      "slug",
      "title",
      "summary",
      "accessMode",
      "estimatedMinutes",
      "items",
    ],
    field,
    issues,
  );
  const lessonKey = normalizedKey(
    value.lessonKey,
    `${field}.lessonKey`,
    SAFE_KEY,
    COURSE_INPUT_LIMITS.key,
    issues,
  );
  const slug = normalizedKey(
    value.slug,
    `${field}.slug`,
    SAFE_SLUG,
    COURSE_INPUT_LIMITS.slug,
    issues,
  );
  const title = text(
    value.title,
    `${field}.title`,
    COURSE_INPUT_LIMITS.title,
    issues,
  );
  const summary = text(
    value.summary ?? "",
    `${field}.summary`,
    COURSE_INPUT_LIMITS.summary,
    issues,
    true,
  );
  const accessMode = LESSON_ACCESS_SET.has(String(value.accessMode))
    ? (value.accessMode as LessonAccessMode)
    : null;
  if (!accessMode)
    issue(
      issues,
      `${field}.accessMode`,
      "Choose a supported lesson access mode.",
    );
  const estimatedMinutes = optionalPositiveInteger(
    value.estimatedMinutes,
    `${field}.estimatedMinutes`,
    issues,
  );
  const values = Array.isArray(value.items) ? value.items : null;
  if (!values)
    issue(issues, `${field}.items`, "Lesson items must be an array.");
  if (values && values.length > COURSE_INPUT_LIMITS.itemsPerLesson) {
    issue(
      issues,
      `${field}.items`,
      `Use at most ${COURSE_INPUT_LIMITS.itemsPerLesson} items.`,
    );
  }
  const items = (values ?? [])
    .slice(0, COURSE_INPUT_LIMITS.itemsPerLesson + 1)
    .map((candidate, index) =>
      item(candidate, `${field}.items.${index}`, issues),
    )
    .filter((candidate): candidate is LessonItemInput => candidate !== null);
  const itemKeys = items.map(({ itemKey }) => itemKey);
  if (new Set(itemKeys).size !== itemKeys.length) {
    issue(
      issues,
      `${field}.items`,
      "Item keys must be unique within a lesson.",
    );
  }
  return lessonKey && slug && title && summary !== null && accessMode
    ? Object.freeze({
        lessonKey,
        slug,
        title,
        summary,
        accessMode,
        estimatedMinutes,
        items: Object.freeze(items),
      })
    : null;
}

function section(
  value: unknown,
  field: string,
  issues: CourseValidationIssue[],
): CourseSectionInput | null {
  if (!isRecord(value)) {
    issue(issues, field, "Course section must be an object.");
    return null;
  }
  exactKeys(
    value,
    ["sectionKey", "title", "description", "lessons"],
    field,
    issues,
  );
  const sectionKey = normalizedKey(
    value.sectionKey,
    `${field}.sectionKey`,
    SAFE_KEY,
    COURSE_INPUT_LIMITS.key,
    issues,
  );
  const title = text(
    value.title,
    `${field}.title`,
    COURSE_INPUT_LIMITS.title,
    issues,
  );
  const description = text(
    value.description ?? "",
    `${field}.description`,
    COURSE_INPUT_LIMITS.summary,
    issues,
    true,
  );
  const values = Array.isArray(value.lessons) ? value.lessons : null;
  if (!values) issue(issues, `${field}.lessons`, "Lessons must be an array.");
  if (values && values.length > COURSE_INPUT_LIMITS.lessonsPerSection) {
    issue(
      issues,
      `${field}.lessons`,
      `Use at most ${COURSE_INPUT_LIMITS.lessonsPerSection} lessons.`,
    );
  }
  const lessons = (values ?? [])
    .slice(0, COURSE_INPUT_LIMITS.lessonsPerSection + 1)
    .map((candidate, index) =>
      lesson(candidate, `${field}.lessons.${index}`, issues),
    )
    .filter((candidate): candidate is CourseLessonInput => candidate !== null);
  return sectionKey && title && description !== null
    ? Object.freeze({
        sectionKey,
        title,
        description,
        lessons: Object.freeze(lessons),
      })
    : null;
}

export function validateCourseDraftInput(
  input: unknown,
): CourseValidationResult<CourseDraftInput> {
  const issues: CourseValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        Object.freeze({
          field: "course",
          message: "Course must be an object.",
        }),
      ],
    };
  }
  exactKeys(
    input,
    [
      "slug",
      "title",
      "description",
      "accessMode",
      "accessPlanId",
      "accessPlanRevision",
      "estimatedMinutes",
      "sections",
    ],
    "course",
    issues,
  );
  const slug = normalizedKey(
    input.slug,
    "slug",
    SAFE_SLUG,
    COURSE_INPUT_LIMITS.slug,
    issues,
  );
  const title = text(input.title, "title", COURSE_INPUT_LIMITS.title, issues);
  const description = text(
    input.description ?? "",
    "description",
    COURSE_INPUT_LIMITS.description,
    issues,
    true,
  );
  const accessMode = COURSE_ACCESS_SET.has(String(input.accessMode))
    ? (input.accessMode as CourseAccessMode)
    : null;
  if (!accessMode)
    issue(issues, "accessMode", "Choose a supported course access mode.");
  const accessPlanId =
    input.accessPlanId === null ||
    input.accessPlanId === undefined ||
    input.accessPlanId === ""
      ? null
      : typeof input.accessPlanId === "string" &&
          SAFE_ID.test(input.accessPlanId)
        ? input.accessPlanId
        : null;
  if (input.accessPlanId && accessPlanId === null) {
    issue(issues, "accessPlanId", "Use a safe access-plan identifier.");
  }
  const accessPlanRevision = optionalPositiveInteger(
    input.accessPlanRevision,
    "accessPlanRevision",
    issues,
  );
  if (
    accessMode === "protected" &&
    (accessPlanId === null || accessPlanRevision === null)
  ) {
    issue(
      issues,
      "accessPlanId",
      "Protected Courses require an access plan and revision.",
    );
  }
  if (
    accessMode &&
    accessMode !== "protected" &&
    (accessPlanId !== null || accessPlanRevision !== null)
  ) {
    issue(issues, "accessPlanId", "Only protected Courses use an access plan.");
  }
  const estimatedMinutes = optionalPositiveInteger(
    input.estimatedMinutes,
    "estimatedMinutes",
    issues,
  );
  const values = Array.isArray(input.sections) ? input.sections : null;
  if (!values) issue(issues, "sections", "Course sections must be an array.");
  if (values && values.length > COURSE_INPUT_LIMITS.sections) {
    issue(
      issues,
      "sections",
      `Use at most ${COURSE_INPUT_LIMITS.sections} sections.`,
    );
  }
  const sections = (values ?? [])
    .slice(0, COURSE_INPUT_LIMITS.sections + 1)
    .map((candidate, index) => section(candidate, `sections.${index}`, issues))
    .filter((candidate): candidate is CourseSectionInput => candidate !== null);
  const sectionKeys = sections.map(({ sectionKey }) => sectionKey);
  const lessonKeys = sections.flatMap(({ lessons }) =>
    lessons.map(({ lessonKey }) => lessonKey),
  );
  const lessonSlugs = sections.flatMap(({ lessons }) =>
    lessons.map(({ slug }) => slug),
  );
  if (new Set(sectionKeys).size !== sectionKeys.length)
    issue(issues, "sections", "Section keys must be unique.");
  if (new Set(lessonKeys).size !== lessonKeys.length)
    issue(issues, "sections", "Lesson keys must be unique across the Course.");
  if (new Set(lessonSlugs).size !== lessonSlugs.length)
    issue(issues, "sections", "Lesson slugs must be unique across the Course.");
  if (
    accessMode !== "protected" &&
    sections.some(({ lessons }) =>
      lessons.some(({ accessMode: mode }) => mode === "protected"),
    )
  ) {
    issue(
      issues,
      "sections",
      "Protected lessons require a protected Course access plan.",
    );
  }
  if (
    issues.length > 0 ||
    !slug ||
    !title ||
    description === null ||
    !accessMode
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return {
    ok: true,
    value: Object.freeze({
      slug,
      title,
      description,
      accessMode,
      accessPlanId,
      accessPlanRevision,
      estimatedMinutes,
      sections: Object.freeze(sections),
    }),
  };
}

export function validateCourseProgressInput(
  input: unknown,
): CourseValidationResult<CourseProgressInput> {
  const issues: CourseValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        Object.freeze({
          field: "progress",
          message: "Progress must be an object.",
        }),
      ],
    };
  }
  exactKeys(
    input,
    [
      "courseId",
      "courseRevisionId",
      "lessonKey",
      "completedItemKeys",
      "lastItemKey",
      "state",
    ],
    "progress",
    issues,
  );
  const courseId =
    typeof input.courseId === "string" && SAFE_ID.test(input.courseId)
      ? input.courseId
      : null;
  const courseRevisionId =
    typeof input.courseRevisionId === "string" &&
    SAFE_ID.test(input.courseRevisionId)
      ? input.courseRevisionId
      : null;
  const lessonKey = normalizedKey(
    input.lessonKey,
    "lessonKey",
    SAFE_KEY,
    COURSE_INPUT_LIMITS.key,
    issues,
  );
  if (!courseId) issue(issues, "courseId", "Use a safe Course identifier.");
  if (!courseRevisionId)
    issue(issues, "courseRevisionId", "Use a safe Course revision identifier.");
  const completedValues = Array.isArray(input.completedItemKeys)
    ? input.completedItemKeys
    : null;
  if (!completedValues)
    issue(issues, "completedItemKeys", "Completed item keys must be an array.");
  const completedItemKeys = (completedValues ?? [])
    .map((value, index) => {
      const parsed = normalizedKey(
        value,
        `completedItemKeys.${index}`,
        SAFE_KEY,
        COURSE_INPUT_LIMITS.key,
        issues,
      );
      return parsed ?? "";
    })
    .filter(Boolean);
  if (new Set(completedItemKeys).size !== completedItemKeys.length) {
    issue(issues, "completedItemKeys", "Completed item keys must be unique.");
  }
  const lastItemKey =
    input.lastItemKey === null ||
    input.lastItemKey === undefined ||
    input.lastItemKey === ""
      ? null
      : normalizedKey(
          input.lastItemKey,
          "lastItemKey",
          SAFE_KEY,
          COURSE_INPUT_LIMITS.key,
          issues,
        );
  const state =
    input.state === "in_progress" || input.state === "completed"
      ? input.state
      : null;
  if (!state)
    issue(issues, "state", "Progress state must be in_progress or completed.");
  if (
    issues.length > 0 ||
    !courseId ||
    !courseRevisionId ||
    !lessonKey ||
    !state
  ) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return {
    ok: true,
    value: Object.freeze({
      courseId,
      courseRevisionId,
      lessonKey,
      completedItemKeys: Object.freeze(completedItemKeys),
      lastItemKey,
      state,
    }),
  };
}
