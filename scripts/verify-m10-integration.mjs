import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const wranglerBinary = resolve(projectRoot, "node_modules/.bin/wrangler");
const port = Number(process.env.AOP_M10_INTEGRATION_PORT ?? 3230);
const baseUrl = `http://localhost:${port}`;
const MAX_COMMAND_OUTPUT_BYTES = 512 * 1024;
const MAX_CLIENT_ARTIFACT_BYTES = 3 * 1024 * 1024;
const MAX_CLIENT_FILE_BYTES = 512 * 1024;
const TEST_PUBLISHABLE_KEY = "pk_test_AopM10IntegrationFictional001";
const TEST_SECRET_KEY = "sk_test_AopM10IntegrationFictional001";
const TEST_WEBHOOK_SECRET = "whsec_AopM10IntegrationFictional001";

const STORY_FAMILIES = Object.freeze([
  {
    id: 1,
    story: "owner-setup-and-identity-publication",
    evidence: ["runtime:m2", "contracts:foundation"],
  },
  {
    id: 2,
    story: "release-media-publication-and-streaming",
    evidence: ["contracts:catalog-media", "runtime:m9"],
  },
  {
    id: 3,
    story: "customer-library-and-listening-history",
    evidence: ["contracts:customer-library-player"],
  },
  {
    id: 4,
    story: "artist-access-library-and-protected-delivery",
    evidence: ["runtime:m5", "contracts:protected-access"],
  },
  {
    id: 5,
    story: "membership-subscription-renewal-credits-cancellation",
    evidence: ["runtime:m6", "contracts:recurring-commerce"],
  },
  {
    id: 6,
    story: "license-issuance-document-and-delivery",
    evidence: ["contracts:licensing-delivery"],
  },
  {
    id: 7,
    story: "stripe-test-checkout-and-exactly-once-fulfillment",
    evidence: ["runtime:m6", "contracts:stripe-boundary"],
  },
  {
    id: 8,
    story: "course-access-progress-and-resume",
    evidence: ["contracts:courses"],
  },
  {
    id: 9,
    story: "video-updates-and-contact",
    evidence: ["contracts:video-updates-contact"],
  },
  {
    id: 10,
    story: "telemetry-legal-diagnostics-export-and-recovery",
    evidence: ["runtime:m8", "runtime:m9", "contracts:recovery"],
  },
]);

const STORY_CONTRACT_TESTS = Object.freeze([
  "tests/foundation.test.mjs",
  "tests/m10-interface-contract.test.mjs",
  "tests/catalog-integration.test.mjs",
  "tests/catalog-delivery-integration.test.mjs",
  "tests/media-preparation.test.mjs",
  "tests/media-publication-integration.test.mjs",
  "tests/customer-library-integration.test.mjs",
  "tests/player-state.test.mjs",
  "tests/player-observation.test.mjs",
  "tests/access-delivery-integration.test.mjs",
  "tests/commerce-recurring-fulfillment-integration.test.mjs",
  "tests/commerce-license-fulfillment-integration.test.mjs",
  "tests/license-document-delivery-integration.test.mjs",
  "tests/licensing-integration.test.mjs",
  "tests/course-integration.test.mjs",
  "tests/course-delivery-integration.test.mjs",
  "tests/video-updates-integration.test.mjs",
  "tests/contact-integration.test.mjs",
  "tests/telemetry-integration.test.mjs",
  "tests/legal-document-integration.test.mjs",
  "tests/operations-integration.test.mjs",
  "tests/portability.test.mjs",
  "tests/portability-d1-export.test.mjs",
  "tests/commerce-environment.test.mjs",
  "tests/commerce-preflight.test.mjs",
  "tests/payment-data-boundary.test.mjs",
  "tests/stripe-checkout.test.mjs",
  "tests/stripe-events.test.mjs",
  "tests/stripe-webhook.test.mjs",
  "tests/commerce-ui-contract.test.mjs",
  "tests/customer-library-ui-contract.test.mjs",
  "tests/music-ui-contract.test.mjs",
  "tests/licensing-ui-contract.test.mjs",
  "tests/telemetry-api-ui-contract.test.mjs",
  "tests/legal-api-ui-contract.test.mjs",
]);

const RUNTIME_LABS = Object.freeze([
  { key: "m2", script: "scripts/verify-m2-runtime.mjs" },
  { key: "m5", script: "scripts/verify-m5-runtime.mjs" },
  { key: "m6", script: "scripts/verify-m6-runtime.mjs" },
  { key: "m8", script: "scripts/verify-m8-runtime.mjs" },
  { key: "m9", script: "scripts/verify-m9-runtime.mjs" },
]);

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error("AOP_M10_INTEGRATION_PORT must be a safe unprivileged port.");
}

function sanitizedEnvironment() {
  const environment = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "SHELL",
    "TERM",
    "CI",
    "NO_COLOR",
    "FORCE_COLOR",
    "CODEX_SANDBOX",
  ]) {
    if (typeof process.env[key] === "string")
      environment[key] = process.env[key];
  }
  environment.WRANGLER_LOG_PATH = "/dev/null";
  environment.WRANGLER_WRITE_LOGS = "false";
  environment.CLOUDFLARE_INCLUDE_PROCESS_ENV = "true";
  environment.STRIPE_PUBLISHABLE_KEY = TEST_PUBLISHABLE_KEY;
  environment.STRIPE_SECRET_KEY = TEST_SECRET_KEY;
  environment.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  return environment;
}

function boundedAppend(current, chunk) {
  const combined = `${current}${chunk}`;
  return combined.length <= MAX_COMMAND_OUTPUT_BYTES
    ? combined
    : combined.slice(-MAX_COMMAND_OUTPUT_BYTES);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolveDelay) => setTimeout(() => resolveDelay(false), 5_000)),
  ]);
  if (!stopped && child.exitCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await once(child, "exit");
  }
}

async function runCommand({
  label,
  command,
  args,
  expectJson = false,
  timeoutMs = 180_000,
}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: sanitizedEnvironment(),
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = boundedAppend(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = boundedAppend(stderr, chunk);
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void stopChild(child);
  }, timeoutMs);
  const [exitCode] = await once(child, "exit");
  clearTimeout(timeout);
  if (timedOut || exitCode !== 0) {
    throw new Error(
      `${label} ${timedOut ? "timed out" : `exited ${String(exitCode)}`}.
${stdout.slice(-4_000)}
${stderr.slice(-4_000)}`,
    );
  }

  if (!expectJson) return { label, status: "passed" };
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const result = JSON.parse(lines[index]);
      assert.equal(result.status, "passed", `${label} did not pass.`);
      return result;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  throw new Error(`${label} produced no JSON result.`);
}

async function readApplicationIdentity() {
  const [packageText, hostingText] = await Promise.all([
    readFile(join(projectRoot, "package.json"), "utf8"),
    readFile(join(projectRoot, ".openai/hosting.json"), "utf8"),
  ]);
  const packageManifest = JSON.parse(packageText);
  const hosting = JSON.parse(hostingText);
  assert.equal(packageManifest.name, "a-op");
  assert.equal(packageManifest.devDependencies?.vinext, "0.0.50");
  assert.deepEqual(hosting, { d1: "DB", r2: "MEDIA" });
  return Object.freeze({
    name: "a-op",
    runtime: "vinext@0.0.50",
    repositoryRoot: "single",
    d1Binding: "DB",
    r2Binding: "MEDIA",
  });
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else files.push(path);
  }
  return files;
}

async function verifyClientArtifactBudget() {
  const files = await filesBelow(join(projectRoot, "dist/client"));
  const sizes = await Promise.all(files.map((file) => stat(file)));
  const totalBytes = sizes.reduce((total, value) => total + value.size, 0);
  const largestBytes = Math.max(0, ...sizes.map(({ size }) => size));
  assert.ok(files.length > 0, "The production client artifact is empty.");
  assert.ok(
    totalBytes <= MAX_CLIENT_ARTIFACT_BYTES,
    `The production client artifact exceeds ${MAX_CLIENT_ARTIFACT_BYTES} bytes.`,
  );
  assert.ok(
    largestBytes <= MAX_CLIENT_FILE_BYTES,
    `A production client file exceeds ${MAX_CLIENT_FILE_BYTES} bytes.`,
  );
  return { fileCount: files.length, totalBytes, largestBytes };
}

async function securityHeaderProbe() {
  const child = spawn(
    vinextBinary,
    ["dev", "--host", "localhost", "--port", String(port), "--strictPort"],
    {
      cwd: projectRoot,
      env: sanitizedEnvironment(),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = boundedAppend(output, chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk) => {
    output = boundedAppend(output, chunk.toString("utf8"));
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(
          `The M10 security probe server exited early.\n${output}`,
        );
      }
      try {
        const response = await fetch(`${baseUrl}/api/health`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // The owned strict port is still opening.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    assert.equal(ready, true, "The M10 security probe server did not start.");

    const home = await fetch(`${baseUrl}/`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(home.status, 200);
    const contentSecurityPolicy =
      home.headers.get("content-security-policy") ?? "";
    assert.match(contentSecurityPolicy, /default-src 'self'/);
    assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
    assert.equal(home.headers.get("cache-control"), "private, no-store");
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.match(home.headers.get("permissions-policy") ?? "", /payment=\(\)/);
    await home.arrayBuffer();

    const laboratory = await fetch(`${baseUrl}/api/runtime-lab/m6`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(laboratory.status, 404);
    await laboratory.arrayBuffer();
    return Object.freeze({
      contentSecurityPolicy: "enforced",
      frameAncestors: "none",
      frameOptions: "DENY",
      paymentPermission: "disabled",
      noStore: true,
      runtimeLabDefault: "off",
    });
  } finally {
    await stopChild(child);
  }
}

function assertRuntimeLabCleanup(results) {
  const { m2, m5, m6, m8, m9 } = results;
  for (const result of [m2, m5, m6, m8]) {
    assert.equal(result.status, "passed");
    assert.equal(result.runtimeLabDefault, "off");
  }
  assert.equal(m9.status, "passed");
  assert.equal(m2.retainedVerificationRows, 0);
  assert.equal(m2.r2ObjectsTouched, 0);
  assert.equal(m2.temporaryFilesCreated, 0);
  assert.equal(m5.retainedVerificationRows, 0);
  assert.equal(m5.baselineCountsRestored, true);
  assert.equal(m5.r2ObjectsTouched, 0);
  assert.equal(m5.temporaryFilesCreated, 0);
  assert.equal(m6.retainedVerificationRows, 0);
  assert.equal(m6.baselineCountsRestored, true);
  assert.equal(m6.moduleStateRestored, true);
  assert.equal(m6.r2ObjectsTouched, 0);
  assert.equal(m6.mediaRowsCreated, 0);
  assert.equal(m6.temporaryFilesCreated, 0);
  assert.equal(m8.retainedVerificationRows, 0);
  assert.equal(m8.baselineCountsRestored, true);
  assert.equal(m8.r2ObjectsTouched, 0);
  assert.equal(m8.mediaBytesCreated, 0);
  assert.equal(m8.temporaryFilesCreated, 0);
  assert.equal(m9.cleanup.restored, true);
  assert.equal(m9.cleanup.retainedVerificationRows, 0);
  assert.equal(m9.cleanup.baselineCountsRestored, true);
  assert.equal(m9.cleanup.mutableStateRestored, true);
  assert.equal(m9.cleanup.sourceFingerprintRestored, true);
  assert.equal(m9.cleanup.foreignKeyViolationCount, 0);
  assert.equal(m9.cleanup.r2Calls, 0);
  assert.equal(m9.cleanup.r2ObjectsTouched, 0);
  assert.equal(m9.cleanup.mediaBytesCreated, 0);
  assert.equal(m9.cleanup.temporaryFilesCreated, 0);
  assert.equal(m9.cleanup.externalCalls, 0);
}

function assertStripeJudgeEvidence(m6) {
  assert.equal(m6.checkoutEvent, "awaited-invoice");
  assert.equal(m6.invoiceEvent, "fulfilled-once");
  assert.equal(m6.replay, "idempotent");
  assert.equal(m6.liveEvent, "rejected-before-write");
  assert.equal(m6.invalidSignature, "rejected-before-write");
  assert.equal(m6.protectedTrack, "visible-after-entitlement");
  assert.equal(m6.customerEvidence, "visible");
  assert.equal(m6.ownerEvidence, "visible");
}

function describeGate() {
  return {
    status: "ready",
    gate: "m10-integration",
    application: "a-op",
    storyFamilies: STORY_FAMILIES,
    runtimeLabs: RUNTIME_LABS.map(({ key }) => key),
    contractTestCount: STORY_CONTRACT_TESTS.length,
    stripeEnvironment: "test",
    livemode: false,
    statement: "No real payment will be accepted.",
    safety: {
      externalCalls: 0,
      realStripeSessions: 0,
      deployments: 0,
      screenshots: 0,
      temporaryAssets: 0,
      mediaFilesCreated: 0,
      sourceR2ObjectsCreated: 0,
      environmentFilesInspected: 0,
    },
  };
}

async function runGate() {
  const application = await readApplicationIdentity();
  await runCommand({
    label: "commerce-boundary",
    command: process.execPath,
    args: ["scripts/verify-commerce-boundary.mjs"],
  });
  await runCommand({
    label: "production-build",
    command: vinextBinary,
    args: ["build"],
  });
  await runCommand({
    label: "runtime-artifact",
    command: process.execPath,
    args: ["scripts/verify-runtime-artifact.mjs"],
  });
  await runCommand({
    label: "local-forward-migrations",
    command: wranglerBinary,
    args: [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      "./wrangler.local.jsonc",
    ],
  });
  await runCommand({
    label: "story-contracts",
    command: process.execPath,
    args: ["--test", ...STORY_CONTRACT_TESTS],
  });

  const runtimeResults = {};
  for (const laboratory of RUNTIME_LABS) {
    runtimeResults[laboratory.key] = await runCommand({
      label: `runtime-${laboratory.key}`,
      command: process.execPath,
      args: [laboratory.script],
      expectJson: true,
      timeoutMs: 240_000,
    });
  }
  assertRuntimeLabCleanup(runtimeResults);
  assertStripeJudgeEvidence(runtimeResults.m6);

  const [securityHeaders, clientArtifact] = await Promise.all([
    securityHeaderProbe(),
    verifyClientArtifactBudget(),
  ]);
  return {
    status: "passed",
    gate: "m10-integration",
    application,
    productionBuild: "passed",
    migrations: "current",
    storyFamilies: STORY_FAMILIES.map(({ id, story }) => ({ id, story })),
    stripe: {
      environment: "test",
      livemode: false,
      hostedCheckoutContract: "verified",
      signedWebhook: "verified",
      fulfillment: "exactly-once",
      replay: "idempotent",
      liveEvent: "zero-write",
      invalidSignature: "zero-write",
      accountEvidence: "visible",
      protectedAccess: "visible-after-entitlement",
      administrationEvidence: "visible",
      statement: "No real payment will be accepted.",
    },
    securityHeaders,
    clientArtifact,
    recovery: {
      checksums: "verified",
      applicationD1Restore: "rehearsed-in-memory",
      semanticFingerprint: "equivalent",
      foreignKeyViolations: 0,
    },
    cleanup: {
      runtimeLabsRestored: true,
      retainedVerificationRows: 0,
      r2ObjectsTouched: 0,
      mediaBytesCreated: 0,
      temporaryFilesCreated: 0,
      externalCalls: 0,
    },
  };
}

if (process.argv.includes("--describe")) {
  process.stdout.write(`${JSON.stringify(describeGate())}\n`);
} else {
  runGate()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : "Milestone 10 integration failed."}\n`,
      );
      process.exitCode = 1;
    });
}
