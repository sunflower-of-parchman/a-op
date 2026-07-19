import Link from "next/link";
import type { CustomerCourseProgressSummary } from "@/lib/courses/types.ts";
import styles from "./Courses.module.css";

export function CustomerCourseProgress({
  courses,
}: {
  readonly courses: readonly CustomerCourseProgressSummary[];
}) {
  return (
    <div className={styles.accountContent}>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceHeading}>
          <p className="eyebrow">Course progress</p>
          <h2>Courses</h2>
          <p className={styles.supporting}>
            Progress follows stable lesson and item keys across published Course
            revisions.
          </p>
        </div>
      </header>
      {courses.length === 0 ? (
        <p className={styles.empty}>No published Courses are available.</p>
      ) : (
        <ul className={styles.accountList}>
          {courses.map(
            ({
              course,
              completedLessons,
              startedLessons,
              totalLessons,
              resumeHref,
              resumeLabel,
            }) => (
              <li className={styles.accountRow} key={course.id}>
                <div className={styles.accountIdentity}>
                  <h3>
                    <Link href={`/courses/${course.slug}`}>{course.title}</Link>
                  </h3>
                  <span
                    className={styles.accessLabel}
                    data-allowed={String(course.access.allowed)}
                  >
                    {course.access.allowed ? "Available" : "Access required"}
                  </span>
                </div>
                <div className={styles.accountProgress}>
                  <p>
                    {completedLessons} of {totalLessons} lessons complete
                  </p>
                  <p>{startedLessons} lessons started</p>
                </div>
                {resumeHref && resumeLabel ? (
                  <Link className="button button-primary" href={resumeHref}>
                    Resume {resumeLabel}
                  </Link>
                ) : (
                  <Link
                    className="button button-secondary"
                    href={`/courses/${course.slug}`}
                  >
                    Open Course
                  </Link>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
