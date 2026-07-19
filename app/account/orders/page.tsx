import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CustomerOrders } from "@/components/commerce";
import { readCustomerCommerceOrders } from "@/db/commerce-surface-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test orders",
};

export default async function CustomerOrdersPage() {
  const authenticatedUser = await requireChatGPTUser("/account/orders");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();

  const orders = await readCustomerCommerceOrders(env.DB, identity.userId);
  return <CustomerOrders orders={orders} />;
}
