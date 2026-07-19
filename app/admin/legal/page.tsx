import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { LegalDocumentLibrary } from "@/components/legal/LegalDocumentLibrary";
import { readLegalAdminWorkspace } from "@/db/legal-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Legal document administration" };

export default async function LegalDocumentAdministrationPage() {
  const identity = await resolveApplicationIdentity(
    env.DB,
    await getChatGPTUser(),
  );
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  const workspace = await readLegalAdminWorkspace(env.DB, identity.userId);
  return <LegalDocumentLibrary workspace={workspace} />;
}
