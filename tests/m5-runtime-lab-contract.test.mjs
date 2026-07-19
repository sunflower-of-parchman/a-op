import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/runtime-lab/m5/route.ts", import.meta.url),
  "utf8",
);
const verifier = await readFile(
  new URL("../scripts/verify-m5-runtime.mjs", import.meta.url),
  "utf8",
);

test("the Milestone 5 runtime laboratory is explicit, local, and production-off", () => {
  assert.match(route, /resolveSimulationMode\(/);
  assert.match(route, /function requireLab\(\)/);
  assert.match(route, /if \(!runtimeLabEnabled\(\)\) unavailable\(\)/);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireExactObject\(value, \["action"\]\)/);
  assert.match(route, /requireExactObject\(value, \["runId"\]\)/);
  assert.match(verifier, /AOP_ENABLE_RUNTIME_LAB = "1"/);
  assert.match(verifier, /delete environment\.AOP_ENABLE_RUNTIME_LAB/);
  assert.match(verifier, /"--strictPort"/);
  assert.match(verifier, /startServer\(\{ runtimeLab: false \}\)/);
  assert.match(verifier, /"\/api\/runtime-lab\/m5",\s*404/);
});

test("the laboratory seeds only fictional principals and protected track metadata", () => {
  assert.match(route, /m5-customer-\$\{shortId\}@a-op\.invalid/);
  assert.match(route, /Fictional M5 Customer/);
  assert.match(route, /Fictional protected track/);
  assert.match(
    route,
    /'protected', 'unavailable',[\s\S]*?'unavailable', '\[\]'/,
  );
  assert.doesNotMatch(
    route,
    /R2Bucket|media_objects|media_derivatives|object_key|FormData|FileReader|\.put\(/i,
  );
  assert.doesNotMatch(
    `${route}\n${verifier}`,
    /screenshot|imagegen|<img|\.png|\.jpe?g|\.gif|\.webp|mkdtemp|tmpdir/i,
  );
});

test("the HTTP journey uses the real owner, account, plan, grant, and protected-view surfaces", () => {
  assert.match(verifier, /"\/admin\/access", 404/);
  assert.match(verifier, /"\/admin\/access", 200/);
  assert.match(verifier, /"\/api\/admin\/access", 401/);
  assert.match(verifier, /"\/api\/admin\/access", 403/);
  assert.match(verifier, /"\/api\/admin\/access\/plans"/);
  assert.match(verifier, /"\/api\/admin\/access\/grants"/);
  assert.match(verifier, /\/revoke`/);
  assert.match(verifier, /"\/account\/access"/);
  assert.match(verifier, /`\/music\/tracks\/\$\{run\.trackSlug\}`/);
  assert.match(verifier, /createReplay\.replayed, true/);
  assert.match(verifier, /issueReplay\.replayed, true/);
  assert.match(verifier, /revokeReplay\.replayed, true/);
  assert.match(verifier, /No protected resources are available\./);
  assert.match(verifier, /"Grant history"/);
  assert.match(verifier, /"Entitlement history"/);
});

test("cleanup removes every run row and proves the pre-run table counts returned", () => {
  for (const table of [
    "entitlements",
    "access_grants",
    "access_grant_sets",
    "access_plans",
    "audit_events",
    "tracks",
    "users",
    "runtime_proofs",
  ]) {
    assert.match(route, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(route, /readTableCounts\(\)/);
  assert.match(
    route,
    /countsEqual\(restoredCounts, snapshot\.baselineCounts\)/,
  );
  assert.match(route, /retainedVerificationRows !== 0/);
  assert.match(verifier, /retainedVerificationRows: 0/);
  assert.match(verifier, /baselineCountsRestored: true/);
  assert.match(verifier, /r2ObjectsTouched: 0/);
  assert.match(verifier, /temporaryFilesCreated: 0/);
});

test("the laboratory and journey contain no payment-card or external-publication surface", () => {
  const combined = `${route}\n${verifier}`;
  assert.doesNotMatch(
    combined,
    /cardNumber|card_number|cvc|cvv|expiryMonth|payment_method_data/i,
  );
  assert.doesNotMatch(
    combined,
    /sites-hosting|deploy|custom domain|dns|sendmail|slack|social media/i,
  );
});
