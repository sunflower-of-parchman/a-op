import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AdminMemberships } from "@/components/memberships/AdminMemberships";
import { readAdminMembershipSurface } from "@/components/memberships/server.ts";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import {
  hasApplicationRole,
  resolveApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Membership administration",
};

export default async function MembershipAdministrationPage() {
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity || !hasApplicationRole(identity, "owner")) notFound();

  await requireActiveModule(env.DB, "memberships");
  const [data, activeModules] = await Promise.all([
    readAdminMembershipSurface(env.DB, identity.userId),
    readActiveModuleKeys(env.DB),
  ]);

  return (
    <AdminMemberships
      data={data}
      subscriptionsActive={activeModules.includes("subscriptions")}
    />
  );
}
