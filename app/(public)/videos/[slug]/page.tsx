import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VideoDetail } from "@/components/video/VideoDetail";
import { readPublishedVideoBySlug } from "@/db/video-read.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await requireActiveModule(env.DB, "video");
  const video = await readPublishedVideoBySlug(env.DB, (await params).slug);
  return video
    ? { title: video.title, description: video.summary || undefined }
    : {};
}

export default async function VideoPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  await requireActiveModule(env.DB, "video");
  const video = await readPublishedVideoBySlug(env.DB, (await params).slug);
  if (!video) notFound();
  return <VideoDetail video={video} />;
}
