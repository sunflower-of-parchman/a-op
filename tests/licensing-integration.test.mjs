import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  listActiveLicenseOffers,
  readActiveLicenseOffer,
  readCustomerLicenseHistory,
  readLicenseAdministration,
  readLicenseTermsVersion,
} = await import("../db/licensing-read.ts");
const {
  approveLicenseRequest,
  createLicenseOffer,
  createLicenseTerms,
  expireIssuedLicense,
  issueLicense,
  rejectLicenseRequest,
  reviseLicenseTerms,
  revokeIssuedLicense,
  setLicenseOfferState,
  setLicenseTermsState,
  submitLicenseRequest,
} = await import("../db/licensing-write.ts");

const OWNER_ID = "user_license_owner";
const CUSTOMER_ID = "user_license_customer";
const OTHER_CUSTOMER_ID = "user_license_other";
const TRACK_ID = "track_license_fictional";
const TRACK_REVISION_ID = "track_revision_license_fictional";
const PRODUCT_ID = "commerce_product_license_fictional";
const PRICE_ID = "commerce_price_license_fictional";

function context(actorUserId, key) {
  return {
    actorUserId,
    idempotencyKey: key,
    requestId: `request.${key}`,
  };
}

function option(overrides = {}) {
  return {
    optionKey: "independent-film",
    label: "Independent film",
    description: "A fictional synchronization use.",
    usageCategory: "Synchronization",
    allowedMedia: ["Film", "Festival trailer"],
    audienceLabel: "Festival audiences",
    maxAudience: 100_000,
    distributionLabel: "One finished production",
    maxCopies: 1,
    termMonths: 1,
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

function terms(overrides = {}) {
  return {
    slug: "sync-terms",
    state: "active",
    name: "Synchronization terms",
    title: "Artist synchronization license",
    introduction: "Fictional artist-authored introduction, version one.",
    generalTerms: "Fictional artist-authored general terms, version one.",
    disclaimer: "Fictional artist-authored disclaimer.",
    options: [option()],
    ...overrides,
  };
}

function requestInput(licenseOfferId, suffix) {
  return {
    licenseOfferId,
    licenseeName: `Fictional Licensee ${suffix}`,
    projectTitle: `Fictional Project ${suffix}`,
    intendedUse: "Opening credits in a fictional production",
    projectDescription: "A fictional independent production used for testing.",
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'license-owner@example.invalid',
       'license-owner@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'license-customer@example.invalid',
       'license-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER_ID}', 'license-other@example.invalid',
       'license-other@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_license_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}'),
      ('role_license_customer', '${CUSTOMER_ID}', 'customer', '${OWNER_ID}'),
      ('role_license_other', '${OTHER_CUSTOMER_ID}', 'customer', '${OWNER_ID}');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('${TRACK_ID}', 'fictional-license-track', '${TRACK_REVISION_ID}',
       '${TRACK_REVISION_ID}', 'published', '2026-07-19T10:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode,
       download_mode, tags_json)
    VALUES
      ('${TRACK_REVISION_ID}', '${TRACK_ID}', 1,
       'Fictional License Track', 'protected', 'protected', 'protected', '[]');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type,
       resource_id, state, revision)
    VALUES
      ('${PRODUCT_ID}', 'fictional-track-license', 'Fictional track license',
       'Test-only fictional license product.', 'license', 'track',
       '${TRACK_ID}', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment,
       livemode, revision)
    VALUES
      ('${PRICE_ID}', '${PRODUCT_ID}', 2500, 'USD', 'one_time', 1,
       'price_test_aop_license_001', 1, 'test', 0, 1);
  `);
  return memory;
}

async function createDefinition(memory, key = "definition") {
  const createdTerms = await createLicenseTerms(
    memory.binding,
    terms(),
    context(OWNER_ID, `${key}.terms.create`),
  );
  const createdOffer = await createLicenseOffer(
    memory.binding,
    {
      slug: `fictional-license-${key}`,
      trackId: TRACK_ID,
      trackRevisionId: TRACK_REVISION_ID,
      licenseTermsId: createdTerms.value.licenseTermsId,
      licenseTermsVersion: 1,
      licenseOptionId: createdTerms.value.optionIds[0],
      commerceProductId: PRODUCT_ID,
      commercePriceId: PRICE_ID,
      state: "active",
    },
    context(OWNER_ID, `${key}.offer.create`),
  );
  return { createdTerms, createdOffer };
}

async function prepareApprovedRequest(memory, licenseOfferId, key) {
  const submitted = await submitLicenseRequest(
    memory.binding,
    requestInput(licenseOfferId, key),
    context(CUSTOMER_ID, `${key}.request.submit`),
  );
  const approved = await approveLicenseRequest(
    memory.binding,
    submitted.value.licenseRequestId,
    {
      expectedRevision: 1,
      decidedAt: "2026-07-19T11:30:00.000Z",
      reason: "The fictional intended use matches the artist-authored terms.",
    },
    context(OWNER_ID, `${key}.request.approve`),
  );
  return { submitted, approved };
}

function assertRuntimeCode(code) {
  return (error) => {
    assert.equal(error?.code, code);
    return true;
  };
}

test("draft terms and offers activate only after their complete frozen references are ready", async () => {
  const memory = await setup();
  try {
    const draftTerms = await createLicenseTerms(
      memory.binding,
      terms({ slug: "draft-sync-terms", state: "draft" }),
      context(OWNER_ID, "draft.terms.create"),
    );
    const draftOffer = await createLicenseOffer(
      memory.binding,
      {
        slug: "draft-license-offer",
        trackId: TRACK_ID,
        trackRevisionId: TRACK_REVISION_ID,
        licenseTermsId: draftTerms.value.licenseTermsId,
        licenseTermsVersion: 1,
        licenseOptionId: draftTerms.value.optionIds[0],
        commerceProductId: PRODUCT_ID,
        commercePriceId: PRICE_ID,
        state: "draft",
      },
      context(OWNER_ID, "draft.offer.create"),
    );
    assert.equal(
      await readLicenseTermsVersion(
        memory.binding,
        draftTerms.value.licenseTermsId,
      ),
      null,
    );
    assert.equal(
      (await readLicenseAdministration(memory.binding, OWNER_ID)).terms[0]
        .state,
      "draft",
    );
    assert.equal(
      await readActiveLicenseOffer(
        memory.binding,
        draftOffer.value.licenseOfferId,
      ),
      null,
    );
    const activeTerms = await setLicenseTermsState(
      memory.binding,
      draftTerms.value.licenseTermsId,
      { expectedState: "draft", nextState: "active" },
      context(OWNER_ID, "draft.terms.activate"),
    );
    assert.equal(activeTerms.value.state, "active");
    assert.equal(
      (
        await readLicenseTermsVersion(
          memory.binding,
          draftTerms.value.licenseTermsId,
        )
      ).state,
      "active",
    );
    const activeOffer = await setLicenseOfferState(
      memory.binding,
      draftOffer.value.licenseOfferId,
      { expectedState: "draft", nextState: "active" },
      context(OWNER_ID, "draft.offer.activate"),
    );
    assert.equal(activeOffer.value.state, "active");
    assert.equal(
      (
        await readActiveLicenseOffer(
          memory.binding,
          draftOffer.value.licenseOfferId,
        )
      ).snapshot.terms.version,
      1,
    );
    assert.deepEqual(
      memory.database.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  } finally {
    memory.close();
  }
});

test("owner administration, customer request, immutable snapshot, issuance, document history, and revocation run atomically", async () => {
  const memory = await setup();
  try {
    const { createdTerms, createdOffer } = await createDefinition(
      memory,
      "owner",
    );
    const replayedTerms = await createLicenseTerms(
      memory.binding,
      terms(),
      context(OWNER_ID, "owner.terms.create"),
    );
    assert.equal(replayedTerms.replayed, true);
    assert.deepEqual(replayedTerms.value, createdTerms.value);

    const activeOffer = await readActiveLicenseOffer(
      memory.binding,
      createdOffer.value.licenseOfferId,
    );
    assert.equal(activeOffer.snapshot.terms.version, 1);
    assert.equal(activeOffer.snapshot.testPrice.amountMinor, 2500);
    assert.deepEqual(
      (await listActiveLicenseOffers(memory.binding)).map(({ id }) => id),
      [createdOffer.value.licenseOfferId],
    );

    const submitted = await submitLicenseRequest(
      memory.binding,
      requestInput(createdOffer.value.licenseOfferId, "Owner"),
      context(CUSTOMER_ID, "owner.request.submit"),
    );
    assert.equal(submitted.value.state, "pending_approval");
    const submittedReplay = await submitLicenseRequest(
      memory.binding,
      requestInput(createdOffer.value.licenseOfferId, "Owner"),
      context(CUSTOMER_ID, "owner.request.submit"),
    );
    assert.equal(submittedReplay.replayed, true);
    assert.deepEqual(submittedReplay.value, submitted.value);

    const revisionInput = { ...terms() };
    delete revisionInput.slug;
    delete revisionInput.state;
    revisionInput.generalTerms =
      "Fictional artist-authored general terms, version two.";
    const revised = await reviseLicenseTerms(
      memory.binding,
      createdTerms.value.licenseTermsId,
      revisionInput,
      1,
      context(OWNER_ID, "owner.terms.revise"),
    );
    assert.equal(revised.value.version, 2);

    const approved = await approveLicenseRequest(
      memory.binding,
      submitted.value.licenseRequestId,
      {
        expectedRevision: 1,
        decidedAt: "2026-07-19T11:30:00.000Z",
        reason: "The fictional intended use matches the terms snapshot.",
      },
      context(OWNER_ID, "owner.request.approve"),
    );
    assert.equal(approved.value.state, "approved");
    const approvedReplay = await approveLicenseRequest(
      memory.binding,
      submitted.value.licenseRequestId,
      {
        expectedRevision: 1,
        decidedAt: "2026-07-19T11:30:00.000Z",
        reason: "The fictional intended use matches the terms snapshot.",
      },
      context(OWNER_ID, "owner.request.approve"),
    );
    assert.equal(approvedReplay.replayed, true);

    const issued = await issueLicense(
      memory.binding,
      {
        source: "owner_approval",
        licenseRequestId: submitted.value.licenseRequestId,
        expectedRevision: 2,
        issuedAt: "2026-07-19T12:00:00.000Z",
      },
      context(OWNER_ID, "owner.license.issue"),
    );
    assert.equal(issued.value.source, "owner_approval");
    assert.equal(issued.value.expiresAt, "2026-08-19T12:00:00.000Z");
    assert.equal(issued.value.entitlementIds.length, 2);
    const issuedReplay = await issueLicense(
      memory.binding,
      {
        source: "owner_approval",
        licenseRequestId: submitted.value.licenseRequestId,
        expectedRevision: 2,
        issuedAt: "2026-07-19T12:00:00.000Z",
      },
      context(OWNER_ID, "owner.license.issue"),
    );
    assert.equal(issuedReplay.replayed, true);
    assert.deepEqual(issuedReplay.value, issued.value);

    const storedSnapshots = memory.database
      .prepare(
        `SELECT request.terms_snapshot_json AS request_snapshot,
                license.terms_snapshot_json AS issued_snapshot
         FROM license_requests request
         JOIN issued_licenses license ON license.license_request_id = request.id
         WHERE request.id = ?1`,
      )
      .get(submitted.value.licenseRequestId);
    assert.equal(
      storedSnapshots.issued_snapshot,
      storedSnapshots.request_snapshot,
    );
    assert.match(storedSnapshots.request_snapshot, /version one/);
    assert.doesNotMatch(storedSnapshots.request_snapshot, /version two/);

    const history = await readCustomerLicenseHistory(
      memory.binding,
      CUSTOMER_ID,
    );
    assert.equal(history.requests.length, 1);
    assert.equal(history.requests[0].termsSnapshot.terms.version, 1);
    assert.equal(history.licenses.length, 1);
    assert.equal(history.documents[0].state, "queued");
    assert.deepEqual(
      history.events.map(({ eventType }) => eventType),
      ["submitted", "approved", "issued"],
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM license_document_jobs
         WHERE license_document_id = ?1 AND status = 'queued'`,
        issued.value.documentId,
      ),
      1,
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM entitlements
         WHERE source_type = 'license' AND source_id = ?1 AND state = 'active'`,
        issued.value.issuedLicenseId,
      ),
      2,
    );

    const administration = await readLicenseAdministration(
      memory.binding,
      OWNER_ID,
    );
    assert.equal(administration.terms[0].currentVersion, 2);
    assert.equal(administration.offers[0].snapshot.terms.version, 1);
    assert.deepEqual(
      administration.documentJobs.map(({ licenseDocumentId, status }) => ({
        licenseDocumentId,
        status,
      })),
      [{ licenseDocumentId: issued.value.documentId, status: "queued" }],
    );
    await assert.rejects(
      readLicenseAdministration(memory.binding, CUSTOMER_ID),
      assertRuntimeCode("LICENSE_OWNER_REQUIRED"),
    );

    const revoked = await revokeIssuedLicense(
      memory.binding,
      issued.value.issuedLicenseId,
      {
        expectedRevision: 1,
        effectiveAt: "2026-07-25T12:00:00.000Z",
        reason: "Fictional owner revocation for verification.",
      },
      context(OWNER_ID, "owner.license.revoke"),
    );
    assert.equal(revoked.value.state, "revoked");
    assert.equal(revoked.value.entitlementCount, 2);
    const revokedReplay = await revokeIssuedLicense(
      memory.binding,
      issued.value.issuedLicenseId,
      {
        expectedRevision: 1,
        effectiveAt: "2026-07-25T12:00:00.000Z",
        reason: "Fictional owner revocation for verification.",
      },
      context(OWNER_ID, "owner.license.revoke"),
    );
    assert.equal(revokedReplay.replayed, true);
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM entitlements
         WHERE source_type = 'license' AND source_id = ?1 AND state = 'revoked'`,
        issued.value.issuedLicenseId,
      ),
      2,
    );

    const rejectedRequest = await submitLicenseRequest(
      memory.binding,
      requestInput(createdOffer.value.licenseOfferId, "Rejected"),
      context(CUSTOMER_ID, "rejected.request.submit"),
    );
    const rejected = await rejectLicenseRequest(
      memory.binding,
      rejectedRequest.value.licenseRequestId,
      {
        expectedRevision: 1,
        decidedAt: "2026-07-26T12:00:00.000Z",
        reason: "The fictional intended use is outside these terms.",
      },
      context(OWNER_ID, "rejected.request.reject"),
    );
    assert.equal(rejected.value.state, "rejected");
    await assert.rejects(
      issueLicense(
        memory.binding,
        {
          source: "owner_approval",
          licenseRequestId: rejectedRequest.value.licenseRequestId,
          expectedRevision: 2,
          issuedAt: "2026-07-26T13:00:00.000Z",
        },
        context(OWNER_ID, "rejected.license.issue"),
      ),
      assertRuntimeCode("LICENSE_STATE_UNAVAILABLE"),
    );

    const archivedOffer = await setLicenseOfferState(
      memory.binding,
      createdOffer.value.licenseOfferId,
      { expectedState: "active", nextState: "archived" },
      context(OWNER_ID, "owner.offer.archive"),
    );
    assert.equal(archivedOffer.value.state, "archived");
    const archivedOfferReplay = await setLicenseOfferState(
      memory.binding,
      createdOffer.value.licenseOfferId,
      { expectedState: "active", nextState: "archived" },
      context(OWNER_ID, "owner.offer.archive"),
    );
    assert.equal(archivedOfferReplay.replayed, true);
    assert.equal(
      await readActiveLicenseOffer(
        memory.binding,
        createdOffer.value.licenseOfferId,
      ),
      null,
    );
    assert.deepEqual(await listActiveLicenseOffers(memory.binding), []);
    const archivedTerms = await setLicenseTermsState(
      memory.binding,
      createdTerms.value.licenseTermsId,
      { expectedState: "active", nextState: "archived" },
      context(OWNER_ID, "owner.terms.archive"),
    );
    assert.equal(archivedTerms.value.state, "archived");
    assert.equal(archivedTerms.value.currentVersion, 2);
    const otherHistory = await readCustomerLicenseHistory(
      memory.binding,
      OTHER_CUSTOMER_ID,
    );
    assert.deepEqual(otherHistory, {
      requests: [],
      licenses: [],
      documents: [],
      events: [],
    });
    assert.deepEqual(
      memory.database.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  } finally {
    memory.close();
  }
});

function seedStripeFulfillment(database, licenseRequestId) {
  const digestA = "a".repeat(64);
  const digestB = "b".repeat(64);
  const digestC = "c".repeat(64);
  database.exec(`
    INSERT INTO checkout_sessions
      (id, customer_user_id, commerce_product_id, commerce_price_id,
       license_request_id, mode, status, return_path,
       stripe_checkout_session_id, amount_minor, currency,
       stripe_environment, livemode, idempotency_key, request_fingerprint,
       completed_at)
    VALUES
      ('checkout_license_stripe', '${CUSTOMER_ID}', '${PRODUCT_ID}',
       '${PRICE_ID}', '${licenseRequestId}', 'payment', 'completed',
       '/account/licenses', 'cs_test_aop_license_001', 2500, 'USD',
       'test', 0, 'checkout.license.stripe', '${digestA}',
       '2026-07-19T12:00:00.000Z');
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       checkout_session_id, event_created_at, raw_body_digest,
       facts_fingerprint, status, stripe_environment, livemode, processed_at)
    VALUES
      ('commerce_event_license_stripe', 'evt_test_aop_license_001',
       'checkout.session.completed', 'cs_test_aop_license_001',
       'checkout_license_stripe', '2026-07-19T12:00:00.000Z', '${digestB}',
       '${digestC}', 'completed', 'test', 0,
       '2026-07-19T12:00:01.000Z');
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id,
       status, total_minor, currency, stripe_payment_intent_id,
       stripe_environment, livemode, completed_at)
    VALUES
      ('order_license_stripe', '${CUSTOMER_ID}', 'checkout_license_stripe',
       'commerce_event_license_stripe', 'fulfilled', 2500, 'USD',
       'pi_test_aop_license_001', 'test', 0,
       '2026-07-19T12:00:01.000Z');
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode)
    VALUES
      ('order_item_license_stripe', 'order_license_stripe', '${PRODUCT_ID}',
       1, '${PRICE_ID}', 'license', 'Fictional track license', '{}', 1,
       2500, 'USD', 'test', 0);
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id,
       customer_user_id, commerce_product_id, kind, provider_object_id,
       facts_fingerprint, status, result_json, stripe_environment,
       livemode, completed_at)
    VALUES
      ('fulfillment_license_stripe', 'commerce_event_license_stripe',
       'checkout_license_stripe', 'order_license_stripe', '${CUSTOMER_ID}',
       '${PRODUCT_ID}', 'one_time', 'cs_test_aop_license_001', '${digestC}',
       'fulfilled', '{}', 'test', 0, '2026-07-19T12:00:02.000Z');
  `);
}

function seedConsumedLicenseCredit(database, licenseRequestId) {
  database.exec(`
    INSERT INTO credit_accounts
      (id, customer_user_id, credit_kind, available_balance,
       reserved_balance, consumed_balance, stripe_environment, livemode,
       revision, last_operation_key)
    VALUES
      ('credit_account_license', '${CUSTOMER_ID}', 'license', 0, 0, 2,
       'test', 0, 3, 'credit.account.license.consumed');
    INSERT INTO credit_reservations
      (id, credit_account_id, customer_user_id, credit_kind, purpose_type,
       purpose_id, quantity, state, expires_at, consumed_at, request_id,
       stripe_environment, livemode, revision, last_operation_key)
    VALUES
      ('credit_reservation_license', 'credit_account_license',
       '${CUSTOMER_ID}', 'license', 'license_request', '${licenseRequestId}',
       2, 'consumed', '2026-07-20T12:00:00.000Z',
       '2026-07-19T12:00:00.000Z', 'credit.request.license', 'test', 0, 2,
       'credit.reservation.license.consumed');
    INSERT INTO credit_ledger_entries
      (id, credit_account_id, customer_user_id, credit_kind,
       credit_reservation_id, entry_type, available_delta, reserved_delta,
       consumed_delta, available_after, reserved_after, consumed_after,
       origin_type, origin_id, stripe_environment, livemode, idempotency_key)
    VALUES
      ('credit_ledger_license_consumed', 'credit_account_license',
       '${CUSTOMER_ID}', 'license', 'credit_reservation_license',
       'consumption', 0, -2, 2, 0, 0, 2, 'license', '${licenseRequestId}',
       'test', 0, 'credit.ledger.license.consumed');
  `);
}

test("verified Stripe-test orders and consumed license credits issue once and expiry closes access", async () => {
  const memory = await setup();
  try {
    const { createdOffer } = await createDefinition(memory, "sources");
    const stripeRequest = await prepareApprovedRequest(
      memory,
      createdOffer.value.licenseOfferId,
      "stripe",
    );
    const stripeInput = {
      source: "stripe_test_order",
      licenseRequestId: stripeRequest.submitted.value.licenseRequestId,
      expectedRevision: 2,
      issuedAt: "2026-07-19T12:10:00.000Z",
      orderId: "order_license_stripe",
      fulfillmentEventId: "fulfillment_license_stripe",
    };
    await assert.rejects(
      issueLicense(
        memory.binding,
        stripeInput,
        context(CUSTOMER_ID, "stripe.license.issue"),
      ),
      assertRuntimeCode("LICENSE_STATE_UNAVAILABLE"),
    );
    assert.equal(
      scalar(
        memory.database,
        "SELECT COUNT(*) FROM issued_licenses WHERE license_request_id = ?1",
        stripeRequest.submitted.value.licenseRequestId,
      ),
      0,
    );
    seedStripeFulfillment(
      memory.database,
      stripeRequest.submitted.value.licenseRequestId,
    );
    const stripeIssued = await issueLicense(
      memory.binding,
      stripeInput,
      context(CUSTOMER_ID, "stripe.license.issue"),
    );
    assert.equal(stripeIssued.value.source, "stripe_test_order");
    const stripeReplay = await issueLicense(
      memory.binding,
      stripeInput,
      context(CUSTOMER_ID, "stripe.license.issue"),
    );
    assert.equal(stripeReplay.replayed, true);
    assert.deepEqual(stripeReplay.value, stripeIssued.value);
    assert.deepEqual(
      {
        ...memory.database
          .prepare(
            `SELECT source, order_id, credit_ledger_entry_id,
                  fulfillment_event_id, stripe_environment, livemode
           FROM issued_licenses WHERE id = ?1`,
          )
          .get(stripeIssued.value.issuedLicenseId),
      },
      {
        source: "stripe_test_order",
        order_id: "order_license_stripe",
        credit_ledger_entry_id: null,
        fulfillment_event_id: "fulfillment_license_stripe",
        stripe_environment: "test",
        livemode: 0,
      },
    );

    const creditRequest = await prepareApprovedRequest(
      memory,
      createdOffer.value.licenseOfferId,
      "credit",
    );
    seedConsumedLicenseCredit(
      memory.database,
      creditRequest.submitted.value.licenseRequestId,
    );
    const creditInput = {
      source: "credit_redemption",
      licenseRequestId: creditRequest.submitted.value.licenseRequestId,
      expectedRevision: 2,
      issuedAt: "2026-07-19T13:00:00.000Z",
      creditLedgerEntryId: "credit_ledger_license_consumed",
    };
    const creditIssued = await issueLicense(
      memory.binding,
      creditInput,
      context(CUSTOMER_ID, "credit.license.issue"),
    );
    assert.equal(creditIssued.value.source, "credit_redemption");
    assert.equal(creditIssued.value.expiresAt, "2026-08-19T13:00:00.000Z");
    assert.deepEqual(
      {
        ...memory.database
          .prepare(
            `SELECT source, order_id, credit_ledger_entry_id,
                  fulfillment_event_id
           FROM issued_licenses WHERE id = ?1`,
          )
          .get(creditIssued.value.issuedLicenseId),
      },
      {
        source: "credit_redemption",
        order_id: null,
        credit_ledger_entry_id: "credit_ledger_license_consumed",
        fulfillment_event_id: null,
      },
    );

    await assert.rejects(
      expireIssuedLicense(
        memory.binding,
        creditIssued.value.issuedLicenseId,
        {
          expectedRevision: 1,
          effectiveAt: "2026-08-19T12:59:59.999Z",
          reason: "The recorded term is not complete yet.",
        },
        context(OWNER_ID, "credit.license.expire.early"),
      ),
      assertRuntimeCode("LICENSE_STATE_UNAVAILABLE"),
    );
    const expired = await expireIssuedLicense(
      memory.binding,
      creditIssued.value.issuedLicenseId,
      {
        expectedRevision: 1,
        effectiveAt: "2026-08-19T13:00:00.000Z",
        reason: "The recorded license term completed.",
      },
      context(OWNER_ID, "credit.license.expire"),
    );
    assert.equal(expired.value.state, "expired");
    const expiredReplay = await expireIssuedLicense(
      memory.binding,
      creditIssued.value.issuedLicenseId,
      {
        expectedRevision: 1,
        effectiveAt: "2026-08-19T13:00:00.000Z",
        reason: "The recorded license term completed.",
      },
      context(OWNER_ID, "credit.license.expire"),
    );
    assert.equal(expiredReplay.replayed, true);
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM entitlements
         WHERE source_type = 'license' AND source_id = ?1 AND state = 'expired'`,
        creditIssued.value.issuedLicenseId,
      ),
      2,
    );

    const history = await readCustomerLicenseHistory(
      memory.binding,
      CUSTOMER_ID,
    );
    assert.deepEqual(history.licenses.map(({ source }) => source).sort(), [
      "credit_redemption",
      "stripe_test_order",
    ]);
    assert.equal(
      history.events.filter(({ eventType }) => eventType === "issued").length,
      2,
    );
    assert.equal(
      history.events.filter(({ eventType }) => eventType === "expired").length,
      1,
    );
    assert.deepEqual(
      memory.database.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  } finally {
    memory.close();
  }
});
