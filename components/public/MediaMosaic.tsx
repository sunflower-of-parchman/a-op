"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PublicArtwork } from "@/db/public-media.ts";
import styles from "./MediaMosaic.module.css";

type MosaicVariant = "home" | "compact" | "auth";

interface MosaicRect {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}

interface MosaicTile {
  readonly id: string;
  readonly rect: MosaicRect;
  readonly current: number;
  readonly previous: number | null;
  readonly revision: number;
}

const GRID = Object.freeze({
  home: { columns: 6, rows: 2, maxLarge: 2 },
  compact: { columns: 8, rows: 2, maxLarge: 2 },
  auth: { columns: 4, rows: 4, maxLarge: 3 },
});

function randomBetween(minimum: number, maximum: number): number {
  return Math.round(minimum + Math.random() * (maximum - minimum));
}

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function rectId(rect: MosaicRect): string {
  return `${rect.column},${rect.row}:${rect.width}x${rect.height}`;
}

function cells(rect: MosaicRect): readonly string[] {
  const result: string[] = [];
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    for (
      let column = rect.column;
      column < rect.column + rect.width;
      column += 1
    ) {
      result.push(`${column},${row}`);
    }
  }
  return result;
}

function initialLargeRect(
  variant: MosaicVariant,
  randomize: boolean,
): MosaicRect {
  const config = GRID[variant];
  const candidates =
    variant === "auth"
      ? [
          { column: 0, row: 0, width: 2, height: 2 },
          { column: 2, row: 0, width: 2, height: 2 },
          { column: 0, row: 2, width: 2, height: 2 },
          { column: 2, row: 2, width: 2, height: 2 },
        ]
      : [
          { column: 0, row: 0, width: 3, height: 2 },
          { column: config.columns - 3, row: 0, width: 3, height: 2 },
          { column: 0, row: 0, width: 2, height: 2 },
          { column: config.columns - 2, row: 0, width: 2, height: 2 },
        ];
  return candidates[
    randomize ? Math.floor(Math.random() * candidates.length) : 0
  ]!;
}

function createLayout(
  variant: MosaicVariant,
  randomize: boolean,
): MosaicRect[] {
  const config = GRID[variant];
  const large = initialLargeRect(variant, randomize);
  const covered = new Set(cells(large));
  const rects: MosaicRect[] = [large];
  for (let row = 0; row < config.rows; row += 1) {
    for (let column = 0; column < config.columns; column += 1) {
      if (!covered.has(`${column},${row}`)) {
        rects.push({ column, row, width: 1, height: 1 });
      }
    }
  }
  return rects;
}

function createTiles(
  variant: MosaicVariant,
  randomize: boolean,
  takeImage: (excluded: ReadonlySet<number>) => number,
): MosaicTile[] {
  const active = new Set<number>();
  return createLayout(variant, randomize).map((rect) => {
    const current = takeImage(active);
    active.add(current);
    return { id: rectId(rect), rect, current, previous: null, revision: 0 };
  });
}

function mergeCandidates(
  tiles: readonly MosaicTile[],
  variant: MosaicVariant,
): MosaicRect[] {
  const config = GRID[variant];
  const unitCells = new Set(
    tiles
      .filter((tile) => tile.rect.width === 1 && tile.rect.height === 1)
      .map((tile) => `${tile.rect.column},${tile.rect.row}`),
  );
  const footprints =
    variant === "auth"
      ? [
          [2, 2],
          [3, 2],
          [2, 3],
        ]
      : [
          [2, 2],
          [3, 2],
        ];
  const candidates: MosaicRect[] = [];
  for (const [width, height] of footprints) {
    for (let row = 0; row <= config.rows - height!; row += 1) {
      for (let column = 0; column <= config.columns - width!; column += 1) {
        const rect = { column, row, width: width!, height: height! };
        if (cells(rect).every((cell) => unitCells.has(cell)))
          candidates.push(rect);
      }
    }
  }
  return candidates;
}

function tileStyle(rect: MosaicRect): CSSProperties {
  return {
    gridColumn: `${rect.column + 1} / span ${rect.width}`,
    gridRow: `${rect.row + 1} / span ${rect.height}`,
  };
}

export function MediaMosaic({
  images,
  title,
  variant = "compact",
}: {
  readonly images: readonly PublicArtwork[];
  readonly title: string;
  readonly variant?: MosaicVariant;
}) {
  const deck = useRef<number[]>([]);
  const lastRegion = useRef<string | null>(null);
  const recentRegions = useRef<string[]>([]);
  const imageCursor = useRef(0);

  function rebuildDeck() {
    deck.current = shuffle(images.map((_, index) => index));
  }

  function takeImage(excluded: ReadonlySet<number>): number {
    for (let pass = 0; pass < 2; pass += 1) {
      if (deck.current.length === 0) rebuildDeck();
      const candidateIndex = deck.current.findIndex(
        (candidate) => !excluded.has(candidate),
      );
      if (candidateIndex >= 0) {
        return deck.current.splice(candidateIndex, 1)[0]!;
      }
      rebuildDeck();
    }
    return 0;
  }

  const [tiles, setTiles] = useState<MosaicTile[]>(() => {
    if (images.length === 0) return [];
    let initialImage = 0;
    return createTiles(variant, false, () => {
      const selected = initialImage % images.length;
      initialImage += 1;
      return selected;
    });
  });

  useEffect(() => {
    if (images.length === 0) {
      return;
    }

    rebuildDeck();
    lastRegion.current = null;
    recentRegions.current = [];
    imageCursor.current = 0;
    let stopped = false;
    const initialTiles = createTiles(variant, true, takeImage);
    queueMicrotask(() => {
      if (!stopped) setTiles(initialTiles);
    });

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      images.length < 8
    ) {
      return () => {
        stopped = true;
      };
    }

    let imageTimer: number | null = null;
    let topologyTimer: number | null = null;
    let imageHasRun = false;
    let topologyHasRun = false;

    const scheduleImage = () => {
      imageTimer = window.setTimeout(
        () => {
          if (stopped || document.hidden) {
            scheduleImage();
            return;
          }
          imageHasRun = true;
          setTiles((current) => {
            if (current.length === 0) return current;
            const slotIndex = imageCursor.current % current.length;
            imageCursor.current += 1;
            const active = new Set(current.map((tile) => tile.current));
            const incoming = takeImage(active);
            return current.map((tile, index) =>
              index === slotIndex
                ? {
                    ...tile,
                    current: incoming,
                    previous: tile.current,
                    revision: tile.revision + 1,
                  }
                : tile,
            );
          });
          scheduleImage();
        },
        imageHasRun
          ? randomBetween(10_000, 14_000)
          : randomBetween(20_000, 24_000),
      );
    };

    const scheduleTopology = () => {
      topologyTimer = window.setTimeout(
        () => {
          if (stopped || document.hidden) {
            scheduleTopology();
            return;
          }
          topologyHasRun = true;
          setTiles((current) => {
            const large = current.filter(
              (tile) => tile.rect.width * tile.rect.height > 1,
            );
            const merges = mergeCandidates(current, variant).filter(
              (rect) =>
                rectId(rect) !== lastRegion.current &&
                !recentRegions.current.includes(rectId(rect)),
            );
            const canMerge =
              large.length < GRID[variant].maxLarge && merges.length > 0;
            const split =
              !canMerge || (large.length > 0 && Math.random() < 0.5);

            if (split && large.length > 0) {
              const candidates = large.filter(
                (tile) => rectId(tile.rect) !== lastRegion.current,
              );
              const target = shuffle(
                candidates.length > 0 ? candidates : large,
              )[0]!;
              const active = new Set(current.map((tile) => tile.current));
              const additions = cells(target.rect).map((cell) => {
                const [column, row] = cell.split(",").map(Number);
                const rect = {
                  column: column!,
                  row: row!,
                  width: 1,
                  height: 1,
                };
                const incoming = takeImage(active);
                active.add(incoming);
                return {
                  id: rectId(rect),
                  rect,
                  current: incoming,
                  previous: null,
                  revision: 0,
                };
              });
              lastRegion.current = rectId(target.rect);
              recentRegions.current = [
                ...recentRegions.current.slice(-2),
                lastRegion.current,
              ];
              return [
                ...current.filter((tile) => tile.id !== target.id),
                ...additions,
              ];
            }

            const target = shuffle(merges)[0];
            if (!target) return current;
            const targetCells = new Set(cells(target));
            const active = new Set(current.map((tile) => tile.current));
            const incoming = takeImage(active);
            lastRegion.current = rectId(target);
            recentRegions.current = [
              ...recentRegions.current.slice(-2),
              lastRegion.current,
            ];
            return [
              ...current.filter(
                (tile) =>
                  !targetCells.has(`${tile.rect.column},${tile.rect.row}`),
              ),
              {
                id: rectId(target),
                rect: target,
                current: incoming,
                previous: null,
                revision: 0,
              },
            ];
          });
          scheduleTopology();
        },
        topologyHasRun
          ? randomBetween(24_000, variant === "auth" ? 48_000 : 40_000)
          : randomBetween(28_000, 34_000),
      );
    };

    scheduleImage();
    scheduleTopology();

    return () => {
      stopped = true;
      if (imageTimer !== null) window.clearTimeout(imageTimer);
      if (topologyTimer !== null) window.clearTimeout(topologyTimer);
    };
  }, [images, variant, title]);

  if (images.length === 0) return null;

  return (
    <header className={styles[variant]}>
      <div
        aria-label={title ? `${title} image mosaic` : "Artist image mosaic"}
        className={styles.grid}
        role="img"
      >
        {tiles.map((tile) => (
          <span
            className={styles.tile}
            key={tile.id}
            style={tileStyle(tile.rect)}
          >
            {tile.previous === null ? null : (
              <img
                alt=""
                className={styles.outgoing}
                src={images[tile.previous]?.url}
              />
            )}
            <img
              alt=""
              className={tile.revision === 0 ? styles.initial : styles.incoming}
              key={`${tile.current}-${tile.revision}`}
              src={images[tile.current]?.url}
            />
          </span>
        ))}
      </div>
      <div className={styles.scrim} />
      {title ? <h1>{title}</h1> : null}
    </header>
  );
}
