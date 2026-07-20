import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function responseSource(route) {
  const start = route.indexOf("return apiJson");
  assert.notEqual(start, -1, "route must return its response through apiJson");
  return route.slice(start);
}

const RESPONSE_SECRET_FIELDS =
  /cardNumber|cardCvc|cardExpiry|paymentMethod|clientSecret|privateObjectKey|objectKey|localPath|machinePath|sourcePath|(?:pk|sk)_(?:test|live)_/i;

test("setup administration is owner-only with same-origin, idempotent, bounded mutations", async () => {
  const [
    page,
    readRoute,
    previewRoute,
    applyRoute,
    setupRoute,
    exportRoute,
    verifyRoute,
    mediaRoute,
  ] = await Promise.all([
    source("../app/admin/setup/page.tsx"),
    source("../app/api/admin/setup/route.ts"),
    source("../app/api/admin/setup/preview/route.ts"),
    source("../app/api/admin/setup/apply/route.ts"),
    source("../app/api/admin/setup/setup-route.ts"),
    source("../app/api/admin/setup/export/route.ts"),
    source("../app/api/admin/setup/export/verify/route.ts"),
    source("../app/api/admin/media-publication/route.ts"),
  ]);

  assert.match(page, /hasApplicationRole\(identity, "owner"\)/);
  for (const route of [
    readRoute,
    previewRoute,
    applyRoute,
    exportRoute,
    verifyRoute,
    mediaRoute,
  ]) {
    assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  }

  assert.match(setupRoute, /requireSameOrigin\(request\)/);
  for (const route of [previewRoute, applyRoute]) {
    assert.match(route, /readSetupJsonMutation\(request\)/);
    assert.match(route, /requireMutationObject\(/);
  }
  for (const route of [exportRoute, verifyRoute, mediaRoute]) {
    assert.match(route, /requireSameOrigin\(request\)/);
    assert.match(route, /requireIdempotencyKey\(request\)/);
  }
  assert.match(applyRoute, /requireIdempotencyKey\(request\)/);
  assert.doesNotMatch(previewRoute, /requireIdempotencyKey/);

  assert.match(setupRoute, /MAXIMUM_SETUP_BYTES\s*=\s*1_048_576/);
  assert.match(setupRoute, /content-type/);
  assert.match(setupRoute, /content-length/);
  assert.match(setupRoute, /request\.body\.getReader\(\)/);
  assert.match(setupRoute, /totalBytes > MAXIMUM_SETUP_BYTES/);
  assert.match(setupRoute, /await reader\.cancel\(\)/);
  assert.match(setupRoute, /JSON\.parse\(text\)/);
  assert.match(previewRoute, /\["proposal", "approval", "externalApprovals"\]/);
  assert.match(applyRoute, /\["proposal", "approval", "externalApprovals"\]/);
  assert.match(
    applyRoute,
    /requires a proposal and its separate exact approval/,
  );
  assert.match(previewRoute, /value\.length > 32/);
  assert.match(applyRoute, /value\.length > 32/);
});

test("setup preview fingerprints customer-independent source state and performs zero writes", async () => {
  const [previewRoute, readRoute, sourceState] = await Promise.all([
    source("../app/api/admin/setup/preview/route.ts"),
    source("../app/api/admin/setup/route.ts"),
    source("../db/setup-source-state.ts"),
  ]);

  assert.match(previewRoute, /compileSetupOperationPlan\(/);
  assert.match(previewRoute, /if \(plan\.writesPerformed !== 0\)/);
  assert.match(previewRoute, /zero-write contract/);
  assert.doesNotMatch(
    previewRoute,
    /beginSetupApplication|completeSetupApplication|failSetupApplication|applySetupOperationPlan|createPortableArtistExport|env\.MEDIA|ensureImmutablePublicationObject|\.put\(/,
  );
  assert.doesNotMatch(
    sourceState,
    /\b(?:INSERT|UPDATE|DELETE|REPLACE)\s+(?:INTO|FROM|setup_state)/i,
  );
  assert.doesNotMatch(
    sourceState,
    /\b(?:profiles|favorites|playlists|listening_history|orders|checkout_sessions|commerce_events|entitlements|contact_submissions|telemetry_events|audit_events)\b/i,
  );
  assert.match(
    sourceState,
    /role_assignments WHERE role_key IN \('owner', 'editor'\)/,
  );
  assert.match(sourceState, /canonicalSha256\(rows\)/);
  assert.match(sourceState, /createSourceStateFingerprint\(snapshot\)/);
  assert.match(readRoute, /resourceCount: source\.snapshot\.resources\.length/);
  assert.doesNotMatch(responseSource(readRoute), RESPONSE_SECRET_FIELDS);
  assert.doesNotMatch(responseSource(previewRoute), RESPONSE_SECRET_FIELDS);
});

test("setup apply dispatches only D1 operations and records every other boundary as deferred", async () => {
  const [applyRoute, dispatcher, stateRepository] = await Promise.all([
    source("../app/api/admin/setup/apply/route.ts"),
    source("../db/setup-apply.ts"),
    source("../db/setup-state.ts"),
  ]);

  assert.match(
    applyRoute,
    /plan\.operations\.filter\([\s\S]*operation\.mutationBoundary === "d1"/,
  );
  assert.match(
    applyRoute,
    /plan\.operations[\s\S]*operation\.mutationBoundary !== "d1"[\s\S]*state: "deferred"/,
  );
  assert.match(
    applyRoute,
    /applySetupOperationPlan\([\s\S]*env\.DB,[\s\S]*artifact\.proposal,[\s\S]*d1Plan\(plan\),[\s\S]*context/,
  );
  assert.doesNotMatch(
    applyRoute,
    /env\.MEDIA|createR2|ensureImmutablePublicationObject|child_process|spawn\(|exec\(|git\s|writeFile|mkdtemp|tmpdir|fetch\(/,
  );
  assert.match(dispatcher, /operation\.mutationBoundary !== "d1"/);
  assert.match(dispatcher, /stripeEnvironment: "test"/);
  assert.match(dispatcher, /livemode: false/);
  assert.match(applyRoute, /beginSetupApplication\(/);
  assert.match(applyRoute, /completeSetupApplication\(/);
  assert.match(applyRoute, /failSetupApplication\(/);
  assert.match(stateRepository, /status = 'applied'/);
  assert.match(stateRepository, /status = 'attention_required'/);
  assert.doesNotMatch(responseSource(applyRoute), RESPONSE_SECRET_FIELDS);
});

test("setup UI keeps exact approval and domain Test Mode constraints in an open responsive workspace", async () => {
  const [component, styles, commerceDomain] = await Promise.all([
    source("../components/setup/SetupWorkspace.tsx"),
    source("../components/setup/SetupWorkspace.module.css"),
    source("../lib/commerce/domain.ts"),
  ]);

  assert.match(component, /useRouter\(\)/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(component, /Proposal JSON/);
  assert.match(component, /Approval JSON/);
  assert.match(component, /function exactInput\(\)/);
  assert.match(component, /Preview with zero writes/);
  assert.match(component, /Apply exact approval/);
  assert.match(component, /preview\?\.readyForApply !== true/);
  assert.match(component, /"idempotency-key"/);
  assert.doesNotMatch(component, /CommerceTestModeNotice/);
  assert.match(commerceDomain, /"Stripe Test Mode"/);
  assert.match(commerceDomain, /"No real payment will be accepted\."/);

  assert.match(styles, /\.workspace \{[\s\S]*?display: grid;/);
  assert.match(
    styles,
    /\.section \{[\s\S]*?border-top: 1px solid var\(--slate\);/,
  );
  assert.match(styles, /@media \(max-width: 800px\)/);
  assert.match(styles, /\.editorGrid \{[\s\S]*?grid-template-columns: 1fr;/);
  assert.doesNotMatch(component, /styles\.card|<Card\b/);
  assert.doesNotMatch(styles, /box-shadow/);
  assert.doesNotMatch(
    component,
    /cardNumber|cardCvc|cardExpiry|paymentMethod|clientSecret|privateObjectKey|objectKey|(?:pk|sk)_(?:test|live)_/i,
  );
  assert.doesNotMatch(
    component,
    /<input[\s\S]*?(?:livemode|stripeEnvironment)/i,
  );
});

test("portability stays customer-independent, in memory, and free of private media bindings", async () => {
  const [
    exportRoute,
    verifyRoute,
    repository,
    archive,
    validation,
    portabilityTypes,
  ] = await Promise.all([
    source("../app/api/admin/setup/export/route.ts"),
    source("../app/api/admin/setup/export/verify/route.ts"),
    source("../db/portability-export.ts"),
    source("../lib/portability/archive.ts"),
    source("../lib/portability/validation.ts"),
    source("../lib/portability/types.ts"),
  ]);

  for (const route of [exportRoute, verifyRoute]) {
    assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
    assert.match(route, /requireSameOrigin\(request\)/);
    assert.match(route, /requireIdempotencyKey\(request\)/);
    assert.doesNotMatch(
      route,
      /env\.MEDIA|createR2|\.put\(|writeFile|mkdtemp|tmpdir|createWriteStream/,
    );
  }
  assert.match(exportRoute, /new ArrayBuffer\(result\.bytes\.byteLength\)/);
  assert.match(exportRoute, /application\/vnd\.a-op\.artist-export\+json/);
  assert.match(verifyRoute, /MAXIMUM_ARCHIVE_BYTES/);
  assert.match(verifyRoute, /request\.body\.getReader\(\)/);
  assert.match(verifyRoute, /parseArtistExportArchiveBytes/);
  assert.match(verifyRoute, /verifyArtistExportArchive/);
  assert.match(verifyRoute, /markPortableArtistExportVerified/);

  assert.doesNotMatch(
    repository,
    /FROM\s+(?:profiles|favorites|playlists|listening_history|orders|checkout_sessions|commerce_events|entitlements|contact_submissions|telemetry_events|audit_events)\b/i,
  );
  assert.doesNotMatch(
    repository,
    /stripe_price_id|external_embed_url|object_key/,
  );
  assert.match(repository, /bindingState: "pending"/);
  assert.match(repository, /contains_customer_data/);
  assert.match(repository, /contains_provider_payload/);
  assert.match(portabilityTypes, /mediaBytesIncluded: false/);
  assert.match(validation, /containsPanLikeValue/);
  assert.match(validation, /"objectkey"/);
  assert.match(validation, /"localpath"/);
  assert.match(validation, /"machinepath"/);
  assert.match(archive, /assertSafeArchivePath/);
  assert.match(archive, /fixed, relative JSON paths without traversal/);
  assert.doesNotMatch(responseSource(verifyRoute), RESPONSE_SECRET_FIELDS);
});

test("media publication requires the exact applied approval before R2 and returns no private locator", async () => {
  const [route, repository, requestReader] = await Promise.all([
    source("../app/api/admin/media-publication/route.ts"),
    source("../db/media-publication.ts"),
    source("../lib/media-preparation/publication-request.ts"),
  ]);

  assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireIdempotencyKey\(request\)/);
  assert.match(
    route,
    /requireAppliedMediaPublicationApproval[\s\S]*ensureImmutablePublicationObject[\s\S]*finalizeMediaPublication/,
  );
  assert.match(repository, /media_setup_application\.proposal_hash = \?/);
  assert.match(repository, /media_setup_application\.approval_hash = \?/);
  assert.match(repository, /media_setup_application\.status = 'applied'/);
  assert.match(repository, /\$\.externalActionApprovals/);
  assert.match(repository, /public-media-upload/);
  assert.match(repository, /publication\.mediaKey/);
  assert.match(repository, /activeOwnerCondition\(actorUserId\)/);
  assert.match(
    repository,
    /finalizeMediaPublication[\s\S]*requireAppliedMediaPublicationApproval\(/,
  );
  assert.match(requestReader, /resolveMediaPublicationByteCap/);
  assert.match(requestReader, /request\.body\.getReader\(\)/);
  assert.match(requestReader, /length > byteCap/);
  assert.match(requestReader, /x-aop-rights-confirmed/);
  assert.match(requestReader, /x-aop-proposal-sha256/);
  assert.match(requestReader, /x-aop-approval-sha256/);
  assert.match(requestReader, /x-aop-media-key/);
  assert.match(requestReader, /x-aop-external-action-id/);
  assert.match(requestReader, /x-aop-external-action-sha256/);
  assert.doesNotMatch(responseSource(route), RESPONSE_SECRET_FIELDS);
});
