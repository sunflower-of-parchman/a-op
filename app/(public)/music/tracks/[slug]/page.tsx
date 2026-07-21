import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFavoriteControl } from "@/components/account";
import { MusicDetail } from "@/components/music/MusicDetail";
import { readCurrentCatalogTrack } from "@/lib/catalog/read-current-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const track = await readCurrentCatalogTrack(env.DB, slug);
  return track
    ? { title: track.title, description: track.description || undefined }
    : {};
}

export default async function TrackPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const track = await readCurrentCatalogTrack(env.DB, slug);
  if (!track) notFound();
  return (
    <MusicDetail
      customerAction={
        <PublicFavoriteControl
          label={track.title}
          targetId={track.id}
          targetType="track"
        />
      }
      data={track}
    />
  );
}
