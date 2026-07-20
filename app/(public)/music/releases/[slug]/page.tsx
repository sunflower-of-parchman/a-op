import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFavoriteControl } from "@/components/account";
import { MusicDetail } from "@/components/music/MusicDetail";
import { PreviewCatalogDetail } from "@/components/music/PreviewCatalogDetail";
import { readCurrentCatalogRelease } from "@/lib/catalog/read-current-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (/^preview-\d+$/.test(slug)) return { title: "Album" };
  const release = await readCurrentCatalogRelease(env.DB, slug);
  return release
    ? { title: release.title, description: release.description || undefined }
    : {};
}

export default async function ReleasePage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (/^preview-\d+$/.test(slug)) {
    return <PreviewCatalogDetail kind="album" />;
  }
  const release = await readCurrentCatalogRelease(env.DB, slug);
  if (!release) notFound();
  return (
    <MusicDetail
      customerAction={
        <PublicFavoriteControl
          label={release.title}
          targetId={release.id}
          targetType="release"
        />
      }
      data={release}
    />
  );
}
