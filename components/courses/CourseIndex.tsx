import Link from "next/link";
import type { PublishedCourseSummary } from "@/lib/courses/types.ts";
import styles from "./Courses.module.css";

function accessLabel(course: PublishedCourseSummary): string {
  if (course.access.allowed) {
    return course.accessMode === "public" ? "Open Course" : "Available to you";
  }
  if (course.access.signInRequired) return "Sign in required";
  return "Access required";
}

export function CourseIndex({
  courses,
}: {
  readonly courses: readonly PublishedCourseSummary[];
}) {
  return (
    <>
      <header className={`page-frame ${styles.pageHeader}`}>
        <p className="eyebrow">Courses</p>
        <h1>Courses</h1>
        <p>
          Ordered lessons with artist-authored text, media, downloads, and
          durable progress.
        </p>
      </header>
      <div className={`page-frame ${styles.indexContent}`}>
        {courses.length === 0 ? (
          <div className={styles.empty}>
            <h2>No Courses are published.</h2>
            <p>The artist&apos;s published Courses will appear here.</p>
          </div>
        ) : (
          <ul className={styles.courseList}>
            {courses.map((course) => (
              <li className={styles.courseRow} key={course.id}>
                <div className={styles.courseIdentity}>
                  <span className="eyebrow">Course</span>
                  <h2>
                    <Link href={`/courses/${course.slug}`}>{course.title}</Link>
                  </h2>
                </div>
                <div className={styles.courseFacts}>
                  {course.description ? <p>{course.description}</p> : null}
                  <span>
                    {course.lessonCount}{" "}
                    {course.lessonCount === 1 ? "lesson" : "lessons"}
                    {course.estimatedMinutes
                      ? ` · ${course.estimatedMinutes} minutes`
                      : ""}
                  </span>
                </div>
                <span
                  className={styles.accessLabel}
                  data-allowed={String(course.access.allowed)}
                >
                  {accessLabel(course)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
