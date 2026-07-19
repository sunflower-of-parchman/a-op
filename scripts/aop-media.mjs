#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  constants as fsConstants,
  mkdtemp,
  open,
  readFile,
  rm,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { sha256Hex } from "../lib/media-preparation/hash.ts";
import {
  prepareApprovedMedia,
  verifyApprovedMediaManifest,
} from "../lib/media-preparation/manifest.ts";
import { buildFfmpegArgv } from "../lib/media-preparation/profiles.ts";
import {
  requirePublicationMediaKey,
  resolveExternalPublicationAuthority,
} from "../lib/media-preparation/publication-authority.ts";
import {
  preflightMediaTools,
  runSpawnedCommand,
} from "../lib/media-preparation/process.ts";
import {
  requireApprovedSource,
  requireContractSha256,
  requireLocalPathAliases,
  resolveLocalAlias,
} from "../lib/media-preparation/validation.ts";

const LOCAL_PATHS_FILE = resolve("setup/local-paths.json");
const PUBLICATION_COOKIE_ENV = "AOP_MEDIA_PUBLICATION_COOKIE";

function usage() {
  return `a-op approved media

Commands:
  preflight --proposal-sha256 sha256:HEX --approval-sha256 sha256:HEX
            --source-alias ALIAS --expected-sha256 HEX --kind KIND
            --content-type TYPE --rights-confirmed --intended-use USE[,USE]
            [--check-tools]
  prepare   (the preflight flags) --manifest-alias ALIAS
            --derivative PROFILE=OUTPUT_ALIAS [--derivative ...]
  verify    --manifest-alias ALIAS
  publish   --manifest-alias ALIAS --media-alias ALIAS --media-id ID
            --media-key KEY --application-id ID --site-origin URL
            --visibility public|protected [--source-media-id ID]
            [--external-approval-alias ALIAS] --confirm-site-publication

All filesystem values resolve through the ignored setup/local-paths.json file.
Commands and manifests emit aliases and hashes only. Publication requires the
exact applied setup approval and an authenticated owner cookie supplied through
${PUBLICATION_COOKIE_ENV}. Public visibility also requires the exact ignored
external-action approval alias; protected visibility rejects that authority.`;
}

function parseArguments(values) {
  const command = values[0];
  const options = new Map();
  for (let index = 1; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--"))
      throw new Error("Use named media command flags only.");
    const name = token.slice(2);
    if (
      ["check-tools", "rights-confirmed", "confirm-site-publication"].includes(
        name,
      )
    ) {
      options.set(name, true);
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`--${name} requires a value.`);
    index += 1;
    const existing = options.get(name);
    options.set(
      name,
      existing === undefined
        ? value
        : [...(Array.isArray(existing) ? existing : [existing]), value],
    );
  }
  return { command, options };
}

function one(options, name) {
  const value = options.get(name);
  if (typeof value !== "string")
    throw new Error(`--${name} is required exactly once.`);
  return value;
}

function many(options, name) {
  const value = options.get(name);
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

async function loadAliases() {
  const raw = JSON.parse(await readFile(LOCAL_PATHS_FILE, "utf8"));
  return requireLocalPathAliases(raw, isAbsolute);
}

function aliasPath(aliases, alias) {
  return resolveLocalAlias(aliases, alias);
}

async function readAliasBytes(aliases, alias) {
  return new Uint8Array(await readFile(aliasPath(aliases, alias)));
}

async function writeAliasBytes(aliases, alias, bytes) {
  const target = aliasPath(aliases, alias);
  try {
    const existing = new Uint8Array(await readFile(target));
    if ((await sha256Hex(existing)) === (await sha256Hex(bytes))) return;
    throw new Error(`Alias ${alias} already contains different bytes.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const handle = await open(
    target,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

function spawnCommand(executable, args, options) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(executable, [...args], options);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < 1_048_576) stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 1_048_576) stderr += chunk;
    });
    child.once("error", rejectCommand);
    child.once("close", (exitCode) => {
      resolveCommand({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function inspectPath(path) {
  const result = await runSpawnedCommand(spawnCommand, "ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=format_name,duration,bit_rate:stream=codec_type,channels,sample_rate",
    "-of",
    "json",
    path,
  ]);
  const parsed = JSON.parse(result.stdout);
  const audio = Array.isArray(parsed.streams)
    ? parsed.streams.find((stream) => stream?.codec_type === "audio")
    : null;
  const seconds = Number(parsed.format?.duration);
  const bitRate = Number(parsed.format?.bit_rate);
  const channels = Number(audio?.channels);
  const sampleRate = Number(audio?.sample_rate);
  return {
    durationMs:
      Number.isFinite(seconds) && seconds >= 0
        ? Math.round(seconds * 1000)
        : null,
    channels: Number.isSafeInteger(channels) && channels >= 0 ? channels : null,
    sampleRate:
      Number.isSafeInteger(sampleRate) && sampleRate >= 0 ? sampleRate : null,
    format:
      typeof parsed.format?.format_name === "string"
        ? parsed.format.format_name.split(",", 1)[0]
        : null,
    bitrateKbps:
      Number.isFinite(bitRate) && bitRate >= 0
        ? Math.round(bitRate / 1000)
        : null,
  };
}

function staticInspection(format) {
  return {
    durationMs: null,
    channels: null,
    sampleRate: null,
    format,
    bitrateKbps: null,
  };
}

function sourceFromOptions(options) {
  if (options.get("rights-confirmed") !== true) {
    throw new Error("--rights-confirmed is required.");
  }
  return requireApprovedSource({
    alias: one(options, "source-alias"),
    expectedSourceSha256: one(options, "expected-sha256"),
    kind: one(options, "kind"),
    contentType: one(options, "content-type"),
    rightsConfirmed: true,
    intendedUse: one(options, "intended-use").split(","),
  });
}

function setupHashesFromOptions(options) {
  return {
    setupProposalSha256: requireContractSha256(
      one(options, "proposal-sha256"),
      "Setup proposal SHA-256",
    ),
    setupApprovalSha256: requireContractSha256(
      one(options, "approval-sha256"),
      "Setup approval SHA-256",
    ),
  };
}

async function preflight(options) {
  const aliases = await loadAliases();
  const source = sourceFromOptions(options);
  const setupHashes = setupHashesFromOptions(options);
  const bytes = await readAliasBytes(aliases, source.alias);
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== source.expectedSourceSha256) {
    throw new Error("Approved source SHA-256 does not match its alias.");
  }
  if (options.get("check-tools") === true)
    await preflightMediaTools(spawnCommand);
  return {
    status: "ready",
    sourceAlias: source.alias,
    sourceSha256: sha256,
    byteLength: bytes.byteLength,
    rightsConfirmed: true,
    intendedUse: source.intendedUse,
    proposalSha256: setupHashes.setupProposalSha256,
    approvalSha256: setupHashes.setupApprovalSha256,
    toolsChecked: options.get("check-tools") === true,
  };
}

async function prepare(options) {
  const aliases = await loadAliases();
  const source = sourceFromOptions(options);
  const manifestAlias = one(options, "manifest-alias");
  const derivatives = many(options, "derivative").map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error("--derivative must use PROFILE=OUTPUT_ALIAS.");
    }
    return {
      profileId: value.slice(0, separator),
      outputAlias: value.slice(separator + 1),
    };
  });
  const manifest = await prepareApprovedMedia(
    {
      ...setupHashesFromOptions(options),
      source,
      derivatives,
      checkTools: options.get("check-tools") === true,
    },
    {
      readAliasBytes: (alias) => readAliasBytes(aliases, alias),
      inspectAlias: (alias) =>
        source.kind === "document"
          ? staticInspection(
              source.contentType === "application/pdf" ? "pdf" : null,
            )
          : inspectPath(aliasPath(aliases, alias)),
      createScratch: () => mkdtemp(join(tmpdir(), "aop-media-")),
      removeScratch: (scratch) => rm(scratch, { recursive: true, force: true }),
      async createDerivative(scratch, sourceAlias, profile) {
        if (profile.processor === "copy") {
          return {
            bytes: await readAliasBytes(aliases, sourceAlias),
            inspection: staticInspection(profile.format),
          };
        }
        const output = join(scratch, `output.${profile.outputExtension}`);
        await runSpawnedCommand(
          spawnCommand,
          "ffmpeg",
          buildFfmpegArgv(profile, aliasPath(aliases, sourceAlias), output),
        );
        return {
          bytes: new Uint8Array(await readFile(output)),
          inspection:
            profile.contentType.startsWith("audio/") ||
            profile.contentType.startsWith("video/")
              ? await inspectPath(output)
              : staticInspection(profile.format),
        };
      },
      writeAliasBytes: (alias, bytes) => writeAliasBytes(aliases, alias, bytes),
      preflightTools: () => preflightMediaTools(spawnCommand),
    },
  );
  await writeAliasBytes(
    aliases,
    manifestAlias,
    new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  return {
    status: "prepared",
    manifestAlias,
    proposalSha256: manifest.proposalSha256,
    approvalSha256: manifest.approvalSha256,
    manifestSha256: manifest.manifestSha256,
    source: { alias: manifest.source.alias, sha256: manifest.source.sha256 },
    derivatives: manifest.derivatives.map(({ alias, sha256, profileId }) => ({
      alias,
      sha256,
      profileId,
    })),
  };
}

async function loadManifest(aliases, alias) {
  return JSON.parse(
    new TextDecoder().decode(await readAliasBytes(aliases, alias)),
  );
}

async function loadAliasJson(aliases, alias, label, byteCap = 65_536) {
  const bytes = await readAliasBytes(aliases, alias);
  if (bytes.byteLength === 0 || bytes.byteLength > byteCap) {
    throw new Error(`${label} has an invalid byte length.`);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function verify(options) {
  const aliases = await loadAliases();
  const manifestAlias = one(options, "manifest-alias");
  const manifest = await loadManifest(aliases, manifestAlias);
  await verifyApprovedMediaManifest(manifest, (alias) =>
    readAliasBytes(aliases, alias),
  );
  return {
    status: "verified",
    manifestAlias,
    manifestSha256: manifest.manifestSha256,
  };
}

function siteOrigin(value) {
  const url = new URL(value);
  const local =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !local)
  ) {
    throw new Error(
      "--site-origin must be an HTTPS origin or a local development origin.",
    );
  }
  return url.origin;
}

async function publish(options) {
  if (options.get("confirm-site-publication") !== true) {
    throw new Error(
      "--confirm-site-publication is required for this Site mutation.",
    );
  }
  const cookie = process.env[PUBLICATION_COOKIE_ENV];
  if (!cookie) throw new Error(`${PUBLICATION_COOKIE_ENV} is required.`);
  const aliases = await loadAliases();
  const manifestAlias = one(options, "manifest-alias");
  const mediaAlias = one(options, "media-alias");
  const logicalMediaKey = requirePublicationMediaKey(one(options, "media-key"));
  const visibility = one(options, "visibility");
  if (visibility !== "public" && visibility !== "protected") {
    throw new Error("--visibility must be public or protected.");
  }
  const manifest = await loadManifest(aliases, manifestAlias);
  await verifyApprovedMediaManifest(manifest, (alias) =>
    readAliasBytes(aliases, alias),
  );
  const entry =
    manifest.source.alias === mediaAlias
      ? manifest.source
      : manifest.derivatives.find(
          (candidate) => candidate.alias === mediaAlias,
        );
  if (!entry)
    throw new Error("Media alias is not present in the approved manifest.");
  if (visibility === "protected" && options.has("external-approval-alias")) {
    throw new Error(
      "Protected publication accepts no external-action approval alias.",
    );
  }
  const externalApproval =
    visibility === "public"
      ? await loadAliasJson(
          aliases,
          one(options, "external-approval-alias"),
          "External-action approval",
        )
      : undefined;
  const externalAuthority = resolveExternalPublicationAuthority({
    visibility,
    manifestProposalSha256: manifest.proposalSha256,
    externalApproval,
  });
  const externalActionHeaders = externalAuthority
    ? {
        "x-aop-external-action-id": externalAuthority.actionId,
        "x-aop-external-action-sha256": externalAuthority.actionSha256,
      }
    : {};
  const bytes = await readAliasBytes(aliases, mediaAlias);
  const origin = siteOrigin(one(options, "site-origin"));
  const headers = {
    origin,
    cookie,
    "content-type": entry.contentType,
    "content-length": String(bytes.byteLength),
    "idempotency-key": `media-publish:${manifest.manifestSha256.slice(-48)}:${entry.sha256.slice(0, 16)}`,
    "x-aop-application-id": one(options, "application-id"),
    "x-aop-proposal-sha256": manifest.proposalSha256,
    "x-aop-approval-sha256": manifest.approvalSha256,
    "x-aop-manifest-sha256": manifest.manifestSha256,
    "x-aop-media-sha256": entry.sha256,
    "x-aop-media-id": one(options, "media-id"),
    "x-aop-media-key": logicalMediaKey,
    "x-aop-media-alias": entry.alias,
    "x-aop-media-role": entry.role,
    "x-aop-media-visibility": visibility,
    "x-aop-rights-confirmed": "true",
    "x-aop-intended-use": manifest.source.intendedUse.join(","),
    ...(entry.inspection.durationMs === null
      ? {}
      : { "x-aop-duration-ms": String(entry.inspection.durationMs) }),
    ...(entry.inspection.channels === null
      ? {}
      : { "x-aop-channels": String(entry.inspection.channels) }),
    ...(entry.inspection.sampleRate === null
      ? {}
      : { "x-aop-sample-rate": String(entry.inspection.sampleRate) }),
    ...externalActionHeaders,
  };
  if (entry.role === "source") {
    headers["x-aop-media-kind"] = entry.kind;
    headers["x-aop-source-version"] = "1";
    if (entry.inspection.format)
      headers["x-aop-format"] = entry.inspection.format;
    if (entry.inspection.bitrateKbps !== null) {
      headers["x-aop-bitrate-kbps"] = String(entry.inspection.bitrateKbps);
    }
  } else {
    headers["x-aop-source-media-id"] = one(options, "source-media-id");
    headers["x-aop-derivative-kind"] = entry.derivativeKind;
    headers["x-aop-processing-profile"] = entry.profileId;
    headers["x-aop-processing-version"] = entry.processingVersion;
    headers["x-aop-format"] = entry.format;
    if (entry.bitrateKbps !== null)
      headers["x-aop-bitrate-kbps"] = String(entry.bitrateKbps);
  }
  const response = await fetch(`${origin}/api/admin/media-publication`, {
    method: "POST",
    headers,
    body: bytes,
    redirect: "error",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      `Site media publication failed with HTTP ${response.status}.`,
    );
  return { status: "published", mediaAlias, response: body };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result =
    command === "preflight"
      ? await preflight(options)
      : command === "prepare"
        ? await prepare(options)
        : command === "verify"
          ? await verify(options)
          : command === "publish"
            ? await publish(options)
            : (() => {
                throw new Error("Unknown a-op media command.");
              })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function safeFailureMessage(error) {
  if (!(error instanceof Error)) return "operation failed";
  if (
    (typeof error === "object" && error !== null && "path" in error) ||
    /(?:\/[A-Za-z0-9._-]+){3,}|[A-Za-z]:\\/.test(error.message)
  ) {
    return "local media operation failed";
  }
  return error.message;
}

main().catch((error) => {
  process.stderr.write(`a-op media: ${safeFailureMessage(error)}\n`);
  process.exitCode = 1;
});
