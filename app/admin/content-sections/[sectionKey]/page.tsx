import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ContentSectionWorkspace } from "@/components/admin/content-sections";
import { readAdminContentSectionByKey } from "@/db/content-section-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { validateContentSectionKey } from "@/lib/content-sections/validation.ts";

export const dynamic = "force-dynamic";

export default async function ContentSectionEditorPage({
  params,
}: {
  readonly params: Promise<{ sectionKey: string }>;
}) {
  const { sectionKey } = await params;
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  if (sectionKey === "new") return <ContentSectionWorkspace initial={null} />;
  const keyResult = validateContentSectionKey(sectionKey);
  if (!keyResult.ok) notFound();
  const section = await readAdminContentSectionByKey(
    env.DB,
    keyResult.value,
    identity.userId,
  );
  if (!section) notFound();
  return <ContentSectionWorkspace initial={section} />;
}
