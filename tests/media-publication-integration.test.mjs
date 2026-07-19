import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { finalizeMediaPublication, requireAppliedMediaPublicationApproval } =
  await import("../db/media-publication.ts");
const { publicationObjectKey } =
  await import("../lib/media-preparation/publication-store.ts");

const OWNER = "user_media_publication_owner";
const APPLICATION = "setup_application_media_01";
const PROPOSAL = "1".repeat(64);
const APPROVAL = "2".repeat(64);
const MANIFEST = "3".repeat(64);
const SOURCE_HASH = "4".repeat(64);
const DERIVATIVE_HASH = "5".repeat(64);
const MEDIA_KEY = "fictional-track-audio";
const EXTERNAL_ACTION_ID = "publish-fictional-track";
const EXTERNAL_ACTION_HASH = `sha256:${"8".repeat(64)}`;

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', 'media-owner@example.invalid',
            'media-owner@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_media_publication_owner', '${OWNER}', 'owner', '${OWNER}');
    INSERT INTO setup_applications
      (id, application_key, proposal_hash, proposal_schema_version,
       source_state_fingerprint, approval_hash, approved_by_user_id,
       approved_at, status, result_state_fingerprint, operation_count,
       result_json, last_operation_key, completed_at)
    VALUES
      ('${APPLICATION}', 'setup:application:media:0001', '${PROPOSAL}', 1,
       '${"6".repeat(64)}', '${APPROVAL}', '${OWNER}',
       '2026-07-19T12:00:00.000Z', 'applied', '${"7".repeat(64)}', 1,
       '{"status":"applied"}', 'setup:application:media:0001',
       '2026-07-19T12:00:01.000Z');
  `);
  return memory;
}

function source(overrides = {}) {
  return {
    applicationId: APPLICATION,
    proposalSha256: PROPOSAL,
    approvalSha256: APPROVAL,
    manifestSha256: MANIFEST,
    mediaSha256: SOURCE_HASH,
    mediaId: "media_source_publication_01",
    mediaKey: MEDIA_KEY,
    alias: "approved-master",
    visibility: "protected",
    externalActionId: null,
    externalActionSha256: null,
    contentType: "audio/wav",
    rightsConfirmed: true,
    intendedUse: ["download", "streaming"],
    inspection: {
      durationMs: 120_000,
      channels: 2,
      sampleRate: 48_000,
      format: "wav",
      bitrateKbps: 1411,
    },
    role: "source",
    kind: "audio",
    sourceVersion: 1,
    ...overrides,
  };
}

function derivative() {
  return {
    applicationId: APPLICATION,
    proposalSha256: PROPOSAL,
    approvalSha256: APPROVAL,
    manifestSha256: MANIFEST,
    mediaSha256: DERIVATIVE_HASH,
    mediaId: "media_derivative_publication_01",
    mediaKey: MEDIA_KEY,
    alias: "approved-stream",
    visibility: "protected",
    externalActionId: null,
    externalActionSha256: null,
    contentType: "audio/mpeg",
    rightsConfirmed: true,
    intendedUse: ["download", "streaming"],
    inspection: {
      durationMs: 120_000,
      channels: 2,
      sampleRate: 48_000,
      format: "mp3",
      bitrateKbps: 192,
    },
    role: "derivative",
    sourceMediaId: "media_source_publication_01",
    derivativeKind: "streaming",
    profileId: "audio-streaming-mp3-192",
    processingVersion: "1",
    format: "mp3",
    bitrateKbps: 192,
  };
}

function object(publication, byteLength = 128) {
  return {
    privateObjectKey: publicationObjectKey(publication),
    etag: "etag-fictional-media",
    byteLength,
  };
}

function context(key) {
  return {
    actorUserId: OWNER,
    idempotencyKey: key,
    requestId: `request-${key}`,
  };
}

test("exact applied approval gates R2 publication before finalization", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  await requireAppliedMediaPublicationApproval(memory.binding, source(), OWNER);
  await assert.rejects(
    requireAppliedMediaPublicationApproval(
      memory.binding,
      source({ approvalSha256: "0".repeat(64) }),
      OWNER,
    ),
    /exact applied setup proposal/,
  );
  memory.database.exec(
    `UPDATE setup_applications SET status = 'failed', safe_failure_code = 'TEST_FAILURE',
       result_state_fingerprint = NULL, completed_at = '2026-07-19T12:01:00.000Z'
     WHERE id = '${APPLICATION}'`,
  );
  await assert.rejects(
    requireAppliedMediaPublicationApproval(memory.binding, source(), OWNER),
    /exact applied setup proposal/,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    0,
  );
});

test("public publication requires the exact persisted Michael approval receipt before R2", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const publication = source({
    visibility: "public",
    externalActionId: EXTERNAL_ACTION_ID,
    externalActionSha256: EXTERNAL_ACTION_HASH,
  });

  await assert.rejects(
    requireAppliedMediaPublicationApproval(memory.binding, publication, OWNER),
    /exact applied setup proposal/,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    0,
  );

  const wrongReceipt = {
    status: "applied",
    externalActionApprovals: [
      {
        actionId: EXTERNAL_ACTION_ID,
        actionHash: EXTERNAL_ACTION_HASH,
        kind: "public-media-upload",
        target: "different-media-key",
        approvedBy: "michael",
        approvalHash: `sha256:${"9".repeat(64)}`,
        approvedAt: "2026-07-19T12:00:00.000Z",
      },
    ],
  };
  memory.database
    .prepare("UPDATE setup_applications SET result_json = ? WHERE id = ?")
    .run(JSON.stringify(wrongReceipt), APPLICATION);
  await assert.rejects(
    requireAppliedMediaPublicationApproval(memory.binding, publication, OWNER),
    /exact applied setup proposal/,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    0,
  );

  const exactReceipt = {
    ...wrongReceipt,
    externalActionApprovals: [
      { ...wrongReceipt.externalActionApprovals[0], target: MEDIA_KEY },
    ],
  };
  memory.database
    .prepare("UPDATE setup_applications SET result_json = ? WHERE id = ?")
    .run(JSON.stringify(exactReceipt), APPLICATION);
  await requireAppliedMediaPublicationApproval(
    memory.binding,
    publication,
    OWNER,
  );
  const result = await finalizeMediaPublication(
    memory.binding,
    publication,
    object(publication),
    context("public-source-publication-0001"),
  );
  assert.equal(result.replayed, false);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    1,
  );
  const audit = memory.database
    .prepare(
      "SELECT details_json, result_json FROM audit_events WHERE action = 'media.publication.source'",
    )
    .get();
  assert.doesNotMatch(
    `${audit.details_json}${audit.result_json}`,
    /approvalHash|approvedAt|I approve this exact external action hash/,
  );
});

test("verified source and derivative pointers finalize once and replay without duplicates", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const sourcePublication = source();
  const first = await finalizeMediaPublication(
    memory.binding,
    sourcePublication,
    object(sourcePublication),
    context("source-publication-0001"),
  );
  assert.equal(first.replayed, false);
  assert.deepEqual(first.value, {
    mediaId: sourcePublication.mediaId,
    role: "source",
    status: "ready",
    approvalState: "approved",
    revision: 1,
    mediaSha256: SOURCE_HASH,
  });
  const replay = await finalizeMediaPublication(
    memory.binding,
    sourcePublication,
    object(sourcePublication),
    context("source-publication-0001"),
  );
  assert.equal(replay.replayed, true);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    1,
  );

  const derivativePublication = derivative();
  await finalizeMediaPublication(
    memory.binding,
    derivativePublication,
    object(derivativePublication, 96),
    context("derivative-publication-0001"),
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_derivatives"),
    1,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT status, approval_state, object_key, content_sha256
       FROM media_derivatives WHERE id = ?`,
        )
        .get(derivativePublication.mediaId),
    },
    {
      status: "ready",
      approval_state: "approved",
      object_key: publicationObjectKey(derivativePublication),
      content_sha256: DERIVATIVE_HASH,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action LIKE 'media.publication.%'",
    ),
    2,
  );
  const audit = memory.database
    .prepare(
      "SELECT details_json, result_json FROM audit_events WHERE action = 'media.publication.source'",
    )
    .get();
  assert.doesNotMatch(
    `${audit.details_json}${audit.result_json}`,
    /originals\/|derivatives\//,
  );
});

test("D1 rejects a pointer that does not match the verified content-addressed key", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const publication = source();
  await assert.rejects(
    finalizeMediaPublication(
      memory.binding,
      publication,
      { ...object(publication), privateObjectKey: "originals/other" },
      context("invalid-object-key-0001"),
    ),
    /does not match/,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    0,
  );
});
