import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { VideoWorkspace } from "@/components/video/VideoWorkspace";
import { readAdminVideoBySlug } from "@/db/video-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export default async function VideoAdministrationEditor({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity) notFound();
  await requireActiveModule(env.DB, "video");
  const owner = hasApplicationRole(identity, "owner");
  const allowed =
    owner ||
    (hasApplicationRole(identity, "editor") &&
      (await hasEditorPermission(env.DB, identity.userId, {
        permissionKey: "pages.write",
        scopeId: slug === "new" ? "*" : slug,
      })));
  if (!allowed) notFound();
  if (slug === "new")
    return <VideoWorkspace canPublish={owner} initial={null} />;
  const video = await readAdminVideoBySlug(env.DB, slug);
  if (!video) notFound();
  return <VideoWorkspace canPublish={owner} initial={video} />;
}
