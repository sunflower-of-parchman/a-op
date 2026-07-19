import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const CLIENT_BYTE_BUDGET = 1_500_000;
const JAVASCRIPT_BYTE_BUDGET = 900_000;
const CSS_BYTE_BUDGET = 300_000;
const LARGEST_JAVASCRIPT_BUDGET = 250_000;
const LARGEST_CSS_BUDGET = 150_000;

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else output.push({ path, bytes: (await stat(path)).size });
  }
  return output;
}

function total(entries) {
  return entries.reduce((sum, entry) => sum + entry.bytes, 0);
}

const clientFiles = await files("dist/client");
const javascript = clientFiles.filter((file) => file.path.endsWith(".js"));
const css = clientFiles.filter((file) => file.path.endsWith(".css"));
const sourceMaps = clientFiles.filter((file) => file.path.endsWith(".map"));
const clientBytes = total(clientFiles);
const javascriptBytes = total(javascript);
const cssBytes = total(css);
const largestJavascript = Math.max(...javascript.map((file) => file.bytes));
const largestCss = Math.max(...css.map((file) => file.bytes));

assert.ok(clientFiles.length > 0);
assert.ok(javascript.length > 0);
assert.ok(css.length > 0);
assert.equal(sourceMaps.length, 0);
assert.ok(clientBytes <= CLIENT_BYTE_BUDGET);
assert.ok(javascriptBytes <= JAVASCRIPT_BYTE_BUDGET);
assert.ok(cssBytes <= CSS_BYTE_BUDGET);
assert.ok(largestJavascript <= LARGEST_JAVASCRIPT_BUDGET);
assert.ok(largestCss <= LARGEST_CSS_BUDGET);

const [worker, hosting, packagedHosting] = await Promise.all([
  readFile("dist/server/index.js", "utf8"),
  readFile(".openai/hosting.json", "utf8"),
  readFile("dist/.openai/hosting.json", "utf8"),
]);
assert.equal(packagedHosting, hosting);
assert.match(worker, /content-security-policy/);
assert.match(worker, /frame-ancestors 'none'/);
assert.match(worker, /x-content-type-options/);
assert.match(worker, /permissions-policy/);
assert.match(worker, /payment=\(\)/);
assert.match(worker, /private, no-store/);

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    clientFiles: clientFiles.length,
    clientBytes,
    javascriptBytes,
    cssBytes,
    largestJavascript,
    largestCss,
    sourceMaps: sourceMaps.length,
    securityHeadersPackaged: true,
  })}\n`,
);
