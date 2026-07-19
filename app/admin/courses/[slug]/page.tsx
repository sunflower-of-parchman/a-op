import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CourseWorkspace } from "@/components/courses";
import {
  readAdminCourseAccessPlans,
  readAdminCourseDraft,
  readAdminCourseMediaOptions,
} from "@/db/course-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export default async function AdminCourseEditor({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  await requireActiveModule(env.DB, "courses");
  const { slug } = await params;
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  if (!identity) notFound();
  const owner = hasApplicationRole(identity, "owner");
  const allowed =
    owner ||
    (hasApplicationRole(identity, "editor") &&
      (await hasEditorPermission(env.DB, identity.userId, {
        permissionKey: "pages.write",
        scopeId: slug === "new" ? "*" : slug,
      })));
  if (!allowed) notFound();
  const [course, media, accessPlans] = await Promise.all([
    slug === "new" ? Promise.resolve(null) : readAdminCourseDraft(env.DB, slug),
    readAdminCourseMediaOptions(env.DB),
    readAdminCourseAccessPlans(env.DB),
  ]);
  if (slug !== "new" && !course) notFound();
  return (
    <CourseWorkspace
      accessPlans={accessPlans}
      canPublish={owner}
      initial={
        course ?? {
          id: "course_pending",
          slug: "",
          title: "",
          description: "",
          accessMode: "public",
          accessPlanId: null,
          accessPlanRevision: null,
          estimatedMinutes: null,
          sections: [],
          revisionId: "course_revision_pending",
          revision: 0,
          version: 0,
          publicationState: "draft",
          publishedRevisionId: null,
          draftIsPublished: false,
        }
      }
      media={media}
    />
  );
}
