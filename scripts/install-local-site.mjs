#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  canonicalSha256,
  createProposalArtifact,
  validateSetupApproval,
} from "../lib/setup/index.ts";

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
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function contentType(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  throw new Error("Unsupported local installer media type.");
}
function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(JSON.parse(stdout));
      else reject(new Error(stderr.trim() || "Local media command failed."));
    });
  });
}
async function post(origin, route, body, key) {
  const response = await fetch(`${origin}${route}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
    redirect: "error",
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload?.error?.message ||
        `${route} failed with HTTP ${response.status}.`,
    );
  return payload;
}

const proposal = await json(required("proposal"));
const approval = await validateSetupApproval(await json(required("approval")));
const origin = new URL(option("site-origin", "http://localhost:3000")).origin;
if (
  !origin.startsWith("http://localhost") &&
  !origin.startsWith("http://127.0.0.1")
) {
  throw new Error(
    "This command is intentionally limited to local preview origins.",
  );
}
const artifact = await createProposalArtifact(proposal);
if (approval.proposalHash !== artifact.proposalHash)
  throw new Error("Approval does not match the exact installer proposal.");
const approvalHash = await canonicalSha256(approval);
const body = { proposal: artifact.proposal, approval, externalApprovals: [] };
const staged = await post(
  origin,
  "/api/admin/setup/stage",
  body,
  `local-install-stage:${artifact.proposalHash.slice(-40)}`,
);
const applicationId = staged.result.applicationId;
const mediaByKey = new Map(
  proposal.topics.rightsMedia.media.map((item) => [item.mediaKey, item]),
);
const aliases = (await json("setup/local-paths.json")).aliases;
const onlyMediaKey = option("only-media-key");
const fromMediaKey = option("from-media-key");
const applyOnly = process.argv.includes("--apply-only");
let reachedStart = fromMediaKey === null;

for (const action of proposal.mediaActions) {
  if (applyOnly) continue;
  if (!reachedStart && action.mediaKey === fromMediaKey) reachedStart = true;
  if (!reachedStart) continue;
  if (onlyMediaKey && action.mediaKey !== onlyMediaKey) continue;
  const media = mediaByKey.get(action.mediaKey);
  if (!media)
    throw new Error(`Missing media declaration for ${action.mediaKey}.`);
  const sourceAlias = media.sourceAlias;
  const sourceBytes = await readFile(aliases[sourceAlias]);
  const compact = Boolean(aliases[`compact-${media.mediaKey}`]);
  const manifestAlias = compact
    ? `compact-manifest-160-${media.mediaKey}`
    : `manifest-${media.mediaKey}`;
  const audio = media.kind === "audio";
  const artwork = media.kind === "artwork";
  const sourceContentType = contentType(aliases[sourceAlias]);
  const imageFormat = sourceContentType === "image/webp" ? "webp" : "jpeg";
  const derivativeArguments = audio
    ? [
        "--derivative",
        `${compact ? "audio-streaming-mp3-128=compact-stream" : "audio-streaming-mp3-192=stream"}-${media.mediaKey}`,
        "--derivative",
        `${compact ? "audio-download-mp3-160=compact-download-160" : "audio-download-mp3-320=download"}-${media.mediaKey}`,
      ]
    : artwork
      ? [
          "--derivative",
          `image-artwork-${imageFormat}-copy=artwork-${media.mediaKey}`,
        ]
      : [
          "--derivative",
          `image-thumbnail-${imageFormat}-copy=thumbnail-${media.mediaKey}`,
        ];
  await runNode([
    "scripts/aop-media.mjs",
    "prepare",
    "--proposal-sha256",
    artifact.proposalHash,
    "--approval-sha256",
    approvalHash,
    "--source-alias",
    sourceAlias,
    "--expected-sha256",
    sha256(sourceBytes),
    "--kind",
    audio ? "audio" : "image",
    "--content-type",
    sourceContentType,
    "--rights-confirmed",
    "--intended-use",
    audio ? "streaming,download,protected-delivery" : "public-site,artwork",
    "--manifest-alias",
    manifestAlias,
    ...derivativeArguments,
  ]);
  const sourceId = `media-${media.mediaKey}`;
  const resumeCompact = Boolean(aliases[`compact-resume-${media.mediaKey}`]);
  const common = [
    "scripts/aop-media.mjs",
    "publish",
    "--manifest-alias",
    manifestAlias,
    "--media-key",
    media.mediaKey,
    "--application-id",
    applicationId,
    "--site-origin",
    origin,
    "--visibility",
    "protected",
    "--local-preview",
    "--confirm-site-publication",
  ];
  if (!resumeCompact) {
    await runNode([
      ...common,
      "--media-alias",
      sourceAlias,
      "--media-id",
      sourceId,
    ]);
  }
  if (audio) {
    const streamAlias = `${compact ? "compact-stream" : "stream"}-${media.mediaKey}`;
    const downloadAlias = `${compact ? "compact-download-160" : "download"}-${media.mediaKey}`;
    if (!resumeCompact) {
      await runNode([
        ...common,
        "--media-alias",
        streamAlias,
        "--media-id",
        `${sourceId}-stream`,
        "--source-media-id",
        sourceId,
      ]);
    }
    await runNode([
      ...common,
      "--media-alias",
      downloadAlias,
      "--media-id",
      `${sourceId}-download`,
      "--source-media-id",
      sourceId,
    ]);
  } else if (artwork) {
    await runNode([
      ...common,
      "--media-alias",
      `artwork-${media.mediaKey}`,
      "--media-id",
      `${sourceId}-artwork`,
      "--source-media-id",
      sourceId,
    ]);
  } else {
    await runNode([
      ...common,
      "--media-alias",
      `thumbnail-${media.mediaKey}`,
      "--media-id",
      `${sourceId}-thumbnail`,
      "--source-media-id",
      sourceId,
    ]);
  }
  process.stdout.write(`Published ${media.mediaKey}\n`);
}

if (onlyMediaKey) {
  process.stdout.write(
    `${JSON.stringify({ status: "media-staged", mediaKey: onlyMediaKey }, null, 2)}\n`,
  );
  process.exit(0);
}

const applied = await post(
  origin,
  "/api/admin/setup/apply",
  body,
  `local-install-apply:${artifact.proposalHash.slice(-40)}`,
);
process.stdout.write(
  `${JSON.stringify(
    {
      status: "installed",
      proposalHash: artifact.proposalHash,
      mediaCount: proposal.mediaActions.length,
      application: applied.result,
    },
    null,
    2,
  )}\n`,
);
