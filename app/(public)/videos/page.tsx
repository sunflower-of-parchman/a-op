import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { VideoIndex } from "@/components/video/VideoIndex";
import { PageHero } from "@/components/public/PageHero";
import {
  listPublishedVideos,
  readPublishedVideoBySlug,
} from "@/db/video-read.ts";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import { requirePublicModulePresentation } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosPage() {
  await requirePublicModulePresentation(env.DB, "video");
  const [videos, mosaicImages] = await Promise.all([
    listPublishedVideos(env.DB),
    readPublicMosaicImages(env.DB),
  ]);
  const activeSlug = videos[0]?.slug;
  const publishedVideos = (
    await Promise.all(
      videos.map(({ slug }) => readPublishedVideoBySlug(env.DB, slug)),
    )
  ).filter((video) => video !== null);
  const activeVideo =
    publishedVideos.find(({ slug }) => slug === activeSlug) ??
    publishedVideos[0] ??
    null;

  return (
    <>
      <PageHero hero={null} mosaicImages={mosaicImages} title="Videos" />
      <VideoIndex activeVideo={activeVideo} videos={publishedVideos} />
    </>
  );
}
