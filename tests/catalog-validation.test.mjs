import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_INPUT_LIMITS,
  validateCollectionDraftInput,
  validateMediaDerivativeRegistrationInput,
  validateMediaObjectRegistrationInput,
  validateReleaseDraftInput,
  validateTrackDraftInput,
} from "../lib/catalog/validation.ts";

const SHA256 = "a".repeat(64);

function trackInput(overrides = {}) {
  return {
    slug: "first-track",
    title: "First track",
    subtitle: null,
    description: "",
    durationMs: 185_000,
    meter: null,
    tempoBpm: null,
    musicalKey: null,
    isrc: "USABC2601234",
    copyrightNotice: "",
    explicit: false,
    viewMode: "public",
    streamMode: "unavailable",
    downloadMode: "unavailable",
    originalMediaId: null,
    streamingDerivativeId: null,
    downloadDerivativeId: null,
    tags: [],
    credits: [],
    ...overrides,
  };
}

function releaseInput(overrides = {}) {
  return {
    slug: "first-release",
    releaseType: "album",
    title: "First release",
    subtitle: null,
    description: "",
    releaseDate: null,
    catalogNumber: null,
    copyrightNotice: "",
    viewMode: "public",
    artworkDerivativeId: null,
    tags: [],
    tracks: [],
    credits: [],
    ...overrides,
  };
}

function collectionInput(overrides = {}) {
  return {
    slug: "first-collection",
    title: "First collection",
    description: "",
    viewMode: "public",
    artworkDerivativeId: null,
    tags: [],
    trackIds: [],
    credits: [],
    ...overrides,
  };
}

function mediaObjectInput(overrides = {}) {
  return {
    id: "media_first_source",
    objectKey: "originals/media_first_source/v1",
    kind: "audio",
    visibility: "protected",
    contentType: "audio/wav",
    byteLength: 128,
    etag: null,
    sourceVersion: 1,
    status: "ready",
    contentSha256: SHA256,
    durationMs: 1_000,
    channels: 2,
    sampleRate: 48_000,
    ...overrides,
  };
}

function derivativeInput(overrides = {}) {
  return {
    id: "derivative_first_stream",
    sourceMediaId: "media_first_source",
    kind: "streaming",
    processingProfile: "stream-main",
    processingVersion: "1",
    objectKey: "derivatives/media_first_source/stream-main-v1",
    status: "ready",
    contentType: "audio/mpeg",
    format: "mp3",
    bitrateKbps: 192,
    durationMs: 1_000,
    channels: 2,
    sampleRate: 48_000,
    byteLength: 64,
    contentSha256: SHA256,
    ...overrides,
  };
}

function assertInvalid(result, field) {
  assert.equal(result.ok, false, `Expected ${field} to be rejected.`);
  assert.ok(
    result.issues.some((candidate) => candidate.field === field),
    `Expected an issue for ${field}; received ${result.issues
      .map((candidate) => candidate.field)
      .join(", ")}.`,
  );
}

test("catalog drafts accept exact bounded input and normalize route-safe values", () => {
  const track = validateTrackDraftInput(
    trackInput({
      slug: "First-Track",
      title: "  First track  ",
      description: "First line\r\nSecond line\rThird line",
      isrc: "us-abc-26-01234",
      tags: ["Ambient", "ambient", "  Live  "],
      credits: [
        { name: "  Fictional Musician  ", role: " Composer ", details: "" },
      ],
    }),
  );

  assert.equal(track.ok, true);
  assert.equal(track.value.slug, "first-track");
  assert.equal(track.value.title, "First track");
  assert.equal(track.value.description, "First line\nSecond line\nThird line");
  assert.equal(track.value.isrc, "USABC2601234");
  assert.deepEqual(track.value.tags, ["Ambient", "Live"]);
  assert.deepEqual(track.value.credits, [
    { name: "Fictional Musician", role: "Composer", details: "" },
  ]);

  assert.equal(
    validateTrackDraftInput(
      trackInput({ title: "x".repeat(CATALOG_INPUT_LIMITS.title) }),
    ).ok,
    true,
  );
  assert.equal(
    validateReleaseDraftInput(releaseInput({ releaseDate: "2024-02-29" })).ok,
    true,
  );
});

test("catalog draft validators reject unknown root and nested keys", () => {
  assertInvalid(
    validateTrackDraftInput(trackInput({ approvalState: "approved" })),
    "approvalState",
  );
  assertInvalid(
    validateTrackDraftInput({
      ...trackInput(),
      credits: [
        {
          name: "Fictional Musician",
          role: "Composer",
          details: "",
          userId: "private_user",
        },
      ],
    }),
    "credits.0.userId",
  );
  assertInvalid(
    validateReleaseDraftInput(
      releaseInput({
        tracks: [
          {
            trackId: "track_one",
            discNumber: 1,
            trackNumber: 1,
            position: 1,
          },
        ],
      }),
    ),
    "tracks.0.position",
  );
  assertInvalid(
    validateCollectionDraftInput(
      collectionInput({ publishedRevisionId: "revision_private" }),
    ),
    "publishedRevisionId",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ approvalState: "approved" }),
    ),
    "approvalState",
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({ approvedByUserId: "user_private" }),
    ),
    "approvedByUserId",
  );
});

test("catalog draft validators reject missing fields, unsafe shapes, and bounds", () => {
  const missingTitle = trackInput();
  delete missingTitle.title;
  assertInvalid(validateTrackDraftInput(missingTitle), "title");

  assertInvalid(validateTrackDraftInput(null), "track");
  assertInvalid(validateReleaseDraftInput([]), "release");
  assertInvalid(
    validateCollectionDraftInput(
      Object.assign(Object.create({ inherited: true }), collectionInput()),
    ),
    "collection",
  );
  assertInvalid(
    validateTrackDraftInput(
      trackInput({ title: "x".repeat(CATALOG_INPUT_LIMITS.title + 1) }),
    ),
    "title",
  );
  assertInvalid(
    validateTrackDraftInput(
      trackInput({ tags: Array(CATALOG_INPUT_LIMITS.tags + 1).fill("tag") }),
    ),
    "tags",
  );
  assertInvalid(
    validateTrackDraftInput(
      trackInput({
        credits: Array.from(
          { length: CATALOG_INPUT_LIMITS.credits + 1 },
          (_, index) => ({
            name: `Name ${index}`,
            role: "Role",
            details: "",
          }),
        ),
      }),
    ),
    "credits",
  );
  assertInvalid(
    validateReleaseDraftInput(
      releaseInput({
        tracks: Array.from(
          { length: CATALOG_INPUT_LIMITS.tracks + 1 },
          (_, index) => ({
            trackId: `track_${index}`,
            discNumber: 1,
            trackNumber: index + 1,
          }),
        ),
      }),
    ),
    "tracks",
  );
});

test("declared text and collection limits accept the boundary and reject one over", () => {
  const boundaryTrack = validateTrackDraftInput(
    trackInput({
      slug: "a".repeat(CATALOG_INPUT_LIMITS.slug),
      title: "t".repeat(CATALOG_INPUT_LIMITS.title),
      subtitle: "s".repeat(CATALOG_INPUT_LIMITS.subtitle),
      description: "d".repeat(CATALOG_INPUT_LIMITS.description),
      copyrightNotice: "c".repeat(CATALOG_INPUT_LIMITS.copyrightNotice),
      tags: Array.from(
        { length: CATALOG_INPUT_LIMITS.tags },
        (_, index) =>
          `tag-${index}-${"x".repeat(CATALOG_INPUT_LIMITS.tag - String(index).length - 5)}`,
      ),
      credits: Array.from(
        { length: CATALOG_INPUT_LIMITS.credits },
        (_, index) => ({
          name: `${index}${"n".repeat(CATALOG_INPUT_LIMITS.creditName - String(index).length)}`,
          role: "r".repeat(CATALOG_INPUT_LIMITS.creditRole),
          details: "d".repeat(CATALOG_INPUT_LIMITS.creditDetails),
        }),
      ),
    }),
  );
  assert.equal(boundaryTrack.ok, true);
  assert.equal(Object.isFrozen(boundaryTrack.value), true);
  assert.equal(Object.isFrozen(boundaryTrack.value.tags), true);
  assert.equal(Object.isFrozen(boundaryTrack.value.credits), true);
  assert.equal(Object.isFrozen(boundaryTrack.value.credits[0]), true);

  for (const [field, value] of [
    ["slug", "a".repeat(CATALOG_INPUT_LIMITS.slug + 1)],
    ["subtitle", "s".repeat(CATALOG_INPUT_LIMITS.subtitle + 1)],
    ["description", "d".repeat(CATALOG_INPUT_LIMITS.description + 1)],
    ["copyrightNotice", "c".repeat(CATALOG_INPUT_LIMITS.copyrightNotice + 1)],
  ]) {
    assertInvalid(
      validateTrackDraftInput(trackInput({ [field]: value })),
      field,
    );
  }

  assertInvalid(
    validateTrackDraftInput(
      trackInput({ tags: ["t".repeat(CATALOG_INPUT_LIMITS.tag + 1)] }),
    ),
    "tags.0",
  );
  assertInvalid(
    validateTrackDraftInput(
      trackInput({
        credits: [
          {
            name: "n".repeat(CATALOG_INPUT_LIMITS.creditName + 1),
            role: "Role",
            details: "",
          },
        ],
      }),
    ),
    "name",
  );
  assertInvalid(
    validateReleaseDraftInput(
      releaseInput({
        catalogNumber: "c".repeat(CATALOG_INPUT_LIMITS.catalogNumber + 1),
      }),
    ),
    "catalogNumber",
  );

  const boundaryTracks = Array.from(
    { length: CATALOG_INPUT_LIMITS.tracks },
    (_, index) => ({
      trackId: `track_${index}`,
      discNumber: 1,
      trackNumber: index + 1,
    }),
  );
  assert.equal(
    validateReleaseDraftInput(releaseInput({ tracks: boundaryTracks })).ok,
    true,
  );
  assert.equal(
    validateCollectionDraftInput(
      collectionInput({
        trackIds: boundaryTracks.map(({ trackId }) => trackId),
      }),
    ).ok,
    true,
  );
});

test("catalog numeric and identifier validation rejects unsafe values", () => {
  for (const durationMs of [
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assertInvalid(
      validateTrackDraftInput(trackInput({ durationMs })),
      "durationMs",
    );
  }

  for (const tempoBpm of [0, 1001, 0.5, Number.NaN]) {
    assertInvalid(
      validateTrackDraftInput(trackInput({ tempoBpm })),
      "tempoBpm",
    );
  }

  assertInvalid(
    validateTrackDraftInput(trackInput({ slug: "unsafe/track" })),
    "slug",
  );
  assertInvalid(
    validateTrackDraftInput(
      trackInput({ originalMediaId: "../private-media" }),
    ),
    "originalMediaId",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ sourceVersion: 0 }),
    ),
    "sourceVersion",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ byteLength: Number.MAX_SAFE_INTEGER + 1 }),
    ),
    "byteLength",
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(derivativeInput({ channels: 0 })),
    "channels",
  );
});

test("track musical metadata is normalized for durable catalog records", () => {
  const result = validateTrackDraftInput(
    trackInput({
      meter: " 4/4 ",
      tempoBpm: 120,
      musicalKey: " C minor ",
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.meter, "4/4");
  assert.equal(result.value.tempoBpm, 120);
  assert.equal(result.value.musicalKey, "C minor");
});

test("release dates and ISRCs require real normalized values", () => {
  for (const releaseDate of ["2025-02-29", "2026-13-01", "2026-7-18"]) {
    assertInvalid(
      validateReleaseDraftInput(releaseInput({ releaseDate })),
      "releaseDate",
    );
  }

  for (const isrc of ["USABC260123", "USABC26012345", "USAB!2601234"]) {
    assertInvalid(validateTrackDraftInput(trackInput({ isrc })), "isrc");
  }
});

test("release sequencing rejects duplicate tracks and duplicate disc coordinates", () => {
  assertInvalid(
    validateReleaseDraftInput(
      releaseInput({
        tracks: [
          { trackId: "track_one", discNumber: 1, trackNumber: 1 },
          { trackId: "track_one", discNumber: 1, trackNumber: 2 },
        ],
      }),
    ),
    "tracks.1.trackId",
  );

  assertInvalid(
    validateReleaseDraftInput(
      releaseInput({
        tracks: [
          { trackId: "track_one", discNumber: 1, trackNumber: 1 },
          { trackId: "track_two", discNumber: 1, trackNumber: 1 },
        ],
      }),
    ),
    "tracks.1.trackNumber",
  );

  assert.equal(
    validateReleaseDraftInput(
      releaseInput({
        tracks: [
          { trackId: "track_one", discNumber: 1, trackNumber: 1 },
          { trackId: "track_two", discNumber: 2, trackNumber: 1 },
        ],
      }),
    ).ok,
    true,
  );
});

test("collection sequencing rejects duplicate track references", () => {
  assertInvalid(
    validateCollectionDraftInput(
      collectionInput({ trackIds: ["track_one", "track_one"] }),
    ),
    "trackIds.1",
  );
  assert.equal(
    validateCollectionDraftInput(
      collectionInput({ trackIds: ["track_one", "track_two"] }),
    ).ok,
    true,
  );
});

test("original media validation enforces hashes, namespaces, and kind MIME", () => {
  const normalized = validateMediaObjectRegistrationInput(
    mediaObjectInput({ contentSha256: "A".repeat(64) }),
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.contentSha256, SHA256);

  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ objectKey: "derivatives/source-v1" }),
    ),
    "objectKey",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ objectKey: "originals/../private" }),
    ),
    "objectKey",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ contentSha256: "g".repeat(64) }),
    ),
    "contentSha256",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ contentSha256: null }),
    ),
    "contentSha256",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ kind: "executable" }),
    ),
    "kind",
  );

  for (const [kind, contentType] of [
    ["audio", "image/png"],
    ["image", "audio/mpeg"],
    ["video", "image/jpeg"],
  ]) {
    assertInvalid(
      validateMediaObjectRegistrationInput(
        mediaObjectInput({ kind, contentType }),
      ),
      "contentType",
    );
  }

  assert.equal(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({
        status: "pending",
        contentSha256: null,
        durationMs: null,
        channels: null,
        sampleRate: null,
      }),
    ).ok,
    true,
  );

  const objectKeyAtLimit = `originals/${"o".repeat(
    CATALOG_INPUT_LIMITS.objectKey - "originals/".length,
  )}`;
  const contentTypeAtLimit = `audio/${"a".repeat(
    CATALOG_INPUT_LIMITS.contentType - "audio/".length,
  )}`;
  assert.equal(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({
        objectKey: objectKeyAtLimit,
        contentType: contentTypeAtLimit,
      }),
    ).ok,
    true,
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ objectKey: `${objectKeyAtLimit}x` }),
    ),
    "objectKey",
  );
  assertInvalid(
    validateMediaObjectRegistrationInput(
      mediaObjectInput({ contentType: `${contentTypeAtLimit}x` }),
    ),
    "contentType",
  );
});

test("derivative validation enforces ready completeness, hashes, namespaces, and kind MIME", () => {
  for (const overrides of [
    { objectKey: null },
    { contentType: null },
    { byteLength: null },
    { contentSha256: null },
  ]) {
    const result = validateMediaDerivativeRegistrationInput(
      derivativeInput(overrides),
    );
    assert.equal(result.ok, false);
  }

  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({ objectKey: "originals/source/stream" }),
    ),
    "objectKey",
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({ objectKey: "derivatives/source/../private" }),
    ),
    "objectKey",
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({ contentSha256: "short" }),
    ),
    "contentSha256",
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({ kind: "executable" }),
    ),
    "kind",
  );

  for (const [kind, contentType] of [
    ["streaming", "image/png"],
    ["download", "application/octet-stream"],
    ["waveform", "application/json"],
    ["artwork", "audio/mpeg"],
    ["poster", "video/mp4"],
    ["thumbnail", "text/plain"],
  ]) {
    assertInvalid(
      validateMediaDerivativeRegistrationInput(
        derivativeInput({ kind, contentType }),
      ),
      "contentType",
    );
  }

  assert.equal(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({
        status: "pending",
        objectKey: null,
        contentType: null,
        byteLength: null,
        contentSha256: null,
        format: null,
        bitrateKbps: null,
        durationMs: null,
        channels: null,
        sampleRate: null,
      }),
    ).ok,
    true,
  );

  assert.equal(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({
        processingProfile: "p".repeat(CATALOG_INPUT_LIMITS.processingValue),
        processingVersion: "v".repeat(CATALOG_INPUT_LIMITS.processingValue),
      }),
    ).ok,
    true,
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({
        processingProfile: "p".repeat(CATALOG_INPUT_LIMITS.processingValue + 1),
      }),
    ),
    "processingProfile",
  );
  assertInvalid(
    validateMediaDerivativeRegistrationInput(
      derivativeInput({
        processingVersion: "v".repeat(CATALOG_INPUT_LIMITS.processingValue + 1),
      }),
    ),
    "processingVersion",
  );
});
