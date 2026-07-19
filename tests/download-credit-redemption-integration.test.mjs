import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readAccessFacts } = await import("../db/access-read.ts");
const { readTrackDownloadDelivery } = await import("../db/catalog-media.ts");
const { grantCustomerCredits } = await import("../db/credit-ledger-write.ts");
const { readCustomerDownloadCreditTargets, redeemTrackDownloadWithCredit } =
  await import("../db/download-credit-redemption.ts");
const { decideAccess } = await import("../lib/access/decide-access.ts");

const OWNER = "user_download_credit_owner";
const CUSTOMER = "user_download_credit_customer";
const TRACK = "track_download_credit";
const TRACK_REVISION = "track_revision_download_credit";
const SOURCE = "media_download_credit_source";
const DERIVATIVE = "media_download_credit_derivative";
const NOW = new Date("2026-07-19T20:00:00.000Z");

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_download_credit_${requestSequence}`,
  };
}

async function setup({ quantity = 2 } = {}) {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    UPDATE artist_modules SET active = 1 WHERE module_key = 'downloads';
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'download-credit-owner@example.invalid',
       'download-credit-owner@example.invalid', 'active'),
      ('${CUSTOMER}', 'download-credit-customer@example.invalid',
       'download-credit-customer@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_download_credit_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_download_credit_customer', '${CUSTOMER}', 'customer', '${OWNER}');

    INSERT INTO media_objects
      (id, object_key, kind, visibility, owner_user_id, content_type,
       byte_length, status, approval_state, content_sha256, approved_by_user_id,
       approved_at)
    VALUES
      ('${SOURCE}', 'originals/download-credit/source.wav', 'audio',
       'protected', '${OWNER}', 'audio/wav', 2048, 'ready', 'approved',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       '${OWNER}', '2026-07-19T18:00:00.000Z');
    INSERT INTO media_derivatives
      (id, source_media_id, kind, processing_profile, processing_version,
       object_key, status, approval_state, content_type, format, byte_length,
       content_sha256, approved_by_user_id, approved_at)
    VALUES
      ('${DERIVATIVE}', '${SOURCE}', 'download', 'fictional-lossless', '1',
       'derivatives/download-credit/track.wav', 'ready', 'approved',
       'audio/wav', 'wav', 1024,
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
       '${OWNER}', '2026-07-19T18:05:00.000Z');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('${TRACK}', 'fictional-download-credit-track', '${TRACK_REVISION}',
       '${TRACK_REVISION}', 'published', '2026-07-19T18:10:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode,
       original_media_id, download_derivative_id, tags_json,
       created_by_user_id)
    VALUES
      ('${TRACK_REVISION}', '${TRACK}', 1,
       'Fictional Download Credit Track', 'protected', 'protected',
       'protected', '${SOURCE}', '${DERIVATIVE}', '[]', '${OWNER}');
  `);

  await grantCustomerCredits(
    memory.binding,
    {
      customerUserId: CUSTOMER,
      creditKind: "download",
      originType: "owner",
      originId: "download_credit_test_grant",
      quantity,
      expiresAt: "2027-07-19T20:00:00.000Z",
      fulfillmentEventId: null,
    },
    0,
    context(OWNER, "download-credit.grant"),
    NOW,
  );
  return memory;
}

async function accessDecision(binding, now = "2026-07-19T20:05:00.000Z") {
  const request = {
    identity: { userId: CUSTOMER, roles: ["customer"] },
    resourceType: "track",
    resourceId: TRACK,
    action: "download",
    now,
  };
  const projection = await readAccessFacts(binding, request);
  return decideAccess({ ...request, facts: projection.facts });
}

async function assertRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("one download credit creates one durable entitlement and replay consumes nothing twice", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  assert.deepEqual(await accessDecision(memory.binding), {
    allowed: false,
    reason: "not-authorized",
    source: "none",
  });
  const beforeTargets = await readCustomerDownloadCreditTargets(
    memory.binding,
    CUSTOMER,
  );
  assert.equal(beforeTargets.length, 1);
  assert.equal(beforeTargets[0].state, "available");
  assert.equal(beforeTargets[0].downloadUrl, null);

  const first = await redeemTrackDownloadWithCredit(
    memory.binding,
    TRACK,
    context(CUSTOMER, "first-browser-operation"),
    NOW,
  );
  assert.equal(first.replayed, false);
  assert.equal(first.value.trackRevisionId, TRACK_REVISION);
  assert.equal(first.value.stripeEnvironment, "test");
  assert.equal(first.value.livemode, false);
  assert.match(
    first.value.downloadUrl,
    new RegExp(
      `/api/media/tracks/${TRACK}/download\\?revision=${TRACK_REVISION}`,
    ),
  );

  const decision = await accessDecision(memory.binding);
  assert.equal(decision.allowed, true);
  assert.equal(decision.source, "credit");
  assert.equal(decision.entitlementId, first.value.entitlementId);
  assert.equal(decision.downloadDisposition, "attachment");

  const replay = await redeemTrackDownloadWithCredit(
    memory.binding,
    TRACK,
    context(CUSTOMER, "second-browser-operation"),
    new Date("2026-07-20T20:00:00.000Z"),
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, first.value);

  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance, reserved_balance, consumed_balance
           FROM credit_accounts
           WHERE customer_user_id = ? AND credit_kind = 'download'`,
        )
        .get(CUSTOMER),
    },
    { available_balance: 1, reserved_balance: 0, consumed_balance: 1 },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_reservations
       WHERE customer_user_id = ? AND credit_kind = 'download'
         AND purpose_type = 'download' AND purpose_id = ? AND quantity = 1
         AND state = 'consumed' AND stripe_environment = 'test'
         AND livemode = 0`,
      CUSTOMER,
      TRACK,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE customer_user_id = ? AND credit_kind = 'download'
         AND origin_type = 'download' AND origin_id = ?
         AND entry_type = 'consumption' AND reserved_delta = -1
         AND consumed_delta = 1 AND stripe_environment = 'test'
         AND livemode = 0`,
      CUSTOMER,
      TRACK,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE id = ? AND user_id = ? AND source_type = 'credit'
         AND resource_type = 'track' AND resource_id = ?
         AND actions_json = '["download"]' AND state = 'active'
         AND starts_at = ? AND stripe_environment = 'test' AND livemode = 0
         AND fulfillment_event_id IS NULL AND credit_reservation_id = ?
         AND revision = 2`,
      first.value.entitlementId,
      CUSTOMER,
      TRACK,
      "2026-07-19T20:00:00.000Z",
      first.value.creditReservationId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action IN ('download-credit.prepare-entitlement',
                        'benefit-credit.reserve', 'benefit-credit.consume',
                        'download-credit.activate-entitlement')`,
    ),
    4,
  );

  const afterTargets = await readCustomerDownloadCreditTargets(
    memory.binding,
    CUSTOMER,
  );
  assert.equal(afterTargets[0].state, "redeemed");
  assert.equal(afterTargets[0].entitlementId, first.value.entitlementId);
  assert.equal(afterTargets[0].downloadUrl, first.value.downloadUrl);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("a prepared future entitlement stays visible without access or consumption while its exact target is withdrawn", async (t) => {
  const memory = await setup({ quantity: 1 });
  t.after(() => memory.close());

  let receiptReads = 0;
  const breakingBinding = {
    prepare(sql) {
      if (
        sql.includes("FROM audit_events") &&
        sql.includes("WHERE idempotency_key")
      ) {
        receiptReads += 1;
        if (receiptReads === 2) {
          throw new Error("simulated break before credit reservation");
        }
      }
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      return memory.binding.batch(statements);
    },
  };

  await assert.rejects(
    redeemTrackDownloadWithCredit(
      breakingBinding,
      TRACK,
      context(CUSTOMER, "break-after-entitlement-preparation"),
      NOW,
    ),
    /simulated break before credit reservation/,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE user_id = ? AND source_type = 'credit' AND resource_id = ?
         AND starts_at = '9999-12-31T23:59:59.999Z'
         AND credit_reservation_id IS NULL AND revision = 1`,
      CUSTOMER,
      TRACK,
    ),
    1,
  );
  assert.deepEqual(await accessDecision(memory.binding), {
    allowed: false,
    reason: "grant-not-yet-active",
    source: "none",
  });

  memory.database.exec(`
    UPDATE tracks
    SET publication_state = 'archived', published_revision_id = NULL
    WHERE id = '${TRACK}';
  `);
  assert.equal(
    await readTrackDownloadDelivery(memory.binding, TRACK, TRACK_REVISION),
    null,
  );
  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      memory.binding,
      TRACK,
      context(CUSTOMER, "resume-after-target-withdrawal"),
      new Date("2026-07-19T20:10:00.000Z"),
    ),
    "DOWNLOAD_CREDIT_TRACK_UNAVAILABLE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      TRACK,
    ),
    0,
  );
  assert.deepEqual(await accessDecision(memory.binding), {
    allowed: false,
    reason: "grant-not-yet-active",
    source: "none",
  });
  const interrupted = await readCustomerDownloadCreditTargets(
    memory.binding,
    CUSTOMER,
  );
  assert.equal(interrupted.length, 1);
  assert.equal(interrupted[0].trackRevisionId, TRACK_REVISION);
  assert.equal(interrupted[0].state, "unavailable");
  assert.equal(interrupted[0].creditReservationId, null);
  assert.notEqual(interrupted[0].entitlementId, null);
  assert.equal(interrupted[0].downloadUrl, null);

  memory.database.exec(`
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode,
       original_media_id, download_derivative_id, tags_json,
       created_by_user_id)
    VALUES
      ('track_revision_download_credit_replacement', '${TRACK}', 2,
       'Fictional Replacement Revision', 'protected', 'protected',
       'protected', '${SOURCE}', '${DERIVATIVE}', '[]', '${OWNER}');
    UPDATE tracks
    SET publication_state = 'published',
        published_revision_id = 'track_revision_download_credit_replacement'
    WHERE id = '${TRACK}';
  `);
  const replacement = await readTrackDownloadDelivery(
    memory.binding,
    TRACK,
    "track_revision_download_credit_replacement",
  );
  assert.equal(
    replacement?.revisionId,
    "track_revision_download_credit_replacement",
  );
  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      memory.binding,
      TRACK,
      context(CUSTOMER, "reject-different-republished-revision"),
      new Date("2026-07-19T20:11:00.000Z"),
    ),
    "DOWNLOAD_CREDIT_TRACK_CHANGED",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
});

test("delivery withdrawal at the consumption batch spends nothing and the exact republished revision resumes safely", async (t) => {
  const memory = await setup({ quantity: 1 });
  t.after(() => memory.close());

  let batchCount = 0;
  const withdrawingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      batchCount += 1;
      if (batchCount === 3) {
        memory.database.exec(`
          UPDATE tracks
          SET publication_state = 'archived', published_revision_id = NULL
          WHERE id = '${TRACK}';
        `);
      }
      return memory.binding.batch(statements);
    },
  };

  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      withdrawingBinding,
      TRACK,
      context(CUSTOMER, "withdraw-at-consumption-boundary"),
      NOW,
    ),
    "STALE_STATE",
  );
  assert.equal(batchCount, 3);
  assert.equal(
    await readTrackDownloadDelivery(memory.binding, TRACK, TRACK_REVISION),
    null,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance, reserved_balance, consumed_balance
           FROM credit_accounts
           WHERE customer_user_id = ? AND credit_kind = 'download'`,
        )
        .get(CUSTOMER),
    },
    { available_balance: 0, reserved_balance: 1, consumed_balance: 0 },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_reservations
       WHERE customer_user_id = ? AND purpose_id = ? AND state = 'reserved'`,
      CUSTOMER,
      TRACK,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      TRACK,
    ),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'benefit-credit.consume'`,
    ),
    0,
  );
  assert.deepEqual(await accessDecision(memory.binding), {
    allowed: false,
    reason: "grant-not-yet-active",
    source: "none",
  });
  const interrupted = await readCustomerDownloadCreditTargets(
    memory.binding,
    CUSTOMER,
  );
  assert.equal(interrupted.length, 1);
  assert.equal(interrupted[0].state, "unavailable");
  assert.notEqual(interrupted[0].creditReservationId, null);
  assert.notEqual(interrupted[0].entitlementId, null);
  assert.equal(interrupted[0].creditLedgerEntryId, null);
  assert.equal(interrupted[0].downloadUrl, null);

  memory.database.exec(`
    UPDATE tracks
    SET publication_state = 'published', published_revision_id = '${TRACK_REVISION}'
    WHERE id = '${TRACK}';
  `);
  const ready = await readTrackDownloadDelivery(
    memory.binding,
    TRACK,
    TRACK_REVISION,
  );
  assert.equal(ready?.trackId, TRACK);
  assert.equal(ready?.revisionId, TRACK_REVISION);
  assert.equal(ready?.downloadMode, "protected");

  const resumed = await redeemTrackDownloadWithCredit(
    memory.binding,
    TRACK,
    context(CUSTOMER, "resume-exact-republished-target"),
    new Date("2026-07-19T20:10:00.000Z"),
  );
  assert.equal(resumed.replayed, false);
  assert.equal(resumed.value.trackRevisionId, TRACK_REVISION);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      TRACK,
    ),
    1,
  );
  const decision = await accessDecision(
    memory.binding,
    "2026-07-19T20:11:00.000Z",
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.source, "credit");
});

test("a post-consumption delivery interruption remains visible and resumes activation without another spend", async (t) => {
  const memory = await setup({ quantity: 1 });
  t.after(() => memory.close());

  let batchCount = 0;
  const interruptingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      batchCount += 1;
      if (batchCount === 4) {
        memory.database.exec(`
          UPDATE tracks
          SET publication_state = 'archived', published_revision_id = NULL
          WHERE id = '${TRACK}';
        `);
      }
      return memory.binding.batch(statements);
    },
  };

  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      interruptingBinding,
      TRACK,
      context(CUSTOMER, "withdraw-at-activation-boundary"),
      NOW,
    ),
    "STALE_STATE",
  );
  assert.equal(batchCount, 4);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance, reserved_balance, consumed_balance
           FROM credit_accounts
           WHERE customer_user_id = ? AND credit_kind = 'download'`,
        )
        .get(CUSTOMER),
    },
    { available_balance: 0, reserved_balance: 0, consumed_balance: 1 },
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      TRACK,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE user_id = ? AND resource_id = ?
         AND starts_at = '9999-12-31T23:59:59.999Z'
         AND credit_reservation_id IS NULL AND revision = 1`,
      CUSTOMER,
      TRACK,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'download-credit.activate-entitlement'`,
    ),
    0,
  );
  assert.deepEqual(await accessDecision(memory.binding), {
    allowed: false,
    reason: "grant-not-yet-active",
    source: "none",
  });
  const interrupted = await readCustomerDownloadCreditTargets(
    memory.binding,
    CUSTOMER,
  );
  assert.equal(interrupted.length, 1);
  assert.equal(interrupted[0].state, "unavailable");
  assert.notEqual(interrupted[0].creditReservationId, null);
  assert.notEqual(interrupted[0].creditLedgerEntryId, null);
  assert.notEqual(interrupted[0].entitlementId, null);
  assert.equal(interrupted[0].downloadUrl, null);

  memory.database.exec(`
    UPDATE tracks
    SET publication_state = 'published', published_revision_id = '${TRACK_REVISION}'
    WHERE id = '${TRACK}';
  `);
  const resumed = await redeemTrackDownloadWithCredit(
    memory.binding,
    TRACK,
    context(CUSTOMER, "resume-activation-after-republish"),
    new Date("2026-07-19T20:20:00.000Z"),
  );
  assert.equal(resumed.replayed, false);
  assert.equal(resumed.value.trackRevisionId, TRACK_REVISION);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      TRACK,
    ),
    1,
  );
  const finalTargets = await readCustomerDownloadCreditTargets(
    memory.binding,
    CUSTOMER,
  );
  assert.equal(finalTargets[0].state, "redeemed");
  assert.equal(finalTargets[0].downloadUrl, resumed.value.downloadUrl);
});

test("inactive modules, ineligible targets, and non-Test accounts write no redemption state", async (t) => {
  const inactive = await setup({ quantity: 1 });
  const ineligible = await setup({ quantity: 1 });
  const nonTest = await setup({ quantity: 1 });
  t.after(() => {
    inactive.close();
    ineligible.close();
    nonTest.close();
  });

  inactive.database.exec(
    "UPDATE artist_modules SET active = 0 WHERE module_key = 'downloads';",
  );
  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      inactive.binding,
      TRACK,
      context(CUSTOMER, "inactive-downloads-module"),
      NOW,
    ),
    "MODULE_INACTIVE",
  );

  ineligible.database.exec(
    `UPDATE track_revisions SET download_mode = 'account' WHERE id = '${TRACK_REVISION}';`,
  );
  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      ineligible.binding,
      TRACK,
      context(CUSTOMER, "ineligible-download-target"),
      NOW,
    ),
    "DOWNLOAD_CREDIT_TRACK_UNAVAILABLE",
  );

  nonTest.database.exec(`
    PRAGMA ignore_check_constraints = ON;
    UPDATE credit_accounts
    SET stripe_environment = 'live', livemode = 1
    WHERE customer_user_id = '${CUSTOMER}' AND credit_kind = 'download';
    PRAGMA ignore_check_constraints = OFF;
  `);
  await assertRuntimeCode(
    redeemTrackDownloadWithCredit(
      nonTest.binding,
      TRACK,
      context(CUSTOMER, "non-test-credit-account"),
      NOW,
    ),
    "DOWNLOAD_CREDIT_ACCOUNT_REQUIRED",
  );

  for (const memory of [inactive, ineligible, nonTest]) {
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
      0,
    );
    assert.equal(
      scalar(
        memory.database,
        "SELECT COUNT(*) FROM entitlements WHERE source_type = 'credit'",
      ),
      0,
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM credit_ledger_entries
         WHERE entry_type IN ('reservation', 'consumption')`,
      ),
      0,
    );
  }
});
