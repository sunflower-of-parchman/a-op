import Link from "next/link";
import type { AdminCourseSummary } from "@/lib/courses/types.ts";
import styles from "./Courses.module.css";

export function AdminCourses({
  courses,
  canCreate,
}: {
  readonly courses: readonly AdminCourseSummary[];
  readonly canCreate: boolean;
}) {
  return (
    <div className={styles.adminWorkspace}>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceHeading}>
          <p className="eyebrow">Course administration</p>
          <h2>Courses</h2>
          <p className={styles.supporting}>
            Build immutable Course revisions, order lessons and items, and
            publish exact access rules.
          </p>
        </div>
        {canCreate ? (
          <Link className="button button-primary" href="/admin/courses/new">
            Add Course
          </Link>
        ) : null}
      </header>
      <dl className={styles.metrics}>
        <div>
          <dt>Total</dt>
          <dd>{courses.length}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>
            {
              courses.filter(
                ({ publicationState }) => publicationState === "published",
              ).length
            }
          </dd>
        </div>
        <div>
          <dt>Draft changes</dt>
          <dd>
            {
              courses.filter(
                ({ publishedRevisionId, draftRevision }) =>
                  !publishedRevisionId || draftRevision > 1,
              ).length
            }
          </dd>
        </div>
      </dl>
      {courses.length === 0 ? (
        <p className={styles.empty}>No Course drafts have been created.</p>
      ) : (
        <ul className={styles.adminList}>
          {courses.map((course) => (
            <li className={styles.adminRow} key={course.id}>
              <div className={styles.adminIdentity}>
                <h3>
                  <Link href={`/admin/courses/${course.slug}`}>
                    {course.title}
                  </Link>
                </h3>
                <span>/{course.slug}</span>
              </div>
              <div className={styles.courseFacts}>
                <span>Draft revision {course.draftRevision}</span>
                <span>
                  Version {course.version} · {course.accessMode} access
                </span>
              </div>
              <span
                className={styles.status}
                data-state={course.publicationState}
              >
                {course.publicationState}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
