import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ContactAdminWorkspace } from "@/components/contact";
import { readContactAdminWorkspace } from "@/db/contact-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact administration" };

export default async function ContactAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();
  await requireActiveModule(env.DB, "contact");
  const workspace = await readContactAdminWorkspace(env.DB, identity.userId);
  return <ContactAdminWorkspace workspace={workspace} />;
}
