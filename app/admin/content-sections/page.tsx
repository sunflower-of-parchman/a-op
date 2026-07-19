import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ContentSectionLibrary } from "@/components/admin/content-sections";
import { readContentSectionAdminWorkspace } from "@/db/content-section-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Content section administration" };

export default async function ContentSectionAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  const { sections, publishedOptions } = await readContentSectionAdminWorkspace(
    env.DB,
    identity.userId,
  );
  return (
    <ContentSectionLibrary
      publishedOptions={publishedOptions}
      sections={sections}
    />
  );
}
