import type { AccessDecision } from "@/lib/access/decide-access.ts";

export const COURSE_ACCESS_MODES = Object.freeze([
  "public",
  "account",
  "protected",
] as const);
export type CourseAccessMode = (typeof COURSE_ACCESS_MODES)[number];

export const LESSON_ACCESS_MODES = Object.freeze([
  "inherit",
  ...COURSE_ACCESS_MODES,
] as const);
export type LessonAccessMode = (typeof LESSON_ACCESS_MODES)[number];

export const LESSON_ITEM_TYPES = Object.freeze([
  "text",
  "prompt",
  "image",
  "audio",
  "video",
  "download",
] as const);
export type LessonItemType = (typeof LESSON_ITEM_TYPES)[number];

export type CoursePublicationState = "draft" | "published" | "archived";

export interface LessonItemContentInput {
  readonly text: string;
  readonly caption: string;
  readonly filename: string | null;
}

export interface LessonItemInput {
  readonly itemKey: string;
  readonly itemType: LessonItemType;
  readonly content: LessonItemContentInput;
  readonly mediaDerivativeId: string | null;
  readonly altText: string | null;
  readonly transcriptText: string | null;
}

export interface CourseLessonInput {
  readonly lessonKey: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly accessMode: LessonAccessMode;
  readonly estimatedMinutes: number | null;
  readonly items: readonly LessonItemInput[];
}

export interface CourseSectionInput {
  readonly sectionKey: string;
  readonly title: string;
  readonly description: string;
  readonly lessons: readonly CourseLessonInput[];
}

export interface CourseDraftInput {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly accessMode: CourseAccessMode;
  readonly accessPlanId: string | null;
  readonly accessPlanRevision: number | null;
  readonly estimatedMinutes: number | null;
  readonly sections: readonly CourseSectionInput[];
}

export interface CourseItemView extends LessonItemInput {
  readonly id: string;
  readonly position: number;
  readonly mediaUrl: string | null;
}

export interface CourseLessonView {
  readonly id: string;
  readonly lessonKey: string;
  readonly slug: string;
  readonly position: number;
  readonly title: string;
  readonly summary: string;
  readonly accessMode: LessonAccessMode;
  readonly effectiveAccessMode: CourseAccessMode;
  readonly estimatedMinutes: number | null;
  readonly access: CourseAccessView;
  readonly items: readonly CourseItemView[];
}

export interface CourseSectionView {
  readonly id: string;
  readonly sectionKey: string;
  readonly position: number;
  readonly title: string;
  readonly description: string;
  readonly lessons: readonly CourseLessonView[];
}

export interface CourseAccessView {
  readonly allowed: boolean;
  readonly reason: AccessDecision["reason"];
  readonly source: AccessDecision["source"];
  readonly signInRequired: boolean;
}

export interface PublishedCourseView {
  readonly id: string;
  readonly slug: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly title: string;
  readonly description: string;
  readonly accessMode: CourseAccessMode;
  readonly estimatedMinutes: number | null;
  readonly publishedAt: string;
  readonly access: CourseAccessView;
  readonly sections: readonly CourseSectionView[];
}

export interface PublishedCourseSummary {
  readonly id: string;
  readonly slug: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly title: string;
  readonly description: string;
  readonly accessMode: CourseAccessMode;
  readonly estimatedMinutes: number | null;
  readonly publishedAt: string;
  readonly lessonCount: number;
  readonly access: CourseAccessView;
}

export interface CourseProgressView {
  readonly id: string;
  readonly courseId: string;
  readonly lessonKey: string;
  readonly state: "in_progress" | "completed";
  readonly completedItemKeys: readonly string[];
  readonly lastItemKey: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface PublishedCourseLessonView {
  readonly course: Omit<PublishedCourseView, "sections">;
  readonly section: Omit<CourseSectionView, "lessons">;
  readonly lesson: CourseLessonView;
  readonly access: CourseAccessView;
  readonly progress: CourseProgressView | null;
}

export interface AdminCourseSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publicationState: CoursePublicationState;
  readonly accessMode: CourseAccessMode;
  readonly version: number;
  readonly draftRevision: number;
  readonly publishedRevisionId: string | null;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface AdminCourseDraft extends CourseDraftInput {
  readonly id: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly version: number;
  readonly publicationState: CoursePublicationState;
  readonly publishedRevisionId: string | null;
  readonly draftIsPublished: boolean;
}

export interface AdminCourseMediaOption {
  readonly id: string;
  readonly kind: string;
  readonly contentType: string;
  readonly sourceMediaId: string;
}

export interface AdminCourseAccessPlanOption {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly state: "active" | "archived";
}

export interface CourseProgressInput {
  readonly courseId: string;
  readonly courseRevisionId: string;
  readonly lessonKey: string;
  readonly completedItemKeys: readonly string[];
  readonly lastItemKey: string | null;
  readonly state: "in_progress" | "completed";
}

export interface CustomerCourseProgressSummary {
  readonly course: PublishedCourseSummary;
  readonly completedLessons: number;
  readonly startedLessons: number;
  readonly totalLessons: number;
  readonly resumeHref: string | null;
  readonly resumeLabel: string | null;
}
