import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { MusicIndex } from "@/components/music/MusicIndex";
import { readPublicMusicIndex } from "@/db/catalog-read";
import type {
  PublicCatalogKind,
  PublicCatalogSort,
  PublicMusicQuery,
} from "@/lib/catalog/public-dto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Music",
};

type SearchValue = string | readonly string[] | undefined;

function firstValue(value: SearchValue): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

function musicQuery(
  searchParams: Readonly<Record<string, SearchValue>>,
): PublicMusicQuery {
  const q = firstValue(searchParams.q).trim().slice(0, 160);
  const requestedKind = firstValue(searchParams.kind);
  const requestedSort = firstValue(searchParams.sort);
  const tag = firstValue(searchParams.tag).trim().slice(0, 80) || null;
  const kind: "all" | PublicCatalogKind = [
    "release",
    "track",
    "collection",
  ].includes(requestedKind)
    ? (requestedKind as PublicCatalogKind)
    : "all";
  const sort: PublicCatalogSort = ["newest", "oldest", "title"].includes(
    requestedSort,
  )
    ? (requestedSort as PublicCatalogSort)
    : "newest";

  return { q, kind, tag, sort };
}

export default async function MusicPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, SearchValue>>;
}) {
  const query = musicQuery(await searchParams);
  const data = await readPublicMusicIndex(env.DB, query);
  return <MusicIndex data={data} />;
}
