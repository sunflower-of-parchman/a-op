import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "../lib/media-preparation/hash.ts";
import {
  DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
  readMediaPublicationRequest,
  resolveMediaPublicationByteCap,
} from "../lib/media-preparation/publication-request.ts";
import {
  ensureImmutablePublicationObject,
  publicationObjectKey,
} from "../lib/media-preparation/publication-store.ts";

const bytes = new TextEncoder().encode("fictional-publication-bytes");
const digest = await sha256Hex(bytes);
const proposal = "1".repeat(64);
const approval = "2".repeat(64);
const manifest = "3".repeat(64);

function request(overrides = {}, body = bytes) {
  return new Request("https://artist.example/api/admin/media-publication", {
    method: "POST",
    headers: {
      "content-type": "audio/wav",
      "content-length": String(body.byteLength),
      "x-aop-application-id": "setup_application_media_01",
      "x-aop-proposal-sha256": `sha256:${proposal}`,
      "x-aop-approval-sha256": `sha256:${approval}`,
      "x-aop-manifest-sha256": `sha256:${manifest}`,
      "x-aop-media-sha256": digest,
      "x-aop-media-id": "media_source_01",
      "x-aop-media-key": "fictional-track-audio",
      "x-aop-media-alias": "approved-master",
      "x-aop-media-role": "source",
      "x-aop-media-visibility": "protected",
      "x-aop-rights-confirmed": "true",
      "x-aop-intended-use": "download,streaming",
      "x-aop-media-kind": "audio",
      "x-aop-source-version": "1",
      "x-aop-duration-ms": "120000",
      "x-aop-channels": "2",
      "x-aop-sample-rate": "48000",
      "x-aop-format": "wav",
      ...overrides,
    },
    body,
  });
}

test("publication request normalizes contract hashes and enforces its byte cap", async () => {
  const result = await readMediaPublicationRequest(
    request(),
    DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
  );
  assert.equal(result.publication.proposalSha256, proposal);
  assert.equal(result.publication.approvalSha256, approval);
  assert.equal(result.publication.manifestSha256, manifest);
  assert.equal(result.publication.mediaSha256, digest);
  assert.equal(result.publication.mediaKey, "fictional-track-audio");
  assert.equal(result.publication.externalActionId, null);
  assert.equal(result.publication.externalActionSha256, null);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(resolveMediaPublicationByteCap(undefined), 32 * 1024 * 1024);
  assert.equal(resolveMediaPublicationByteCap("4096"), 4096);
  assert.throws(
    () => resolveMediaPublicationByteCap("0"),
    /configured media publication byte cap is invalid/,
  );
  await assert.rejects(
    readMediaPublicationRequest(request(), 8),
    /configured byte cap/,
  );
  await assert.rejects(
    readMediaPublicationRequest(
      request({ "x-aop-proposal-sha256": proposal }),
      DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
    ),
    /sha256:<lowercase digest>/,
  );
});

test("public requests require exact safe external-action headers and protected requests reject them", async () => {
  await assert.rejects(
    readMediaPublicationRequest(
      request({ "x-aop-media-visibility": "public" }),
      DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
    ),
    /x-aop-external-action-id is required/,
  );
  await assert.rejects(
    readMediaPublicationRequest(
      request({
        "x-aop-external-action-id": "publish-fictional-track",
        "x-aop-external-action-sha256": `sha256:${"8".repeat(64)}`,
      }),
      DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
    ),
    /accepts no external-action authority/,
  );

  const result = await readMediaPublicationRequest(
    request({
      "x-aop-media-visibility": "public",
      "x-aop-external-action-id": "publish-fictional-track",
      "x-aop-external-action-sha256": `sha256:${"8".repeat(64)}`,
    }),
    DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
  );
  assert.equal(result.publication.externalActionId, "publish-fictional-track");
  assert.equal(
    result.publication.externalActionSha256,
    `sha256:${"8".repeat(64)}`,
  );
});

test("derivative request must match a fixed profile exactly", async () => {
  const good = request({
    "content-type": "audio/mpeg",
    "x-aop-media-id": "media_derivative_01",
    "x-aop-media-alias": "approved-stream",
    "x-aop-media-role": "derivative",
    "x-aop-source-media-id": "media_source_01",
    "x-aop-derivative-kind": "streaming",
    "x-aop-processing-profile": "audio-streaming-mp3-192",
    "x-aop-processing-version": "1",
    "x-aop-format": "mp3",
    "x-aop-bitrate-kbps": "192",
  });
  const result = await readMediaPublicationRequest(
    good,
    DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
  );
  assert.equal(result.publication.role, "derivative");
  assert.equal(result.publication.profileId, "audio-streaming-mp3-192");

  await assert.rejects(
    readMediaPublicationRequest(
      request({
        "content-type": "audio/mpeg",
        "x-aop-media-role": "derivative",
        "x-aop-source-media-id": "media_source_01",
        "x-aop-derivative-kind": "streaming",
        "x-aop-processing-profile": "audio-streaming-mp3-192",
        "x-aop-processing-version": "2",
        "x-aop-format": "mp3",
        "x-aop-bitrate-kbps": "192",
      }),
      DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
    ),
    /fixed profile/,
  );
});

test("hosted video and Course derivatives accept only their profile-approved intended uses", async () => {
  const hosted = await readMediaPublicationRequest(
    request({
      "content-type": "video/mp4",
      "x-aop-media-id": "media_video_stream_01",
      "x-aop-media-key": "fictional-hosted-video",
      "x-aop-media-alias": "approved-video-stream",
      "x-aop-media-role": "derivative",
      "x-aop-intended-use": "video",
      "x-aop-source-media-id": "media_video_source_01",
      "x-aop-derivative-kind": "streaming",
      "x-aop-processing-profile": "video-streaming-mp4-h264-720",
      "x-aop-processing-version": "1",
      "x-aop-format": "mp4",
    }),
    DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
  );
  assert.equal(hosted.publication.profileId, "video-streaming-mp4-h264-720");
  assert.equal(hosted.publication.bitrateKbps, null);

  await assert.rejects(
    readMediaPublicationRequest(
      request({
        "content-type": "video/mp4",
        "x-aop-media-role": "derivative",
        "x-aop-intended-use": "artwork",
        "x-aop-source-media-id": "media_video_source_01",
        "x-aop-derivative-kind": "streaming",
        "x-aop-processing-profile": "video-streaming-mp4-h264-720",
        "x-aop-processing-version": "1",
        "x-aop-format": "mp4",
      }),
      DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
    ),
    /fixed profile/,
  );

  const document = await readMediaPublicationRequest(
    request({
      "content-type": "application/pdf",
      "x-aop-media-id": "media_course_document_01",
      "x-aop-media-key": "fictional-course-document",
      "x-aop-media-alias": "approved-course-document",
      "x-aop-media-role": "derivative",
      "x-aop-intended-use": "course",
      "x-aop-source-media-id": "media_document_source_01",
      "x-aop-derivative-kind": "download",
      "x-aop-processing-profile": "document-download-pdf-copy",
      "x-aop-processing-version": "1",
      "x-aop-format": "pdf",
    }),
    DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
  );
  assert.equal(document.publication.profileId, "document-download-pdf-copy");
  assert.equal(document.publication.derivativeKind, "download");
});

class MemoryStore {
  objects = new Map();
  puts = 0;

  async read(key) {
    const object = this.objects.get(key);
    return object
      ? {
          ...object,
          bytes: new Uint8Array(object.bytes),
          metadata: { ...object.metadata },
        }
      : null;
  }

  async put(key, value, contentType, metadata) {
    this.puts += 1;
    this.objects.set(key, {
      bytes: new Uint8Array(value),
      contentType,
      etag: `etag-${this.puts}`,
      metadata: { ...metadata },
    });
  }
}

async function sourcePublication() {
  return (
    await readMediaPublicationRequest(
      request(),
      DEFAULT_MEDIA_PUBLICATION_BYTE_CAP,
    )
  ).publication;
}

test("immutable publication writes once, verifies stored bytes, and reuses only an exact object", async () => {
  const store = new MemoryStore();
  const publication = await sourcePublication();
  const first = await ensureImmutablePublicationObject(
    store,
    publication,
    bytes,
  );
  assert.equal(first.reused, false);
  assert.equal(store.puts, 1);
  assert.equal(first.privateObjectKey, publicationObjectKey(publication));

  const replay = await ensureImmutablePublicationObject(
    store,
    publication,
    bytes,
  );
  assert.equal(replay.reused, true);
  assert.equal(store.puts, 1);

  const stored = store.objects.get(publicationObjectKey(publication));
  stored.metadata["aop-approval-sha256"] = "0".repeat(64);
  await assert.rejects(
    ensureImmutablePublicationObject(store, publication, bytes),
    /SHA metadata differs/,
  );
  assert.equal(store.puts, 1);
});

test("body hash mismatch creates no object", async () => {
  const store = new MemoryStore();
  const publication = {
    ...(await sourcePublication()),
    mediaSha256: "0".repeat(64),
  };
  await assert.rejects(
    ensureImmutablePublicationObject(store, publication, bytes),
    /does not match/,
  );
  assert.equal(store.puts, 0);
});
