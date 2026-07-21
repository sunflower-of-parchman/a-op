#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createProposalArtifact } from "../lib/setup/index.ts";

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : (process.argv[index + 1] ?? null);
}

function required(name) {
  const value = option(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values
    .filter((entry) => entry.some(Boolean))
    .map((entry) =>
      Object.fromEntries(
        headers.map((header, index) => [header, entry[index] ?? ""]),
      ),
    );
}

async function loadVideos(packet) {
  const csvUrl = option("videos-csv-url");
  if (!csvUrl) return json(path.join(packet, "videos/videos.json"));
  const url = new URL(csvUrl);
  if (url.protocol !== "https:")
    throw new Error("--videos-csv-url must use HTTPS.");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok)
    throw new Error("The approved videos sheet could not be read.");
  return csvRows(await response.text()).map((video) => ({
    ...video,
    is_published: video.is_published.toUpperCase() === "TRUE",
  }));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorText = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (errorText.length < 16_384) errorText += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorText.trim() || `${executable} failed.`));
    });
  });
}

async function normalizeAudio(packet, track, preparedRoot) {
  const source = path.join(packet, track.audio);
  const compact = Number(track.durationSeconds) * 40_000 > 24 * 1024 * 1024;
  const bitrate = compact ? "128k" : "320k";
  const target = path.join(preparedRoot, `${track.trackKey}.${bitrate}.mp3`);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const [sourceInfo, targetInfo] = await Promise.all([
      stat(source),
      stat(target),
    ]);
    if (targetInfo.mtimeMs >= sourceInfo.mtimeMs && targetInfo.size > 0) {
      return { path: target, compact };
    }
  } catch {
    // The deterministic local derivative will be created below.
  }
  await run("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-map_metadata",
    "-1",
    "-vn",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    bitrate,
    "-write_xing",
    "0",
    "-id3v2_version",
    "0",
    "-fflags",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    target,
  ]);
  return { path: target, compact };
}

async function mapLimit(values, limit, mapper) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        result[index] = await mapper(values[index], index);
      }
    }),
  );
  return result;
}

const packet = path.resolve(required("packet"));
const baseProposalPath = path.resolve(required("base-proposal"));
const output = path.resolve(required("output"));
const aliasesOutput = path.resolve(
  option("aliases-output", "setup/local-paths.json"),
);
const currentFingerprint = required("current-source-fingerprint");
const artistName = option("artist-name", "Artist");
const artistHeadline = option("artist-headline", artistName);
const artistDescription = option("artist-description", artistName);
const aboutJsonPath = option("about-json");
const preparedRoot = path.join(packet, "prepared", "installer-audio");
const mediaRoot = path.join(packet, "prepared", "installer-media");

const [base, tracks, releases, collections, packetVideos, editorial, about] =
  await Promise.all([
    json(baseProposalPath),
    json(path.join(packet, "catalog/tracks.json")),
    json(path.join(packet, "catalog/releases.json")),
    json(path.join(packet, "catalog/collections.json")),
    loadVideos(packet),
    json(path.join(packet, "setup/editorial-presentation.json")),
    aboutJsonPath ? json(path.resolve(aboutJsonPath)) : null,
  ]);
const normalized = await mapLimit(tracks, 2, (track) =>
  normalizeAudio(packet, track, preparedRoot),
);

const aliases = {};
const media = [];
const mediaActions = [];
for (let index = 0; index < tracks.length; index += 1) {
  const track = tracks[index];
  const mediaKey = `audio-${track.trackKey}`;
  const sourceAlias = `source-${mediaKey}`;
  aliases[sourceAlias] = normalized[index].path;
  if (normalized[index].compact) aliases[`compact-${mediaKey}`] = true;
  aliases[`manifest-${mediaKey}`] = path.join(
    mediaRoot,
    `${mediaKey}.manifest.json`,
  );
  aliases[`stream-${mediaKey}`] = path.join(
    mediaRoot,
    `${mediaKey}.stream.mp3`,
  );
  aliases[`download-${mediaKey}`] = path.join(
    mediaRoot,
    `${mediaKey}.download.mp3`,
  );
  media.push({
    mediaKey,
    sourceAlias,
    kind: "audio",
    rights: "confirmed",
    intendedUse: "protected",
    attribution: null,
  });
  mediaActions.push({
    actionId: `publish-${mediaKey}`,
    mediaKey,
    sourceAlias,
    operation: "publish-approved",
    derivatives: ["stream", "download"],
    requiresArtistApproval: true,
  });
}
for (const item of [...releases, ...collections]) {
  const key = item.releaseKey ?? item.collectionKey;
  const mediaKey = `artwork-${key}`;
  const sourceAlias = `source-${mediaKey}`;
  aliases[sourceAlias] = path.join(packet, item.artwork);
  aliases[`manifest-${mediaKey}`] = path.join(
    mediaRoot,
    `${mediaKey}.manifest.json`,
  );
  aliases[`artwork-${mediaKey}`] = path.join(mediaRoot, `${mediaKey}.webp`);
  media.push({
    mediaKey,
    sourceAlias,
    kind: "artwork",
    rights: "confirmed",
    intendedUse: "protected",
    attribution: null,
  });
  mediaActions.push({
    actionId: `publish-${mediaKey}`,
    mediaKey,
    sourceAlias,
    operation: "publish-approved",
    derivatives: ["artwork"],
    requiresArtistApproval: true,
  });
}
await mkdir(mediaRoot, { recursive: true });

const mediaByTrack = new Map(
  tracks.map((track) => [track.trackKey, `audio-${track.trackKey}`]),
);
const videos = packetVideos
  .filter((video) => video.is_published !== false && video.embed_url)
  .map((video) => ({
    videoKey: `video-${video.provider_id}`.toLowerCase().replace(/_/g, "-"),
    title: video.title,
    summary: video.description || video.title,
    mediaKey: null,
    transcript: null,
    externalEmbedUrl: video.embed_url,
    consentRequired: true,
  }));

const proposal = structuredClone(base);
proposal.proposalId = `${base.proposalId.replace(/-media(?:-[0-9]+)?$/, "")}-media-1`;
proposal.createdAt = new Date().toISOString();
proposal.sourceStateFingerprint = currentFingerprint;
proposal.topics.artist = {
  ...proposal.topics.artist,
  publicName: artistName,
  shortName: artistName,
  headline: artistHeadline,
  description: artistDescription,
  biography: about
    ? about.sections
        .flatMap((section) => [`## ${section.title}`, ...section.paragraphs])
        .join("\n\n")
    : "",
};
proposal.topics.rightsMedia.media = media;
proposal.topics.catalogReleases.tracks =
  proposal.topics.catalogReleases.tracks.map((track) => {
    const metadata = tracks.find((entry) => entry.trackKey === track.trackKey);
    return {
      ...track,
      durationMs: metadata
        ? Math.round(Number(metadata.durationSeconds) * 1000)
        : null,
      meter: metadata?.meter || null,
      tempoBpm: metadata?.tempo ?? null,
      musicalKey: metadata?.key || null,
      tags: metadata?.mood ? [metadata.mood] : [],
      mediaKey: mediaByTrack.get(track.trackKey) ?? null,
    };
  });
proposal.topics.catalogReleases.releases =
  proposal.topics.catalogReleases.releases.map((release) => ({
    ...release,
    artworkMediaKey: `artwork-${release.releaseKey}`,
  }));
proposal.topics.catalogReleases.collections =
  proposal.topics.catalogReleases.collections.map((collection) => ({
    ...collection,
    artworkMediaKey: `artwork-${collection.collectionKey}`,
  }));
proposal.topics.streamingDownloads.tracks =
  proposal.topics.streamingDownloads.tracks.map((track) => ({
    ...track,
    streaming: "public",
    download: "account",
  }));
proposal.topics.coursesVideo.videos = videos;
if (about) {
  proposal.topics.editorialPresentation.about = {
    title: "About",
    introduction: about.introduction ?? "",
    bodyText: about.sections
      .flatMap((section) => [`## ${section.title}`, ...section.paragraphs])
      .join("\n\n"),
    publication: "publish",
  };
}
proposal.topics.editorialPresentation.pageHeroes = [];
proposal.topics.accountsPublication.publication.media = "publish-approved";
proposal.mediaActions = mediaActions;
proposal.externalActions = [];

const artifact = await createProposalArtifact(proposal);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(path.dirname(aliasesOutput), { recursive: true });
await Promise.all([
  writeFile(output, `${JSON.stringify(artifact.proposal, null, 2)}\n`, {
    mode: 0o600,
  }),
  writeFile(
    aliasesOutput,
    `${JSON.stringify({ schemaVersion: "aop.local-path-aliases.v1", aliases }, null, 2)}\n`,
    { mode: 0o600 },
  ),
]);

const sourceBytes = await Promise.all(
  normalized.map(({ path: file }) => readFile(file)),
);
process.stdout.write(
  `${JSON.stringify(
    {
      status: "ready-for-one-approval",
      proposalId: artifact.proposal.proposalId,
      proposalHash: artifact.proposalHash,
      summary: {
        releases: proposal.topics.catalogReleases.releases.length,
        tracks: tracks.length,
        protectedAudioSources: tracks.length,
        streamingDerivatives: tracks.length,
        downloadDerivatives: tracks.length,
        courses: proposal.topics.coursesVideo.courses.length,
        videos: videos.length,
        posts: proposal.topics.editorialPresentation.posts.length,
        updates: proposal.topics.editorialPresentation.updates.length,
        pageHeroes: 0,
        catalogArtwork: releases.length + collections.length,
        preparedAudioBytes: sourceBytes.reduce(
          (sum, bytes) => sum + bytes.byteLength,
          0,
        ),
      },
      output,
      aliasesOutput,
    },
    null,
    2,
  )}\n`,
);
