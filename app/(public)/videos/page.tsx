import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { VideoIndex } from "@/components/video/VideoIndex";
import {
  listPublishedVideos,
  readPublishedVideoBySlug,
} from "@/db/video-read.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ video?: string | string[] }>;
}) {
  await requireActiveModule(env.DB, "video");
  const videos = await listPublishedVideos(env.DB);
  const rawSelection = (await searchParams).video;
  const requestedSlug = Array.isArray(rawSelection)
    ? rawSelection[0]
    : rawSelection;
  const activeSlug =
    videos.find(({ slug }) => slug === requestedSlug)?.slug ?? videos[0]?.slug;
  const activeVideo = activeSlug
    ? await readPublishedVideoBySlug(env.DB, activeSlug)
    : null;

  return (
    <VideoIndex
      activeVideo={activeVideo}
      previewSelection={requestedSlug ?? null}
      videos={videos}
    />
  );
}
