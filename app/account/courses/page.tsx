import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerCourseProgress } from "@/components/courses";
import { readCustomerCourseProgress } from "@/db/course-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Course progress" };

export default async function AccountCoursesPage() {
  await requireActiveModule(env.DB, "courses");
  const authenticatedUser = await requireChatGPTUser("/account/courses");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();
  const courses = await readCustomerCourseProgress(
    env.DB,
    identity,
    new Date().toISOString(),
  );
  return <CustomerCourseProgress courses={courses} />;
}
