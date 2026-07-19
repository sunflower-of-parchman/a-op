import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { EditorialWorkspace } from "@/components/updates/EditorialWorkspace";
import { readAdminEditorialPostBySlug } from "@/db/editorial-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export default async function EditorialAdministrationEditor({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity) notFound();
  await requireActiveModule(env.DB, "whats-new");
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
    return <EditorialWorkspace canPublish={owner} initial={null} />;
  const post = await readAdminEditorialPostBySlug(env.DB, slug);
  if (!post) notFound();
  return <EditorialWorkspace canPublish={owner} initial={post} />;
}
