import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { processVerifiedCheckoutEvent } =
  await import("../db/commerce-fulfillment.ts");
const {
  approveLicenseRequest,
  createLicenseOffer,
  createLicenseTerms,
  submitLicenseRequest,
} = await import("../db/licensing-write.ts");

const OWNER_ID = "user_commerce_license_owner";
const CUSTOMER_ID = "user_commerce_license_customer";
const TRACK_ID = "track_commerce_license";
const TRACK_REVISION_ID = "track_revision_commerce_license";
const PRODUCT_ID = "product_commerce_license";
const PRICE_ID = "price_commerce_license";
const PROCESSED_AT = "2026-07-19T14:00:01.000Z";

function context(actorUserId, key) {
  return {
    actorUserId,
    idempotencyKey: key,
    requestId: `request.${key}`,
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'commerce-license-owner@example.invalid',
       'commerce-license-owner@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'commerce-license-customer@example.invalid',
       'commerce-license-customer@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_commerce_license_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}'),
      ('role_commerce_license_customer', '${CUSTOMER_ID}', 'customer',
       '${OWNER_ID}');
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES ('${TRACK_ID}', 'commerce-license-track', '${TRACK_REVISION_ID}',
            '${TRACK_REVISION_ID}', 'published',
            '2026-07-19T12:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode,
       tags_json)
    VALUES ('${TRACK_REVISION_ID}', '${TRACK_ID}', 1,
            'Commerce License Track', 'protected', 'protected', 'protected',
            '[]');
    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type, resource_id,
       state, revision)
    VALUES ('${PRODUCT_ID}', 'commerce-license', 'Commerce test license',
            'A fictional Stripe Test license.', 'license', 'track',
            '${TRACK_ID}', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode,
       revision)
    VALUES ('${PRICE_ID}', '${PRODUCT_ID}', 2500, 'USD', 'one_time', 1,
            'price_CommerceLicenseTest001', 1, 'test', 0, 1);
  `);

  const terms = await createLicenseTerms(
    memory.binding,
    {
      slug: "commerce-license-terms",
      state: "active",
      name: "Commerce license terms",
      title: "Artist test synchronization license",
      introduction: "Fictional artist-authored terms for verification.",
      generalTerms: "Fictional general terms for the test license.",
      disclaimer: "Fictional terms do not grant real-world rights.",
      options: [
        {
          optionKey: "short-film",
          label: "Short film",
          description: "A fictional synchronization use.",
          usageCategory: "Synchronization",
          allowedMedia: ["Film"],
          audienceLabel: "Festival audiences",
          maxAudience: 10000,
          distributionLabel: "One finished production",
          maxCopies: 1,
          termMonths: 1,
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
    context(OWNER_ID, "commerce-license.terms"),
  );
  const offer = await createLicenseOffer(
    memory.binding,
    {
      slug: "commerce-license-offer",
      trackId: TRACK_ID,
      trackRevisionId: TRACK_REVISION_ID,
      licenseTermsId: terms.value.licenseTermsId,
      licenseTermsVersion: 1,
      licenseOptionId: terms.value.optionIds[0],
      commerceProductId: PRODUCT_ID,
      commercePriceId: PRICE_ID,
      state: "active",
    },
    context(OWNER_ID, "commerce-license.offer"),
  );
  const submitted = await submitLicenseRequest(
    memory.binding,
    {
      licenseOfferId: offer.value.licenseOfferId,
      licenseeName: "Fictional Licensee",
      projectTitle: "Fictional Short Film",
      intendedUse: "Opening credits in a fictional film",
      projectDescription: "A fictional project used only for verification.",
    },
    context(CUSTOMER_ID, "commerce-license.request"),
  );
  await approveLicenseRequest(
    memory.binding,
    submitted.value.licenseRequestId,
    {
      expectedRevision: 1,
      decidedAt: "2026-07-19T13:30:00.000Z",
      reason: "The fictional use matches the frozen terms.",
    },
    context(OWNER_ID, "commerce-license.approve"),
  );
  return { memory, licenseRequestId: submitted.value.licenseRequestId };
}

function seedCheckout(database, licenseRequestId) {
  database
    .prepare(
      `INSERT INTO checkout_sessions
        (id, customer_user_id, commerce_product_id, commerce_price_id,
         license_request_id, mode, status, return_path,
         stripe_checkout_session_id, stripe_checkout_url, amount_minor,
         currency, stripe_environment, livemode, idempotency_key,
         request_fingerprint)
       VALUES ('checkout_commerce_license', ?1, ?2, ?3, ?4, 'payment',
               'open', '/commerce/return',
               'cs_test_CommerceLicenseSession001',
               'https://checkout.stripe.com/c/pay/commerce-license-test',
               2500, 'USD', 'test', 0, 'checkout.commerce-license', ?5)`,
    )
    .run(CUSTOMER_ID, PRODUCT_ID, PRICE_ID, licenseRequestId, "c".repeat(64));
}

function eventInput({
  eventId = "evt_CommerceLicenseEvent001",
  rawBodyDigest = "a".repeat(64),
  factsFingerprint = "b".repeat(64),
  requestId = "request_commerce_license_001",
} = {}) {
  return {
    event: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      stripeEventId: eventId,
      stripeEventType: "checkout.session.completed",
      createdAtUnix: 1784479200,
      objectKind: "checkout-session",
      checkoutSession: {
        checkoutSessionId: "cs_test_CommerceLicenseSession001",
        mode: "payment",
        status: "complete",
        paymentStatus: "paid",
        stripeCustomerId: "cus_CommerceLicenseCustomer001",
        stripeSubscriptionId: null,
        amountTotal: 2500,
        currency: "usd",
        application: {
          checkoutId: "checkout_commerce_license",
          productId: PRODUCT_ID,
          customerUserId: CUSTOMER_ID,
        },
      },
    },
    rawBodyDigest,
    factsFingerprint,
    requestId,
    processedAt: PROCESSED_AT,
  };
}

test("a verified paid license checkout issues one immutable test license and replay creates no duplicate", async () => {
  const { memory, licenseRequestId } = await setup();
  try {
    seedCheckout(memory.database, licenseRequestId);
    const input = eventInput();
    const first = await processVerifiedCheckoutEvent(memory.binding, input);

    assert.equal(first.status, "fulfilled");
    assert.equal(first.resultType, "license");
    assert.equal(first.replayed, false);
    assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM fulfillment_events"),
      1,
    );
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
      1,
    );
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM license_documents"),
      1,
    );
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM license_document_jobs"),
      1,
    );
    assert.equal(
      scalar(
        memory.database,
        "SELECT COUNT(*) FROM entitlements WHERE source_type = 'license'",
      ),
      2,
    );
    assert.deepEqual(
      {
        ...memory.database
          .prepare(
            `SELECT source, order_id, fulfillment_event_id,
                    stripe_environment, livemode
             FROM issued_licenses`,
          )
          .get(),
      },
      {
        source: "stripe_test_order",
        order_id: first.orderId,
        fulfillment_event_id: first.fulfillmentEventId,
        stripe_environment: "test",
        livemode: 0,
      },
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM audit_events
         WHERE action IN (
           'commerce.webhook.processing',
           'license.issue.stripe-test-fulfillment',
           'commerce.webhook.fulfilled'
         )`,
      ),
      3,
    );

    const replay = await processVerifiedCheckoutEvent(memory.binding, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.orderId, first.orderId);
    for (const [table, expected] of [
      ["commerce_events", 1],
      ["orders", 1],
      ["fulfillment_events", 1],
      ["issued_licenses", 1],
      ["license_documents", 1],
      ["license_document_jobs", 1],
      ["entitlements", 2],
    ]) {
      assert.equal(
        scalar(memory.database, `SELECT COUNT(*) FROM ${table}`),
        expected,
      );
    }

    const secondEvent = await processVerifiedCheckoutEvent(
      memory.binding,
      eventInput({
        eventId: "evt_CommerceLicenseEvent002",
        rawBodyDigest: "d".repeat(64),
        factsFingerprint: "e".repeat(64),
        requestId: "request_commerce_license_002",
      }),
    );
    assert.equal(secondEvent.status, "ignored");
    assert.equal(secondEvent.resultType, "already-fulfilled");
    assert.equal(secondEvent.orderId, first.orderId);
    assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM orders"), 1);
    assert.equal(
      scalar(memory.database, "SELECT COUNT(*) FROM issued_licenses"),
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
