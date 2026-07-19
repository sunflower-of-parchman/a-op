import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { readCustomerAdminDetail } =
  await import("../db/customer-admin-read.ts");

const OWNER = "user_customer_detail_owner";
const CUSTOMER = "user_customer_detail_exact";
const OTHER = "user_customer_detail_other";

function seedCustomerDetail(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'customer-detail-owner@example.invalid',
       'customer-detail-owner@example.invalid', 'active'),
      ('${CUSTOMER}', 'shared-contact@example.invalid',
       'shared-contact@example.invalid', 'active'),
      ('${OTHER}', 'other-customer@example.invalid',
       'other-customer@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('${OWNER}', 'Fictional detail owner'),
      ('${CUSTOMER}', 'Exact fictional customer'),
      ('${OTHER}', 'Other fictional customer');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_customer_detail_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_customer_detail_exact', '${CUSTOMER}', 'customer', '${OWNER}'),
      ('role_customer_detail_other', '${OTHER}', 'customer', '${OWNER}');

    INSERT INTO credit_accounts
      (id, customer_user_id, credit_kind, available_balance,
       reserved_balance, consumed_balance, stripe_environment, livemode,
       created_at, updated_at)
    VALUES
      ('credit_account_detail_exact', '${CUSTOMER}', 'download', 4, 1, 2,
       'test', 0, '2026-07-19T08:00:00.000Z',
       '2026-07-19T09:00:00.000Z'),
      ('credit_account_detail_other', '${OTHER}', 'download', 90, 0, 0,
       'test', 0, '2026-07-19T08:00:00.000Z',
       '2026-07-19T09:00:00.000Z');
    INSERT INTO credit_grant_lots
      (id, credit_account_id, customer_user_id, credit_kind, origin_type,
       origin_id, quantity_granted, quantity_available, quantity_reserved,
       quantity_consumed, quantity_expired, quantity_reversed, state,
       stripe_environment, livemode, last_operation_key,
       created_at, updated_at)
    VALUES
      ('credit_lot_detail_exact_1', 'credit_account_detail_exact',
       '${CUSTOMER}', 'download', 'owner', 'detail-origin-1', 4, 4, 0, 0,
       0, 0, 'active', 'test', 0, 'detail-lot-operation-1',
       '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z'),
      ('credit_lot_detail_exact_2', 'credit_account_detail_exact',
       '${CUSTOMER}', 'download', 'owner', 'detail-origin-2', 3, 0, 1, 2,
       0, 0, 'active', 'test', 0, 'detail-lot-operation-2',
       '2026-07-19T08:01:00.000Z', '2026-07-19T08:01:00.000Z'),
      ('credit_lot_detail_other', 'credit_account_detail_other',
       '${OTHER}', 'download', 'owner', 'detail-origin-other', 90, 90, 0, 0,
       0, 0, 'active', 'test', 0, 'detail-lot-operation-other',
       '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');

    INSERT INTO entitlements
      (id, user_id, source_type, source_id, resource_type, resource_id,
       actions_json, state, created_at, updated_at)
    VALUES
      ('entitlement_detail_exact', '${CUSTOMER}', 'membership',
       'membership_detail_exact', 'track', 'track_detail_exact', '["view"]',
       'active', '2026-07-19T08:00:00.000Z',
       '2026-07-19T08:00:00.000Z'),
      ('entitlement_detail_other', '${OTHER}', 'membership',
       'membership_detail_other', 'track', 'track_detail_other', '["view"]',
       'active', '2026-07-19T08:00:00.000Z',
       '2026-07-19T08:00:00.000Z');

    INSERT INTO contact_forms
      (id, form_key, title, description, categories_json, state,
       current_consent_version, delivery_adapter, revision)
    VALUES
      ('contact_form_detail', 'contact', 'Contact', '', '["General"]',
       'active', 1, 'stored_only', 1);
    INSERT INTO contact_consent_versions
      (id, contact_form_id, version, consent_text, effective_at)
    VALUES
      ('contact_consent_detail', 'contact_form_detail', 1,
       'Store this fictional inquiry.', '2026-07-19T08:00:00.000Z');
    INSERT INTO contact_submissions
      (id, contact_form_id, consent_version_id, submitter_user_id, name,
       email, normalized_email, category, subject, message, state,
       request_id, consented_at, created_at, updated_at)
    VALUES
      ('contact_submission_detail_exact', 'contact_form_detail',
       'contact_consent_detail', '${CUSTOMER}', 'Exact customer',
       'shared-contact@example.invalid', 'shared-contact@example.invalid',
       'General', 'Exact user inquiry', 'Fictional exact message.', 'new',
       'request_contact_detail_exact', '2026-07-19T08:05:00.000Z',
       '2026-07-19T08:05:00.000Z', '2026-07-19T08:05:00.000Z'),
      ('contact_submission_detail_same_email', 'contact_form_detail',
       'contact_consent_detail', NULL, 'Anonymous shared email',
       'shared-contact@example.invalid', 'shared-contact@example.invalid',
       'General', 'Same email must not join', 'Fictional anonymous message.',
       'new', 'request_contact_detail_same_email',
       '2026-07-19T08:06:00.000Z', '2026-07-19T08:06:00.000Z',
       '2026-07-19T08:06:00.000Z'),
      ('contact_submission_detail_other', 'contact_form_detail',
       'contact_consent_detail', '${OTHER}', 'Other customer',
       'other-customer@example.invalid', 'other-customer@example.invalid',
       'General', 'Other user inquiry', 'Fictional other message.', 'new',
       'request_contact_detail_other', '2026-07-19T08:07:00.000Z',
       '2026-07-19T08:07:00.000Z', '2026-07-19T08:07:00.000Z');

    INSERT INTO commerce_events
      (id, stripe_event_id, event_type, stripe_object_id, event_created_at,
       raw_body_digest, facts_fingerprint, status, stripe_environment,
       livemode, created_at, processed_at)
    VALUES
      ('commerce_event_detail_exact', 'evt_test_detail_exact',
       'invoice.paid', 'in_test_detail_exact',
       '2026-07-19T08:10:00.000Z', '${"a".repeat(64)}', '${"b".repeat(64)}',
       'completed', 'test', 0, '2026-07-19T08:10:00.000Z',
       '2026-07-19T08:10:01.000Z'),
      ('commerce_event_detail_other', 'evt_test_detail_other',
       'invoice.paid', 'in_test_detail_other',
       '2026-07-19T08:11:00.000Z', '${"c".repeat(64)}', '${"d".repeat(64)}',
       'completed', 'test', 0, '2026-07-19T08:11:00.000Z',
       '2026-07-19T08:11:01.000Z');
    INSERT INTO orders
      (id, customer_user_id, commerce_event_id, status, total_minor,
       currency, stripe_subscription_id, stripe_environment, livemode,
       completed_at, created_at, updated_at)
    VALUES
      ('order_detail_exact', '${CUSTOMER}', 'commerce_event_detail_exact',
       'fulfilled', 1500, 'USD', 'sub_test_detail_exact', 'test', 0,
       '2026-07-19T08:10:01.000Z', '2026-07-19T08:10:00.000Z',
       '2026-07-19T08:10:01.000Z'),
      ('order_detail_other', '${OTHER}', 'commerce_event_detail_other',
       'fulfilled', 9900, 'USD', 'sub_test_detail_other', 'test', 0,
       '2026-07-19T08:11:01.000Z', '2026-07-19T08:11:00.000Z',
       '2026-07-19T08:11:01.000Z');
  `);
}

test("customer detail joins credits, entitlements, orders, and contact by exact user ID", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerDetail(memory.database);

  const detail = await readCustomerAdminDetail(memory.binding, OWNER, CUSTOMER);
  assert.equal(detail.stripeTestOnly, true);
  assert.equal(detail.identity.userId, CUSTOMER);
  assert.deepEqual(detail.credits, [
    {
      id: "credit_account_detail_exact",
      kind: "download",
      available: 4,
      reserved: 1,
      consumed: 2,
      lotCount: 2,
      stripeEnvironment: "test",
      livemode: false,
      updatedAt: "2026-07-19T09:00:00.000Z",
    },
  ]);
  assert.deepEqual(
    detail.entitlements.map(({ id }) => id),
    ["entitlement_detail_exact"],
  );
  assert.deepEqual(
    detail.orders.map(({ id }) => id),
    ["order_detail_exact"],
  );
  assert.deepEqual(
    detail.contactSubmissions.map(({ id }) => id),
    ["contact_submission_detail_exact"],
  );
  assert.doesNotMatch(
    JSON.stringify(detail),
    /detail_other|Same email must not join/,
  );

  await assert.rejects(
    readCustomerAdminDetail(memory.binding, CUSTOMER, CUSTOMER),
    /active D1 customer relationship was not found/i,
  );
});

test("customer order projection is one row per order without an order-item multiplicity join", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedCustomerDetail(memory.database);
  const detail = await readCustomerAdminDetail(memory.binding, OWNER, CUSTOMER);
  assert.equal(detail.orders.length, 1);
  assert.equal(detail.orders[0].productName, null);
});
