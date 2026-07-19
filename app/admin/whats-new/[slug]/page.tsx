import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { UpdateWorkspace } from "@/components/updates/UpdateWorkspace";
import { readAdminUpdateBySlug } from "@/db/updates-read.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export default async function UpdateAdministrationEditor({
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
    return <UpdateWorkspace canPublish={owner} initial={null} />;
  const update = await readAdminUpdateBySlug(env.DB, slug);
  if (!update) notFound();
  return <UpdateWorkspace canPublish={owner} initial={update} />;
}
