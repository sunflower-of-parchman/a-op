import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerMemberships } from "@/components/memberships/CustomerMemberships";
import { readCustomerMembershipSurface } from "@/components/memberships/server.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Memberships and subscriptions",
};

export default async function CustomerMembershipsPage() {
  const authenticatedUser = await requireChatGPTUser("/account/memberships");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();
  await requireActiveModule(env.DB, "memberships");

  const data = await readCustomerMembershipSurface(env.DB, identity.userId);
  return <CustomerMemberships data={data} />;
}
