#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SetupContractError,
  compileSetupOperationPlan,
  createProposalArtifact,
  requireSetupPreflight,
  runSetupPreflight,
} from "../lib/setup/index.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const proposalRoot = resolve(projectRoot, "setup/proposals");
const localAliasesPath = resolve(projectRoot, "setup/local-paths.json");
const MAX_JSON_BYTES = 1_048_576;
const REQUIRED_FILES = Object.freeze([
  "AGENTS.md",
  "PRODUCT.md",
  "PLANS.md",
  "SETUP.md",
  "plans/migrateAopToSites.md",
  ".openai/hosting.json",
]);

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function help() {
  process.stdout.write(
    [
      "a-op setup contract",
      "",
      "preflight [--proposal setup/proposals/<name>.json]",
      "preview --proposal setup/proposals/<name>.json",
      "check --proposal setup/proposals/<name>.json --approval setup/proposals/<name>.approval.json --current-source-fingerprint sha256:<hash> [--external-approval setup/proposals/<name>.external-approval.json]",
      "diagnose [--proposal setup/proposals/<name>.json]",
      "",
      "These commands inspect and compile setup state. They perform no product, media, hosting, or external writes.",
    ].join("\n"),
  );
}

function parseArguments(argv) {
  const command = argv[0] ?? "help";
  const allowedCommands = new Set([
    "help",
    "preflight",
    "preview",
    "check",
    "diagnose",
  ]);
  if (!allowedCommands.has(command)) {
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      "Use help, preflight, preview, check, or diagnose.",
    );
  }
  const parsed = {
    command,
    proposal: undefined,
    approval: undefined,
    externalApprovals: [],
    currentSourceStateFingerprint: undefined,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (
      ![
        "--proposal",
        "--approval",
        "--external-approval",
        "--current-source-fingerprint",
      ].includes(flag) ||
      typeof next !== "string" ||
      next.startsWith("--")
    ) {
      throw new SetupContractError(
        "SETUP_INPUT_INVALID",
        "Use only the documented setup command arguments.",
      );
    }
    index += 1;
    if (flag === "--proposal") {
      if (parsed.proposal !== undefined) {
        throw new SetupContractError(
          "SETUP_INPUT_INVALID",
          "Provide one setup proposal.",
        );
      }
      parsed.proposal = next;
    } else if (flag === "--approval") {
      if (parsed.approval !== undefined) {
        throw new SetupContractError(
          "SETUP_INPUT_INVALID",
          "Provide one setup approval.",
        );
      }
      parsed.approval = next;
    } else if (flag === "--external-approval") {
      parsed.externalApprovals.push(next);
    } else {
      parsed.currentSourceStateFingerprint = next;
    }
  }
  return parsed;
}

function proposalFilePath(input) {
  if (
    isAbsolute(input) ||
    input.includes("\\") ||
    !/^setup\/proposals\/[a-z][a-z0-9.-]*\.json$/.test(input)
  ) {
    throw new SetupContractError(
      "SETUP_FILE_BOUNDARY_REJECTED",
      "Setup JSON files must use a safe repository-relative name inside setup/proposals.",
    );
  }
  const candidate = resolve(projectRoot, input);
  const boundary = relative(proposalRoot, candidate);
  if (boundary.startsWith("..") || isAbsolute(boundary)) {
    throw new SetupContractError(
      "SETUP_FILE_BOUNDARY_REJECTED",
      "Setup JSON files must stay inside setup/proposals.",
    );
  }
  return candidate;
}

async function readJsonFile(input) {
  const bytes = await readFile(proposalFilePath(input));
  if (bytes.byteLength > MAX_JSON_BYTES) {
    throw new SetupContractError(
      "SETUP_FILE_INVALID",
      "The setup JSON file exceeds the one-megabyte limit.",
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new SetupContractError(
      "SETUP_FILE_INVALID",
      "The setup JSON file is not valid JSON.",
    );
  }
}

async function exists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandAvailable(name) {
  const pathValue = process.env.PATH;
  if (typeof pathValue !== "string" || pathValue.length === 0) return false;
  for (const directory of pathValue.split(delimiter)) {
    if (directory.length === 0) continue;
    try {
      await access(resolve(directory, name), fsConstants.X_OK);
      return true;
    } catch {
      // Continue through the current PATH without executing the command.
    }
  }
  return false;
}

async function readLocalAliasNames() {
  if (!(await exists(localAliasesPath))) {
    return { present: false, aliases: [] };
  }
  const bytes = await readFile(localAliasesPath);
  if (bytes.byteLength > MAX_JSON_BYTES) {
    throw new SetupContractError(
      "SETUP_FILE_INVALID",
      "The ignored local path alias file exceeds the one-megabyte limit.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new SetupContractError(
      "SETUP_FILE_INVALID",
      "The ignored local path alias file is not valid JSON.",
    );
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(",") !== "aliases,schemaVersion" ||
    parsed.schemaVersion !== "aop.local-path-aliases.v1" ||
    parsed.aliases === null ||
    typeof parsed.aliases !== "object" ||
    Array.isArray(parsed.aliases)
  ) {
    throw new SetupContractError(
      "SETUP_FILE_INVALID",
      "The ignored local path alias file does not match its exact schema.",
    );
  }
  const aliases = Object.keys(parsed.aliases);
  for (const alias of aliases) {
    const value = parsed.aliases[alias];
    if (
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(alias) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 4_096 ||
      !isAbsolute(value) ||
      /[\u0000-\u001f\u007f]/.test(value)
    ) {
      throw new SetupContractError(
        "SETUP_FILE_INVALID",
        "The ignored local path alias file contains an invalid alias or path.",
      );
    }
  }
  return { present: true, aliases: aliases.sort() };
}

async function repositoryFacts() {
  const requiredFilesPresent = (
    await Promise.all(
      REQUIRED_FILES.map((path) => exists(resolve(projectRoot, path))),
    )
  ).every(Boolean);
  let hosting = {};
  try {
    hosting = JSON.parse(
      await readFile(resolve(projectRoot, ".openai/hosting.json"), "utf8"),
    );
  } catch {
    // The report uses false binding facts and contains no file contents.
  }
  return {
    requiredFilesPresent,
    d1BindingReady: hosting?.d1 === "DB",
    r2BindingReady: hosting?.r2 === "MEDIA",
  };
}

async function preflightInput(proposal) {
  const [repository, aliases, ffprobeAvailable, ffmpegAvailable] =
    await Promise.all([
      repositoryFacts(),
      readLocalAliasNames(),
      commandAvailable("ffprobe"),
      commandAvailable("ffmpeg"),
    ]);
  return {
    proposal,
    environment: process.env,
    repository,
    localMedia: {
      aliasFilePresent: aliases.present,
      aliases: aliases.aliases,
      ffprobeAvailable,
      ffmpegAvailable,
    },
  };
}

async function execute(parsed) {
  if (parsed.command === "help") {
    help();
    return;
  }
  if (
    (parsed.command === "preview" || parsed.command === "check") &&
    parsed.proposal === undefined
  ) {
    throw new SetupContractError(
      "SETUP_INPUT_INVALID",
      `${parsed.command} requires one proposal in setup/proposals.`,
    );
  }
  if (parsed.command === "check" && parsed.approval === undefined) {
    throw new SetupContractError(
      "SETUP_APPROVAL_REQUIRED",
      "check requires a separate exact-hash setup approval.",
    );
  }

  const proposal =
    parsed.proposal === undefined
      ? undefined
      : await readJsonFile(parsed.proposal);
  const preflight = runSetupPreflight(await preflightInput(proposal));
  if (parsed.command === "preflight") {
    output({ command: "preflight", writesPerformed: 0, preflight });
    requireSetupPreflight(preflight);
    return;
  }

  if (parsed.command === "diagnose") {
    const artifact = proposal
      ? await createProposalArtifact(proposal)
      : undefined;
    output({
      command: "diagnose",
      writesPerformed: 0,
      proposal:
        artifact === undefined
          ? null
          : {
              proposalId: artifact.proposal.proposalId,
              proposalHash: artifact.proposalHash,
              sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
            },
      preflight,
    });
    requireSetupPreflight(preflight);
    return;
  }

  const approval =
    parsed.approval === undefined
      ? undefined
      : await readJsonFile(parsed.approval);
  const externalApprovals = await Promise.all(
    parsed.externalApprovals.map(readJsonFile),
  );
  const plan = await compileSetupOperationPlan({
    proposal,
    approval,
    externalApprovals,
    currentSourceStateFingerprint: parsed.currentSourceStateFingerprint,
  });
  output({
    command: parsed.command,
    writesPerformed: 0,
    preflight,
    plan,
  });
  if (parsed.command === "check") {
    requireSetupPreflight(preflight);
    if (!plan.readyForApply) {
      throw new SetupContractError(
        "SETUP_APPROVAL_REQUIRED",
        "The exact proposal is not ready for deterministic apply.",
      );
    }
  }
}

try {
  await execute(parseArguments(process.argv.slice(2)));
} catch (error) {
  if (error instanceof SetupContractError) {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        code: error.code,
        message: error.message,
        issues: error.issues,
      })}\n`,
    );
  } else {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        code: "SETUP_FILE_INVALID",
        message:
          "The setup command could not read or validate the requested local input.",
      })}\n`,
    );
  }
  process.exitCode = 1;
}
