import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  beginSetupApplication,
  completeSetupApplication,
  failSetupApplication,
  readSetupWorkspace,
} = await import("../db/setup-state.ts");
const { readSetupSourceState } = await import("../db/setup-source-state.ts");

const OWNER = "user_setup_owner";

function seedOwner(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', 'setup-owner@example.invalid',
            'setup-owner@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES ('${OWNER}', 'Fictional setup owner');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_setup_owner', '${OWNER}', 'owner', '${OWNER}');
  `);
}

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function input() {
  return {
    proposalHash: digest("a"),
    proposalSchemaVersion: 1,
    sourceStateFingerprint: digest("b"),
    approvalHash: digest("c"),
    approvedAt: "2026-07-19T11:00:00.000Z",
    operationCount: 14,
  };
}

function context(idempotencyKey) {
  return {
    actorUserId: OWNER,
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
  };
}

test("approved setup apply records exact hashes once and completes visibly", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);

  const initial = await readSetupWorkspace(memory.binding, OWNER);
  assert.equal(initial.state.status, "unconfigured");
  assert.equal(initial.applications.length, 0);

  const begun = await beginSetupApplication(
    memory.binding,
    input(),
    context("setup-apply-0001"),
  );
  assert.equal(begun.replayed, false);
  assert.equal(begun.application.status, "applying");
  assert.equal(begun.application.proposalHash, digest("a"));
  assert.equal(begun.application.approvalHash, digest("c"));

  const applyingReplay = await beginSetupApplication(
    memory.binding,
    input(),
    context("setup-apply-0002"),
  );
  assert.equal(applyingReplay.replayed, false);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM setup_applications"),
    1,
  );

  const completed = await completeSetupApplication(
    memory.binding,
    {
      applicationKey: begun.application.applicationKey,
      resultStateFingerprint: digest("d"),
      operationCount: 14,
      mediaObjectCount: 0,
      mediaByteCount: 0,
      externalActionApprovals: [
        {
          actionId: "publish-approved-opening-media",
          kind: "public-media-upload",
          target: "opening-track-media",
          actionHash: digest("e"),
          approvalHash: digest("f"),
          approvedAt: "2026-07-19T11:01:00.000Z",
          approvedBy: "michael",
        },
      ],
    },
    context("setup-complete-0001"),
  );
  assert.equal(completed.status, "applied");
  assert.equal(completed.resultStateFingerprint, digest("d"));
  const storedResult = JSON.parse(
    memory.database
      .prepare("SELECT result_json FROM setup_applications LIMIT 1")
      .get().result_json,
  );
  assert.deepEqual(storedResult.externalActionApprovals, [
    {
      actionId: "publish-approved-opening-media",
      kind: "public-media-upload",
      target: "opening-track-media",
      actionHash: digest("e"),
      approvalHash: digest("f"),
      approvedAt: "2026-07-19T11:01:00.000Z",
      approvedBy: "michael",
    },
  ]);

  const completedReplay = await completeSetupApplication(
    memory.binding,
    {
      applicationKey: begun.application.applicationKey,
      resultStateFingerprint: digest("d"),
      operationCount: 14,
      mediaObjectCount: 0,
      mediaByteCount: 0,
    },
    context("setup-complete-0002"),
  );
  assert.equal(completedReplay.status, "applied");
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'setup.apply.complete'",
    ),
    1,
  );
  const workspace = await readSetupWorkspace(memory.binding, OWNER);
  assert.equal(workspace.state.status, "applied");
  assert.equal(workspace.state.stateFingerprint, digest("d"));
  assert.equal(workspace.applications.length, 1);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("failed setup apply records a fixed code and resumes without duplication", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);

  const begun = await beginSetupApplication(
    memory.binding,
    input(),
    context("setup-failure-0001"),
  );
  await failSetupApplication(
    memory.binding,
    begun.application.applicationKey,
    "SETUP_OPERATION_FAILED",
    OWNER,
  );
  let workspace = await readSetupWorkspace(memory.binding, OWNER);
  assert.equal(workspace.state.status, "attention_required");
  assert.equal(workspace.applications[0].status, "failed");
  assert.equal(
    workspace.applications[0].safeFailureCode,
    "SETUP_OPERATION_FAILED",
  );

  const resumed = await beginSetupApplication(
    memory.binding,
    input(),
    context("setup-failure-0002"),
  );
  assert.equal(resumed.application.status, "applying");
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM setup_applications"),
    1,
  );
  workspace = await readSetupWorkspace(memory.binding, OWNER);
  assert.equal(workspace.state.status, "applying");
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("setup apply rejects hash conflicts and non-owner authority", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  await beginSetupApplication(
    memory.binding,
    input(),
    context("setup-conflict-0001"),
  );

  await assert.rejects(
    beginSetupApplication(
      memory.binding,
      { ...input(), approvalHash: digest("e") },
      context("setup-conflict-0002"),
    ),
    (error) => error?.code === "SETUP_APPLICATION_CONFLICT",
  );
  await assert.rejects(
    readSetupWorkspace(memory.binding, "user_setup_customer"),
    (error) => error?.code === "ROLE_REQUIRED",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM setup_applications"),
    1,
  );
});

test("setup source fingerprints cover all topics and exclude customer activity", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);

  const first = await readSetupSourceState(memory.binding);
  const repeated = await readSetupSourceState(memory.binding);
  assert.equal(repeated.fingerprint, first.fingerprint);
  assert.equal(first.snapshot.d1SchemaVersion, 19);
  assert.equal(first.snapshot.setupRevision, 1);
  for (const topic of [
    "artist",
    "capabilities-navigation",
    "rights-media",
    "catalog-releases",
    "streaming-downloads",
    "customer-access",
    "memberships-subscriptions",
    "credits",
    "licensing",
    "courses-video",
    "contact-consent",
    "telemetry-retention",
    "privacy-terms",
    "accounts-publication",
  ]) {
    assert.ok(first.snapshot.resources.some(({ kind }) => kind === topic));
  }

  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('customer_source_noise', 'source-noise@example.invalid',
            'source-noise@example.invalid', 'active');
    INSERT INTO role_assignments (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_source_noise', 'customer_source_noise', 'customer', '${OWNER}');
  `);
  const afterCustomer = await readSetupSourceState(memory.binding);
  assert.equal(afterCustomer.fingerprint, first.fingerprint);
  assert.doesNotMatch(
    JSON.stringify(afterCustomer.snapshot),
    /customer_source_noise|source-noise/,
  );

  memory.database.exec(
    "UPDATE artist_config SET version = version + 1 WHERE id = 'artist'",
  );
  const afterArtistChange = await readSetupSourceState(memory.binding);
  assert.notEqual(afterArtistChange.fingerprint, first.fingerprint);
});
