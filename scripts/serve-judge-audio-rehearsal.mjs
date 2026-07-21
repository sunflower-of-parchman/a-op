#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { Readable } from "node:stream";

import { createInMemoryD1 } from "../tests/helpers/in-memory-d1.mjs";

register(
  new URL("../tests/helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [
  { deliverTrackDownload, deliverTrackStream },
  { saveTrackDraft, publishTrack },
] = await Promise.all([
  import("../lib/catalog/delivery.ts"),
  import("../db/catalog-write.ts"),
]);

const AUDIO_PATH = new URL(
  "../content/imports/sfm-judge-packet/audio/amiss/amiss.mp3",
  import.meta.url,
);
const OWNER = "judge_audio_owner";
const SOURCE_ID = "judge_audio_source";
const DERIVATIVE_ID = "judge_audio_stream";
const OBJECT_KEY = "derivatives/judge-audio/stream.mp3";
const DOWNLOAD_DERIVATIVE_ID = "judge_audio_download";
const DOWNLOAD_OBJECT_KEY = "derivatives/judge-audio/download.mp3";

function objectMetadata(bytes) {
  return {
    key: OBJECT_KEY,
    version: "judge-rehearsal",
    size: bytes.byteLength,
    etag: "judge-rehearsal",
    httpEtag: '"judge-rehearsal"',
    checksums: {},
    uploaded: new Date("2026-07-19T00:00:00.000Z"),
    httpMetadata: { contentType: "audio/mpeg" },
    customMetadata: {},
    storageClass: "Standard",
  };
}

function body(bytes) {
  const copy = new Uint8Array(bytes);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(copy);
      controller.close();
    },
  });
}

class ApprovedAudioBucket {
  constructor(bytes) {
    this.bytes = bytes;
  }

  async head(key) {
    return key === OBJECT_KEY || key === DOWNLOAD_OBJECT_KEY
      ? { ...objectMetadata(this.bytes), key }
      : null;
  }

  async get(key, options) {
    if (key !== OBJECT_KEY && key !== DOWNLOAD_OBJECT_KEY) return null;
    const range = options?.range;
    const bytes = range
      ? this.bytes.slice(range.offset, range.offset + range.length)
      : this.bytes;
    return {
      ...objectMetadata(this.bytes),
      body: body(bytes),
      bodyUsed: false,
      arrayBuffer: async () => new Uint8Array(bytes).buffer,
      text: async () => new TextDecoder().decode(bytes),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      blob: async () => new Blob([bytes], { type: "audio/mpeg" }),
      writeHttpMetadata() {},
    };
  }

  async put() {
    throw new Error("The judge audio rehearsal is read-only.");
  }

  async delete() {
    throw new Error("The judge audio rehearsal is read-only.");
  }
}

function seed(database, byteLength, sha256) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', 'judge-audio@example.invalid',
            'judge-audio@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('judge_audio_owner_role', '${OWNER}', 'owner', '${OWNER}');
  `);
  database
    .prepare(
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, owner_user_id, content_type,
         byte_length, source_version, status, approval_state, content_sha256,
         revision, approved_by_user_id, approved_at)
       VALUES (?, ?, 'audio', 'protected', ?, 'audio/mpeg', ?, 1, 'ready',
               'approved', ?, 1, ?, CURRENT_TIMESTAMP)`,
    )
    .run(
      SOURCE_ID,
      "originals/judge-audio/source.mp3",
      OWNER,
      byteLength,
      sha256,
      OWNER,
    );
  database
    .prepare(
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, approval_state, content_type, format,
         byte_length, content_sha256, revision, approved_by_user_id, approved_at)
       VALUES (?, ?, 'streaming', 'audio-streaming-mp3-192', '1', ?, 'ready',
               'approved', 'audio/mpeg', 'mp3', ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
    )
    .run(DERIVATIVE_ID, SOURCE_ID, OBJECT_KEY, byteLength, sha256, OWNER);
  database
    .prepare(
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, approval_state, content_type, format,
         byte_length, content_sha256, revision, approved_by_user_id, approved_at)
       VALUES (?, ?, 'download', 'audio-download-original', '1', ?, 'ready',
               'approved', 'audio/mpeg', 'mp3', ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
    )
    .run(
      DOWNLOAD_DERIVATIVE_ID,
      SOURCE_ID,
      DOWNLOAD_OBJECT_KEY,
      byteLength,
      sha256,
      OWNER,
    );
  database.exec(
    "UPDATE artist_modules SET active = 1 WHERE module_key = 'downloads';",
  );
}

function context(key) {
  return {
    actorUserId: OWNER,
    idempotencyKey: key,
    requestId: `judge-audio-${key}`,
  };
}

function html() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>a-op judge audio</title></head>
<body><main><h1>Approved local audio rehearsal</h1>
<p>Amiss by Michael Wall</p>
<button id="play" type="button">Play approved track</button>
<a href="/download">Download approved track</a>
<audio id="audio" preload="metadata" src="/audio"></audio>
<output id="status" aria-live="polite">ready</output></main>
<script>
const audio = document.querySelector('#audio');
const status = document.querySelector('#status');
document.querySelector('#play').addEventListener('click', async () => {
  try { await audio.play(); } catch (error) { status.textContent = 'error:' + error.name; }
});
audio.addEventListener('playing', () => { status.textContent = 'playing'; });
audio.addEventListener('timeupdate', () => {
  if (audio.currentTime > 0) status.textContent = 'playing:' + audio.currentTime.toFixed(2);
});
audio.addEventListener('error', () => { status.textContent = 'media-error'; });
</script></body></html>`;
}

async function sendWebResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  for (const [name, value] of response.headers)
    nodeResponse.setHeader(name, value);
  if (!response.body) return nodeResponse.end();
  Readable.fromWeb(response.body).pipe(nodeResponse);
}

const bytes = new Uint8Array(await readFile(AUDIO_PATH));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const memory = await createInMemoryD1();
seed(memory.database, bytes.byteLength, sha256);
const draft = await saveTrackDraft(
  memory.binding,
  {
    slug: "amiss",
    title: "Amiss",
    subtitle: null,
    description: "Michael-approved Sound for Movement judge rehearsal audio.",
    durationMs: null,
    isrc: null,
    copyrightNotice: "Michael Wall",
    explicit: false,
    viewMode: "public",
    streamMode: "public",
    downloadMode: "public",
    originalMediaId: SOURCE_ID,
    streamingDerivativeId: DERIVATIVE_ID,
    downloadDerivativeId: DOWNLOAD_DERIVATIVE_ID,
    tags: ["Judge rehearsal"],
    credits: [],
  },
  0,
  context("draft"),
);
await publishTrack(memory.binding, "amiss", 1, context("publish"));

const bucket = new ApprovedAudioBucket(bytes);
const ranges = [];
let sequence = 0;
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      return response.end(html());
    }
    if (request.url === "/result") {
      response.setHeader("content-type", "application/json");
      return response.end(
        JSON.stringify({ ranges, sha256, byteLength: bytes.byteLength }),
      );
    }
    if (request.url === "/audio") {
      ranges.push(request.headers.range ?? null);
      sequence += 1;
      const origin = `http://${request.headers.host}`;
      const delivered = await deliverTrackStream({
        binding: memory.binding,
        bucket,
        request: new Request(`${origin}/audio`, {
          headers: request.headers.range
            ? { range: request.headers.range }
            : {},
        }),
        requestId: `judge-browser-audio-${sequence}`,
        trackId: draft.value.id,
        requestedRevisionId: draft.value.revisionId,
        identity: null,
      });
      return sendWebResponse(delivered, response);
    }
    if (request.url === "/download") {
      const delivered = await deliverTrackDownload({
        binding: memory.binding,
        bucket,
        requestId: `judge-browser-download-${++sequence}`,
        trackId: draft.value.id,
        requestedRevisionId: draft.value.revisionId,
        identity: null,
      });
      return sendWebResponse(delivered, response);
    }
    response.statusCode = 404;
    response.end("Not found");
  } catch (error) {
    response.statusCode =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : 500;
    response.end("Audio rehearsal failed");
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(
    `${JSON.stringify({
      status: "ready",
      url: `http://127.0.0.1:${address.port}`,
      track: "Amiss",
      byteLength: bytes.byteLength,
      sha256,
    })}\n`,
  );
});

async function shutdown() {
  server.close();
  memory.close();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
