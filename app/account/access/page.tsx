import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerAccessLibrary } from "@/components/account/CustomerAccessLibrary";
import { readCustomerAccessLibrary } from "@/db/customer-access-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access",
};

export default async function AccountAccessPage() {
  const authenticatedUser = await requireChatGPTUser("/account/access");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();

  const access = await readCustomerAccessLibrary(
    env.DB,
    identity,
    new Date().toISOString(),
  );

  return (
    <CustomerAccessLibrary
      data={access}
      title="Access"
      description="Current protected resources, durable entitlement history, and completed deliveries for this customer relationship."
    />
  );
}
