import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/runtime-lab/m9/route.ts", import.meta.url),
  "utf8",
);
const verifier = await readFile(
  new URL("../scripts/verify-m9-runtime.mjs", import.meta.url),
  "utf8",
);
const combined = `${route}\n${verifier}`;

test("the Milestone 9 laboratory is explicit, same-origin, exact-input, and production-off", () => {
  assert.match(route, /resolveSimulationMode\(/);
  assert.match(route, /function requireLab\(\)/);
  assert.match(route, /if \(!runtimeLabEnabled\(\)\) unavailable\(\)/);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireExactObject\(value, \["action"\]\)/);
  assert.match(route, /requireExactObject\(value, \["runId"\]\)/);
  assert.match(verifier, /AOP_ENABLE_RUNTIME_LAB = "1"/);
  assert.match(verifier, /"--strictPort"/);
  assert.match(verifier, /startServer\(\{ runtimeLab: false \}\)/);
  assert.match(verifier, /"\/api\/runtime-lab\/m9",\s*404/);
});

test("the setup journey uses fictional metadata and exact captured D1 baselines", () => {
  assert.match(route, /m9-owner-\$\{shortId\}@a-op\.invalid/);
  assert.match(route, /Fictional M9 Owner/);
  assert.match(route, /Fictional M9 Artist/);
  assert.match(route, /baselineCounts/);
  assert.match(route, /baselineSourceFingerprint/);
  for (const state of [
    "artistConfig",
    "artistModules",
    "moduleRegistryState",
    "navigationSets",
    "legalDocuments",
    "contactForms",
    "telemetrySettings",
    "setupState",
  ]) {
    assert.match(route, new RegExp(state));
  }
  assert.doesNotMatch(
    route,
    /R2Bucket|env\.MEDIA|\.put\(|FormData|FileReader|playwright|screenshot/i,
  );
  assert.doesNotMatch(
    verifier,
    /env\.MEDIA|\.put\(|FormData|FileReader|playwright|screenshot/i,
  );
});

test("real HTTP preview, exact apply, public and admin rendering, and replay are exercised", () => {
  for (const surface of [
    "/api/admin/setup",
    "/api/admin/setup/preview",
    "/api/admin/setup/apply",
    "/music",
    "/courses",
    "/videos",
    "/contact",
    "/admin/artist",
    "/admin/music",
    "/admin/access",
    "/admin/memberships",
    "/admin/licensing",
    "/admin/courses",
    "/admin/videos",
    "/admin/contact",
    "/admin/editors",
    "/admin/legal",
    "/admin/setup",
  ]) {
    assert.match(verifier, new RegExp(surface.replaceAll("/", "\\/")));
  }
  assert.match(verifier, /expectHtml\("\/", 200/);
  assert.match(verifier, /proposalOnlyPreview\.plan\.writesPerformed, 0/);
  assert.match(verifier, /approvedPreview\.plan\.operations\.length, 15/);
  assert.match(
    verifier,
    /afterPreview\.currentCounts, beforePreview\.currentCounts/,
  );
  assert.match(
    verifier,
    /afterReplay\.currentCounts, afterApply\.currentCounts/,
  );
  assert.match(verifier, /afterReplay\.artifacts, afterApply\.artifacts/);
  assert.match(verifier, /setupReceipts, 15/);
  assert.match(verifier, /assertAppliedDefinitions\(run, afterApply\)/);
  assert.match(verifier, /afterReplay\.definitions, afterApply\.definitions/);
  assert.match(verifier, /mediaObjects, 0/);
  assert.match(verifier, /mediaJobs, 0/);
});

test("all fourteen topics carry non-empty local definitions without media bytes", () => {
  for (const definition of [
    /activeModules:\s*\[/,
    /rightsStatement: run\.rightsStatement/,
    /trackKey: run\.trackKey/,
    /streaming: "disabled"/,
    /grantKey: run\.grantKey/,
    /membershipPlanKey: run\.membershipPlanKey/,
    /downloadCreditRules:\s*\[/,
    /licenseCreditRules:\s*\[/,
    /termsKey: run\.licenseTermsKey/,
    /courseKey: run\.courseKey/,
    /lessonKey: run\.lessonKey/,
    /mediaKeys: \[\]/,
    /externalEmbedUrl: `https:\/\/video\.example\.invalid/,
    /consentRequired: true/,
    /collectionMode: "consent-required"/,
    /artistReviewRequired: true/,
    /editorAccountAliases:\s*\[/,
  ]) {
    assert.match(verifier, definition);
  }
  assert.match(verifier, /mediaKey: null/);
  assert.match(verifier, /publication:\s*\{[\s\S]*catalog: "draft"/);
  assert.match(verifier, /content: "publish"/);
  assert.match(route, /readRunDefinitions/);
  assert.match(route, /membership_credit_rules/);
  assert.match(route, /commerce_binding_intents/);
  assert.match(route, /video_transcripts/);
  assert.match(route, /contact_consent_versions/);
});

test("Stripe Test Mode remains visible throughout setup without a live path", () => {
  assert.match(combined, /stripe-test-simulation/);
  assert.match(combined, /Stripe Test Mode/);
  assert.match(combined, /No real payment will be accepted\./);
  assert.match(combined, /stripeEnvironment: "test"/);
  assert.match(combined, /livemode: false/);
  assert.match(verifier, /journey: "active"/);
  assert.match(verifier, /pk_test_m9_runtime_fictional_publishable/);
  assert.match(verifier, /sk_test_m9_runtime_fictional_secret/);
  assert.match(verifier, /whsec_m9_runtime_fictional_signature/);
  assert.doesNotMatch(
    combined,
    /pk_live_|sk_live_|livemode:\s*true|stripeEnvironment:\s*"live"/,
  );
});

test("export verification and the disposable in-memory restore prove portable semantics", () => {
  assert.match(verifier, /\/api\/admin\/setup\/export"/);
  assert.match(verifier, /\/api\/admin\/setup\/export\/verify"/);
  assert.match(verifier, /a-op\.artist-installation-export/);
  assert.match(verifier, /manifest\.entries\.every/);
  assert.match(verifier, /for \(const exportedDefinition of \[/);
  assert.match(verifier, /run\.grantKey/);
  assert.match(verifier, /run\.licenseOptionKey/);
  assert.match(verifier, /run\.lessonKey/);
  assert.match(
    verifier,
    /rehearseArtistExportBytesInMemory\(exported\.bytes\)/,
  );
  assert.match(
    verifier,
    /rehearsal\.restoredSemanticFingerprint,\s*rehearsal\.semanticFingerprint/,
  );
  assert.match(verifier, /rehearsal\.secondPass\.inserted, 0/);
  assert.match(verifier, /rehearsal\.duplicateCount, 0/);
  assert.match(verifier, /commerceBindingState, "pending"/);
});

test("cleanup removes every run-owned row and verifies exact restored state", () => {
  for (const table of [
    "export_manifests",
    "setup_applications",
    "commerce_binding_intents",
    "membership_credit_rules",
    "subscription_plans",
    "membership_plan_revisions",
    "membership_plans",
    "license_options",
    "license_terms_versions",
    "license_terms",
    "videos",
    "courses",
    "access_grant_templates",
    "access_plan_items",
    "access_plans",
    "releases",
    "collections",
    "tracks",
    "contact_consent_versions",
    "contact_forms",
    "legal_document_versions",
    "navigation_items",
    "artist_config_revisions",
    "audit_events",
    "editor_permissions",
    "role_assignments",
    "profiles",
    "users",
    "runtime_proofs",
  ]) {
    assert.match(route, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(
    route,
    /countsEqual\(restoredCounts, snapshot\.baselineCounts\)/,
  );
  assert.match(route, /statesEqual\(restoredState, baseline\)/);
  assert.match(
    route,
    /restoredSource\.fingerprint === snapshot\.baselineSourceFingerprint/,
  );
  assert.match(route, /PRAGMA foreign_key_check/);
  assert.match(verifier, /retainedVerificationRows: 0/);
  assert.match(verifier, /r2Calls: 0/);
  assert.match(verifier, /mediaBytesCreated: 0/);
  assert.match(verifier, /temporaryFilesCreated: 0/);
  assert.match(verifier, /externalCalls: 0/);
});
