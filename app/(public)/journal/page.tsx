import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { EditorialIndex } from "@/components/updates/EditorialViews";
import { listPublishedEditorialPosts } from "@/db/editorial-read.ts";
import { requirePublicModulePresentation } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Journal" };

export default async function JournalPage() {
  await requirePublicModulePresentation(env.DB, "whats-new");
  const posts = await listPublishedEditorialPosts(env.DB);
  return (
    <>
      <PublicPageHeader title="Journal" variant="compact" />
      <EditorialIndex posts={posts} />
    </>
  );
}
