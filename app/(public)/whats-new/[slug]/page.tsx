import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { UpdateDetail } from "@/components/updates/UpdateDetail";
import { readPublishedUpdateBySlug } from "@/db/updates-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

async function readForViewer(slug: string) {
  await requireActiveModule(env.DB, "whats-new");
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const customerUserId = identity?.roles.includes("customer")
    ? identity.userId
    : null;
  const update = await readPublishedUpdateBySlug(env.DB, slug, customerUserId);
  return { update, customerUserId };
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { update } = await readForViewer((await params).slug);
  return update
    ? { title: update.title, description: update.summary || undefined }
    : {};
}

export default async function UpdatePage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { update, customerUserId } = await readForViewer((await params).slug);
  if (!update) notFound();
  return <UpdateDetail recordRead={customerUserId !== null} update={update} />;
}
