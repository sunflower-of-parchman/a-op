"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import type {
  PublicCatalogKind,
  PublicCatalogSort,
  PublicMusicQuery,
} from "@/lib/catalog/public-dto";
import styles from "./Music.module.css";

export interface MusicFiltersProps {
  readonly availableTags: readonly string[];
  readonly query: PublicMusicQuery;
}

const KIND_OPTIONS: readonly {
  readonly value: "all" | PublicCatalogKind;
  readonly label: string;
}[] = [
  { value: "all", label: "All music" },
  { value: "release", label: "Releases" },
  { value: "track", label: "Tracks" },
  { value: "collection", label: "Collections" },
];

const SORT_OPTIONS: readonly {
  readonly value: PublicCatalogSort;
  readonly label: string;
}[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title" },
];

function musicUrl(form: HTMLFormElement): string {
  const data = new FormData(form);
  const params = new URLSearchParams();
  const q = String(data.get("q") ?? "").trim();
  const kind = String(data.get("kind") ?? "all");
  const tag = String(data.get("tag") ?? "");
  const sort = String(data.get("sort") ?? "newest");

  if (q) params.set("q", q);
  if (kind !== "all") params.set("kind", kind);
  if (tag) params.set("tag", tag);
  if (sort !== "newest") params.set("sort", sort);

  const query = params.toString();
  return query ? `/music?${query}` : "/music";
}

export function MusicFilters({ availableTags, query }: MusicFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = musicUrl(event.currentTarget);
    startTransition(() => router.push(href));
  }

  return (
    <form
      action="/music"
      aria-busy={pending}
      className={styles.filters}
      method="get"
      onSubmit={submit}
      role="search"
    >
      <label className={styles.searchField}>
        <span>Search music</span>
        <input defaultValue={query.q} name="q" type="search" />
      </label>

      <label>
        <span>Type</span>
        <select defaultValue={query.kind} name="kind">
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {availableTags.length > 0 ? (
        <label>
          <span>Tag</span>
          <select defaultValue={query.tag ?? ""} name="tag">
            <option value="">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        <span>Sort</span>
        <select defaultValue={query.sort} name="sort">
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.filterActions}>
        <button className={styles.applyButton} disabled={pending} type="submit">
          {pending ? "Applying" : "Apply"}
        </button>
        <button
          className={styles.clearButton}
          disabled={pending}
          onClick={() => startTransition(() => router.push("/music"))}
          type="button"
        >
          Clear
        </button>
      </div>
    </form>
  );
}

export default MusicFilters;
