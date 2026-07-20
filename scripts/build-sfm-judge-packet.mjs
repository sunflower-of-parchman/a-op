#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const RELEASES = Object.freeze([
  Object.freeze({
    id: 73,
    slug: "rust",
    art: "rust.jpg",
    sources: Object.freeze({
      lost: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/lost.mp3",
      love: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/love.mp3",
      melancholy: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/melancholy.mp3",
      nostalgia: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/nostalgia.mp3",
      tension: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/tension.mp3",
    }),
  }),
  Object.freeze({
    id: 69,
    slug: "inside",
    art: "inside.jpg",
    sources: Object.freeze({
      "inside-1": "Albums/Inside - All Materials/Inside/Inside 1.mp3",
      "inside-2": "Albums/Inside - All Materials/Inside/Inside 2.mp3",
      "inside-3": "Albums/Inside - All Materials/Inside/Inside 3.mp3",
      "inside-4": "Albums/Inside - All Materials/Inside/Inside 4.mp3",
      "inside-5": "Albums/Inside - All Materials/Inside/Inside 5.mp3",
    }),
  }),
  Object.freeze({
    id: 19,
    slug: "breathe",
    art: "breathe.webp",
    sources: Object.freeze({
      breathe: "Mp3s/breathe.mp3",
      "cold-start": "Mp3s/cold_start.mp3",
      peace: "Mp3s/peace.mp3",
      sustain: "Mp3s/sustain.mp3",
      "well-bye": "Mp3s/well_bye.mp3",
    }),
  }),
  Object.freeze({
    id: 9,
    slug: "amiss",
    art: "amiss.webp",
    sources: Object.freeze({
      "4-162": "Mp3s/4_162.mp3",
      amiss: "Mp3s/amiss.mp3",
      "lilies-in-the-lake": "Mp3s/lilies_in_the_lake.mp3",
      "long-walk": "Mp3s/long_walk.mp3",
      "look-out": "Mp3s/look_out.mp3",
      portal: "Mp3s/portal.mp3",
      shift: "Mp3s/shift.mp3",
      "shore-walk": "Mp3s/shore_walk.mp3",
      "step-by-step": "Mp3s/step_by_step.mp3",
      "the-madness": "Mp3s/the_madness.mp3",
    }),
  }),
]);

const LEARN_SLUGS = Object.freeze([
  "musicians-in-dance",
  "working-with-an-accompanist",
  "starting-a-collaboration",
  "music-and-process",
  "beat-pulse-tempo-and-meter",
  "listening-to-music-is-a-practice",
  "music-and-movement-in-3",
  "music-and-movement-in-4",
  "the-tiny-dance",
]);

const VIDEO_IDS = Object.freeze([
  "L46QPu0NQ_0",
  "D0194EZYyuc",
  "5xGxAfhj6ss",
  "AEFrka8E6Q8",
  "WUgBRWu_9uQ",
]);

const UPDATE_TITLES = Object.freeze([
  "New Essay - Codex for Musicians",
  "New Music - Rust",
]);

const HERO_SOURCES = Object.freeze({
  courses: "images/home/collaborators/american-dance-festival.webp",
  videos: "images/home/about-michael-composing.webp",
  membership: "images/home/michael-wall-rig.jpg",
  licensing: "images/home/collaborators/movement-research.webp",
});

const ABOUT = Object.freeze({
  introduction:
    "Sound for Movement is Michael Wall's website for music, licensing, Scores, and Learn. It started with music for dance classes and is being built into a larger library: more original tracks, more albums, and learning materials connected to the catalog.",
  sections: Object.freeze([
    Object.freeze({
      title: "The practical problem",
      paragraphs: Object.freeze([
        "Nearly twenty years ago, Michael noticed dance teachers spending evenings searching through piles of CDs to find the right track for class: something with the right meter, tempo, feel, and without awkward lyrics.",
        "When MP3s became easy to sell online and PayPal links could make checkout simple, the first version of Sound for Movement became a direct way to find and buy that music. It went through several websites before becoming the catalog, membership, licensing, playlist, and Scores site it is now.",
      ]),
    }),
    Object.freeze({
      title: "The musical foundation",
      paragraphs: Object.freeze([
        "The musical part reaches back to 1995, when Michael began playing for dance classes at Rutgers University under Robert \"Tigger\" Benford. It continued through classes, rehearsals, commissions, performances, and teaching at The Ohio State University and the University of Utah, with additional time learning from musicians at the American Dance Festival and Bates Dance Festival.",
        "Sound for Movement is built on nearly 30 years of playing music for dance classes, working with hundreds of teachers and thousands of students. The music moves through piano, trumpet, harmonica, djembe, congas, modular synths, voice, audio engineering, notation, and production tools.",
      ]),
    }),
    Object.freeze({
      title: "Teaching music to dancers",
      paragraphs: Object.freeze([
        "Sound for Movement has contributed to education at universities and dance programs through teaching, guest lectures, and curriculum development for teaching music to dancers. That work includes rhythm, listening, software, and ways for dancers to make their own music.",
        "Learn is where that belongs on the site now. The goal is to build a full library of subscriber learning materials: rhythm, music skills for dance, creative technology, piano, sound design, music history, and practical ways to make and use music.",
      ]),
    }),
    Object.freeze({
      title: "The website keeps growing",
      paragraphs: Object.freeze([
        "Sound for Movement became its own company in 2013 after earlier distribution work with A Simple Sound. Today it brings together streaming, downloads, playlists, licensing, membership, and Scores, the built-in tool for arranging catalog tracks into a finished audio file.",
        "The catalog now includes more than 575 original tracks and 70 albums and EPs. The next goal is more original music, more albums, better metadata, better search, and learning materials that stay close to the catalog instead of sitting off to the side.",
        "That is the work: make the music easier to find, make licensing easier to complete, keep learning materials close to the catalog, and keep building the website around what dancers, teachers, choreographers, and filmmakers need from the music.",
      ]),
    }),
  ]),
});

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) throw new Error(`Missing required --${name} path.`);
  return path.resolve(value);
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function json(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "a-op-judge-packet/1" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.json();
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "a-op-judge-packet/1" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function copy(source, destination) {
  await access(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function writeJson(destination, value) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileRecord(root, filePath) {
  const contents = await readFile(filePath);
  const info = await stat(filePath);
  return Object.freeze({
    path: path.relative(root, filePath),
    bytes: info.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}

function pianoLesson(sql) {
  const content = /\$lesson\$\n([\s\S]*?)\n\$lesson\$/.exec(sql)?.[1]?.trim();
  if (!content) throw new Error("The Piano source migration has no lesson body.");
  return Object.freeze({
    slug: "push-a-key",
    title: "Push a Key",
    summary: "I first played the piano in middle school.",
    category: "Piano",
    accessLevel: "subscriber",
    content,
    source: "approved-private-repository-migration",
  });
}

async function main() {
  const sfmRepo = requiredOption("sfm-repo");
  const musicRoot = requiredOption("music-root");
  const output = path.resolve(
    option("output") ?? "content/imports/sfm-judge-packet",
  );
  const previewRoot = path.resolve(
    option("public-preview") ?? "public/judge-content",
  );
  const baseUrl = option("base-url") ?? "https://www.soundformovement.com";
  const albumArtBase =
    "https://cfiddtqpfvjtfvobdvsf.supabase.co/storage/v1/object/public/album_art";

  const releases = [];
  const tracks = [];
  for (const selection of RELEASES) {
    const album = await json(`${baseUrl}/api/albums/${selection.id}`);
    const result = await json(
      `${baseUrl}/api/tracks?album_id=${selection.id}&limit=10&sort_by=title&sort_dir=asc`,
    );
    const artworkRelative = `images/releases/${selection.art}`;
    await download(
      `${albumArtBase}/${encodeURIComponent(album.album_art)}`,
      path.join(output, artworkRelative),
    );
    releases.push({
      releaseKey: selection.slug,
      title: album.name,
      artist: album.artist_name,
      description: album.description,
      releaseDate: album.release_date,
      artwork: artworkRelative,
      sourceId: album.id,
    });
    for (const track of result.tracks) {
      const trackSlug = slugify(track.title);
      const sourceRelative = selection.sources[trackSlug];
      if (!sourceRelative) {
        throw new Error(`No approved source mapping for ${selection.slug}/${track.title}.`);
      }
      const audioRelative = `audio/${selection.slug}/${trackSlug}.mp3`;
      await copy(path.join(musicRoot, sourceRelative), path.join(output, audioRelative));
      tracks.push({
        trackKey: `${selection.slug}-${trackSlug}`,
        releaseKey: selection.slug,
        sourceId: track.id,
        title: track.title,
        sequence: result.tracks.indexOf(track) + 1,
        duration: track.duration,
        tempo: track.tempo,
        meter: track.meter || null,
        key: track.key,
        instruments: track.instruments ?? [],
        audio: audioRelative,
      });
    }
  }

  const posts = [];
  for (const slug of LEARN_SLUGS) {
    const post = await json(`${baseUrl}/api/learn/${slug}`);
    posts.push({
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      category: post.category,
      accessLevel: post.access_level,
      content: post.content,
      contentBlocks: post.content_blocks,
      sourceId: post.id,
      source: "public-api",
    });
  }
  const pianoSql = await readFile(
    path.join(
      sfmRepo,
      "supabase/migrations/20260604174000_seed_piano_draft_path.sql",
    ),
    "utf8",
  );
  posts.unshift(pianoLesson(pianoSql));

  const videoResponse = await json(`${baseUrl}/api/videos/public`);
  const videos = VIDEO_IDS.map((providerId) =>
    videoResponse.items.find((item) => item.provider_id === providerId),
  );
  if (videos.some((video) => !video)) {
    throw new Error("One or more approved YouTube records are unavailable.");
  }
  for (const video of videos) {
    const thumbnail = `images/videos/${video.provider_id}.jpg`;
    await download(video.thumbnail_url, path.join(output, thumbnail));
    video.localThumbnail = thumbnail;
  }

  const updateResponse = await json(`${baseUrl}/api/whats-new/public`);
  const updates = UPDATE_TITLES.map((title) =>
    updateResponse.items.find((item) => item.title === title),
  );
  if (updates.some((update) => !update)) {
    throw new Error("One or more approved What's New entries are unavailable.");
  }
  for (const update of updates) {
    if (!update.image_url) continue;
    const image = `images/updates/${slugify(update.title)}.png`;
    await download(update.image_url, path.join(output, image));
    update.localImage = image;
    delete update.image_url;
  }

  const heroMedia = {};
  for (const [pageKey, relativeSource] of Object.entries(HERO_SOURCES)) {
    const extension = path.extname(relativeSource);
    const relativeDestination = `images/heroes/${pageKey}${extension}`;
    await copy(
      path.join(sfmRepo, "public", relativeSource),
      path.join(output, relativeDestination),
    );
    await copy(
      path.join(sfmRepo, "public", relativeSource),
      path.join(previewRoot, "heroes", `${pageKey}${extension}`),
    );
    heroMedia[pageKey] = relativeDestination;
  }

  const courses = [
    {
      slug: "piano",
      title: "Piano",
      summary:
        "Begin with one note and build a personal piano practice through touch, rhythm, listening, and curiosity.",
      accessLevel: "subscriber",
      lessons: ["push-a-key"],
    },
    {
      slug: "teaching-music-for-dance",
      title: "Teaching Music for Dance",
      summary: "Teaching music for dance.",
      accessLevel: "public",
      lessons: LEARN_SLUGS,
    },
  ];

  const activation = {
    core: ["music", "identity", "access", "administration"],
    activate: [
      "downloads",
      "customer-library",
      "licensing",
      "memberships",
      "subscriptions",
      "courses",
      "video",
      "whats-new",
      "contact",
      "telemetry",
    ],
    commerceEnvironment: "stripe-test-simulation",
    publicNavigation: [
      "Music",
      "Courses",
      "Videos",
      "Membership",
      "Licensing",
      "Account",
    ],
    contentDecisions: {
      publishAllSelectedReleases: true,
      teachingMusicForDancePublic: true,
      pianoSubscriberOnly: true,
      externalVideoConsentRequired: true,
      telemetryConsentRequired: true,
      legalDocumentsRequireArtistReview: true,
    },
  };

  const rights = {
    owner: "Michael Wall",
    approvedUse:
      "Local a-op competition rehearsal and judge demonstration packet approved by Michael Wall on 2026-07-19.",
    prohibitedUse:
      "Do not publish, distribute, or reuse outside this approved local rehearsal without fresh approval.",
    customerDataIncluded: false,
    privateOperationalDataIncluded: false,
    productionWritesPerformed: false,
  };

  await Promise.all([
    writeJson(path.join(output, "artist/about.json"), ABOUT),
    writeJson(path.join(output, "catalog/releases.json"), releases),
    writeJson(path.join(output, "catalog/tracks.json"), tracks),
    writeJson(path.join(output, "learn/posts.json"), posts),
    writeJson(path.join(output, "learn/courses.json"), courses),
    writeJson(path.join(output, "videos/videos.json"), videos),
    writeJson(path.join(output, "whats-new/updates.json"), updates),
    writeJson(path.join(output, "presentation/heroes.json"), heroMedia),
    writeJson(path.join(output, "setup/activation-answers.json"), activation),
    writeJson(path.join(output, "RIGHTS.json"), rights),
  ]);

  const expectedFiles = [
    "artist/about.json",
    "catalog/releases.json",
    "catalog/tracks.json",
    "learn/posts.json",
    "learn/courses.json",
    "videos/videos.json",
    "whats-new/updates.json",
    "presentation/heroes.json",
    "setup/activation-answers.json",
    "RIGHTS.json",
    ...releases.map(({ artwork }) => artwork),
    ...tracks.map(({ audio }) => audio),
    ...videos.map(({ localThumbnail }) => localThumbnail),
    ...updates.flatMap(({ localImage }) => (localImage ? [localImage] : [])),
    ...Object.values(heroMedia),
  ];
  const files = await Promise.all(
    expectedFiles.map((relative) => fileRecord(output, path.join(output, relative))),
  );
  const manifest = {
    schemaVersion: 1,
    packetKey: "sfm-judge-packet",
    generatedAt: new Date().toISOString(),
    counts: {
      releases: releases.length,
      tracks: tracks.length,
      posts: posts.length,
      courses: courses.length,
      videos: videos.length,
      updates: updates.length,
      heroes: Object.keys(heroMedia).length,
    },
    files,
  };
  await writeJson(path.join(output, "packet.json"), manifest);
  console.log(JSON.stringify({ output, previewRoot, counts: manifest.counts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
