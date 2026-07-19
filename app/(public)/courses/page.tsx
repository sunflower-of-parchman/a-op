import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CourseIndex } from "@/components/courses";
import { readPublishedCourseIndex } from "@/db/course-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  await requireActiveModule(env.DB, "courses");
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  const courses = await readPublishedCourseIndex(
    env.DB,
    identity,
    new Date().toISOString(),
  );
  return <CourseIndex courses={courses} />;
}
