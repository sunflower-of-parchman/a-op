import { env } from "cloudflare:workers";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { CoursePreviewPost, LessonExperience } from "@/components/courses";
import styles from "@/components/courses/Courses.module.css";
import { readPublishedCourseLesson } from "@/db/course-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

async function lessonForRequest(courseSlug: string, lessonSlug: string) {
  await requireActiveModule(env.DB, "courses");
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const lesson = await readPublishedCourseLesson(
    env.DB,
    courseSlug,
    lessonSlug,
    identity,
    new Date().toISOString(),
  );
  return { authenticatedUser, identity, lesson };
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ courseSlug: string; lessonSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug, lessonSlug } = await params;
  if (
    /^preview-[1-2]$/.test(courseSlug) &&
    /^post-(?:10|[1-9])$/.test(lessonSlug)
  ) {
    return { title: "Post", description: "Blurb" };
  }
  const { lesson } = await lessonForRequest(courseSlug, lessonSlug);
  return lesson
    ? {
        title: `${lesson.lesson.title} · ${lesson.course.title}`,
        description: lesson.lesson.summary || undefined,
      }
    : {};
}

export default async function CourseLessonPage({
  params,
}: {
  readonly params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  if (
    /^preview-[1-2]$/.test(courseSlug) &&
    /^post-(?:10|[1-9])$/.test(lessonSlug)
  ) {
    await requireActiveModule(env.DB, "courses");
    return <CoursePreviewPost courseSlug={courseSlug} postSlug={lessonSlug} />;
  }
  const { identity, lesson } = await lessonForRequest(courseSlug, lessonSlug);
  if (!lesson) notFound();
  const returnTo = `/courses/${courseSlug}/${lessonSlug}`;
  if (!lesson.access.allowed) {
    return (
      <div className={`page-frame ${styles.lessonContent}`}>
        <div className={styles.accessMessage}>
          <p className="eyebrow">Course access</p>
          <h1>{lesson.lesson.title}</h1>
          <p>
            {lesson.access.signInRequired
              ? "Sign in to verify access to this lesson."
              : "This lesson requires artist-granted, membership, subscription, or other entitled access."}
          </p>
          {lesson.access.signInRequired ? (
            <Link
              className="button button-primary"
              href={chatGPTSignInPath(returnTo)}
            >
              Sign in with ChatGPT
            </Link>
          ) : (
            <Link className="button button-secondary" href="/account/access">
              View account access
            </Link>
          )}
          <Link className="text-link" href={`/courses/${courseSlug}`}>
            Back to Course
          </Link>
        </div>
      </div>
    );
  }
  return (
    <LessonExperience
      canTrackProgress={identity?.roles.includes("customer") ?? false}
      data={lesson}
      signInHref={chatGPTSignInPath(returnTo)}
    />
  );
}
