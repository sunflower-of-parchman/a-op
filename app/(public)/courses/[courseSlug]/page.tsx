import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CourseDetail, CoursePreviewDetail } from "@/components/courses";
import { readPublishedCourse } from "@/db/course-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

async function courseForRequest(courseSlug: string) {
  await requireActiveModule(env.DB, "courses");
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  return readPublishedCourse(
    env.DB,
    courseSlug,
    identity,
    new Date().toISOString(),
  );
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ courseSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug } = await params;
  if (/^preview-[1-2]$/.test(courseSlug)) return { title: "Course" };
  const course = await courseForRequest(courseSlug);
  return course
    ? { title: course.title, description: course.description || undefined }
    : {};
}

export default async function CoursePage({
  params,
}: {
  readonly params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  if (/^preview-[1-2]$/.test(courseSlug)) {
    await requireActiveModule(env.DB, "courses");
    return <CoursePreviewDetail courseSlug={courseSlug} />;
  }
  const course = await courseForRequest(courseSlug);
  if (!course) notFound();
  return <CourseDetail course={course} />;
}
