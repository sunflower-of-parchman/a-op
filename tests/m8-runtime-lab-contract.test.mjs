import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/runtime-lab/m8/route.ts", import.meta.url),
  "utf8",
);
const verifier = await readFile(
  new URL("../scripts/verify-m8-runtime.mjs", import.meta.url),
  "utf8",
);
const combined = `${route}\n${verifier}`;

test("the Milestone 8 runtime laboratory is explicit, local, and production-off", () => {
  assert.match(route, /resolveSimulationMode\(/);
  assert.match(route, /function requireLab\(\)/);
  assert.match(route, /if \(!runtimeLabEnabled\(\)\) unavailable\(\)/);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireExactObject\(value, \["action"\]\)/);
  assert.match(route, /requireExactObject\(value, \["runId"\]\)/);
  assert.match(verifier, /AOP_ENABLE_RUNTIME_LAB = "1"/);
  assert.match(verifier, /"--strictPort"/);
  assert.match(verifier, /startServer\(\{ runtimeLab: false \}\)/);
  assert.match(verifier, /"\/api\/runtime-lab\/m8",\s*404/);
});

test("the laboratory owns isolated fictional metadata and exact mutable baselines", () => {
  assert.match(route, /m8-owner-\$\{shortId\}@a-op\.invalid/);
  assert.match(route, /m8-customer-\$\{shortId\}@a-op\.invalid/);
  assert.match(route, /Fictional M8 Owner/);
  assert.match(route, /Fictional M8 Customer/);
  assert.match(route, /Fictional privacy notice/);
  assert.match(route, /baselineCounts: await readTableCounts\(\)/);
  assert.match(route, /baselineModule: await readModuleState\(\)/);
  assert.match(
    route,
    /baselineTelemetrySettings: await readTelemetrySettingsState\(\)/,
  );
  assert.match(
    route,
    /baselineLegalDocument: await readLegalDocumentState\(\)/,
  );
  assert.match(route, /'application\/octet-stream', 0, 'failed'/);
  assert.doesNotMatch(
    route,
    /R2Bucket|env\.MEDIA|\.put\(|FormData|FileReader/i,
  );
});

test("the HTTP journey drives real operations, telemetry, and legal surfaces", () => {
  for (const surface of [
    "/api/admin/operations",
    "/admin/operations",
    "/api/telemetry",
    "/api/telemetry/consent",
    "/api/telemetry/events",
    "/admin/telemetry",
    "/api/admin/legal/",
    "/admin/legal/",
  ]) {
    assert.match(verifier, new RegExp(surface.replaceAll("/", "\\/")));
  }
  assert.match(verifier, /"music-view"/);
  assert.match(verifier, /"consent-required"/);
  assert.match(verifier, /"LEGAL_APPROVAL_REQUIRED"/);
  assert.match(verifier, /"Exact draft approved"/);
  assert.match(verifier, /"Version history"/);
  assert.match(verifier, /"Stripe Test Mode"/);
  assert.match(verifier, /"No real payment will be accepted"/);
  assert.match(verifier, /"AUTHENTICATION_REQUIRED"/);
  assert.match(verifier, /"ROLE_REQUIRED"/);
});

test("operations evidence proves failed media health and a redacted audit projection", () => {
  assert.match(route, /FICTIONAL_MEDIA_PROCESSING_FAILED/);
  assert.match(route, /INSERT INTO operational_failures/);
  assert.match(route, /INSERT INTO media_jobs/);
  assert.match(route, /INSERT INTO audit_events/);
  assert.match(verifier, /body\.result\.media\.status, "attention"/);
  assert.match(verifier, /body\.result\.jobs\.status, "attention"/);
  assert.match(verifier, /\\\[REDACTED\\\]/);
  assert.match(
    verifier,
    /assert\.doesNotMatch\(text, new RegExp\(run\.auditMarker\)\)/,
  );
  assert.match(verifier, /body\.result\.storage\.objectCount >= 0/);
});

test("cleanup removes run-scoped rows and restores counts, module, settings, and legal state", () => {
  for (const table of [
    "legal_document_versions",
    "telemetry_events",
    "audit_events",
    "operational_failures",
    "media_jobs",
    "media_objects",
    "role_assignments",
    "profiles",
    "users",
    "runtime_proofs",
  ]) {
    assert.match(route, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(route, /UPDATE legal_documents/);
  assert.match(route, /UPDATE telemetry_settings/);
  assert.match(route, /UPDATE artist_modules/);
  assert.match(
    route,
    /countsEqual\(restoredCounts, snapshot\.baselineCounts\)/,
  );
  assert.match(verifier, /retainedVerificationRows: 0/);
  assert.match(verifier, /baselineCountsRestored: true/);
  assert.match(verifier, /moduleStateRestored: true/);
  assert.match(verifier, /telemetrySettingsRestored: true/);
  assert.match(verifier, /legalDocumentRestored: true/);
  assert.match(verifier, /r2ObjectsTouched: 0/);
  assert.match(verifier, /mediaBytesCreated: 0/);
  assert.match(verifier, /temporaryFilesCreated: 0/);
});

test("the runtime proof contains no payment fields, media assets, temporary files, or external calls", () => {
  assert.doesNotMatch(
    combined,
    /cardNumber|card_number|cvc|cvv|expiryMonth|payment_method_data/i,
  );
  assert.doesNotMatch(combined, /\b(?:pk|sk|rk)_(?:test|live)_/i);
  assert.doesNotMatch(combined, /\bwhsec_/i);
  assert.doesNotMatch(
    combined,
    /screenshot|imagegen|<img|\.png|\.jpe?g|\.gif|\.webp/i,
  );
  assert.doesNotMatch(
    combined,
    /mkdtemp|writeFile|appendFile|createWriteStream/i,
  );
  assert.doesNotMatch(verifier, /fetch\(\s*["'`]https?:\/\//i);
  assert.doesNotMatch(
    combined,
    /sites-hosting|custom domain|dns|sendmail|slack|social media/i,
  );
});
