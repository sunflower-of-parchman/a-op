"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  PublicMusicQuery,
  PublicMusicView,
} from "@/lib/catalog/public-dto";
import { MusicFilters } from "./MusicFilters";
import styles from "./Music.module.css";

const MOBILE_LIBRARY_LINKS: readonly {
  readonly href: string;
  readonly label: string;
  readonly view: PublicMusicView;
}[] = [
  { href: "/music?view=explore", label: "Explore", view: "explore" },
  { href: "/music", label: "Tracks", view: "tracks" },
  { href: "/music?view=albums", label: "Albums", view: "albums" },
  {
    href: "/music?view=collections",
    label: "Collections",
    view: "collections",
  },
  { href: "/music?view=favorites", label: "Favorites", view: "favorites" },
];

type MobileTool = "search" | "filters";

export function MobileMusicControls({
  availableKeys,
  availableMeters,
  query,
  view,
}: {
  readonly availableKeys: readonly string[];
  readonly availableMeters: readonly string[];
  readonly query: PublicMusicQuery;
  readonly view: PublicMusicView;
}) {
  const [activeTool, setActiveTool] = useState<MobileTool | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTool === "search") {
      panelRef.current
        ?.querySelector<HTMLInputElement>('input[type="search"]')
        ?.focus();
    }
  }, [activeTool]);

  function toggleTool(tool: MobileTool) {
    setActiveTool((current) => (current === tool ? null : tool));
  }

  return (
    <div className={styles.mobileLibraryControls}>
      <nav aria-label="Music library mobile navigation">
        <ul className={styles.mobileLibraryNavigation}>
          {MOBILE_LIBRARY_LINKS.map((item) => (
            <li key={item.view}>
              <Link
                aria-current={view === item.view ? "page" : undefined}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/account/playlists">Playlists</Link>
          </li>
          <li>
            <button
              aria-expanded={activeTool === "search"}
              aria-controls="mobile-music-tools"
              onClick={() => toggleTool("search")}
              type="button"
            >
              Search
            </button>
          </li>
          <li>
            <button
              aria-expanded={activeTool === "filters"}
              aria-controls="mobile-music-tools"
              onClick={() => toggleTool("filters")}
              type="button"
            >
              Filters
            </button>
          </li>
        </ul>
      </nav>

      {activeTool ? (
        <div
          className={styles.mobileMusicTools}
          id="mobile-music-tools"
          ref={panelRef}
        >
          <MusicFilters
            availableKeys={availableKeys}
            availableMeters={availableMeters}
            embedded
            query={query}
            view={view}
          />
        </div>
      ) : null}
    </div>
  );
}

export default MobileMusicControls;
