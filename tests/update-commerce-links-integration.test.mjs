import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [updatesWrite, updatesRead, updatesValidation, commerceRead] =
  await Promise.all([
    import("../db/updates-write.ts"),
    import("../db/updates-read.ts"),
    import("../lib/updates/validation.ts"),
    import("../db/commerce-read.ts"),
  ]);

let operationSequence = 0;
function context(actorUserId, label) {
  operationSequence += 1;
  return {
    actorUserId,
    idempotencyKey: `${label}-${operationSequence}`,
    requestId: `request-${label}-${operationSequence}`,
  };
}

function updateInput(slug, type, id, audience = "account") {
  return {
    slug,
    title: `Fictional ${type} activity`,
    summary: "A fictional connected commerce update.",
    body: [{ type: "paragraph", text: "Fictional commerce activity." }],
    audience,
    resource: { type, id },
  };
}

async function publishConnectedUpdate(binding, slug, type, id) {
  const draft = await updatesWrite.saveUpdateDraft(
    binding,
    updateInput(slug, type, id),
    0,
    context("user_update_owner", `${slug}-draft`),
  );
  await updatesWrite.publishUpdate(
    binding,
    slug,
    draft.value.revision,
    context("user_update_owner", `${slug}-publish`),
  );
  return draft.value;
}

function seedCommerceLinks(database) {
  const digestA = "a".repeat(64);
  const digestB = "b".repeat(64);
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_update_owner', 'owner@example.invalid',
       'owner@example.invalid', 'active'),
      ('user_update_customer', 'customer@example.invalid',
       'customer@example.invalid', 'active'),
      ('user_update_other', 'other@example.invalid',
       'other@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_update_owner', 'user_update_owner', 'owner', 'user_update_owner'),
      ('role_update_customer', 'user_update_customer', 'customer',
       'user_update_owner'),
      ('role_update_other', 'user_update_other', 'customer',
       'user_update_owner');

    UPDATE artist_modules
    SET active = 1, activated_at = CURRENT_TIMESTAMP
    WHERE module_key IN
      ('whats-new', 'licensing', 'memberships', 'subscriptions');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('track_update_license', 'track-update-license',
       'track_update_license_r1', 'track_update_license_r1', 'published', 1);
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_update_license_r1', 'track_update_license', 1,
       'Fictional licensed track', 'public', 'public', 'protected');

    INSERT INTO membership_plans
      (id, slug, state, current_revision, created_by_user_id)
    VALUES
      ('membership_plan_update', 'membership-update', 'active', 1,
       'user_update_owner');
    INSERT INTO membership_plan_revisions
      (id, membership_plan_id, revision, name, description, benefits_json,
       download_credits, license_credits, created_by_user_id)
    VALUES
      ('membership_plan_update_r1', 'membership_plan_update', 1,
       'Fictional membership', '', '["Connected access"]', 0, 0,
       'user_update_owner');
    INSERT INTO subscription_plans
      (id, slug, name, description, membership_plan_id,
       membership_plan_revision_id, membership_plan_revision,
       billing_interval, interval_count, state, revision, created_by_user_id)
    VALUES
      ('subscription_plan_update', 'subscription-update',
       'Fictional subscription', '', 'membership_plan_update',
       'membership_plan_update_r1', 1, 'month', 1, 'active', 1,
       'user_update_owner');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type, resource_id,
       state, revision, created_by_user_id)
    VALUES
      ('product_update_license', 'product-update-license',
       'Fictional test license', '', 'license', 'track',
       'track_update_license', 'active', 1, 'user_update_owner');
    INSERT INTO commerce_products
      (id, slug, name, description, product_type, membership_plan_id,
       membership_plan_revision_id, membership_plan_revision, state,
       revision, created_by_user_id)
    VALUES
      ('product_update_membership', 'buy-membership-update',
       'Fictional membership offer', '', 'membership',
       'membership_plan_update', 'membership_plan_update_r1', 1, 'active', 1,
       'user_update_owner');
    INSERT INTO commerce_products
      (id, slug, name, description, product_type, subscription_plan_id,
       state, revision, created_by_user_id)
    VALUES
      ('product_update_subscription', 'buy-subscription-update',
       'Fictional subscription offer', '', 'subscription',
       'subscription_plan_update', 'active', 1, 'user_update_owner');
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode)
    VALUES
      ('price_update_license', 'product_update_license', 500, 'USD',
       'one_time', 1, 'price_UpdateLicense001', 1, 'test', 0),
      ('price_update_membership', 'product_update_membership', 700, 'USD',
       'one_time', 1, 'price_UpdateMembership001', 1, 'test', 0),
      ('price_update_subscription', 'product_update_subscription', 900,
       'USD', 'month', 1, 'price_UpdateSubscription001', 1, 'test', 0);
    INSERT INTO license_terms
      (id, slug, state, current_version, created_by_user_id)
    VALUES
      ('license_terms_update', 'license-terms-update', 'active', 1,
       'user_update_owner');
    INSERT INTO license_terms_versions
      (id, license_terms_id, version, name, title, general_terms,
       created_by_user_id)
    VALUES
      ('license_terms_update_v1', 'license_terms_update', 1,
       'Fictional terms', 'Fictional license', 'Fictional general terms.',
       'user_update_owner');
    INSERT INTO license_options
      (id, license_terms_id, license_terms_version_id, license_terms_version,
       option_key, label, usage_category, allowed_media_json, territory,
       attribution_required, attribution_text, exclusive, requires_approval,
       license_credit_cost, includes_track_download, position)
    VALUES
      ('license_option_update', 'license_terms_update',
       'license_terms_update_v1', 1, 'film', 'Film', 'Synchronization',
       '["Film"]', 'Worldwide', 1, 'Music by the artist', 0, 0, 1, 1, 1);
    INSERT INTO license_offers
      (id, slug, track_id, track_revision_id, license_terms_id,
       license_terms_version_id, license_terms_version, license_option_id,
       commerce_product_id, commerce_price_id, state, revision,
       created_by_user_id)
    VALUES
      ('license_offer_update', 'license-offer-update',
       'track_update_license', 'track_update_license_r1',
       'license_terms_update', 'license_terms_update_v1', 1,
       'license_option_update', 'product_update_license',
       'price_update_license', 'active', 1, 'user_update_owner');

    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id, event_created_at,
       raw_body_digest, facts_fingerprint, status, stripe_environment,
       livemode, processed_at)
    VALUES
      ('event_update_order', 'evt_UpdateOrder001', 'invoice.paid',
       'in_UpdateOrder001', '2026-07-19T09:20:00.000Z', '${digestA}',
       '${digestB}', 'completed', 'test', 0, '2026-07-19T09:21:00.000Z');
    INSERT INTO orders
      (id, customer_user_id, commerce_event_id, status, total_minor, currency,
       stripe_subscription_id, stripe_environment, livemode, completed_at)
    VALUES
      ('order_update_private', 'user_update_customer', 'event_update_order',
       'fulfilled', 500, 'USD', 'sub_UpdateOrder001', 'test', 0,
       '2026-07-19T09:21:00.000Z');
    INSERT INTO order_items
      (id, order_id, commerce_product_id, commerce_product_revision,
       commerce_price_id, product_type, product_name,
       fulfillment_snapshot_json, quantity, unit_amount_minor, currency,
       stripe_environment, livemode)
    VALUES
      ('order_item_update_private', 'order_update_private',
       'product_update_license', 1, 'price_update_license', 'license',
       'Fictional test license', '{}', 1, 500, 'USD', 'test', 0);
  `);
}

async function expectRuntimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("commerce-linked updates resolve active resources and keep order activity customer-private", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCommerceLinks(memory.database);

  await publishConnectedUpdate(
    memory.binding,
    "license-activity",
    "license",
    "license_offer_update",
  );
  await publishConnectedUpdate(
    memory.binding,
    "membership-activity",
    "membership",
    "membership_plan_update",
  );
  await publishConnectedUpdate(
    memory.binding,
    "subscription-activity",
    "subscription",
    "subscription_plan_update",
  );
  const orderUpdate = await publishConnectedUpdate(
    memory.binding,
    "order-activity",
    "order",
    "order_update_private",
  );

  const customerFeed = await updatesRead.listPublishedUpdates(
    memory.binding,
    "user_update_customer",
  );
  assert.deepEqual(
    new Set(customerFeed.map(({ slug }) => slug)),
    new Set([
      "license-activity",
      "membership-activity",
      "subscription-activity",
      "order-activity",
    ]),
  );
  const commerceOffers = await commerceRead.listActiveCommerceProducts(
    memory.binding,
  );
  const commerceOfferAnchors = new Set(
    commerceOffers.map(({ offerAnchorId }) => offerAnchorId),
  );
  assert.ok(commerceOfferAnchors.has("membership-membership-update"));
  assert.ok(commerceOfferAnchors.has("subscription-subscription-update"));
  for (const updateSlug of ["membership-activity", "subscription-activity"]) {
    const href = customerFeed.find(({ slug }) => slug === updateSlug)?.resource
      ?.href;
    assert.ok(href);
    assert.ok(commerceOfferAnchors.has(href.split("#")[1]));
  }
  assert.deepEqual(
    Object.fromEntries(
      customerFeed.map(({ slug, resource }) => [slug, resource?.href]),
    ),
    {
      "license-activity": "/licensing#offer-license-offer-update",
      "membership-activity": "/commerce#membership-membership-update",
      "order-activity": "/account/orders",
      "subscription-activity": "/commerce#subscription-subscription-update",
    },
  );
  assert.equal(
    await updatesRead.countUnreadUpdates(
      memory.binding,
      "user_update_customer",
    ),
    4,
  );

  const otherFeed = await updatesRead.listPublishedUpdates(
    memory.binding,
    "user_update_other",
  );
  assert.deepEqual(
    new Set(otherFeed.map(({ slug }) => slug)),
    new Set([
      "license-activity",
      "membership-activity",
      "subscription-activity",
    ]),
  );
  assert.equal(
    await updatesRead.readPublishedUpdateBySlug(
      memory.binding,
      "order-activity",
      "user_update_other",
    ),
    null,
  );
  assert.equal(
    await updatesRead.countUnreadUpdates(memory.binding, "user_update_other"),
    3,
  );
  await expectRuntimeCode(
    updatesWrite.markUpdateRead(
      memory.binding,
      orderUpdate.id,
      context("user_update_other", "other-order-read"),
    ),
    "UPDATE_NOT_AVAILABLE",
  );
  const receipt = await updatesWrite.markUpdateRead(
    memory.binding,
    orderUpdate.id,
    context("user_update_customer", "customer-order-read"),
  );
  assert.equal(receipt.value.read, true);

  await expectRuntimeCode(
    updatesWrite.saveUpdateDraft(
      memory.binding,
      updateInput(
        "public-order-activity",
        "order",
        "order_update_private",
        "public",
      ),
      0,
      context("user_update_owner", "public-order-draft"),
    ),
    "UPDATE_ORDER_AUDIENCE_INVALID",
  );
  const validation = updatesValidation.validateUpdateDraftInput(
    updateInput(
      "public-order-activity",
      "order",
      "order_update_private",
      "public",
    ),
  );
  assert.equal(validation.ok, false);
  assert.ok(
    validation.issues.some(
      ({ code }) => code === "update-order-audience-invalid",
    ),
  );
});
