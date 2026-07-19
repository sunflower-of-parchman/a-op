import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readAdminCommerceProducts } =
  await import("../db/commerce-admin-read.ts");

const OWNER_ID = "user_product_read_owner";

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

function seedProductRead(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'product-owner@example.invalid',
       'product-owner@example.invalid', 'active'),
      ('user_product_read_other', 'product-other@example.invalid',
       'product-other@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_product_read_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version)
    VALUES
      ('track_product_read', 'track-product-read', 'track_product_read_r1',
       'track_product_read_r1', 'published', 1);
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode, download_mode)
    VALUES
      ('track_product_read_r1', 'track_product_read', 1,
       'Fictional license track', 'public', 'public', 'protected');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type, resource_id,
       credit_kind, credit_quantity, state, revision, created_by_user_id)
    VALUES
      ('product_read_license', 'read-license', 'Fictional test license',
       'A test license definition.', 'license', 'track',
       'track_product_read', NULL, NULL, 'draft', 1, '${OWNER_ID}'),
      ('product_read_credits', 'read-download-credits',
       'Fictional download credits', '', 'download-credits', NULL, NULL,
       'download', 4, 'active', 2, '${OWNER_ID}');

    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment, livemode,
       revision)
    VALUES
      ('price_read_license', 'product_read_license', 1200, 'USD', 'one_time',
       1, 'price_AopReadLicense001', 1, 'test', 0, 1),
      ('price_read_credits', 'product_read_credits', 500, 'USD', 'one_time',
       1, 'price_AopReadCredits001', 1, 'test', 0, 1);

    INSERT INTO license_terms
      (id, slug, state, current_version, created_by_user_id)
    VALUES
      ('terms_product_read', 'terms-product-read', 'active', 1, '${OWNER_ID}');
    INSERT INTO license_terms_versions
      (id, license_terms_id, version, name, title, general_terms,
       created_by_user_id)
    VALUES
      ('terms_product_read_v1', 'terms_product_read', 1, 'Fictional terms',
       'Fictional license', 'Fictional artist-authored terms.', '${OWNER_ID}');
    INSERT INTO license_options
      (id, license_terms_id, license_terms_version_id, license_terms_version,
       option_key, label, usage_category, allowed_media_json,
       attribution_required, attribution_text, position)
    VALUES
      ('option_product_read', 'terms_product_read', 'terms_product_read_v1', 1,
       'film', 'Film', 'Synchronization', '["Film"]', 1,
       'Music by the artist', 1);
    INSERT INTO license_offers
      (id, slug, track_id, track_revision_id, license_terms_id,
       license_terms_version_id, license_terms_version, license_option_id,
       commerce_product_id, commerce_price_id, state, revision,
       created_by_user_id)
    VALUES
      ('offer_product_read', 'offer-product-read', 'track_product_read',
       'track_product_read_r1', 'terms_product_read', 'terms_product_read_v1',
       1, 'option_product_read', 'product_read_license',
       'price_read_license', 'draft', 3, '${OWNER_ID}');
  `);
}

test("owner product projection returns every sale state with one immutable test price and offer revision", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedProductRead(memory.database);

  const products = await readAdminCommerceProducts(memory.binding, OWNER_ID);
  assert.equal(products.length, 2);
  const license = products.find(({ id }) => id === "product_read_license");
  const credits = products.find(({ id }) => id === "product_read_credits");
  assert.deepEqual(
    {
      state: license.state,
      revision: license.revision,
      priceId: license.priceId,
      stripePriceId: license.stripePriceId,
      environment: license.stripeEnvironment,
      livemode: license.livemode,
      resourceId: license.subject.resourceId,
      offers: license.licenseOffers,
    },
    {
      state: "draft",
      revision: 1,
      priceId: "price_read_license",
      stripePriceId: "price_AopReadLicense001",
      environment: "test",
      livemode: false,
      resourceId: "track_product_read",
      offers: [
        {
          id: "offer_product_read",
          slug: "offer-product-read",
          state: "draft",
          revision: 3,
          trackRevisionId: "track_product_read_r1",
        },
      ],
    },
  );
  assert.deepEqual(
    {
      state: credits.state,
      revision: credits.revision,
      creditKind: credits.subject.creditKind,
      creditQuantity: credits.subject.creditQuantity,
    },
    {
      state: "active",
      revision: 2,
      creditKind: "download",
      creditQuantity: 4,
    },
  );
  assert.equal(Object.isFrozen(products), true);
  assert.equal(Object.isFrozen(license), true);
  assert.equal(Object.isFrozen(license.subject), true);
  assert.equal(Object.isFrozen(license.licenseOffers), true);
});

test("product projection requires a live owner at the server boundary", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedProductRead(memory.database);

  await assertRuntimeCode(
    readAdminCommerceProducts(memory.binding, "user_product_read_other"),
    "COMMERCE_OWNER_REQUIRED",
  );
  memory.database.exec(`
    UPDATE role_assignments
    SET revoked_at = CURRENT_TIMESTAMP, revoked_by_user_id = '${OWNER_ID}'
    WHERE id = 'role_product_read_owner';
  `);
  await assertRuntimeCode(
    readAdminCommerceProducts(memory.binding, OWNER_ID),
    "COMMERCE_OWNER_REQUIRED",
  );
});
