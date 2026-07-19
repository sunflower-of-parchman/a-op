import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorialDetail } from "@/components/updates/EditorialViews";
import { readPublishedEditorialPostBySlug } from "@/db/editorial-read.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await requireActiveModule(env.DB, "whats-new");
  const post = await readPublishedEditorialPostBySlug(
    env.DB,
    (await params).slug,
  );
  return post
    ? { title: post.title, description: post.excerpt || undefined }
    : {};
}

export default async function EditorialPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  await requireActiveModule(env.DB, "whats-new");
  const post = await readPublishedEditorialPostBySlug(
    env.DB,
    (await params).slug,
  );
  if (!post) notFound();
  return (
    <EditorialDetail
      body={post.body}
      excerpt={post.excerpt}
      title={post.title}
    />
  );
}
