import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/admin/media-publication/route.ts", import.meta.url),
  "utf8",
);
const repository = await readFile(
  new URL("../db/media-publication.ts", import.meta.url),
  "utf8",
);
const script = await readFile(
  new URL("../scripts/aop-media.mjs", import.meta.url),
  "utf8",
);

test("hosted media publication is owner-only, approval-first, bounded, and R2 verified", () => {
  assert.match(route, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(
    route,
    /requireAppliedMediaPublicationApproval[\s\S]+ensureImmutablePublicationObject[\s\S]+finalizeMediaPublication/,
  );
  assert.match(route, /resolveMediaPublicationByteCap/);
  assert.match(route, /requireSameOrigin/);
  assert.match(route, /requireIdempotencyKey/);
  assert.match(repository, /status IN \('applying', 'applied'\)/);
  assert.match(repository, /proposal_hash = \?/);
  assert.match(repository, /approval_hash = \?/);
  assert.match(repository, /\$\.externalActionApprovals/);
  assert.match(repository, /public-media-upload/);
  assert.match(repository, /\$\.target/);
  assert.match(repository, /publication\.mediaKey/);
  assert.match(repository, /activeOwnerCondition/);
  assert.doesNotMatch(route, /export async function GET/);
  const responseBody = route.slice(route.indexOf("return apiJson"));
  assert.doesNotMatch(responseBody, /privateObjectKey|objectKey/);
});

test("local command accepts aliases only and never enables shell execution", () => {
  assert.match(script, /setup\/local-paths\.json/);
  assert.match(script, /--rights-confirmed/);
  assert.match(script, /--expected-sha256/);
  assert.match(script, /--proposal-sha256/);
  assert.match(script, /--approval-sha256/);
  assert.match(script, /--confirm-site-publication/);
  assert.match(script, /--media-key/);
  assert.match(script, /--external-approval-alias/);
  assert.match(script, /resolveExternalPublicationAuthority/);
  assert.match(script, /x-aop-external-action-id/);
  assert.match(script, /x-aop-external-action-sha256/);
  assert.match(script, /Protected publication accepts no external-action/);
  assert.match(script, /preflightMediaTools/);
  assert.match(script, /buildFfmpegArgv/);
  assert.match(script, /safeFailureMessage/);
  assert.doesNotMatch(script, /--(?:source-|output-)?path\b/);
  assert.doesNotMatch(script, /shell:\s*true/);
});
