import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "../lib/media-preparation/hash.ts";
import {
  prepareApprovedMedia,
  verifyApprovedMediaManifest,
} from "../lib/media-preparation/manifest.ts";
import {
  FIXED_DERIVATIVE_PROFILES,
  buildFfmpegArgv,
  requireDerivativeProfile,
} from "../lib/media-preparation/profiles.ts";
import {
  preflightMediaTools,
  runSpawnedCommand,
} from "../lib/media-preparation/process.ts";
import {
  requireLocalPathAliases,
  resolveLocalAlias,
} from "../lib/media-preparation/validation.ts";

const sourceBytes = new TextEncoder().encode("fictional-approved-source-bytes");
const derivativeBytes = new TextEncoder().encode(
  "fictional-prepared-derivative",
);
const inspection = {
  durationMs: 120_000,
  channels: 2,
  sampleRate: 48_000,
  format: "wav",
  bitrateKbps: 1411,
};

async function input() {
  return {
    setupProposalSha256: `sha256:${"1".repeat(64)}`,
    setupApprovalSha256: `sha256:${"2".repeat(64)}`,
    source: {
      alias: "approved-master",
      expectedSourceSha256: await sha256Hex(sourceBytes),
      kind: "audio",
      contentType: "audio/wav",
      rightsConfirmed: true,
      intendedUse: ["download", "streaming"],
    },
    derivatives: [
      {
        profileId: "audio-streaming-mp3-192",
        outputAlias: "approved-stream",
      },
    ],
  };
}

function dependencies(overrides = {}) {
  const written = new Map();
  const calls = { tools: 0, removed: [], derivative: 0 };
  return {
    written,
    calls,
    value: {
      async readAliasBytes(alias) {
        return written.get(alias) ?? sourceBytes;
      },
      async inspectAlias() {
        return inspection;
      },
      async createScratch() {
        return "opaque-scratch-handle";
      },
      async removeScratch(scratch) {
        calls.removed.push(scratch);
      },
      async createDerivative(_scratch, _sourceAlias, profile) {
        calls.derivative += 1;
        return {
          bytes: derivativeBytes,
          inspection: {
            ...inspection,
            format: profile.format,
            bitrateKbps: 192,
          },
        };
      },
      async writeAliasBytes(alias, bytes) {
        written.set(alias, new Uint8Array(bytes));
      },
      async preflightTools() {
        calls.tools += 1;
      },
      ...overrides,
    },
  };
}

test("media preparation is alias-only, deterministic, rights-bound, and hash-verifiable", async () => {
  const firstDependencies = dependencies();
  const first = await prepareApprovedMedia(
    await input(),
    firstDependencies.value,
  );
  assert.equal(first.proposalSha256.startsWith("sha256:"), true);
  assert.equal(first.approvalSha256.startsWith("sha256:"), true);
  assert.equal(first.manifestSha256.startsWith("sha256:"), true);
  assert.equal(first.proposalSha256, `sha256:${"1".repeat(64)}`);
  assert.equal(first.approvalSha256, `sha256:${"2".repeat(64)}`);
  assert.equal(first.source.alias, "approved-master");
  assert.equal(first.derivatives[0].alias, "approved-stream");
  assert.equal(firstDependencies.calls.tools, 0);
  assert.deepEqual(firstDependencies.calls.removed, ["opaque-scratch-handle"]);
  assert.doesNotMatch(JSON.stringify(first), /\/Users\/|\/private\/|\/tmp\//);
  await verifyApprovedMediaManifest(
    first,
    firstDependencies.value.readAliasBytes,
  );

  const secondDependencies = dependencies();
  const second = await prepareApprovedMedia(
    await input(),
    secondDependencies.value,
  );
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.deepEqual(first, second);
});

test("expected source hash and explicit rights fail before any derivative runs", async () => {
  const fixture = dependencies();
  await assert.rejects(
    prepareApprovedMedia(
      {
        ...(await input()),
        source: {
          ...(await input()).source,
          expectedSourceSha256: "0".repeat(64),
        },
      },
      fixture.value,
    ),
    /does not match/,
  );
  assert.equal(fixture.calls.derivative, 0);

  await assert.rejects(
    prepareApprovedMedia(
      {
        ...(await input()),
        source: { ...(await input()).source, rightsConfirmed: false },
      },
      fixture.value,
    ),
    /rights confirmation/,
  );
});

test("scratch cleanup runs in finally after a failed conversion", async () => {
  const fixture = dependencies({
    async createDerivative() {
      throw new Error("synthetic conversion failure");
    },
  });
  await assert.rejects(
    prepareApprovedMedia(await input(), fixture.value),
    /synthetic conversion failure/,
  );
  assert.deepEqual(fixture.calls.removed, ["opaque-scratch-handle"]);
});

test("tool preflight runs only on explicit request", async () => {
  const fixture = dependencies();
  await prepareApprovedMedia(await input(), fixture.value);
  assert.equal(fixture.calls.tools, 0);
  await prepareApprovedMedia(
    { ...(await input()), checkTools: true },
    fixture.value,
  );
  assert.equal(fixture.calls.tools, 1);
});

test("fixed profiles build argv arrays and every spawned command disables shells", async () => {
  const profile = requireDerivativeProfile("audio-streaming-mp3-192");
  const argv = buildFfmpegArgv(profile, "/opaque/input", "/opaque/output");
  assert.deepEqual(argv.slice(0, 8), [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "/opaque/input",
    "-map_metadata",
  ]);

  const calls = [];
  const fakeSpawn = async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  await runSpawnedCommand(fakeSpawn, "ffmpeg", argv);
  await preflightMediaTools(fakeSpawn);
  assert.deepEqual(
    calls.map(({ executable }) => executable),
    ["ffmpeg", "ffprobe", "ffmpeg"],
  );
  assert.equal(
    calls.every(({ options }) => options.shell === false),
    true,
  );
  assert.equal(
    calls.every(({ args }) => Array.isArray(args)),
    true,
  );
});

test("fixed profiles cover bounded audio, hosted video, Course image, captions, and document delivery", () => {
  assert.deepEqual(
    FIXED_DERIVATIVE_PROFILES.map(({ id }) => id),
    [
      "audio-streaming-mp3-192",
      "audio-download-flac",
      "audio-download-mp3-320",
      "audio-streaming-mp3-128",
      "audio-download-mp3-128",
      "audio-download-mp3-160",
      "video-streaming-mp4-h264-720",
      "video-download-mp4-h264-1080",
      "video-poster-webp-1280",
      "video-captions-webvtt",
      "image-course-webp-1600",
      "image-artwork-webp-1600",
      "image-artwork-webp-copy",
      "image-artwork-jpeg-copy",
      "image-thumbnail-webp-copy",
      "image-thumbnail-jpeg-copy",
      "document-download-pdf-copy",
    ],
  );
  for (const profile of FIXED_DERIVATIVE_PROFILES) {
    assert.equal(profile.version, "1");
    assert.ok(profile.sourceContentTypes.length > 0);
    assert.ok(profile.intendedUses.length > 0);
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.ffmpegArguments));
    if (profile.processor === "copy") {
      assert.deepEqual(profile.ffmpegArguments, []);
      assert.throws(
        () => buildFfmpegArgv(profile, "/opaque/input", "/opaque/output"),
        /does not use ffmpeg/,
      );
      continue;
    }
    const argv = buildFfmpegArgv(profile, "/opaque/input", "/opaque/output");
    assert.deepEqual(argv.slice(0, 7), [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      "/opaque/input",
    ]);
    assert.equal(argv.at(-1), "/opaque/output");
    assert.equal(
      argv.every((argument) => typeof argument === "string"),
      true,
    );
  }

  const streamVideo = requireDerivativeProfile("video-streaming-mp4-h264-720");
  assert.ok(streamVideo.ffmpegArguments.includes("libx264"));
  assert.ok(streamVideo.ffmpegArguments.includes("0:a:0?"));
  assert.ok(streamVideo.ffmpegArguments.includes("1"));
  assert.match(streamVideo.ffmpegArguments.join(" "), /min\(1280\\,iw\)/);

  const poster = requireDerivativeProfile("video-poster-webp-1280");
  assert.equal(poster.derivativeKind, "poster");
  assert.ok(poster.ffmpegArguments.includes("1"));

  const captions = requireDerivativeProfile("video-captions-webvtt");
  assert.equal(captions.derivativeKind, "transcript");
  assert.ok(captions.ffmpegArguments.includes("0:s:0"));

  const image = requireDerivativeProfile("image-course-webp-1600");
  assert.equal(image.derivativeKind, "thumbnail");
  assert.match(image.ffmpegArguments.join(" "), /min\(1600\\,iw\)/);
});

test("manifests bind new profiles to source content, intended use, and byte-exact copy", async () => {
  const videoFixture = dependencies({
    async createDerivative(_scratch, _sourceAlias, profile) {
      return {
        bytes: new TextEncoder().encode(`fictional-${profile.id}`),
        inspection: {
          ...inspection,
          format: profile.format,
          bitrateKbps: profile.bitrateKbps,
        },
      };
    },
  });
  const videoManifest = await prepareApprovedMedia(
    {
      setupProposalSha256: `sha256:${"3".repeat(64)}`,
      setupApprovalSha256: `sha256:${"4".repeat(64)}`,
      source: {
        alias: "approved-video",
        expectedSourceSha256: await sha256Hex(sourceBytes),
        kind: "video",
        contentType: "video/mp4",
        rightsConfirmed: true,
        intendedUse: ["video", "course", "download"],
      },
      derivatives: [
        {
          profileId: "video-streaming-mp4-h264-720",
          outputAlias: "approved-video-stream",
        },
        {
          profileId: "video-download-mp4-h264-1080",
          outputAlias: "approved-video-download",
        },
        {
          profileId: "video-poster-webp-1280",
          outputAlias: "approved-video-poster",
        },
        {
          profileId: "video-captions-webvtt",
          outputAlias: "approved-video-captions",
        },
      ],
    },
    videoFixture.value,
  );
  assert.deepEqual(
    videoManifest.derivatives.map(
      ({ profileId, derivativeKind, contentType }) => ({
        profileId,
        derivativeKind,
        contentType,
      }),
    ),
    [
      {
        profileId: "video-streaming-mp4-h264-720",
        derivativeKind: "streaming",
        contentType: "video/mp4",
      },
      {
        profileId: "video-download-mp4-h264-1080",
        derivativeKind: "download",
        contentType: "video/mp4",
      },
      {
        profileId: "video-poster-webp-1280",
        derivativeKind: "poster",
        contentType: "image/webp",
      },
      {
        profileId: "video-captions-webvtt",
        derivativeKind: "transcript",
        contentType: "text/vtt",
      },
    ],
  );

  const imageFixture = dependencies();
  const imageManifest = await prepareApprovedMedia(
    {
      setupProposalSha256: `sha256:${"5".repeat(64)}`,
      setupApprovalSha256: `sha256:${"6".repeat(64)}`,
      source: {
        alias: "approved-course-image",
        expectedSourceSha256: await sha256Hex(sourceBytes),
        kind: "image",
        contentType: "image/png",
        rightsConfirmed: true,
        intendedUse: ["course"],
      },
      derivatives: [
        {
          profileId: "image-course-webp-1600",
          outputAlias: "approved-course-image-webp",
        },
      ],
    },
    imageFixture.value,
  );
  assert.equal(imageManifest.derivatives[0].derivativeKind, "thumbnail");

  const copyFixture = dependencies({
    async createDerivative() {
      return {
        bytes: sourceBytes,
        inspection: {
          durationMs: null,
          channels: null,
          sampleRate: null,
          format: "pdf",
          bitrateKbps: null,
        },
      };
    },
  });
  const documentManifest = await prepareApprovedMedia(
    {
      setupProposalSha256: `sha256:${"7".repeat(64)}`,
      setupApprovalSha256: `sha256:${"8".repeat(64)}`,
      source: {
        alias: "approved-course-document",
        expectedSourceSha256: await sha256Hex(sourceBytes),
        kind: "document",
        contentType: "application/pdf",
        rightsConfirmed: true,
        intendedUse: ["course"],
      },
      derivatives: [
        {
          profileId: "document-download-pdf-copy",
          outputAlias: "approved-course-document-download",
        },
      ],
    },
    copyFixture.value,
  );
  assert.equal(documentManifest.derivatives[0].derivativeKind, "download");
  assert.equal(
    documentManifest.derivatives[0].sha256,
    documentManifest.source.sha256,
  );

  const wrongContentFixture = dependencies();
  await assert.rejects(
    prepareApprovedMedia(
      {
        setupProposalSha256: `sha256:${"b".repeat(64)}`,
        setupApprovalSha256: `sha256:${"c".repeat(64)}`,
        source: {
          alias: "approved-text-document",
          expectedSourceSha256: await sha256Hex(sourceBytes),
          kind: "document",
          contentType: "text/plain",
          rightsConfirmed: true,
          intendedUse: ["course"],
        },
        derivatives: [
          {
            profileId: "document-download-pdf-copy",
            outputAlias: "invalid-document",
          },
        ],
      },
      wrongContentFixture.value,
    ),
    /source content type/,
  );
  assert.equal(wrongContentFixture.calls.derivative, 0);

  const wrongUseFixture = dependencies();
  await assert.rejects(
    prepareApprovedMedia(
      {
        ...(await input()),
        source: {
          ...(await input()).source,
          intendedUse: ["artwork"],
        },
      },
      wrongUseFixture.value,
    ),
    /outside the approved intended media uses/,
  );
  assert.equal(wrongUseFixture.calls.derivative, 0);

  const changedCopyFixture = dependencies({
    async createDerivative() {
      return { bytes: derivativeBytes, inspection };
    },
  });
  await assert.rejects(
    prepareApprovedMedia(
      {
        setupProposalSha256: `sha256:${"9".repeat(64)}`,
        setupApprovalSha256: `sha256:${"a".repeat(64)}`,
        source: {
          alias: "approved-document",
          expectedSourceSha256: await sha256Hex(sourceBytes),
          kind: "document",
          contentType: "application/pdf",
          rightsConfirmed: true,
          intendedUse: ["download"],
        },
        derivatives: [
          {
            profileId: "document-download-pdf-copy",
            outputAlias: "changed-copy",
          },
        ],
      },
      changedCopyFixture.value,
    ),
    /byte-copy derivative changed/,
  );
  assert.deepEqual(changedCopyFixture.calls.removed, ["opaque-scratch-handle"]);
});

test("local path configuration accepts exact ignored aliases without surfacing paths", () => {
  const configuration = requireLocalPathAliases(
    {
      schemaVersion: "aop.local-path-aliases.v1",
      aliases: {
        "approved-master": "/private/artist/master.wav",
        "approved-stream": "/private/artist/stream.mp3",
      },
    },
    (value) => value.startsWith("/"),
  );
  assert.equal(
    resolveLocalAlias(configuration, "approved-master"),
    "/private/artist/master.wav",
  );
  assert.throws(
    () =>
      requireLocalPathAliases(
        {
          schemaVersion: "aop.local-path-aliases.v1",
          aliases: {},
          extra: true,
        },
        () => true,
      ),
    /only schemaVersion and aliases/,
  );
  assert.throws(
    () => resolveLocalAlias(configuration, "missing-alias"),
    /not configured/,
  );
});
