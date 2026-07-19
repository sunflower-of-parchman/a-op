import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { grantCustomerCredits } = await import("../db/credit-ledger-write.ts");
const { createCheckoutIntent, markCheckoutFailed } =
  await import("../db/commerce-checkout-write.ts");
const { redeemLicenseRequestWithCredits } =
  await import("../db/license-credit-redemption.ts");
const {
  approveLicenseRequest,
  createLicenseOffer,
  createLicenseTerms,
  issueLicense,
  reviseLicenseTerms,
  submitLicenseRequest,
} = await import("../db/licensing-write.ts");

const OWNER = "user_license_credit_owner";
const CUSTOMER = "user_license_credit_customer";
const OTHER_CUSTOMER = "user_license_credit_other";
const TRACK = "track_license_credit";
const TRACK_REVISION = "track_revision_license_credit";
const PRODUCT = "commerce_product_license_credit";
const PRICE = "commerce_price_license_credit";
const NOW = new Date("2026-07-19T18:00:00.000Z");

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_license_credit_${requestSequence}`,
  };
}

function option(overrides = {}) {
  return {
    optionKey: "fictional-film",
    label: "Fictional film",
    description: "A fictional synchronization license.",
    usageCategory: "Synchronization",
    allowedMedia: ["Film"],
    audienceLabel: "Festival audience",
    maxAudience: 10_000,
    distributionLabel: "One production",
    maxCopies: 1,
    termMonths: 3,
    territory: "Worldwide",
    attributionRequired: true,
    attributionText: "Music by the artist",
    exclusive: false,
    requiresApproval: true,
    licenseCreditCost: 2,
    includesTrackDownload: true,
    ...overrides,
  };
}

function definition(overrides = {}) {
  return {
    slug: "license-credit-terms",
    state: "active",
    name: "License credit terms",
    title: "Fictional license credit terms",
    introduction: "Fictional artist-authored introduction.",
    generalTerms: "Fictional artist-authored general terms.",
    disclaimer: "Fictional test disclaimer.",
    options: [option()],
    ...overrides,
  };
}

async function setup({ creditQuantity = 3 } = {}) {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    UPDATE artist_modules SET active = 1 WHERE module_key = 'licensing';
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'license-credit-owner@example.invalid',
       'license-credit-owner@example.invalid', 'active'),
      ('${CUSTOMER}', 'license-credit-customer@example.invalid',
       'license-credit-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER}', 'license-credit-other@example.invalid',
       'license-credit-other@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_license_credit_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_license_credit_customer', '${CUSTOMER}', 'customer', '${OWNER}'),
      ('role_license_credit_other', '${OTHER_CUSTOMER}', 'customer', '${OWNER}');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('${TRACK}', 'fictional-license-credit-track', '${TRACK_REVISION}',
       '${TRACK_REVISION}', 'published', '2026-07-19T15:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode,
       download_mode, tags_json)
    VALUES
      ('${TRACK_REVISION}', '${TRACK}', 1, 'Fictional License Credit Track',
       'protected', 'protected', 'protected', '[]');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type,
       resource_id, state, revision)
    VALUES
      ('${PRODUCT}', 'fictional-license-credit-product',
       'Fictional license credit product', 'Test-only fictional product.',
       'license', 'track', '${TRACK}', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment,
       livemode, revision)
    VALUES
      ('${PRICE}', '${PRODUCT}', 2800, 'USD', 'one_time', 1,
       'price_TestAopLicenseCredit001', 1, 'test', 0, 1);
  `);

  const terms = await createLicenseTerms(
    memory.binding,
    definition(),
    context(OWNER, "license-credit.terms.create"),
  );
  const offer = await createLicenseOffer(
    memory.binding,
    {
      slug: "fictional-license-credit-offer",
      trackId: TRACK,
      trackRevisionId: TRACK_REVISION,
      licenseTermsId: terms.value.licenseTermsId,
      licenseTermsVersion: 1,
      licenseOptionId: terms.value.optionIds[0],
      commerceProductId: PRODUCT,
      commercePriceId: PRICE,
      state: "active",
    },
    context(OWNER, "license-credit.offer.create"),
  );
  const submitted = await submitLicenseRequest(
    memory.binding,
    {
      licenseOfferId: offer.value.licenseOfferId,
      licenseeName: "Fictional Licensee",
      projectTitle: "Fictional Credit Project",
      intendedUse: "Opening credits in a fictional production",
      projectDescription: "A fictional production for credit testing.",
    },
    context(CUSTOMER, "license-credit.request.submit"),
  );
  await approveLicenseRequest(
    memory.binding,
    submitted.value.licenseRequestId,
    {
      expectedRevision: 1,
      decidedAt: "2026-07-19T17:00:00.000Z",
      reason: "The fictional intended use matches the frozen terms.",
    },
    context(OWNER, "license-credit.request.approve"),
  );
  await grantCustomerCredits(
    memory.binding,
    {
      customerUserId: CUSTOMER,
      creditKind: "license",
      originType: "owner",
      originId: "license_credit_test_grant",
      quantity: creditQuantity,
      expiresAt: "2027-07-19T18:00:00.000Z",
      fulfillmentEventId: null,
    },
    0,
    context(OWNER, "license-credit.grant"),
    NOW,
  );
  return {
    memory,
    licenseRequestId: submitted.value.licenseRequestId,
    licenseTermsId: terms.value.licenseTermsId,
  };
}

async function assertRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("the exact frozen license-credit cost issues once and replays the complete result", async (t) => {
  const { memory, licenseRequestId, licenseTermsId } = await setup();
  t.after(() => memory.close());

  const revised = { ...definition() };
  delete revised.slug;
  delete revised.state;
  revised.options = [option({ licenseCreditCost: 9 })];
  await reviseLicenseTerms(
    memory.binding,
    licenseTermsId,
    revised,
    1,
    context(OWNER, "license-credit.terms.revise"),
  );

  const first = await redeemLicenseRequestWithCredits(
    memory.binding,
    licenseRequestId,
    context(CUSTOMER, "browser-operation-first"),
    NOW,
  );
  assert.equal(first.replayed, false);
  assert.equal(first.value.licenseCreditCost, 2);
  assert.equal(first.value.issuedLicense.source, "credit_redemption");
  assert.equal(first.value.issuedLicense.entitlementIds.length, 2);
  assert.equal(first.value.stripeEnvironment, "test");
  assert.equal(first.value.livemode, false);

  const replay = await redeemLicenseRequestWithCredits(
    memory.binding,
    licenseRequestId,
    context(CUSTOMER, "different-browser-operation"),
    new Date("2026-07-20T18:00:00.000Z"),
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, first.value);
  assert.equal(
    scalar(
      memory.database,
      `SELECT available_balance FROM credit_accounts
       WHERE customer_user_id = ? AND credit_kind = 'license'`,
      CUSTOMER,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_reservations
       WHERE customer_user_id = ? AND purpose_type = 'license_request'
         AND purpose_id = ? AND quantity = 2 AND state = 'consumed'
         AND stripe_environment = 'test' AND livemode = 0`,
      CUSTOMER,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE customer_user_id = ? AND origin_type = 'license'
         AND origin_id = ? AND entry_type = 'consumption'
         AND consumed_delta = 2 AND stripe_environment = 'test' AND livemode = 0`,
      CUSTOMER,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM issued_licenses
       WHERE license_request_id = ? AND source = 'credit_redemption'
         AND stripe_environment = 'test' AND livemode = 0`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM license_document_jobs WHERE status = 'queued'`,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM entitlements
       WHERE source_type = 'license' AND state = 'active'`,
    ),
    2,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action IN ('benefit-credit.reserve', 'benefit-credit.consume',
                        'license.issue.credit_redemption')`,
    ),
    3,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("one license request holds one acquisition path until that path releases or issues", async (t) => {
  const { memory, licenseRequestId } = await setup();
  t.after(() => memory.close());

  const checkout = await createCheckoutIntent(
    memory.binding,
    { productId: PRODUCT, licenseRequestId },
    context(CUSTOMER, "license-acquisition.checkout"),
  );
  assert.equal(checkout.checkout.status, "creating");
  const checkoutReplay = await createCheckoutIntent(
    memory.binding,
    { productId: PRODUCT, licenseRequestId },
    context(CUSTOMER, "license-acquisition.checkout"),
  );
  assert.equal(checkoutReplay.replayed, true);
  assert.equal(checkoutReplay.checkout.id, checkout.checkout.id);

  await assertRuntimeCode(
    createCheckoutIntent(
      memory.binding,
      { productId: PRODUCT, licenseRequestId },
      context(CUSTOMER, "license-acquisition.duplicate-checkout"),
    ),
    "CHECKOUT_UNAVAILABLE",
  );
  await assertRuntimeCode(
    redeemLicenseRequestWithCredits(
      memory.binding,
      licenseRequestId,
      context(CUSTOMER, "license-acquisition.competing-credit"),
      NOW,
    ),
    "STALE_STATE",
  );
  await assertRuntimeCode(
    issueLicense(
      memory.binding,
      {
        source: "owner_approval",
        licenseRequestId,
        expectedRevision: 2,
        issuedAt: "2026-07-19T18:04:00.000Z",
      },
      context(OWNER, "license-acquisition.competing-owner"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance, reserved_balance, consumed_balance
           FROM credit_accounts
           WHERE customer_user_id = ? AND credit_kind = 'license'`,
        )
        .get(CUSTOMER),
    },
    { available_balance: 3, reserved_balance: 0, consumed_balance: 0 },
  );

  await markCheckoutFailed(
    memory.binding,
    checkout.checkout.id,
    "provider_unavailable",
  );
  const ownerIssued = await issueLicense(
    memory.binding,
    {
      source: "owner_approval",
      licenseRequestId,
      expectedRevision: 2,
      issuedAt: "2026-07-19T18:05:00.000Z",
    },
    context(OWNER, "license-acquisition.owner-after-release"),
  );
  assert.equal(ownerIssued.value.source, "owner_approval");
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    1,
  );
});

test("a checkout acquired after credit pre-read wins without changing any losing credit state", async (t) => {
  const { memory, licenseRequestId } = await setup();
  t.after(() => memory.close());

  const snapshotCreditState = () => ({
    account: {
      ...memory.database
        .prepare(
          `SELECT available_balance, reserved_balance, consumed_balance,
                  revision, last_operation_key
           FROM credit_accounts
           WHERE customer_user_id = ? AND credit_kind = 'license'`,
        )
        .get(CUSTOMER),
    },
    lots: memory.database
      .prepare(
        `SELECT id, quantity_available, quantity_reserved, quantity_consumed,
                revision, last_operation_key
         FROM credit_grant_lots
         WHERE customer_user_id = ? AND credit_kind = 'license'
         ORDER BY id`,
      )
      .all(CUSTOMER)
      .map((row) => ({ ...row })),
    reservations: memory.database
      .prepare(
        `SELECT * FROM credit_reservations
         WHERE customer_user_id = ? AND credit_kind = 'license'
         ORDER BY id`,
      )
      .all(CUSTOMER)
      .map((row) => ({ ...row })),
    allocations: memory.database
      .prepare(
        `SELECT allocation.*
         FROM credit_reservation_allocations AS allocation
         JOIN credit_reservations AS reservation
           ON reservation.id = allocation.credit_reservation_id
         WHERE reservation.customer_user_id = ?
           AND reservation.credit_kind = 'license'
         ORDER BY allocation.id`,
      )
      .all(CUSTOMER)
      .map((row) => ({ ...row })),
    ledger: memory.database
      .prepare(
        `SELECT * FROM credit_ledger_entries
         WHERE customer_user_id = ? AND credit_kind = 'license'
         ORDER BY rowid`,
      )
      .all(CUSTOMER)
      .map((row) => ({ ...row })),
    audits: memory.database
      .prepare(
        `SELECT * FROM audit_events
         WHERE subject_type IN ('credit-reservation', 'credit-grant-lot')
         ORDER BY rowid`,
      )
      .all()
      .map((row) => ({ ...row })),
  });
  const before = snapshotCreditState();
  let injected = false;
  const racingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      if (!injected) {
        injected = true;
        memory.database
          .prepare(
            `INSERT INTO checkout_sessions
              (id, customer_user_id, commerce_product_id, commerce_price_id,
               license_request_id, mode, status, return_path, amount_minor,
               currency, stripe_environment, livemode, idempotency_key,
               request_fingerprint)
             VALUES (?, ?, ?, ?, ?, 'payment', 'creating', '/account/licenses',
                     2800, 'USD', 'test', 0, ?, ?)`,
          )
          .run(
            "checkout_license_credit_boundary_race",
            CUSTOMER,
            PRODUCT,
            PRICE,
            licenseRequestId,
            "license-credit-boundary-race",
            "c".repeat(64),
          );
      }
      return memory.binding.batch(statements);
    },
  };

  await assertRuntimeCode(
    redeemLicenseRequestWithCredits(
      racingBinding,
      licenseRequestId,
      context(CUSTOMER, "license-credit-boundary-race"),
      NOW,
    ),
    "STALE_STATE",
  );
  assert.equal(injected, true);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM checkout_sessions
       WHERE id = 'checkout_license_credit_boundary_race'
         AND license_request_id = ? AND status = 'creating'`,
      licenseRequestId,
    ),
    1,
  );
  assert.deepEqual(snapshotCreditState(), before);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
});

test("a break after consumption resumes issuance without consuming twice", async (t) => {
  const { memory, licenseRequestId } = await setup();
  t.after(() => memory.close());

  let mutationReceiptReads = 0;
  const breakingBinding = {
    prepare(sql) {
      if (
        sql.includes("FROM audit_events") &&
        sql.includes("WHERE idempotency_key")
      ) {
        mutationReceiptReads += 1;
        if (mutationReceiptReads === 3) {
          throw new Error("simulated break before license issuance");
        }
      }
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      return memory.binding.batch(statements);
    },
  };

  await assert.rejects(
    redeemLicenseRequestWithCredits(
      breakingBinding,
      licenseRequestId,
      context(CUSTOMER, "break-before-issue"),
      NOW,
    ),
    /simulated break before license issuance/,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_reservations
       WHERE purpose_id = ? AND state = 'consumed'`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM license_document_jobs"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM entitlements WHERE source_type = 'license'",
    ),
    0,
  );

  await assertRuntimeCode(
    createCheckoutIntent(
      memory.binding,
      { productId: PRODUCT, licenseRequestId },
      context(CUSTOMER, "reserved-acquisition.checkout"),
    ),
    "CHECKOUT_UNAVAILABLE",
  );
  await assertRuntimeCode(
    issueLicense(
      memory.binding,
      {
        source: "owner_approval",
        licenseRequestId,
        expectedRevision: 2,
        issuedAt: "2026-07-19T18:06:00.000Z",
      },
      context(OWNER, "reserved-acquisition.owner"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );

  const resumed = await redeemLicenseRequestWithCredits(
    memory.binding,
    licenseRequestId,
    context(CUSTOMER, "resume-after-break"),
    new Date("2026-07-20T18:00:00.000Z"),
  );
  assert.equal(resumed.replayed, false);
  assert.equal(resumed.value.issuedLicense.source, "credit_redemption");
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    1,
  );
});

test("a reserved exact purpose resumes consumption and issuance", async (t) => {
  const { memory, licenseRequestId } = await setup();
  t.after(() => memory.close());

  let mutationReceiptReads = 0;
  const breakingBinding = {
    prepare(sql) {
      if (
        sql.includes("FROM audit_events") &&
        sql.includes("WHERE idempotency_key")
      ) {
        mutationReceiptReads += 1;
        if (mutationReceiptReads === 2) {
          throw new Error("simulated break before credit consumption");
        }
      }
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      return memory.binding.batch(statements);
    },
  };

  await assert.rejects(
    redeemLicenseRequestWithCredits(
      breakingBinding,
      licenseRequestId,
      context(CUSTOMER, "break-before-consume"),
      NOW,
    ),
    /simulated break before credit consumption/,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_reservations
       WHERE purpose_id = ? AND state = 'reserved' AND quantity = 2`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      licenseRequestId,
    ),
    0,
  );

  const resumed = await redeemLicenseRequestWithCredits(
    memory.binding,
    licenseRequestId,
    context(CUSTOMER, "resume-reserved-purpose"),
    new Date("2026-07-20T18:00:00.000Z"),
  );
  assert.equal(resumed.value.licenseCreditCost, 2);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_reservations
       WHERE purpose_id = ? AND state = 'consumed' AND quantity = 2`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM credit_ledger_entries
       WHERE origin_id = ? AND entry_type = 'consumption'`,
      licenseRequestId,
    ),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    1,
  );
});

test("insufficient balance and a different customer grant no reservation or license", async (t) => {
  const { memory, licenseRequestId } = await setup({ creditQuantity: 1 });
  t.after(() => memory.close());

  await assertRuntimeCode(
    redeemLicenseRequestWithCredits(
      memory.binding,
      licenseRequestId,
      context(CUSTOMER, "insufficient-license-credits"),
      NOW,
    ),
    "BENEFIT_CREDIT_INSUFFICIENT",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );

  await grantCustomerCredits(
    memory.binding,
    {
      customerUserId: OTHER_CUSTOMER,
      creditKind: "license",
      originType: "owner",
      originId: "other_customer_license_credit_grant",
      quantity: 3,
      expiresAt: "2027-07-19T18:00:00.000Z",
      fulfillmentEventId: null,
    },
    0,
    context(OWNER, "license-credit.other.grant"),
    NOW,
  );
  await assertRuntimeCode(
    redeemLicenseRequestWithCredits(
      memory.binding,
      licenseRequestId,
      context(OTHER_CUSTOMER, "wrong-customer-license-request"),
      NOW,
    ),
    "LICENSE_CREDIT_REQUEST_NOT_FOUND",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
});

test("an inactive licensing module stops redemption before any credit write", async (t) => {
  const { memory, licenseRequestId } = await setup();
  t.after(() => memory.close());
  memory.database.exec(
    "UPDATE artist_modules SET active = 0 WHERE module_key = 'licensing';",
  );

  await assertRuntimeCode(
    redeemLicenseRequestWithCredits(
      memory.binding,
      licenseRequestId,
      context(CUSTOMER, "inactive-module-license-credit"),
      NOW,
    ),
    "MODULE_INACTIVE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
});

test("an owner-issued request consumes no license credits", async (t) => {
  const { memory, licenseRequestId } = await setup();
  t.after(() => memory.close());

  await issueLicense(
    memory.binding,
    {
      source: "owner_approval",
      licenseRequestId,
      expectedRevision: 2,
      issuedAt: "2026-07-19T18:05:00.000Z",
    },
    context(OWNER, "license-credit.owner-issue"),
  );

  await assertRuntimeCode(
    redeemLicenseRequestWithCredits(
      memory.binding,
      licenseRequestId,
      context(CUSTOMER, "issued-by-owner-credit-attempt"),
      NOW,
    ),
    "LICENSE_CREDIT_ISSUANCE_CONFLICT",
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT available_balance, reserved_balance, consumed_balance
           FROM credit_accounts
           WHERE customer_user_id = ? AND credit_kind = 'license'`,
        )
        .get(CUSTOMER),
    },
    {
      available_balance: 3,
      reserved_balance: 0,
      consumed_balance: 0,
    },
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM credit_reservations"),
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
});
