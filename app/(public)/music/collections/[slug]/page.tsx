import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFavoriteControl } from "@/components/account";
import { MusicDetail } from "@/components/music/MusicDetail";
import { PreviewCatalogDetail } from "@/components/music/PreviewCatalogDetail";
import { readCurrentCatalogCollection } from "@/lib/catalog/read-current-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (/^preview-\d+$/.test(slug)) return { title: "Collection" };
  const collection = await readCurrentCatalogCollection(env.DB, slug);
  return collection
    ? {
        title: collection.title,
        description: collection.description || undefined,
      }
    : {};
}

export default async function CollectionPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (/^preview-\d+$/.test(slug)) {
    return <PreviewCatalogDetail kind="collection" />;
  }
  const collection = await readCurrentCatalogCollection(env.DB, slug);
  if (!collection) notFound();
  return (
    <MusicDetail
      customerAction={
        <PublicFavoriteControl
          label={collection.title}
          targetId={collection.id}
          targetType="collection"
        />
      }
      data={collection}
    />
  );
}
