import Link from "next/link";
import type { PublishedCourseSummary } from "@/lib/courses/types.ts";
import type { PublicArtwork } from "@/db/public-media.ts";
import { PageHero } from "@/components/public/PageHero";
import { CoursePreviewIndex } from "./CoursePreview";
import styles from "./Courses.module.css";

function accessLabel(course: PublishedCourseSummary): string {
  if (course.access.allowed) {
    return course.accessMode === "public" ? "Open Course" : "Available to you";
  }
  if (course.access.signInRequired) return "Sign in required";
  return "Access required";
}

export function CourseIndex({
  artworkBySlug,
  courses,
  mosaicImages,
  previewCategory,
}: {
  readonly artworkBySlug?: Readonly<Record<string, PublicArtwork | null>>;
  readonly courses: readonly PublishedCourseSummary[];
  readonly mosaicImages?: readonly PublicArtwork[];
  readonly previewCategory?: string | null;
}) {
  if (courses.length === 0) {
    return <CoursePreviewIndex category={previewCategory ?? null} />;
  }

  return (
    <>
      <PageHero hero={null} mosaicImages={mosaicImages} title="Courses" />
      <div className={`page-frame ${styles.indexContent}`}>
        <CourseCards artworkBySlug={artworkBySlug} courses={courses} />
      </div>
    </>
  );
}

export function CourseCards({
  artworkBySlug,
  courses,
}: {
  readonly artworkBySlug?: Readonly<Record<string, PublicArtwork | null>>;
  readonly courses: readonly PublishedCourseSummary[];
}) {
  return (
    <ul className={styles.courseList}>
      {courses.map((course) => (
        <li className={styles.courseCard} key={course.id}>
          <Link href={`/courses/${course.slug}`}>
            {artworkBySlug?.[course.slug] ? (
              <img
                alt={artworkBySlug[course.slug]?.alt ?? ""}
                className={styles.courseArtwork}
                src={artworkBySlug[course.slug]?.url}
              />
            ) : (
              <span
                aria-hidden="true"
                className={styles.courseArtworkFallback}
              />
            )}
            <span className={styles.courseOverlay}>
              <span className={styles.courseMeta}>
                {course.lessonCount}{" "}
                {course.lessonCount === 1 ? "lesson" : "lessons"}
              </span>
              <strong>{course.title}</strong>
              <span
                className={styles.accessLabel}
                data-allowed={String(course.access.allowed)}
              >
                {accessLabel(course)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
