import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { VideoIndex } from "@/components/video/VideoIndex";
import { listPublishedVideos } from "@/db/video-read.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosPage() {
  await requireActiveModule(env.DB, "video");
  const videos = await listPublishedVideos(env.DB);
  return (
    <>
      <PublicPageHeader title="Videos" variant="compact" />
      <VideoIndex videos={videos} />
    </>
  );
}
