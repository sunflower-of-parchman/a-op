import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { UpdateIndex } from "@/components/updates/UpdateIndex";
import { countUnreadUpdates, listPublishedUpdates } from "@/db/updates-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your updates" };

export default async function AccountUpdatesPage() {
  const authenticatedUser = await requireChatGPTUser("/account/whats-new");
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  if (!identity?.roles.includes("customer")) notFound();
  await requireActiveModule(env.DB, "whats-new");
  const [updates, unreadCount] = await Promise.all([
    listPublishedUpdates(env.DB, identity.userId),
    countUnreadUpdates(env.DB, identity.userId),
  ]);
  return (
    <UpdateIndex accountView unreadCount={unreadCount} updates={updates} />
  );
}
