import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const SOURCE_DIRECTORIES = ["app", "components", "db", "lib", "worker"];
const SOURCE_EXTENSION = /\.(?:ts|tsx|js|mjs)$/;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (SOURCE_EXTENSION.test(entry.name)) files.push(path);
  }
  return files;
}

const files = (await Promise.all(SOURCE_DIRECTORIES.map(sourceFiles))).flat();
const sources = new Map(
  await Promise.all(
    files.map(async (file) => [file, await readFile(file, "utf8")]),
  ),
);

test("runtime source contains no executable-content or dynamic-code escape hatch", () => {
  const forbidden = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /insertAdjacentHTML/,
    /document\.write/,
    /createContextualFragment/,
    /\beval\s*\(/,
    /new Function\s*\(/,
    /setTimeout\s*\(\s*["']/,
    /setInterval\s*\(\s*["']/,
    /allowDangerousHtml|rehype-raw|sanitize\s*:\s*false/,
  ];

  for (const [file, source] of sources) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} matched ${pattern}`);
    }
  }

  const htmlEscapes = [...sources.entries()].filter(([, source]) =>
    source.includes("dangerouslySetInnerHTML"),
  );
  assert.deepEqual(
    htmlEscapes.map(([file]) => file),
    ["app/layout.tsx"],
  );
  assert.equal(
    (
      htmlEscapes[0][1].match(
        /dangerouslySetInnerHTML=\{\{ __html: themeBootstrap \}\}/g,
      ) ?? []
    ).length,
    1,
  );
});

test("browser persistence stores only the non-sensitive theme preference", () => {
  const storageUsers = [...sources.entries()].filter(([, source]) =>
    /localStorage|sessionStorage/.test(source),
  );
  assert.deepEqual(storageUsers.map(([file]) => file).sort(), [
    "app/layout.tsx",
    "components/ui/ThemeToggle.tsx",
  ]);
  for (const [file, source] of storageUsers) {
    const storageLines = source
      .split("\n")
      .filter((line) => /localStorage|sessionStorage/.test(line));
    assert.equal(storageLines.length > 0, true);
    assert.doesNotMatch(source, /sessionStorage/);
    if (file === "app/layout.tsx") {
      assert.deepEqual(
        storageLines.map((line) => line.trim()),
        ['const stored = localStorage.getItem("aop-theme");'],
      );
    } else {
      assert.match(source, /const STORAGE_KEY = "aop-theme"/);
      assert.deepEqual(
        storageLines.map((line) => line.trim()),
        [
          "const storedTheme = window.localStorage.getItem(STORAGE_KEY);",
          "window.localStorage.setItem(STORAGE_KEY, nextTheme);",
        ],
      );
    }
  }
});

test("the consent-gated external player stays sandboxed and receives no broad browser authority", () => {
  const source = sources.get("components/video/ExternalVideoConsent.tsx");
  assert.ok(source);
  assert.match(source, /if \(!consented\)/);
  assert.match(
    source,
    /sandbox="allow-scripts allow-same-origin allow-presentation"/,
  );
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(source, /allow-top-navigation|allow-popups|allow-forms/);

  const iframeUsers = [...sources.entries()].filter(([, value]) =>
    /<iframe\b/.test(value),
  );
  assert.deepEqual(
    iframeUsers.map(([file]) => file),
    ["components/video/ExternalVideoConsent.tsx"],
  );
});

test("auth, payment, and provider secrets cannot be exposed through public build variables", () => {
  for (const [file, source] of sources) {
    assert.doesNotMatch(
      source,
      /(?:NEXT_PUBLIC|VITE|PUBLIC)_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|STRIPE|AUTH|KEY)/,
      `${file} declares a secret-shaped public variable`,
    );
    assert.doesNotMatch(source, /postMessage\s*\([^,]+,\s*["']\*["']/);
  }
});

test("the Worker applies the repository-owned security policy to application and image responses", () => {
  const worker = sources.get("worker/index.ts");
  const policy = sources.get("lib/security/response-headers.ts");
  assert.ok(worker);
  assert.ok(policy);
  assert.equal(
    (worker.match(/applyResponseSecurityHeaders\(/g) ?? []).length,
    2,
  );
  for (const required of [
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-resource-policy",
    "strict-transport-security",
  ]) {
    assert.match(policy, new RegExp(required));
  }
});

test("the dependency graph is locked and production dependencies use exact versions", async () => {
  const [manifest, lock] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("package-lock.json", "utf8").then(JSON.parse),
  ]);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[""].name, "a-op");
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
    assert.equal(lock.packages[""].dependencies[name], version);
  }
});
