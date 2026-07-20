import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { MusicIndex } from "@/components/music/MusicIndex";
import { readPublicMusicIndex } from "@/db/catalog-read";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import {
  readCustomerFavorites,
  readCustomerPlaylists,
  readListeningHistory,
} from "@/db/customer-read.ts";
import { listActiveLicenseOffers } from "@/db/licensing-read.ts";
import { readActiveModuleKeys } from "@/db/site-read.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import type {
  PublicCatalogKind,
  PublicCatalogSort,
  PublicMusicQuery,
  PublicMusicView,
} from "@/lib/catalog/public-dto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Music",
};

type SearchValue = string | readonly string[] | undefined;

function firstValue(value: SearchValue): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

function musicRequest(searchParams: Readonly<Record<string, SearchValue>>): {
  readonly query: PublicMusicQuery;
  readonly view: PublicMusicView;
} {
  const q = firstValue(searchParams.q).trim().slice(0, 160);
  const requestedKind = firstValue(searchParams.kind);
  const requestedSort = firstValue(searchParams.sort);
  const requestedView = firstValue(searchParams.view);
  const tag = firstValue(searchParams.tag).trim().slice(0, 80) || null;
  const legacyKind: "all" | PublicCatalogKind =
    requestedKind === "all"
      ? "all"
      : ["release", "track", "collection"].includes(requestedKind)
        ? (requestedKind as PublicCatalogKind)
        : "track";
  const view: PublicMusicView = [
    "explore",
    "tracks",
    "collections",
    "albums",
    "favorites",
  ].includes(requestedView)
    ? (requestedView as PublicMusicView)
    : legacyKind === "all"
      ? "explore"
      : legacyKind === "collection"
        ? "collections"
        : legacyKind === "release"
          ? "albums"
          : "tracks";
  const kind: PublicMusicQuery["kind"] =
    view === "collections"
      ? "collection"
      : view === "albums"
        ? "release"
        : view === "tracks"
          ? "track"
          : "all";
  const sort: PublicCatalogSort = ["newest", "oldest", "title"].includes(
    requestedSort,
  )
    ? (requestedSort as PublicCatalogSort)
    : "newest";

  const integer = (key: string, scale = 1) => {
    const value = firstValue(searchParams[key]);
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value) * scale;
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  return {
    view,
    query: {
      q,
      kind,
      tag,
      sort,
      meter: firstValue(searchParams.meter).trim().slice(0, 16) || null,
      tempoMin: integer("tempoMin"),
      tempoMax: integer("tempoMax"),
      musicalKey:
        firstValue(searchParams.musicalKey).trim().slice(0, 32) || null,
      durationMinMs: integer("durationMin", 1000),
      durationMaxMs: integer("durationMax", 1000),
    },
  };
}

export default async function MusicPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, SearchValue>>;
}) {
  const { query, view } = musicRequest(await searchParams);
  const activeModules = new Set(await readActiveModuleKeys(env.DB));
  const authenticatedUser = await getChatGPTUser();
  const identity = await resolveApplicationIdentity(env.DB, authenticatedUser);
  const customerLibraryAvailable =
    activeModules.has("customer-library") &&
    identity?.roles.includes("customer") === true;
  const [data, products, licenseOffers, customerLibrary] = await Promise.all([
    readPublicMusicIndex(env.DB, query),
    listActiveCommerceProducts(env.DB),
    activeModules.has("licensing")
      ? listActiveLicenseOffers(env.DB)
      : Promise.resolve([]),
    customerLibraryAvailable && identity
      ? Promise.all([
          readCustomerFavorites(env.DB, identity.userId),
          readCustomerPlaylists(env.DB, identity.userId),
          readListeningHistory(env.DB, identity.userId),
        ])
      : Promise.resolve([[], [], []] as const),
  ]);
  return (
    <MusicIndex
      data={data}
      favorites={customerLibrary[0]}
      licenseOffers={licenseOffers}
      listeningHistory={customerLibrary[2]}
      playlists={customerLibrary[1]}
      products={products}
      view={view}
    />
  );
}
