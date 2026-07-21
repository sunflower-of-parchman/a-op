import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Sites release preparation fails closed around one clean main artifact", async () => {
  const [verifier, runner, packageJson, contract, agents] = await Promise.all([
    source("scripts/verify-sites-deployment-contract.mjs"),
    source("scripts/prepare-sites-release.sh"),
    source("package.json"),
    source("docs/architecture/sites-release-contract.md"),
    source("AGENTS.md"),
  ]);

  assert.match(verifier, /git\("branch", "--show-current"\)/);
  assert.match(
    verifier,
    /git\("status", "--porcelain", "--untracked-files=all"\)/,
  );
  assert.match(verifier, /git\("rev-parse", "origin\/main"\)/);
  assert.match(verifier, /Substitute Site entry point/);
  assert.match(verifier, /app\/\(public\)\/membership\/page\.tsx/);
  assert.match(verifier, /requirePublicModulePresentation/);
  assert.match(verifier, /dist\/server\/index\.js/);
  assert.match(verifier, /dist\/\.openai\/hosting\.json/);
  assert.match(verifier, /dist\/\.openai\/drizzle\/meta\/_journal\.json/);
  assert.match(verifier, /createHash\("sha256"\)/);

  const ci = runner.indexOf("npm ci");
  const build = runner.indexOf("npm run build");
  const artifact = runner.indexOf("--artifact");
  assert.ok(ci > runner.indexOf("verify-sites-deployment-contract.mjs"));
  assert.ok(build > ci);
  assert.ok(artifact > build);
  assert.match(runner, /set -euo pipefail/);

  assert.match(packageJson, /"prepare:sites-release"/);
  assert.match(contract, /Any failure is terminal/);
  assert.match(contract, /No membership is published\./);
  assert.match(agents, /npm run prepare:sites-release/);
});
