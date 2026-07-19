import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MusicDetail } from "@/components/music/MusicDetail";
import { readCurrentCatalogCollection } from "@/lib/catalog/read-current-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
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
  const collection = await readCurrentCatalogCollection(env.DB, slug);
  if (!collection) notFound();
  return <MusicDetail data={collection} />;
}
