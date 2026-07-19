import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AccessWorkspace } from "@/components/admin/access/AccessWorkspace";
import { readAdminAccessOverview } from "@/db/access-admin-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access administration",
};

export default async function AccessAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();

  const data = await readAdminAccessOverview(env.DB, identity.userId);
  return <AccessWorkspace data={data} />;
}
