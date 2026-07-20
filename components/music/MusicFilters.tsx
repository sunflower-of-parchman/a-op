"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type {
  PublicMusicQuery,
  PublicMusicView,
} from "@/lib/catalog/public-dto";
import styles from "./Music.module.css";

export interface MusicFiltersProps {
  readonly availableKeys: readonly string[];
  readonly availableMeters: readonly string[];
  readonly embedded?: boolean;
  readonly query: PublicMusicQuery;
  readonly view: PublicMusicView;
}

function musicUrl(form: HTMLFormElement): string {
  const data = new FormData(form);
  const params = new URLSearchParams();
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const q = text("q");
  const view = text("view");
  const sort = text("sort");

  if (view !== "tracks") params.set("view", view);
  if (q) params.set("q", q);
  if (sort !== "newest") params.set("sort", sort);
  for (const name of [
    "meter",
    "tempoMin",
    "tempoMax",
    "musicalKey",
    "durationMin",
    "durationMax",
  ]) {
    const value = text(name);
    if (value) params.set(name, value);
  }

  const query = params.toString();
  return query ? `/music?${query}` : "/music";
}

export function MusicFilters({
  availableKeys,
  availableMeters,
  embedded = false,
  query,
  view,
}: MusicFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = musicUrl(event.currentTarget);
    startTransition(() => router.push(href));
  }

  function applySelection(event: ChangeEvent<HTMLSelectElement>) {
    event.currentTarget.form?.requestSubmit();
  }

  function applyInput(event: ChangeEvent<HTMLInputElement>) {
    if (timer.current) clearTimeout(timer.current);
    const form = event.currentTarget.form;
    timer.current = setTimeout(() => form?.requestSubmit(), 350);
  }

  const form = (
    <form
      action="/music"
      aria-busy={pending}
      className={styles.filters}
      method="get"
      onSubmit={submit}
      role="search"
    >
      <input name="view" type="hidden" value={view} />
      <input name="sort" type="hidden" value={query.sort} />
      <label className={styles.searchField}>
        <span>Search tracks</span>
        <input
          defaultValue={query.q}
          name="q"
          onChange={applyInput}
          placeholder="Search tracks…"
          type="search"
        />
      </label>

      <details className={styles.musicalFilter}>
        <summary>Meter</summary>
        {availableMeters.length > 0 ? (
          <select
            aria-label="Meter"
            defaultValue={query.meter ?? ""}
            name="meter"
            onChange={applySelection}
          >
            <option aria-label="All meters" value="" />
            {availableMeters.map((meter) => (
              <option key={meter} value={meter}>
                {meter}
              </option>
            ))}
          </select>
        ) : null}
      </details>

      <details className={styles.musicalFilter}>
        <summary>Tempo</summary>
        <div className={styles.rangeFields}>
          <input
            aria-label="Minimum tempo"
            defaultValue={query.tempoMin ?? ""}
            min={1}
            name="tempoMin"
            onChange={applyInput}
            placeholder="Min"
            type="number"
          />
          <input
            aria-label="Maximum tempo"
            defaultValue={query.tempoMax ?? ""}
            min={1}
            name="tempoMax"
            onChange={applyInput}
            placeholder="Max"
            type="number"
          />
        </div>
      </details>

      <details className={styles.musicalFilter}>
        <summary>Key</summary>
        {availableKeys.length > 0 ? (
          <select
            aria-label="Key"
            defaultValue={query.musicalKey ?? ""}
            name="musicalKey"
            onChange={applySelection}
          >
            <option aria-label="All keys" value="" />
            {availableKeys.map((musicalKey) => (
              <option key={musicalKey} value={musicalKey}>
                {musicalKey}
              </option>
            ))}
          </select>
        ) : null}
      </details>

      <details className={styles.musicalFilter}>
        <summary>Duration</summary>
        <div className={styles.rangeFields}>
          <input
            aria-label="Minimum duration in seconds"
            defaultValue={
              query.durationMinMs === null ? "" : query.durationMinMs / 1000
            }
            min={0}
            name="durationMin"
            onChange={applyInput}
            placeholder="Min"
            type="number"
          />
          <input
            aria-label="Maximum duration in seconds"
            defaultValue={
              query.durationMaxMs === null ? "" : query.durationMaxMs / 1000
            }
            min={0}
            name="durationMax"
            onChange={applyInput}
            placeholder="Max"
            type="number"
          />
        </div>
      </details>
    </form>
  );

  if (embedded) return form;

  return (
    <details className={styles.filterDisclosure} open>
      <summary>Filters</summary>
      {form}
    </details>
  );
}

export default MusicFilters;
