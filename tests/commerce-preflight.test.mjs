import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = new URL(
  "../scripts/verify-commerce-boundary.mjs",
  import.meta.url,
);
const baseEnvironment = Object.freeze({
  PATH: process.env.PATH,
  LANG: "C",
});

function run(args = [], environment = {}) {
  return spawnSync(process.execPath, [fileURLToPath(script), ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...baseEnvironment, ...environment },
  });
}

test("neutral validation permits a completely unconfigured fresh installation", () => {
  const result = run(["--allow-missing"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    adapter: "stripe-test-simulation",
    configured: false,
    livemode: false,
  });
});

test("setup preflight clearly fails when test credentials are missing", () => {
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /STRIPE_PUBLISHABLE_KEY is required/);
  assert.doesNotMatch(result.stderr, /undefined|null/);
});

test("setup preflight accepts one complete Stripe Test configuration", () => {
  const result = run([], {
    STRIPE_PUBLISHABLE_KEY: "pk_test_FictionalPreflightKey001",
    STRIPE_SECRET_KEY: "sk_test_FictionalPreflightSecret001",
    STRIPE_WEBHOOK_SECRET: "whsec_FictionalPreflightWebhook001",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    adapter: "stripe-test-simulation",
    configured: true,
    livemode: false,
  });
  assert.doesNotMatch(result.stdout, /FictionalPreflight/);
});

test("every recognized live credential fails commerce activation validation", () => {
  for (const [name, value] of [
    ["STRIPE_PUBLISHABLE_KEY", "pk_live_ForbiddenPreflight001"],
    ["STRIPE_SECRET_KEY", "sk_live_ForbiddenPreflight001"],
    ["STRIPE_WEBHOOK_SECRET", "rk_live_ForbiddenPreflight001"],
  ]) {
    const result = run(["--allow-missing"], { [name]: value });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /recognized live Stripe credential detected/);
    assert.doesNotMatch(result.stderr, /ForbiddenPreflight001/);
  }
});

test("unrelated caller credentials do not become Stripe build inputs", () => {
  const result = run(["--allow-missing"], {
    UNRELATED_PROVIDER_VALUE: ["rk", "live", "FictionalOtherService001"].join(
      "_",
    ),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).configured, false);
  assert.doesNotMatch(result.stdout, /FictionalOtherService001/);
});

test("optional validation reports partial setup while every present wrong prefix fails closed", () => {
  const partial = run(["--allow-missing"], {
    STRIPE_PUBLISHABLE_KEY: "pk_test_FictionalPreflightKey001",
  });
  assert.equal(partial.status, 0, partial.stderr);
  assert.equal(JSON.parse(partial.stdout).configured, false);

  const partialWrong = run(["--allow-missing"], {
    STRIPE_SECRET_KEY: "pk_test_NotASecretPreflight001",
  });
  assert.equal(partialWrong.status, 1);
  assert.match(
    partialWrong.stderr,
    /STRIPE_SECRET_KEY must be a valid sk_test_/,
  );

  const wrong = run(["--allow-missing"], {
    STRIPE_PUBLISHABLE_KEY: "pk_test_FictionalPreflightKey001",
    STRIPE_SECRET_KEY: "pk_test_NotASecretPreflight001",
    STRIPE_WEBHOOK_SECRET: "whsec_FictionalPreflightWebhook001",
  });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /STRIPE_SECRET_KEY must be a valid sk_test_/);
});

test("commerce setup validates ignored local environment values separately from the neutral build", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(packageJson.scripts.build, "bash scripts/build-neutral.sh");
  assert.match(
    packageJson.scripts["commerce:preflight"],
    /--env-file-if-exists=\.env/,
  );
  assert.match(
    packageJson.scripts["commerce:preflight"],
    /verify-commerce-boundary\.mjs/,
  );
});

test("the neutral production build removes caller Stripe values", async () => {
  const source = await readFile(
    new URL("../scripts/build-neutral.sh", import.meta.url),
    "utf8",
  );
  assert.match(source, /unset STRIPE_PUBLISHABLE_KEY/);
  assert.match(source, /unset STRIPE_SECRET_KEY/);
  assert.match(source, /unset STRIPE_WEBHOOK_SECRET/);
  assert.match(source, /verify-commerce-boundary\.mjs --allow-missing/);
  assert.match(source, /vinext build/);
});
