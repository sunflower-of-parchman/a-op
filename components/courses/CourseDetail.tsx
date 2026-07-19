import Link from "next/link";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { TelemetryPageView } from "@/components/telemetry";
import type { PublishedCourseView } from "@/lib/courses/types.ts";
import styles from "./Courses.module.css";

export function CourseDetail({
  course,
}: {
  readonly course: PublishedCourseView;
}) {
  const totalLessons = course.sections.reduce(
    (count, section) => count + section.lessons.length,
    0,
  );
  return (
    <>
      <TelemetryPageView
        eventName="course-view"
        resourceId={course.id}
        resourceType="course"
      />
      <header className={`page-frame ${styles.detailHeader}`}>
        <div className={styles.detailHeading}>
          <p className="eyebrow">Course</p>
          <h1>{course.title}</h1>
          {course.description ? (
            <p className={styles.lessonIntro}>{course.description}</p>
          ) : null}
        </div>
        <dl className={styles.detailFacts}>
          <div>
            <dt>Lessons</dt>
            <dd>{totalLessons}</dd>
          </div>
          {course.estimatedMinutes ? (
            <div>
              <dt>Estimated time</dt>
              <dd>{course.estimatedMinutes} minutes</dd>
            </div>
          ) : null}
          <div>
            <dt>Access</dt>
            <dd>{course.accessMode}</dd>
          </div>
        </dl>
      </header>
      <div className={`page-frame ${styles.detailContent}`}>
        {!course.access.allowed && course.access.signInRequired ? (
          <div className={styles.accessMessage}>
            <h2>Sign in to take this Course</h2>
            <p>
              Your account keeps lesson progress and verifies account-based
              access.
            </p>
            <Link
              className="button button-primary"
              href={chatGPTSignInPath(`/courses/${course.slug}`)}
            >
              Sign in with ChatGPT
            </Link>
          </div>
        ) : null}
        <ol className={styles.sectionList}>
          {course.sections.map((section) => (
            <li className={styles.section} key={section.id}>
              <div className={styles.sectionHeading}>
                <span className="eyebrow">Section {section.position}</span>
                <h2>{section.title}</h2>
                {section.description ? (
                  <p className={styles.sectionDescription}>
                    {section.description}
                  </p>
                ) : null}
              </div>
              <ol className={styles.lessonList}>
                {section.lessons.map((lesson) => (
                  <li className={styles.lessonRow} key={lesson.id}>
                    <span className={styles.lessonNumber}>
                      {String(lesson.position).padStart(2, "0")}
                    </span>
                    <div className={styles.lessonIdentity}>
                      {lesson.access.allowed ? (
                        <Link
                          className={styles.lessonLink}
                          href={`/courses/${course.slug}/${lesson.slug}`}
                        >
                          {lesson.title}
                        </Link>
                      ) : (
                        <span>{lesson.title}</span>
                      )}
                      {lesson.summary ? (
                        <p className={styles.lessonSummary}>{lesson.summary}</p>
                      ) : null}
                    </div>
                    <span
                      className={styles.accessLabel}
                      data-allowed={String(lesson.access.allowed)}
                    >
                      {lesson.access.allowed
                        ? lesson.estimatedMinutes
                          ? `${lesson.estimatedMinutes} min`
                          : "Open"
                        : lesson.access.signInRequired
                          ? "Sign in"
                          : "Access required"}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
