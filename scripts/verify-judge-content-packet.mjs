#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(
  process.argv[2] ?? "content/imports/sfm-judge-packet",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function main() {
  const manifest = await json("packet.json");
  assert(manifest.schemaVersion === 1, "Unsupported packet schema version.");
  assert(manifest.counts.releases === 4, "Packet must contain four releases.");
  assert(manifest.counts.tracks > 0, "Packet has no tracks.");
  assert(manifest.counts.tracks <= 40, "A selected release exceeds ten tracks.");
  assert(manifest.counts.posts === 10, "Packet must contain ten posts.");
  assert(manifest.counts.courses === 2, "Packet must contain two courses.");
  assert(manifest.counts.videos === 5, "Packet must contain five videos.");
  assert(manifest.counts.updates === 2, "Packet must contain two updates.");
  assert(manifest.counts.heroes === 4, "Packet must contain four hero images.");

  const [releases, tracks, posts, courses, videos, updates, rights] =
    await Promise.all([
      json("catalog/releases.json"),
      json("catalog/tracks.json"),
      json("learn/posts.json"),
      json("learn/courses.json"),
      json("videos/videos.json"),
      json("whats-new/updates.json"),
      json("RIGHTS.json"),
    ]);
  for (const release of releases) {
    const releaseTracks = tracks.filter(
      ({ releaseKey }) => releaseKey === release.releaseKey,
    );
    assert(releaseTracks.length > 0, `${release.title} has no tracks.`);
    assert(releaseTracks.length <= 10, `${release.title} exceeds ten tracks.`);
  }
  assert(new Set(tracks.map(({ trackKey }) => trackKey)).size === tracks.length, "Track keys are not unique.");
  assert(new Set(posts.map(({ slug }) => slug)).size === posts.length, "Post slugs are not unique.");
  assert(courses.every(({ lessons }) => lessons.length > 0), "A course has no lessons.");
  assert(videos.every(({ provider }) => provider === "youtube"), "A selected video is not a YouTube record.");
  assert(updates.every(({ is_published: published }) => published), "A selected update is not published.");
  assert(rights.customerDataIncluded === false, "Customer data is not permitted in the packet.");
  assert(rights.productionWritesPerformed === false, "The packet must not report production writes.");

  for (const file of manifest.files) {
    const target = path.join(root, file.path);
    const info = await stat(target);
    const contents = await readFile(target);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    assert(info.size === file.bytes, `Byte count changed for ${file.path}.`);
    assert(sha256 === file.sha256, `Checksum changed for ${file.path}.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        root,
        counts: manifest.counts,
        filesVerified: manifest.files.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
