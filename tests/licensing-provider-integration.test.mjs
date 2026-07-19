import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  approveLicenseRequest,
  createLicenseOffer,
  createLicenseTerms,
  issueLicenseFromVerifiedStripeTestFulfillment,
  submitLicenseRequest,
} = await import("../db/licensing-write.ts");

const OWNER_ID = "user_license_provider_owner";
const CUSTOMER_ID = "user_license_provider_customer";
const TRACK_ID = "track_license_provider";
const TRACK_REVISION_ID = "track_revision_license_provider";
const PRODUCT_ID = "commerce_product_license_provider";
const PRICE_ID = "commerce_price_license_provider";
const COMMERCE_EVENT_ID = "commerce_event_license_provider";
const ORDER_ID = "order_license_provider";
const FULFILLMENT_EVENT_ID = "fulfillment_license_provider";
const STRIPE_EVENT_ID = "evt_AopLicenseProvider001";
const STRIPE_OBJECT_ID = "cs_test_AopLicenseProvider001";
const FACTS_FINGERPRINT = "d".repeat(64);
const PROVIDER_EVENT_CREATED_AT = "2026-07-20T12:00:00.000Z";

function context(actorUserId, key) {
  return {
    actorUserId,
    idempotencyKey: key,
    requestId: `request.${key}`,
  };
}

function providerInput(overrides = {}) {
  return {
    customerUserId: CUSTOMER_ID,
    commerceProductId: PRODUCT_ID,
    commercePriceId: PRICE_ID,
    commerceEventId: COMMERCE_EVENT_ID,
    orderId: ORDER_ID,
    fulfillmentEventId: FULFILLMENT_EVENT_ID,
    factsFingerprint: FACTS_FINGERPRINT,
    stripeEventId: STRIPE_EVENT_ID,
    stripeObjectId: STRIPE_OBJECT_ID,
    fulfillmentProviderObjectId: STRIPE_OBJECT_ID,
    providerEventCreatedAt: PROVIDER_EVENT_CREATED_AT,
    requestId: "request.license.provider.fulfillment",
    ...overrides,
  };
}

async function setupLicenseRequest() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'provider-owner@example.invalid',
       'provider-owner@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'provider-customer@example.invalid',
       'provider-customer@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_license_provider_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}'),
      ('role_license_provider_customer', '${CUSTOMER_ID}', 'customer',
       '${OWNER_ID}');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('${TRACK_ID}', 'fictional-provider-track', '${TRACK_REVISION_ID}',
       '${TRACK_REVISION_ID}', 'published', '2026-07-20T10:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode,
       download_mode, tags_json)
    VALUES
      ('${TRACK_REVISION_ID}', '${TRACK_ID}', 1,
       'Fictional Provider Track', 'protected', 'protected', 'protected', '[]');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type,
       resource_id, state, revision)
    VALUES
      ('${PRODUCT_ID}', 'fictional-provider-license',
       'Fictional provider license', 'Test-only provider license.',
       'license', 'track', '${TRACK_ID}', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment,
       livemode, revision)
    VALUES
      ('${PRICE_ID}', '${PRODUCT_ID}', 3200, 'USD', 'one_time', 1,
       'price_AopLicenseProvider001', 1, 'test', 0, 1);
  `);
  const terms = await createLicenseTerms(
    memory.binding,
    {
      slug: "provider-license-terms",
      state: "active",
      name: "Provider license terms",
      title: "Fictional provider license",
      introduction: "Fictional terms for verified provider testing.",
      generalTerms: "Fictional artist-authored provider terms.",
      disclaimer: "Fictional test disclaimer.",
      options: [
        {
          optionKey: "fictional-film",
          label: "Fictional film",
          description: "A fictional synchronization license.",
          usageCategory: "Synchronization",
          allowedMedia: ["Film"],
          audienceLabel: "Festival audiences",
          maxAudience: 10_000,
          distributionLabel: "One production",
          maxCopies: 1,
          termMonths: 3,
          territory: "Worldwide",
          attributionRequired: true,
          attributionText: "Music by the artist",
          exclusive: false,
          requiresApproval: true,
          licenseCreditCost: 1,
          includesTrackDownload: true,
        },
      ],
    },
    context(OWNER_ID, "provider.terms.create"),
  );
  const offer = await createLicenseOffer(
    memory.binding,
    {
      slug: "fictional-provider-license",
      trackId: TRACK_ID,
      trackRevisionId: TRACK_REVISION_ID,
      licenseTermsId: terms.value.licenseTermsId,
      licenseTermsVersion: 1,
      licenseOptionId: terms.value.optionIds[0],
      commerceProductId: PRODUCT_ID,
      commercePriceId: PRICE_ID,
      state: "active",
    },
    context(OWNER_ID, "provider.offer.create"),
  );
  const submitted = await submitLicenseRequest(
    memory.binding,
    {
      licenseOfferId: offer.value.licenseOfferId,
      licenseeName: "Fictional Provider Licensee",
      projectTitle: "Fictional Provider Project",
      intendedUse: "Opening credits in a fictional production",
      projectDescription: "A fictional production for provider testing.",
    },
    context(CUSTOMER_ID, "provider.request.submit"),
  );
  await approveLicenseRequest(
    memory.binding,
    submitted.value.licenseRequestId,
    {
      expectedRevision: 1,
      decidedAt: "2026-07-20T11:00:00.000Z",
      reason: "The fictional request matches the terms.",
    },
    context(OWNER_ID, "provider.request.approve"),
  );
  return { memory, licenseRequestId: submitted.value.licenseRequestId };
}

function seedProviderFulfillment(database, licenseRequestId, phase) {
  const eventStatus = phase === "processing" ? "processing" : "completed";
  const orderStatus = phase === "processing" ? "pending" : "fulfilled";
  const fulfillmentStatus = phase === "processing" ? "processing" : "fulfilled";
  database.exec(`
    INSERT INTO checkout_sessions
      (id, customer_user_id, commerce_product_id, commerce_price_id,
       license_request_id, mode, status, return_path,
       stripe_checkout_session_id, amount_minor, currency,
       stripe_environment, livemode, idempotency_key, request_fingerprint,
       completed_at)
    VALUES
      ('checkout_license_provider', '${CUSTOMER_ID}', '${PRODUCT_ID}',
       '${PRICE_ID}', '${licenseRequestId}', 'payment', 'completed',
       '/account/licenses', '${STRIPE_OBJECT_ID}', 3200, 'USD', 'test', 0,
       'checkout.license.provider', '${"a".repeat(64)}',
       '${PROVIDER_EVENT_CREATED_AT}');
    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id,
       checkout_session_id, event_created_at, raw_body_digest,
       facts_fingerprint, status, stripe_environment, livemode)
    VALUES
      ('${COMMERCE_EVENT_ID}', '${STRIPE_EVENT_ID}',
       'checkout.session.completed', '${STRIPE_OBJECT_ID}',
       'checkout_license_provider', '${PROVIDER_EVENT_CREATED_AT}',
       '${"b".repeat(64)}', '${FACTS_FINGERPRINT}', '${eventStatus}',
       'test', 0);
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id,
       status, total_minor, currency, stripe_environment, livemode)
    VALUES
      ('${ORDER_ID}', '${CUSTOMER_ID}', 'checkout_license_provider',
       '${COMMERCE_EVENT_ID}', '${orderStatus}', 3200, 'USD', 'test', 0);
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode)
    VALUES
      ('order_item_license_provider', '${ORDER_ID}', '${PRODUCT_ID}', 1,
       '${PRICE_ID}', 'license', 'Fictional provider license', '{}', 1,
       3200, 'USD', 'test', 0);
    INSERT INTO fulfillment_events
      (id, commerce_event_id, checkout_session_id, order_id,
       customer_user_id, commerce_product_id, kind, provider_object_id,
       facts_fingerprint, status, result_json, stripe_environment, livemode)
    VALUES
      ('${FULFILLMENT_EVENT_ID}', '${COMMERCE_EVENT_ID}',
       'checkout_license_provider', '${ORDER_ID}', '${CUSTOMER_ID}',
       '${PRODUCT_ID}', 'one_time', '${STRIPE_OBJECT_ID}',
       '${FACTS_FINGERPRINT}', '${fulfillmentStatus}', '{}', 'test', 0);
  `);
}

function assertRuntimeCode(code) {
  return (error) => {
    assert.equal(error?.code, code);
    return true;
  };
}

for (const phase of ["processing", "fulfilled"]) {
  test(`verified ${phase} Stripe Test facts issue one complete license without caller authority`, async (t) => {
    const { memory, licenseRequestId } = await setupLicenseRequest();
    t.after(() => memory.close());
    seedProviderFulfillment(memory.database, licenseRequestId, phase);

    const issued = await issueLicenseFromVerifiedStripeTestFulfillment(
      memory.binding,
      providerInput(),
    );
    assert.equal(issued.replayed, false);
    assert.equal(issued.value.source, "stripe_test_order");
    assert.equal(issued.value.customerUserId, CUSTOMER_ID);
    assert.equal(issued.value.issuedAt, PROVIDER_EVENT_CREATED_AT);
    assert.equal(issued.value.entitlementIds.length, 2);
    assert.deepEqual(
      {
        ...memory.database
          .prepare(
            `SELECT source, order_id, fulfillment_event_id,
                    stripe_environment, livemode
             FROM issued_licenses WHERE id = ?1`,
          )
          .get(issued.value.issuedLicenseId),
      },
      {
        source: "stripe_test_order",
        order_id: ORDER_ID,
        fulfillment_event_id: FULFILLMENT_EVENT_ID,
        stripe_environment: "test",
        livemode: 0,
      },
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM license_document_jobs
         WHERE id = ?1 AND license_document_id = ?2 AND status = 'queued'`,
        issued.value.documentJobId,
        issued.value.documentId,
      ),
      1,
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM entitlements
         WHERE source_type = 'license' AND source_id = ?1
           AND fulfillment_event_id = ?2 AND state = 'active'`,
        issued.value.issuedLicenseId,
        FULFILLMENT_EVENT_ID,
      ),
      2,
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM license_events
         WHERE issued_license_id = ?1 AND actor_user_id IS NULL
           AND source = 'stripe_test' AND order_id = ?2
           AND fulfillment_event_id = ?3`,
        issued.value.issuedLicenseId,
        ORDER_ID,
        FULFILLMENT_EVENT_ID,
      ),
      1,
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM audit_events
         WHERE action = 'license.issue.stripe-test-fulfillment'
           AND actor_user_id IS NULL AND request_id = ?1`,
        providerInput().requestId,
      ),
      1,
    );

    const replay = await issueLicenseFromVerifiedStripeTestFulfillment(
      memory.binding,
      providerInput(),
    );
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.value, issued.value);
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
      1,
    );
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM license_documents"),
      1,
    );
    assert.deepEqual(
      memory.database.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  });
}

test("wrong verified facts and mixed commerce phases grant no license or access", async (t) => {
  const { memory, licenseRequestId } = await setupLicenseRequest();
  t.after(() => memory.close());
  seedProviderFulfillment(memory.database, licenseRequestId, "processing");

  for (const wrongInput of [
    providerInput({ commercePriceId: "commerce_price_license_wrong" }),
    providerInput({ factsFingerprint: "e".repeat(64) }),
    providerInput({
      fulfillmentProviderObjectId: "cs_test_AopLicenseProviderWrong",
    }),
  ]) {
    await assert.rejects(
      issueLicenseFromVerifiedStripeTestFulfillment(memory.binding, wrongInput),
      assertRuntimeCode("LICENSE_PROVIDER_FULFILLMENT_REQUIRED"),
    );
  }
  memory.database.exec(`
    UPDATE commerce_events
    SET status = 'completed'
    WHERE id = '${COMMERCE_EVENT_ID}';
  `);
  await assert.rejects(
    issueLicenseFromVerifiedStripeTestFulfillment(
      memory.binding,
      providerInput(),
    ),
    assertRuntimeCode("LICENSE_PROVIDER_FULFILLMENT_REQUIRED"),
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM license_documents"),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM entitlements WHERE source_type = 'license'",
    ),
    0,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'license.issue.stripe-test-fulfillment'`,
    ),
    0,
  );
});

test("customer authority lost at the atomic boundary rolls back every license projection", async (t) => {
  const { memory, licenseRequestId } = await setupLicenseRequest();
  t.after(() => memory.close());
  seedProviderFulfillment(memory.database, licenseRequestId, "processing");

  let invalidated = false;
  const invalidatingBinding = {
    prepare(sql) {
      return memory.binding.prepare(sql);
    },
    batch(statements) {
      if (!invalidated) {
        invalidated = true;
        memory.database.exec(`
          UPDATE role_assignments
          SET revoked_at = '2026-07-20T12:00:01.000Z'
          WHERE id = 'role_license_provider_customer';
        `);
      }
      return memory.binding.batch(statements);
    },
  };

  await assert.rejects(
    issueLicenseFromVerifiedStripeTestFulfillment(
      invalidatingBinding,
      providerInput(),
    ),
    assertRuntimeCode("STALE_STATE"),
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM license_requests WHERE id = ?1",
      licenseRequestId,
    ),
    "approved",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM license_documents"),
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
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM audit_events
       WHERE action = 'license.issue.stripe-test-fulfillment'`,
    ),
    0,
  );
});
