import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  activateCommerceProduct,
  archiveCommerceProduct,
  createCommerceProduct,
} = await import("../db/commerce-admin-write.ts");
const { bindCommerceIntent } = await import("../db/commerce-binding-write.ts");

const OWNER_ID = "user_commerce_product_owner";
let requestSequence = 0;

function context(idempotencyKey, actorUserId = OWNER_ID) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_commerce_product_${requestSequence}`,
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function price(stripePriceId, overrides = {}) {
  return {
    stripePriceId,
    amountMinor: 900,
    currency: "USD",
    billingInterval: "one_time",
    intervalCount: 1,
    ...overrides,
  };
}

function product(slug, productType, subject, stripePriceId, overrides = {}) {
  return {
    slug,
    name: `Fictional ${productType} product`,
    description: "A fictional Stripe Test Mode product.",
    productType,
    subject,
    price: price(stripePriceId),
    ...overrides,
  };
}

function seedDefinitions(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'owner@example.invalid', 'owner@example.invalid', 'active'),
      ('user_commerce_product_disabled', 'disabled@example.invalid',
       'disabled@example.invalid', 'disabled');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id, revoked_at)
    VALUES
      ('role_commerce_product_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}', NULL),
      ('role_commerce_product_disabled', 'user_commerce_product_disabled',
       'owner', '${OWNER_ID}', NULL);

    UPDATE artist_modules
    SET active = 1, activated_at = CURRENT_TIMESTAMP,
        updated_by_user_id = '${OWNER_ID}'
    WHERE module_key IN
      ('downloads', 'licensing', 'memberships', 'subscriptions');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('track_commerce_product', 'track-commerce-product',
       'track_commerce_product_r1', 'track_commerce_product_r1',
       'published', 1);
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_commerce_product_r1', 'track_commerce_product', 1,
       'Fictional protected track', 'protected', 'protected', 'protected');

    INSERT INTO releases
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('release_commerce_product', 'release-commerce-product',
       'release_commerce_product_r1', 'release_commerce_product_r1',
       'published', 1);
    INSERT INTO release_revisions
      (id, release_id, revision, title, view_mode)
    VALUES
      ('release_commerce_product_r1', 'release_commerce_product', 1,
       'Fictional protected release', 'protected');

    INSERT INTO collections
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('collection_commerce_product', 'collection-commerce-product',
       'collection_commerce_product_r1', 'collection_commerce_product_r1',
       'published', 1);
    INSERT INTO collection_revisions
      (id, collection_id, revision, title, view_mode)
    VALUES
      ('collection_commerce_product_r1', 'collection_commerce_product', 1,
       'Fictional protected collection', 'protected');

    INSERT INTO access_plans
      (id, slug, name, description, state, revision, created_by_user_id)
    VALUES
      ('access_plan_commerce_product', 'commerce-product-access',
       'Fictional commerce access', '', 'active', 1, '${OWNER_ID}');
    INSERT INTO access_plan_items
      (id, access_plan_id, position, resource_type, resource_id, actions_json,
       remaining_uses, download_disposition)
    VALUES
      ('access_item_commerce_track', 'access_plan_commerce_product', 1,
       'track', 'track_commerce_product', '["view","stream","download"]',
       NULL, 'attachment'),
      ('access_item_commerce_release', 'access_plan_commerce_product', 2,
       'release', 'release_commerce_product', '["view"]', NULL, NULL),
      ('access_item_commerce_collection', 'access_plan_commerce_product', 3,
       'collection', 'collection_commerce_product', '["view"]', NULL, NULL);

    INSERT INTO membership_plans
      (id, slug, state, current_revision, created_by_user_id)
    VALUES
      ('membership_plan_commerce_product', 'commerce-membership', 'active', 1,
       '${OWNER_ID}');
    INSERT INTO membership_plan_revisions
      (id, membership_plan_id, revision, name, description, benefits_json,
       access_plan_id, access_plan_revision, download_credits,
       license_credits, duration_days, created_by_user_id)
    VALUES
      ('membership_plan_commerce_product_r1',
       'membership_plan_commerce_product', 1, 'Fictional membership', '',
       '["Protected catalog access"]', 'access_plan_commerce_product', 1,
       1, 1, 30, '${OWNER_ID}');

    INSERT INTO subscription_plans
      (id, slug, name, description, membership_plan_id,
       membership_plan_revision_id, membership_plan_revision,
       billing_interval, interval_count, state, revision, created_by_user_id)
    VALUES
      ('subscription_plan_commerce_product', 'commerce-subscription',
       'Fictional subscription', '', 'membership_plan_commerce_product',
       'membership_plan_commerce_product_r1', 1, 'month', 1, 'active', 1,
       '${OWNER_ID}');

    INSERT INTO license_terms
      (id, slug, state, current_version, created_by_user_id)
    VALUES
      ('license_terms_commerce_product', 'commerce-license-terms', 'active', 1,
       '${OWNER_ID}');
    INSERT INTO license_terms_versions
      (id, license_terms_id, version, name, title, introduction,
       general_terms, disclaimer, created_by_user_id)
    VALUES
      ('license_terms_commerce_product_v1', 'license_terms_commerce_product', 1,
       'Fictional terms', 'Fictional artist license', '',
       'Fictional general terms.', '', '${OWNER_ID}');
    INSERT INTO license_options
      (id, license_terms_id, license_terms_version_id, license_terms_version,
       option_key, label, description, usage_category, allowed_media_json,
       territory, attribution_required, attribution_text, exclusive,
       requires_approval, license_credit_cost, includes_track_download,
       position)
    VALUES
      ('license_option_commerce_product', 'license_terms_commerce_product',
       'license_terms_commerce_product_v1', 1, 'independent-film',
       'Independent film', '', 'Synchronization', '["Film"]', 'Worldwide',
       1, 'Music by the artist', 0, 1, 1, 1, 1);
  `);
}

function catalogSubject(resourceType) {
  return {
    resourceId: `${resourceType}_commerce_product`,
    resourceRevisionId: `${resourceType}_commerce_product_r1`,
    resourceVersion: 1,
    accessPlanId: "access_plan_commerce_product",
    accessPlanRevision: 1,
  };
}

test("owner creates every test product shape and transitions only sale state", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDefinitions(memory.database);

  const definitions = [
    product(
      "test-track-access",
      "track",
      catalogSubject("track"),
      "price_AopAdminTrack001",
    ),
    product(
      "test-release-access",
      "release",
      catalogSubject("release"),
      "price_AopAdminRelease001",
    ),
    product(
      "test-collection-access",
      "collection",
      catalogSubject("collection"),
      "price_AopAdminCollection001",
    ),
    product(
      "test-membership",
      "membership",
      {
        membershipPlanId: "membership_plan_commerce_product",
        membershipPlanRevision: 1,
      },
      "price_AopAdminMembership001",
    ),
    product(
      "test-subscription",
      "subscription",
      {
        subscriptionPlanId: "subscription_plan_commerce_product",
        subscriptionPlanRevision: 1,
      },
      "price_AopAdminSubscription001",
      {
        price: price("price_AopAdminSubscription001", {
          billingInterval: "month",
        }),
      },
    ),
    product(
      "test-license",
      "license",
      {
        trackId: "track_commerce_product",
        trackRevisionId: "track_commerce_product_r1",
        trackVersion: 1,
      },
      "price_AopAdminLicense001",
    ),
    product(
      "test-download-credits",
      "download-credits",
      { quantity: 5 },
      "price_AopAdminDownloadCredits001",
    ),
    product(
      "test-license-credits",
      "license-credits",
      { quantity: 2 },
      "price_AopAdminLicenseCredits001",
    ),
  ];

  const created = [];
  for (const definition of definitions) {
    const operation = context(`create.${definition.productType}`);
    const first = await createCommerceProduct(
      memory.binding,
      definition,
      operation,
    );
    assert.equal(first.replayed, false);
    assert.equal(first.value.state, "draft");
    assert.equal(first.value.revision, 1);
    assert.equal(first.value.stripeEnvironment, "test");
    assert.equal(first.value.livemode, false);
    const replay = await createCommerceProduct(
      memory.binding,
      definition,
      operation,
    );
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.value, first.value);
    created.push(first.value);
  }

  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM commerce_products"),
    8,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM commerce_prices WHERE active = 1 AND stripe_environment = 'test' AND livemode = 0 AND revision = 1",
    ),
    8,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.product.create'",
    ),
    8,
  );

  for (const receipt of created) {
    const licenseOffer =
      receipt.productType === "license"
        ? {
            licenseOfferId: "license_offer_commerce_product",
            licenseOfferRevision: 1,
          }
        : null;
    if (receipt.productType === "license") {
      await assertRuntimeCode(
        activateCommerceProduct(
          memory.binding,
          receipt.commerceProductId,
          1,
          licenseOffer,
          context("activate.license.missing-offer"),
        ),
        "COMMERCE_PRODUCT_REFERENCE_UNAVAILABLE",
      );
      memory.database
        .prepare(
          `INSERT INTO license_offers
            (id, slug, track_id, track_revision_id, license_terms_id,
             license_terms_version_id, license_terms_version,
             license_option_id, commerce_product_id, commerce_price_id,
             state, revision, created_by_user_id)
           VALUES (?, 'commerce-license-offer', 'track_commerce_product',
                   'track_commerce_product_r1',
                   'license_terms_commerce_product',
                   'license_terms_commerce_product_v1', 1,
                   'license_option_commerce_product', ?, ?, 'draft', 1, ?)`,
        )
        .run(
          licenseOffer.licenseOfferId,
          receipt.commerceProductId,
          receipt.commercePriceId,
          OWNER_ID,
        );
    }
    const operation = context(`activate.${receipt.productType}`);
    const active = await activateCommerceProduct(
      memory.binding,
      receipt.commerceProductId,
      1,
      licenseOffer,
      operation,
    );
    assert.equal(active.value.state, "active");
    assert.equal(active.value.revision, 2);
    assert.equal(
      (
        await activateCommerceProduct(
          memory.binding,
          receipt.commerceProductId,
          1,
          licenseOffer,
          operation,
        )
      ).replayed,
      true,
    );
  }

  const track = created.find(({ productType }) => productType === "track");
  memory.database
    .prepare(
      `INSERT INTO checkout_sessions
        (id, customer_user_id, commerce_product_id, commerce_price_id, mode,
         status, return_path, stripe_checkout_session_id, amount_minor,
         currency, stripe_environment, livemode, idempotency_key,
         request_fingerprint, completed_at)
       VALUES
        ('checkout_product_history', ?, ?, ?, 'payment', 'completed',
         '/account/orders', 'cs_test_AopProductHistory001', 900, 'USD',
         'test', 0, 'checkout-product-history', ?, CURRENT_TIMESTAMP)`,
    )
    .run(
      OWNER_ID,
      track.commerceProductId,
      track.commercePriceId,
      "a".repeat(64),
    );
  memory.database
    .prepare(
      `INSERT INTO commerce_events
        (id, stripe_event_id, event_type, stripe_object_id,
         checkout_session_id, event_created_at, raw_body_digest,
         facts_fingerprint, status, stripe_environment, livemode, processed_at)
       VALUES
        ('commerce_event_product_history', 'evt_AopProductHistory001',
         'checkout.session.completed', 'cs_test_AopProductHistory001',
         'checkout_product_history', CURRENT_TIMESTAMP, ?, ?, 'completed',
         'test', 0, CURRENT_TIMESTAMP)`,
    )
    .run("b".repeat(64), "c".repeat(64));
  memory.database.exec(`
    INSERT INTO orders
      (id, customer_user_id, checkout_session_id, commerce_event_id, status,
       total_minor, currency, stripe_environment, livemode, completed_at)
    VALUES
      ('order_product_history', '${OWNER_ID}', 'checkout_product_history',
       'commerce_event_product_history', 'fulfilled', 900, 'USD', 'test', 0,
       CURRENT_TIMESTAMP);
  `);
  memory.database
    .prepare(
      `INSERT INTO order_items
        (id, order_id, commerce_product_id, commerce_product_revision,
         commerce_price_id, product_type, product_name,
         fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
         stripe_environment, livemode)
       VALUES
        ('order_item_product_history', 'order_product_history', ?, 2, ?,
         'track', 'Fictional track product', '{}', 1, 900, 'USD', 'test', 0)`,
    )
    .run(track.commerceProductId, track.commercePriceId);
  const definitionBefore = memory.database
    .prepare(
      `SELECT name, description, resource_type, resource_id,
              access_plan_id, access_plan_revision
       FROM commerce_products WHERE id = ?`,
    )
    .get(track.commerceProductId);
  const priceBefore = memory.database
    .prepare("SELECT * FROM commerce_prices WHERE id = ?")
    .get(track.commercePriceId);
  const archived = await archiveCommerceProduct(
    memory.binding,
    track.commerceProductId,
    2,
    context("archive.track"),
  );
  assert.equal(archived.value.state, "archived");
  assert.equal(archived.value.revision, 3);
  const definitionAfter = memory.database
    .prepare(
      `SELECT name, description, resource_type, resource_id,
              access_plan_id, access_plan_revision
       FROM commerce_products WHERE id = ?`,
    )
    .get(track.commerceProductId);
  const priceAfter = memory.database
    .prepare("SELECT * FROM commerce_prices WHERE id = ?")
    .get(track.commercePriceId);
  assert.deepEqual(definitionAfter, definitionBefore);
  assert.deepEqual(priceAfter, priceBefore);
  assert.equal(
    scalar(
      memory.database,
      "SELECT commerce_product_revision FROM order_items WHERE id = 'order_item_product_history'",
    ),
    2,
  );
  for (const receipt of created.filter(
    ({ commerceProductId }) => commerceProductId !== track.commerceProductId,
  )) {
    const terminal = await archiveCommerceProduct(
      memory.binding,
      receipt.commerceProductId,
      2,
      context(`archive.${receipt.productType}`),
    );
    assert.equal(terminal.value.state, "archived");
    assert.equal(terminal.value.revision, 3);
  }
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action IN ('commerce.product.activate', 'commerce.product.archive')",
    ),
    16,
  );
});

test("owner authority, module state, exact revisions, CAS, and idempotency all gate writes", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDefinitions(memory.database);

  const trackDefinition = product(
    "gated-track-access",
    "track",
    catalogSubject("track"),
    "price_AopAdminGatedTrack001",
  );
  await assertRuntimeCode(
    createCommerceProduct(
      memory.binding,
      trackDefinition,
      context("disabled-owner", "user_commerce_product_disabled"),
    ),
    "COMMERCE_OWNER_REQUIRED",
  );
  const createContext = context("create.gated-track");
  const created = await createCommerceProduct(
    memory.binding,
    trackDefinition,
    createContext,
  );
  await assertRuntimeCode(
    createCommerceProduct(
      memory.binding,
      { ...trackDefinition, name: "Different fingerprint" },
      createContext,
    ),
    "IDEMPOTENCY_CONFLICT",
  );
  await assertRuntimeCode(
    activateCommerceProduct(
      memory.binding,
      created.value.commerceProductId,
      2,
      null,
      context("activate.stale"),
    ),
    "STALE_STATE",
  );

  memory.database.exec(`
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_commerce_product_r2', 'track_commerce_product', 2,
       'Fictional changed track', 'protected', 'protected', 'protected');
    UPDATE tracks
    SET draft_revision_id = 'track_commerce_product_r2',
        published_revision_id = 'track_commerce_product_r2', version = 2
    WHERE id = 'track_commerce_product';
  `);
  await assertRuntimeCode(
    activateCommerceProduct(
      memory.binding,
      created.value.commerceProductId,
      1,
      null,
      context("activate.changed-resource"),
    ),
    "COMMERCE_PRODUCT_REFERENCE_UNAVAILABLE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM commerce_products WHERE id = ?",
      created.value.commerceProductId,
    ),
    "draft",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key LIKE '%activate.changed-resource'",
    ),
    0,
  );

  const release = await createCommerceProduct(
    memory.binding,
    product(
      "gated-release-access",
      "release",
      catalogSubject("release"),
      "price_AopAdminGatedRelease001",
    ),
    context("create.gated-release"),
  );
  memory.database.exec(`
    UPDATE access_plans
    SET revision = 2
    WHERE id = 'access_plan_commerce_product';
  `);
  await assertRuntimeCode(
    activateCommerceProduct(
      memory.binding,
      release.value.commerceProductId,
      1,
      null,
      context("activate.changed-plan"),
    ),
    "COMMERCE_PRODUCT_REFERENCE_UNAVAILABLE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM commerce_products WHERE id = ?",
      release.value.commerceProductId,
    ),
    "draft",
  );

  const creditDefinition = product(
    "inactive-download-credits",
    "download-credits",
    { quantity: 2 },
    "price_AopAdminInactiveCredits001",
  );
  const credit = await createCommerceProduct(
    memory.binding,
    creditDefinition,
    context("create.inactive-credit"),
  );
  memory.database.exec(
    "UPDATE artist_modules SET active = 0, revision = revision + 1 WHERE module_key = 'downloads'",
  );
  await assertRuntimeCode(
    activateCommerceProduct(
      memory.binding,
      credit.value.commerceProductId,
      1,
      null,
      context("activate.inactive-credit"),
    ),
    "COMMERCE_PRODUCT_REFERENCE_UNAVAILABLE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM commerce_products WHERE id = ?",
      credit.value.commerceProductId,
    ),
    "draft",
  );
});

test("authority and module changes at the D1 batch boundary roll back product and audit writes", async (t) => {
  const createMemory = await createInMemoryD1();
  t.after(() => createMemory.close());
  seedDefinitions(createMemory.database);

  let revoked = false;
  const revokingBinding = {
    prepare(sql) {
      return createMemory.binding.prepare(sql);
    },
    batch(statements) {
      if (!revoked) {
        revoked = true;
        createMemory.database.exec(`
          UPDATE role_assignments
          SET revoked_at = CURRENT_TIMESTAMP,
              revoked_by_user_id = '${OWNER_ID}'
          WHERE id = 'role_commerce_product_owner';
        `);
      }
      return createMemory.binding.batch(statements);
    },
  };
  await assertRuntimeCode(
    createCommerceProduct(
      revokingBinding,
      product(
        "batch-owner-revoked",
        "download-credits",
        { quantity: 1 },
        "price_AopAdminBatchOwner001",
      ),
      context("create.batch-owner-revoked"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(createMemory.database, "SELECT COUNT(*) FROM commerce_products"),
    0,
  );
  assert.equal(
    scalar(
      createMemory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.product.create'",
    ),
    0,
  );

  const moduleMemory = await createInMemoryD1();
  t.after(() => moduleMemory.close());
  seedDefinitions(moduleMemory.database);
  const created = await createCommerceProduct(
    moduleMemory.binding,
    product(
      "batch-module-disabled",
      "download-credits",
      { quantity: 1 },
      "price_AopAdminBatchModule001",
    ),
    context("create.batch-module-disabled"),
  );
  let disabled = false;
  const disablingBinding = {
    prepare(sql) {
      return moduleMemory.binding.prepare(sql);
    },
    batch(statements) {
      if (!disabled) {
        disabled = true;
        moduleMemory.database.exec(`
          UPDATE artist_modules
          SET active = 0, revision = revision + 1
          WHERE module_key = 'downloads';
        `);
      }
      return moduleMemory.binding.batch(statements);
    },
  };
  await assertRuntimeCode(
    activateCommerceProduct(
      disablingBinding,
      created.value.commerceProductId,
      1,
      null,
      context("activate.batch-module-disabled"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      moduleMemory.database,
      "SELECT state FROM commerce_products WHERE id = ?",
      created.value.commerceProductId,
    ),
    "draft",
  );
  assert.equal(
    scalar(
      moduleMemory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.product.activate'",
    ),
    0,
  );
});

test("owner binds a setup subscription to one active Stripe Test product", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDefinitions(memory.database);
  memory.database.exec(`
    UPDATE membership_plans
    SET state = 'draft'
    WHERE id = 'membership_plan_commerce_product';
    UPDATE subscription_plans
    SET state = 'draft'
    WHERE id = 'subscription_plan_commerce_product';
    INSERT INTO commerce_binding_intents
      (id, intent_key, intent_kind, name, description,
       subscription_plan_id, subscription_plan_revision, amount_minor,
       currency, billing_interval, interval_count, binding_state,
       stripe_environment, livemode, revision, created_by_user_id)
    VALUES
      ('commerce_binding_intent_subscription',
       'subscription-commerce-subscription', 'subscription',
       'Fictional subscription', 'A frozen setup definition.',
       'subscription_plan_commerce_product', 1, 1000, 'USD', 'month', 1,
       'pending', 'test', 0, 1, '${OWNER_ID}');
  `);

  const operation = context("bind.subscription");
  const first = await bindCommerceIntent(
    memory.binding,
    "subscription-commerce-subscription",
    "price_AopBindingSubscription001",
    operation,
  );
  assert.equal(first.replayed, false);
  assert.equal(first.value.bindingState, "bound");
  assert.equal(first.value.productState, "active");
  assert.equal(first.value.stripeEnvironment, "test");
  assert.equal(first.value.livemode, false);
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM membership_plans WHERE id = 'membership_plan_commerce_product'",
    ),
    "active",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM subscription_plans WHERE id = 'subscription_plan_commerce_product'",
    ),
    "active",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM commerce_products WHERE id = ?",
      first.value.commerceProductId,
    ),
    "active",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT amount_minor FROM commerce_prices WHERE id = ?",
      first.value.commercePriceId,
    ),
    1000,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT binding_state FROM commerce_binding_intents WHERE id = 'commerce_binding_intent_subscription'",
    ),
    "bound",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'commerce.binding-intent.bind'",
    ),
    1,
  );

  const replay = await bindCommerceIntent(
    memory.binding,
    "subscription-commerce-subscription",
    "price_AopBindingSubscription001",
    operation,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, first.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM commerce_products"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM commerce_prices"),
    1,
  );
});

test("owner binds a setup license to one active offer and Test product", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDefinitions(memory.database);
  memory.database.exec(`
    UPDATE license_terms
    SET state = 'draft'
    WHERE id = 'license_terms_commerce_product';
    INSERT INTO commerce_binding_intents
      (id, intent_key, intent_kind, name, description,
       track_id, track_revision_id, track_revision, license_terms_id,
       license_terms_version_id, license_terms_version, license_option_id,
       amount_minor, currency, billing_interval, interval_count,
       binding_state, stripe_environment, livemode, revision,
       created_by_user_id)
    VALUES
      ('commerce_binding_intent_license', 'license-fictional-track',
       'license', 'Fictional track license', 'A frozen setup definition.',
       'track_commerce_product', 'track_commerce_product_r1', 1,
       'license_terms_commerce_product',
       'license_terms_commerce_product_v1', 1,
       'license_option_commerce_product', 30000, 'USD', 'one_time', 1,
       'pending', 'test', 0, 1, '${OWNER_ID}');
  `);

  const operation = context("bind.license");
  const first = await bindCommerceIntent(
    memory.binding,
    "license-fictional-track",
    "price_AopBindingLicense001",
    operation,
  );
  assert.equal(first.replayed, false);
  assert.equal(first.value.intentKind, "license");
  assert.equal(first.value.bindingState, "bound");
  assert.ok(first.value.licenseOfferId);
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM license_terms WHERE id = 'license_terms_commerce_product'",
    ),
    "active",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM commerce_products WHERE id = ?",
      first.value.commerceProductId,
    ),
    "active",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT state FROM license_offers WHERE id = ?",
      first.value.licenseOfferId,
    ),
    "active",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT binding_state FROM commerce_binding_intents WHERE id = 'commerce_binding_intent_license'",
    ),
    "bound",
  );

  const replay = await bindCommerceIntent(
    memory.binding,
    "license-fictional-track",
    "price_AopBindingLicense001",
    operation,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, first.value);
});
