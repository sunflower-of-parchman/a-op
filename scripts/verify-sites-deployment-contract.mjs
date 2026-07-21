import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactMode = process.argv.includes("--artifact");
const expectedShaIndex = process.argv.indexOf("--expected-sha");
const expectedSha =
  expectedShaIndex === -1 ? null : process.argv[expectedShaIndex + 1];

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function source(path) {
  return readFile(resolve(root, path), "utf8");
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(resolve(root, path)))
    .digest("hex");
}

const sourceSha = git("rev-parse", "HEAD");
assert.match(sourceSha, /^[0-9a-f]{40}$/, "Git HEAD is not a full commit SHA.");
assert.equal(
  git("branch", "--show-current"),
  "main",
  "Sites releases must start from main.",
);
assert.equal(
  git("status", "--porcelain", "--untracked-files=all"),
  "",
  "Sites releases require a clean checkout. Stop instead of modifying source during deployment.",
);
assert.equal(
  git("rev-parse", "origin/main"),
  sourceSha,
  "HEAD must equal origin/main. Push the approved commit before preparing a Sites release.",
);
if (expectedSha !== null) {
  assert.match(
    expectedSha,
    /^[0-9a-f]{40}$/,
    "--expected-sha must be a full Git SHA.",
  );
  assert.equal(
    sourceSha,
    expectedSha,
    "The source commit changed during release preparation.",
  );
}

const trackedPaths = new Set(git("ls-files").split("\n"));
for (const forbidden of ["app/site.tsx", "app/site.jsx", "app/site.js"]) {
  assert.equal(
    trackedPaths.has(forbidden),
    false,
    `Substitute Site entry point ${forbidden} is forbidden.`,
  );
}

const requiredSourceContracts = [
  {
    path: "app/(public)/membership/page.tsx",
    patterns: [
      /export default async function MembershipPage/,
      /requirePublicModulePresentation\(env\.DB, "memberships"\)/,
      /<MembershipLanding/,
    ],
  },
  {
    path: "components/memberships/MembershipLanding.tsx",
    patterns: [/No membership is published\./],
  },
  {
    path: "app/(public)/music/page.tsx",
    patterns: [/readPublicMusicIndex\(env\.DB, query\)/],
  },
  {
    path: "app/(public)/licensing/page.tsx",
    patterns: [/listActiveLicenseOffers\(env\.DB\)/],
  },
];

for (const contract of requiredSourceContracts) {
  assert.ok(
    trackedPaths.has(contract.path),
    `Required route source ${contract.path} is not tracked.`,
  );
  const contents = await source(contract.path);
  for (const pattern of contract.patterns) {
    assert.match(
      contents,
      pattern,
      `${contract.path} no longer satisfies ${pattern}.`,
    );
  }
}

const hosting = JSON.parse(await source(".openai/hosting.json"));
assert.equal(hosting.d1, "DB", "The Sites D1 binding must remain DB.");
assert.equal(hosting.r2, "MEDIA", "The Sites R2 binding must remain MEDIA.");
assert.deepEqual(
  Object.keys(hosting).sort(),
  Object.hasOwn(hosting, "project_id")
    ? ["d1", "project_id", "r2"]
    : ["d1", "r2"],
  ".openai/hosting.json may contain only project_id, d1, and r2.",
);

const migrationNames = (await readdir(resolve(root, "drizzle")))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
assert.equal(
  migrationNames.length,
  36,
  "The release must contain exactly 36 source migrations.",
);
for (const [index, name] of migrationNames.entries()) {
  assert.equal(
    name.slice(0, 4),
    String(index).padStart(4, "0"),
    `Migration sequence breaks at ${name}.`,
  );
}

const journal = JSON.parse(await source("drizzle/meta/_journal.json"));
assert.deepEqual(
  journal.entries.map(({ idx }) => idx),
  migrationNames.map((_, index) => index),
  "The Drizzle journal indexes do not match migrations 0000 through 0035.",
);
assert.deepEqual(
  journal.entries.map(({ tag }) => `${tag}.sql`),
  migrationNames,
  "The Drizzle journal tags do not match the checked-in migration files.",
);

let workerSha256 = null;
if (artifactMode) {
  const [worker, packagedHosting, packagedMigrationNames] = await Promise.all([
    source("dist/server/index.js"),
    source("dist/.openai/hosting.json"),
    readdir(resolve(root, "dist/.openai/drizzle")),
  ]);
  assert.deepEqual(
    JSON.parse(packagedHosting),
    hosting,
    "The packaged Sites bindings differ from the validated source bindings.",
  );
  assert.deepEqual(
    packagedMigrationNames
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort(),
    migrationNames,
    "The packaged migration set differs from the validated source set.",
  );
  assert.equal(
    await source("dist/.openai/drizzle/meta/_journal.json"),
    await source("drizzle/meta/_journal.json"),
    "The packaged Drizzle journal differs from the validated source journal.",
  );
  for (const header of [
    "content-security-policy",
    "frame-ancestors 'none'",
    "x-content-type-options",
    "permissions-policy",
    "payment=()",
    "private, no-store",
  ]) {
    assert.ok(worker.includes(header), `The Worker is missing ${header}.`);
  }
  workerSha256 = await sha256("dist/server/index.js");
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    sourceSha,
    sourceTreeClean: true,
    branch: "main",
    originMainMatches: true,
    bindings: { d1: "DB", r2: "MEDIA" },
    migrations: migrationNames.length,
    firstMigration: migrationNames[0],
    lastMigration: migrationNames.at(-1),
    neutralRoutes: ["/", "/music", "/membership", "/licensing"],
    workerSha256,
  })}\n`,
);
