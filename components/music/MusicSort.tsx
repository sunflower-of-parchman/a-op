"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ChangeEvent } from "react";
import type {
  PublicCatalogSort,
  PublicMusicQuery,
  PublicMusicView,
} from "@/lib/catalog/public-dto";
import styles from "./Music.module.css";

const SORT_OPTIONS: readonly {
  readonly value: PublicCatalogSort;
  readonly label: string;
}[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title" },
];

function sortedMusicUrl(
  query: PublicMusicQuery,
  view: PublicMusicView,
  sort: string,
): string {
  const params = new URLSearchParams();

  if (view !== "tracks") params.set("view", view);
  if (query.q) params.set("q", query.q);
  if (query.tag) params.set("tag", query.tag);
  if (query.meter) params.set("meter", query.meter);
  if (query.tempoMin !== null) params.set("tempoMin", String(query.tempoMin));
  if (query.tempoMax !== null) params.set("tempoMax", String(query.tempoMax));
  if (query.musicalKey) params.set("musicalKey", query.musicalKey);
  if (query.durationMinMs !== null)
    params.set("durationMin", String(query.durationMinMs / 1000));
  if (query.durationMaxMs !== null)
    params.set("durationMax", String(query.durationMaxMs / 1000));
  if (sort !== "newest") params.set("sort", sort);

  const search = params.toString();
  return search ? `/music?${search}` : "/music";
}

export function MusicSort({
  query,
  view,
}: {
  readonly query: PublicMusicQuery;
  readonly view: PublicMusicView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeSort(event: ChangeEvent<HTMLSelectElement>) {
    const href = sortedMusicUrl(query, view, event.currentTarget.value);
    startTransition(() => router.push(href));
  }

  return (
    <label aria-busy={pending} className={styles.sortControl}>
      <span>Sort</span>
      <select
        defaultValue={query.sort}
        disabled={pending}
        onChange={changeSort}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default MusicSort;
