import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AdminCourses } from "@/components/courses";
import { readAdminCourseIndex } from "@/db/course-read.ts";
import { readActiveEditorPermissions } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export default async function AdminCoursesPage() {
  await requireActiveModule(env.DB, "courses");
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  if (!identity || !hasApplicationRole(identity, "owner", "editor")) notFound();
  const owner = hasApplicationRole(identity, "owner");
  const permissions = owner
    ? []
    : await readActiveEditorPermissions(env.DB, identity.userId);
  const scopes = owner
    ? null
    : permissions
        .filter(({ permissionKey }) => permissionKey === "pages.write")
        .map(({ scopeId }) => scopeId);
  const courses = await readAdminCourseIndex(env.DB, scopes);
  return (
    <AdminCourses
      canCreate={scopes === null || scopes.includes("*")}
      courses={courses}
    />
  );
}
