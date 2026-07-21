import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PageHero } from "@/components/public/PageHero";
import { UpdateIndex } from "@/components/updates/UpdateIndex";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import { countUnreadUpdates, listPublishedUpdates } from "@/db/updates-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "What's New" };

export default async function WhatsNewPage() {
  await requireActiveModule(env.DB, "whats-new");
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const customerUserId = identity?.roles.includes("customer")
    ? identity.userId
    : null;
  const [updates, unreadCount, mosaicImages] = await Promise.all([
    listPublishedUpdates(env.DB, customerUserId),
    customerUserId === null
      ? Promise.resolve(null)
      : countUnreadUpdates(env.DB, customerUserId),
    readPublicMosaicImages(env.DB),
  ]);
  return (
    <>
      <PageHero hero={null} mosaicImages={mosaicImages} title="What's New" />
      <UpdateIndex unreadCount={unreadCount} updates={updates} />
    </>
  );
}
