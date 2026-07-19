import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const verifierPath = "scripts/verify-m10-integration.mjs";

test("the M10 descriptor covers all ten stories in one test-locked application", () => {
  const result = spawnSync(process.execPath, [verifierPath, "--describe"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const description = JSON.parse(result.stdout);
  assert.equal(description.status, "ready");
  assert.equal(description.gate, "m10-integration");
  assert.equal(description.application, "a-op");
  assert.deepEqual(
    description.storyFamilies.map(({ id }) => id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(
    new Set(description.storyFamilies.map(({ story }) => story)).size,
    10,
  );
  assert.equal(
    description.storyFamilies.every(
      ({ evidence }) => Array.isArray(evidence) && evidence.length > 0,
    ),
    true,
  );
  assert.deepEqual(description.runtimeLabs, ["m2", "m5", "m6", "m8", "m9"]);
  assert.ok(description.contractTestCount >= 30);
  assert.equal(description.stripeEnvironment, "test");
  assert.equal(description.livemode, false);
  assert.equal(description.statement, "No real payment will be accepted.");
  assert.deepEqual(description.safety, {
    externalCalls: 0,
    realStripeSessions: 0,
    deployments: 0,
    screenshots: 0,
    temporaryAssets: 0,
    mediaFilesCreated: 0,
    sourceR2ObjectsCreated: 0,
    environmentFilesInspected: 0,
  });
});

test("the gate composes current build, migration, story, runtime, security, Stripe, cleanup, and recovery evidence", async () => {
  const source = await readFile(verifierPath, "utf8");
  for (const script of [
    "scripts/verify-runtime-artifact.mjs",
    "scripts/verify-m2-runtime.mjs",
    "scripts/verify-m5-runtime.mjs",
    "scripts/verify-m6-runtime.mjs",
    "scripts/verify-m8-runtime.mjs",
    "scripts/verify-m9-runtime.mjs",
  ]) {
    assert.match(source, new RegExp(script.replaceAll(".", "\\.")));
  }
  for (const testPath of [
    "tests/catalog-integration.test.mjs",
    "tests/customer-library-integration.test.mjs",
    "tests/access-delivery-integration.test.mjs",
    "tests/commerce-recurring-fulfillment-integration.test.mjs",
    "tests/commerce-license-fulfillment-integration.test.mjs",
    "tests/course-integration.test.mjs",
    "tests/video-updates-integration.test.mjs",
    "tests/contact-integration.test.mjs",
    "tests/telemetry-integration.test.mjs",
    "tests/legal-document-integration.test.mjs",
    "tests/operations-integration.test.mjs",
    "tests/portability-d1-export.test.mjs",
    "tests/m10-interface-contract.test.mjs",
  ]) {
    assert.match(source, new RegExp(testPath.replaceAll(".", "\\.")));
  }

  assert.match(source, /args: \["build"\]/);
  assert.match(source, /"d1",\s*"migrations",\s*"apply"/);
  assert.match(source, /content-security-policy/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /payment=\\\(\\\)/);
  assert.match(source, /MAX_CLIENT_ARTIFACT_BYTES/);
  assert.match(source, /invoiceEvent, "fulfilled-once"/);
  assert.match(source, /replay, "idempotent"/);
  assert.match(source, /liveEvent, "rejected-before-write"/);
  assert.match(source, /invalidSignature, "rejected-before-write"/);
  assert.match(source, /protectedTrack, "visible-after-entitlement"/);
  assert.match(source, /customerEvidence, "visible"/);
  assert.match(source, /ownerEvidence, "visible"/);
  assert.match(source, /foreignKeyViolationCount, 0/);
  assert.match(source, /r2ObjectsTouched, 0/);
  assert.match(source, /mediaBytesCreated, 0/);
  assert.match(source, /temporaryFilesCreated, 0/);
  assert.match(source, /externalCalls, 0/);

  assert.doesNotMatch(source, /(?:--env-file|["']\.env(?:["'/]|$))/);
  assert.doesNotMatch(source, /https:\/\//);
  assert.doesNotMatch(source, /\b(?:writeFile|mkdtemp|mkdir|rmSync|unlink)\b/);
  assert.doesNotMatch(source, /\b(?:screenshot|imagegen)\b/i);
  assert.doesNotMatch(source, /(?:MEDIA|R2Bucket)\.put\s*\(/);
  assert.doesNotMatch(source, /sites:sites-hosting|deploy(?:ment)?\s+create/i);
});

test("the portability CLI accurately describes migration reads and zero file or media creation", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/aop-portability.mjs", "--help"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reads the checked-in migrations/i);
  assert.match(result.stdout, /uses only in-memory D1/i);
  assert.match(result.stdout, /creates no files or media/i);
  assert.match(result.stdout, /no R2, publication, or external operation/i);
});
