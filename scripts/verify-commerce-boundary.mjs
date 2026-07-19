import { readFile } from "node:fs/promises";

const allowMissing = process.argv.includes("--allow-missing");
const LIVE_CREDENTIAL = /^[\t ]*[a-z][a-z0-9]{1,15}_live_/i;
const TEST_PUBLISHABLE_KEY = /^pk_test_[A-Za-z0-9]{8,}$/;
const TEST_SECRET_KEY = /^sk_test_[A-Za-z0-9]{8,}$/;
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9]{8,}$/;
const REQUIRED = Object.freeze([
  ["STRIPE_PUBLISHABLE_KEY", TEST_PUBLISHABLE_KEY, "pk_test_"],
  ["STRIPE_SECRET_KEY", TEST_SECRET_KEY, "sk_test_"],
  ["STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET, "whsec_"],
]);

function fail(message) {
  process.stderr.write(`Stripe Test Mode preflight failed: ${message}\n`);
  process.exitCode = 1;
}

for (const [name, value] of Object.entries(process.env)) {
  if (typeof value === "string" && LIVE_CREDENTIAL.test(value)) {
    fail(`recognized live Stripe credential detected in ${name}.`);
    break;
  }
}

if (process.exitCode !== 1) {
  const present = REQUIRED.filter(([name]) => process.env[name] !== undefined);
  if (allowMissing) {
    for (const [name, pattern, expectedPrefix] of REQUIRED) {
      const value = process.env[name];
      if (value === undefined) continue;
      if (
        typeof value !== "string" ||
        value.trim() !== value ||
        !pattern.test(value)
      ) {
        fail(`${name} must be a valid ${expectedPrefix} Stripe Test value.`);
        break;
      }
    }
    if (process.exitCode !== 1) {
      process.stdout.write(
        `${JSON.stringify({ adapter: "stripe-test-simulation", configured: present.length === REQUIRED.length, livemode: false })}\n`,
      );
    }
  } else {
    for (const [name, pattern, expectedPrefix] of REQUIRED) {
      const value = process.env[name];
      if (typeof value !== "string" || value.length === 0) {
        fail(`${name} is required for the simulated commerce journey.`);
        break;
      }
      if (value.trim() !== value || !pattern.test(value)) {
        fail(`${name} must be a valid ${expectedPrefix} Stripe Test value.`);
        break;
      }
    }
    if (process.exitCode !== 1) {
      process.stdout.write(
        `${JSON.stringify({ adapter: "stripe-test-simulation", configured: true, livemode: false })}\n`,
      );
    }
  }
}

if (process.exitCode !== 1) {
  const [environmentSource, hostingSource] = await Promise.all([
    readFile(
      new URL("../lib/commerce/environment.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  if (
    !environmentSource.includes(
      'SITES_COMMERCE_ADAPTER = "stripe-test-simulation"',
    ) ||
    environmentSource.includes("stripe-live")
  ) {
    fail("the Sites commerce adapter is not permanently test-locked.");
  }
  const hosting = JSON.parse(hostingSource);
  if (
    Object.keys(hosting).some((key) => /stripe|payment|commerce/i.test(key))
  ) {
    fail("commerce credentials must not be declared in hosting.json.");
  }
}
