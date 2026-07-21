#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  copyFile,
  link,
  mkdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEMO_ALBUMS = Object.freeze({
  "An Agreement": Object.freeze({
    folder: "An Agreement ",
    artwork: "An Agreement - Album Art.jpg",
    audio: Object.freeze({
      "Clouded Street Sign": "clouded_street_sign.wav",
      "An Agreement": "an_agreement.wav",
      "Gap in the Wall": "gap_in_the_wall.wav",
      Unisons: "unisons.wav",
      Spiral: "spiral.wav",
    }),
  }),
  "Maquina de Humo": Object.freeze({
    folder: "Maquina de Humo",
    artwork: "maquina_de_humo.jpg",
    audio: Object.freeze({
      "Maquina de Humo": "macchina_del_fumo.wav",
      "From Over There": "from_over_there.wav",
      "Time Passes": "time_passes.wav",
      "Brush Wire": "brush_wire.wav",
      "Hills and Valleys": "hills_and_valleys.wav",
    }),
  }),
  "Myself Through You": Object.freeze({
    folder: "Myself Through You",
    artwork: "Myself Through You.jpeg",
    audio: Object.freeze({
      "Step Lightly": "step_lightly.wav",
      "Myself Through You": "myself_through_you.wav",
      "A Red Wall in Brooklyn": "a_red_wall_in_brooklyn.wav",
      "Two Adrift": "two_adrift.wav",
      "With Me": "with_me.wav",
      "Flight Not Yet Fled": "flight_not_yet_fled.wav",
      "Blue in Green": "blue_in_green.wav",
      "Dreams of North Carolina": "dreams_of_north_carolina.wav",
    }),
  }),
  Amiss: Object.freeze({
    folder: "Amiss",
    artwork: "amiss.jpg",
    audio: Object.freeze({
      Amiss: "amiss.mp3",
      "Shore Walk": "shore-walk.mp3",
      "Look Out": "look-out.mp3",
      Shift: "shift.mp3",
      "The Madness": "the-madness.mp3",
      "4 162": "4-162.mp3",
      "Lilies in the Lake": "lilies-in-the-lake.mp3",
      Portal: "portal.mp3",
      "Step by Step": "step-by-step.mp3",
      "Long Walk": "long-walk.mp3",
    }),
  }),
});

const RELEASES = Object.freeze([
  Object.freeze({
    id: 73,
    slug: "rust",
    art: "rust.jpg",
    sources: Object.freeze({
      lost: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/lost.mp3",
      love: "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/love.mp3",
      melancholy:
        "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/melancholy.mp3",
      nostalgia:
        "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/nostalgia.mp3",
      tension:
        "In Process/Rust - All Materials/Rust - All Materials/Rust mp3/tension.mp3",
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
  "🎧 New Music - Rust",
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
        'The musical part reaches back to 1995, when Michael began playing for dance classes at Rutgers University under Robert "Tigger" Benford. It continued through classes, rehearsals, commissions, performances, and teaching at The Ohio State University and the University of Utah, with additional time learning from musicians at the American Dance Festival and Bates Dance Festival.',
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
  return index === -1 ? null : (process.argv[index + 1] ?? null);
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

function xmlText(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnIndex(reference) {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? "A";
  return (
    [...letters].reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

async function xlsxEntry(workbookPath, entry) {
  const { stdout } = await execFileAsync("unzip", ["-p", workbookPath, entry], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function readWorkbookRows(workbookPath, sheetNumber) {
  let shared = [];
  try {
    const source = await xlsxEntry(workbookPath, "xl/sharedStrings.xml");
    shared = [...source.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
      xmlText(match[1]),
    );
  } catch {
    shared = [];
  }
  const source = await xlsxEntry(
    workbookPath,
    `xl/worksheets/sheet${sheetNumber}.xml`,
  );
  return [...source.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const values = [];
    const cells = row[1].replace(/<c\b([^>]*)\/>/g, "<c$1></c>");
    for (const cell of cells.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = /\br="([A-Z]+\d+)"/.exec(cell[1])?.[1] ?? "A1";
      const type = /\bt="([^"]+)"/.exec(cell[1])?.[1] ?? "n";
      const raw =
        /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ??
        /<is>([\s\S]*?)<\/is>/.exec(cell[2])?.[1] ??
        "";
      values[columnIndex(reference)] =
        type === "s"
          ? shared[Number(raw)]
          : type === "inlineStr"
            ? xmlText(raw)
            : raw;
    }
    return values;
  });
}

function records(rows) {
  const headers = rows[0];
  return rows
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? null]),
      ),
    );
}

function excelDate(serial) {
  return new Date((Number(serial) - 25569) * 86400000)
    .toISOString()
    .slice(0, 10);
}

async function buildDemoAssetsPacket({ demoAssets, output, previewRoot }) {
  await Promise.all([
    rm(path.join(output, "images", "heroes"), {
      recursive: true,
      force: true,
    }),
    rm(path.join(output, "presentation", "heroes.json"), { force: true }),
    rm(path.join(previewRoot, "heroes"), { recursive: true, force: true }),
  ]);
  const pythonExecutable = option("python") ?? "python3";
  const metadataWorkbook = option("metadata-workbook");
  const workbookPath = metadataWorkbook
    ? path.resolve(metadataWorkbook)
    : path.join(demoAssets, "openai-build-week-demo-album-metadata.xlsx");
  const [albumRows, trackRows] = await Promise.all([
    readWorkbookRows(workbookPath, 1),
    readWorkbookRows(workbookPath, 2),
  ]);
  const albums = records(albumRows);
  const metadataTracks = records(trackRows);
  const releases = [];
  const tracks = [];

  async function albumFolder(selection) {
    const candidates = [
      path.join(demoAssets, "Music", selection.folder),
      path.join(demoAssets, selection.folder),
    ];
    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Continue so the intake can generalize over a grouped or flat folder.
      }
    }
    throw new Error(`No approved album folder found for ${selection.folder}.`);
  }

  for (const album of albums) {
    const selection = DEMO_ALBUMS[album.Album];
    if (!selection)
      throw new Error(`No approved folder mapping for ${album.Album}.`);
    const sourceFolder = await albumFolder(selection);
    const releaseKey = slugify(album.Album);
    const artworkRelative = `images/releases/${releaseKey}${path.extname(selection.artwork).toLowerCase()}`;
    await copy(
      path.join(sourceFolder, selection.artwork),
      path.join(output, artworkRelative),
    );
    await copy(
      path.join(sourceFolder, selection.artwork),
      path.join(previewRoot, "releases", path.basename(artworkRelative)),
    );
    releases.push({
      releaseKey,
      title: album.Album,
      artist: "Michael Wall",
      description: album.Description,
      releaseDate: excelDate(album["Release date"]),
      artwork: artworkRelative,
      sourceId: Number(album["Album ID"]),
    });
    for (const track of metadataTracks.filter(
      (entry) => entry.Album === album.Album,
    )) {
      const filename = selection.audio[track.Track];
      if (!filename)
        throw new Error(
          `No approved audio mapping for ${album.Album}/${track.Track}.`,
        );
      const extension = path.extname(filename).toLowerCase();
      const audioRelative = `audio/${releaseKey}/${slugify(track.Track)}${extension}`;
      await copy(
        path.join(sourceFolder, filename),
        path.join(output, audioRelative),
      );
      tracks.push({
        trackKey: `${releaseKey}-${slugify(track.Track)}`,
        releaseKey,
        title: track.Track,
        sequence: Number(track["Album order"]),
        duration: track.Duration,
        durationSeconds: Number(track.Seconds),
        tempo: track["Tempo (BPM)"] ? Number(track["Tempo (BPM)"]) : null,
        meter: track.Meter || null,
        mood: track.Mood,
        key: track.Key,
        audio: audioRelative,
        contentType: extension === ".mp3" ? "audio/mpeg" : "audio/wav",
      });
    }
  }

  const collections = [];
  for (const name of [
    "ambient",
    "beautiful",
    "energetic",
    "hopeful",
    "intense",
    "mysterious",
    "nostalgic",
    "rhythmic",
    "sad",
  ]) {
    const relative = `images/collections/${name}.webp`;
    await copy(
      path.join(demoAssets, "Collection Images", `${name}.webp`),
      path.join(output, relative),
    );
    await copy(
      path.join(demoAssets, "Collection Images", `${name}.webp`),
      path.join(previewRoot, "collections", `${name}.webp`),
    );
    collections.push({
      collectionKey: name,
      title: name[0].toUpperCase() + name.slice(1),
      artwork: relative,
    });
  }

  for (const track of tracks) {
    await hardlink(
      path.join(output, track.audio),
      path.join(previewRoot, track.audio),
    );
  }

  const courseManifest = JSON.parse(
    await readFile(
      path.join(
        demoAssets,
        "Course Materials",
        "course-materials-manifest.json",
      ),
      "utf8",
    ),
  );
  const lessons = [];
  for (const entry of courseManifest) {
    const pdfSource = path.join(demoAssets, "Course Materials", entry.pdf);
    const imageSource = path.join(demoAssets, "Course Images", entry.image);
    const pdfRelative = `courses/${entry.pdf}`;
    const imageRelative = `courses/${entry.image}`;
    await copy(pdfSource, path.join(output, "documents", pdfRelative));
    await copy(imageSource, path.join(output, "images", imageRelative));
    await copy(pdfSource, path.join(previewRoot, pdfRelative));
    await copy(imageSource, path.join(previewRoot, imageRelative));
    const body = await pdfText(pdfSource, pythonExecutable);
    lessons.push({
      ...entry,
      summary: body.find((paragraph) => paragraph !== entry.title) ?? "",
      body,
      pdfUrl: `/judge-content/${pdfRelative}`,
      imageUrl: `/judge-content/${imageRelative}`,
    });
  }
  const courses = [...new Set(lessons.map(({ course }) => course))].map(
    (title) => ({
      slug: slugify(title),
      title,
      description:
        title === "Listening, Rhythm, and Musical Structure"
          ? "Listening, rhythm, meter, and musical structure through embodied practice."
          : "Collaboration, creative process, budgets, and practical music licensing.",
      lessons: lessons.filter(({ course }) => course === title),
    }),
  );
  const aboutSource = path.join(
    demoAssets,
    "About",
    "About - Michael Wall.pdf",
  );
  const aboutBody = await pdfText(aboutSource, pythonExecutable);
  await copy(
    aboutSource,
    path.join(output, "documents/about/about-michael-wall.pdf"),
  );
  await copy(
    aboutSource,
    path.join(previewRoot, "about/about-michael-wall.pdf"),
  );

  const artworkByRelease = new Map(
    releases.map((release) => [
      release.releaseKey,
      `/judge-content/releases/${path.basename(release.artwork)}`,
    ]),
  );
  const demo = {
    artist: { name: "Michael Wall", about: aboutBody },
    releases: releases.map((release) => ({
      ...release,
      artworkUrl: artworkByRelease.get(release.releaseKey),
      tracks: tracks
        .filter((track) => track.releaseKey === release.releaseKey)
        .sort((left, right) => left.sequence - right.sequence)
        .map((track) => ({
          ...track,
          artworkUrl: artworkByRelease.get(release.releaseKey),
          streamUrl: `/judge-content/${track.audio}`,
          downloadUrl: `/judge-content/${track.audio}`,
        })),
    })),
    collections: collections.map((collection) => ({
      ...collection,
      artworkUrl: `/judge-content/collections/${path.basename(collection.artwork)}`,
    })),
    courses,
  };
  await writeJson(path.join(previewRoot, "demo.json"), demo);

  const rights = {
    owner: "Michael Wall",
    approvedUse:
      "Local a-op demo rehearsal from MichaelWall_a-op_Demo_Assets, approved by Michael Wall on 2026-07-20.",
    prohibitedUse: "Do not publish or distribute without fresh approval.",
    customerDataIncluded: false,
    privateOperationalDataIncluded: false,
    productionWritesPerformed: false,
  };
  await Promise.all([
    writeJson(path.join(output, "catalog/releases.json"), releases),
    writeJson(path.join(output, "catalog/tracks.json"), tracks),
    writeJson(path.join(output, "catalog/collections.json"), collections),
    writeJson(path.join(output, "RIGHTS.json"), rights),
  ]);
  const expectedFiles = [
    "catalog/releases.json",
    "catalog/tracks.json",
    "catalog/collections.json",
    "RIGHTS.json",
    ...releases.map(({ artwork }) => artwork),
    ...tracks.map(({ audio }) => audio),
    ...collections.map(({ artwork }) => artwork),
    ...lessons.flatMap((lesson) => [
      `documents/courses/${lesson.pdf}`,
      `images/courses/${lesson.image}`,
    ]),
    "documents/about/about-michael-wall.pdf",
  ];
  const files = await Promise.all(
    expectedFiles.map((relative) =>
      fileRecord(output, path.join(output, relative)),
    ),
  );
  const manifest = {
    schemaVersion: 1,
    packetKey: "sfm-judge-packet",
    packetKind: "album-demo",
    generatedAt: new Date().toISOString(),
    counts: {
      releases: releases.length,
      tracks: tracks.length,
      collections: collections.length,
      posts: lessons.length,
      courses: courses.length,
      videos: 0,
      updates: 0,
      heroes: 0,
    },
    files,
  };
  await writeJson(path.join(output, "packet.json"), manifest);
  console.log(
    JSON.stringify({ output, previewRoot, counts: manifest.counts }, null, 2),
  );
}

async function json(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "a-op-judge-packet/1",
    },
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

async function hardlink(source, destination) {
  await access(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await unlink(destination).catch(() => {});
  await link(source, destination).catch(() => copyFile(source, destination));
}

async function pdfText(source, pythonExecutable) {
  const script =
    "import pdfplumber,sys; " +
    "p=pdfplumber.open(sys.argv[1]); " +
    "print('\\n\\n'.join((x.extract_text() or '') for x in p.pages)); p.close()";
  const { stdout } = await execFileAsync(
    pythonExecutable,
    ["-c", script, source],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return stdout
    .replace(/\f/g, "\n")
    .split(/\n{2,}/)
    .map((value) => value.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
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
  if (!content)
    throw new Error("The Piano source migration has no lesson body.");
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

function structuredBody(content, blocks = null) {
  const source =
    Array.isArray(blocks) && blocks.length > 0
      ? blocks.map((block) => block.markdown).filter(Boolean)
      : String(content)
          .split(/\n\s*\n/)
          .map((entry) => entry.trim())
          .filter(Boolean);
  return source.map((text) => ({ type: "paragraph", text }));
}

async function main() {
  const demoAssetsOption = option("demo-assets");
  if (demoAssetsOption) {
    return buildDemoAssetsPacket({
      demoAssets: path.resolve(demoAssetsOption),
      output: path.resolve(
        option("output") ?? "content/imports/sfm-judge-packet",
      ),
      previewRoot: path.resolve(
        option("public-preview") ?? "public/judge-content",
      ),
    });
  }
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
        throw new Error(
          `No approved source mapping for ${selection.slug}/${track.title}.`,
        );
      }
      const audioRelative = `audio/${selection.slug}/${trackSlug}.mp3`;
      await copy(
        path.join(musicRoot, sourceRelative),
        path.join(output, audioRelative),
      );
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

  const editorialPresentation = {
    posts: posts.map((post) => ({
      postKey: post.slug,
      title: post.title,
      excerpt: post.summary ?? "",
      body: structuredBody(post.content, post.contentBlocks),
      publication: "publish",
    })),
    updates: updates.map((update) => ({
      updateKey: slugify(update.title),
      title: update.title,
      summary: update.body.split(/\n\s*\n/, 1)[0]?.slice(0, 500) ?? "",
      body: structuredBody(update.body),
      audience: "public",
      publication: "publish",
    })),
    about: {
      title: "About",
      introduction: ABOUT.introduction,
      bodyText: ABOUT.sections
        .flatMap((section) => [`## ${section.title}`, ...section.paragraphs])
        .join("\n\n"),
      publication: "publish",
    },
    pageHeroes: [
      {
        pageKey: "courses",
        mediaKey: "hero-courses",
        altText: "A dance class at the American Dance Festival.",
      },
      {
        pageKey: "videos",
        mediaKey: "hero-videos",
        altText: "Michael Wall composing music at a workstation.",
      },
      {
        pageKey: "membership",
        mediaKey: "hero-membership",
        altText: "Michael Wall's music rig and instruments.",
      },
      {
        pageKey: "licensing",
        mediaKey: "hero-licensing",
        altText: "Movement Research artists in performance.",
      },
    ],
  };

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
    writeJson(
      path.join(output, "setup/editorial-presentation.json"),
      editorialPresentation,
    ),
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
    "setup/editorial-presentation.json",
    "setup/activation-answers.json",
    "RIGHTS.json",
    ...releases.map(({ artwork }) => artwork),
    ...tracks.map(({ audio }) => audio),
    ...videos.map(({ localThumbnail }) => localThumbnail),
    ...updates.flatMap(({ localImage }) => (localImage ? [localImage] : [])),
    ...Object.values(heroMedia),
  ];
  const files = await Promise.all(
    expectedFiles.map((relative) =>
      fileRecord(output, path.join(output, relative)),
    ),
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
  console.log(
    JSON.stringify({ output, previewRoot, counts: manifest.counts }, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
