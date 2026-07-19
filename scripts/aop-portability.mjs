#!/usr/bin/env node

import {
  parseArtistExportArchiveBytes,
  verifyArtistExportArchive,
} from "../lib/portability/archive.ts";
import { PortabilityError } from "../lib/portability/errors.ts";
import { rehearseArtistExportRestoreInMemory } from "../lib/portability/sqlite-rehearsal.mjs";

const MAX_STDIN_BYTES = 50 * 1024 * 1024;

function usage() {
  return [
    "Usage:",
    "  node scripts/aop-portability.mjs verify-stdin",
    "  node scripts/aop-portability.mjs rehearse-stdin",
    "",
    "Both commands read one artist installation archive from standard input.",
    "Rehearsal reads the checked-in migrations and uses only in-memory D1.",
    "It creates no files or media and performs no R2, publication, or external operation.",
  ].join("\n");
}

async function readStdin() {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    byteLength += bytes.byteLength;
    if (byteLength > MAX_STDIN_BYTES) {
      throw new Error(
        "The stdin archive exceeds the 50 MiB verification limit.",
      );
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function main() {
  const command = process.argv[2];
  if (command === "--help" || command === "-h" || command === undefined) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== "verify-stdin" && command !== "rehearse-stdin") {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  const archive = parseArtistExportArchiveBytes(await readStdin());
  if (command === "verify-stdin") {
    const verified = await verifyArtistExportArchive(archive);
    process.stdout.write(
      `${JSON.stringify({
        status: "passed",
        format: verified.archive.manifest.format,
        formatVersion: verified.archive.manifest.formatVersion,
        applicationSchemaVersion:
          verified.archive.manifest.applicationSchemaVersion,
        semanticFingerprint: verified.semanticFingerprint,
        archiveSha256: verified.archiveSha256,
        documents: verified.archive.files.length,
      })}\n`,
    );
    return;
  }

  const report = await rehearseArtistExportRestoreInMemory(archive);
  process.stdout.write(`${JSON.stringify({ status: "passed", ...report })}\n`);
}

main().catch((error) => {
  const output =
    error instanceof PortabilityError
      ? { status: "failed", code: error.code, location: error.location }
      : { status: "failed", code: "PORTABILITY_COMMAND_FAILED" };
  process.stderr.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 1;
});
