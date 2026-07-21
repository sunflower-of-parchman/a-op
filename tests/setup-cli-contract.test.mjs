import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(
  new URL("../scripts/aop-setup.mjs", import.meta.url),
);

function run(args, environment = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      LANG: "C",
      ...environment,
    },
  });
}

test("setup preflight is read-only and succeeds without inactive commerce credentials", () => {
  const result = run(["preflight"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "preflight");
  assert.equal(output.writesPerformed, 0);
  assert.equal(output.preflight.ok, true);
  assert.equal(output.preflight.commerce.adapter, "stripe-test-simulation");
  assert.equal(output.preflight.commerce.credentialState, "not-configured");
});

test("production preflight requires one valid owner bootstrap identity without exposing it", () => {
  for (const environment of [
    { AOP_RUNTIME_ENV: "production" },
    {
      AOP_RUNTIME_ENV: "production",
      AOP_OWNER_BOOTSTRAP_EMAIL: "not-an-email-FictionalPrivate",
    },
  ]) {
    const result = run(["preflight"], environment);
    assert.equal(result.status, 1);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.code, "SETUP_OWNER_BOOTSTRAP_CONFIGURATION_MISSING");
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /not-an-email-FictionalPrivate/,
    );
  }

  const approved = run(["preflight"], {
    AOP_RUNTIME_ENV: "production",
    AOP_OWNER_BOOTSTRAP_EMAIL: "approved-owner-FictionalPrivate@example.test",
  });
  assert.equal(approved.status, 0, approved.stderr);
  assert.doesNotMatch(
    approved.stdout,
    /approved-owner-FictionalPrivate@example\.test/,
  );
  const output = JSON.parse(approved.stdout);
  assert.equal(
    output.preflight.checks.find(
      (check) => check.id === "owner-bootstrap-identity",
    )?.status,
    "pass",
  );
});

test("the CLI rejects live credentials without echoing their values", () => {
  const result = run(["preflight"], {
    UNRELATED_VALUE: "pk_live_FictionalCliPrivate001",
  });
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.code, "SETUP_LIVE_CREDENTIAL_REJECTED");
  assert.doesNotMatch(result.stderr, /FictionalCliPrivate/);
});

test("proposal arguments cannot escape ignored setup/proposals", () => {
  const result = run(["preview", "--proposal", "/tmp/proposal.json"]);
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.code, "SETUP_FILE_BOUNDARY_REJECTED");
  assert.doesNotMatch(result.stderr, /\/tmp\/proposal/);
});

test("the setup CLI contains no mutation or hosting execution surface", async () => {
  const source = await readFile(script, "utf8");
  assert.doesNotMatch(
    source,
    /writeFile|appendFile|mkdir|rename|unlink|rmSync/,
  );
  assert.doesNotMatch(
    source,
    /sites-hosting|wrangler\s+(?:deploy|d1)|git\s+(?:add|commit|push)/,
  );
  assert.match(source, /writesPerformed:\s*0/);
  assert.match(source, /help.*preflight.*preview.*check.*diagnose/s);
});
