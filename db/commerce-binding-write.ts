import { changedRows } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type { CommerceBindingMutationReceipt } from "@/lib/commerce-admin/types.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CountRow {
  readonly count: number;
}

interface BindingIntentRow {
  readonly id: string;
  readonly intent_key: string;
  readonly intent_kind: "membership" | "subscription" | "license";
  readonly name: string;
  readonly description: string;
  readonly membership_plan_id: string | null;
  readonly membership_plan_revision_id: string | null;
  readonly membership_plan_revision: number | null;
  readonly subscription_plan_id: string | null;
  readonly subscription_plan_revision: number | null;
  readonly track_id: string | null;
  readonly track_revision_id: string | null;
  readonly track_revision: number | null;
  readonly license_terms_id: string | null;
  readonly license_terms_version_id: string | null;
  readonly license_terms_version: number | null;
  readonly license_option_id: string | null;
  readonly amount_minor: number;
  readonly currency: string;
  readonly billing_interval: "one_time" | "month" | "year";
  readonly interval_count: number;
  readonly binding_state: "pending" | "bound" | "archived";
  readonly commerce_product_id: string | null;
  readonly commerce_price_id: string | null;
  readonly revision: number;
}

interface SubscriptionSubjectRow {
  readonly membership_plan_id: string;
  readonly membership_plan_revision_id: string;
  readonly membership_plan_revision: number;
}

const SAFE_INTENT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_STRIPE_TEST_PRICE = /^price_[A-Za-z0-9]{6,249}$/;

function inputError(message: string): RuntimeError {
  return new RuntimeError("COMMERCE_BINDING_INPUT_INVALID", message, {
    status: 400,
    publicMessage: "Provide a valid pending binding and Stripe Test price.",
  });
}

async function requireActiveOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<CountRow>();
  if (row?.count === 1) return;
  throw new RuntimeError(
    "COMMERCE_OWNER_REQUIRED",
    "Commerce binding requires live owner authority.",
    { status: 403, publicMessage: "Owner access is required." },
  );
}

async function readIntent(
  binding: D1Database,
  intentKey: string,
): Promise<BindingIntentRow | null> {
  return binding
    .prepare(
      `SELECT id, intent_key, intent_kind, name, description,
              membership_plan_id, membership_plan_revision_id,
              membership_plan_revision, subscription_plan_id,
              subscription_plan_revision, track_id, track_revision_id,
              track_revision, license_terms_id, license_terms_version_id,
              license_terms_version, license_option_id, amount_minor, currency,
              billing_interval, interval_count, binding_state,
              commerce_product_id, commerce_price_id, revision
       FROM commerce_binding_intents
       WHERE intent_key = ?
       LIMIT 1`,
    )
    .bind(intentKey)
    .first<BindingIntentRow>();
}

function planGuard(intent: BindingIntentRow): {
  readonly sql: string;
  readonly bindings: readonly (number | string)[];
} {
  if (intent.intent_kind === "membership") {
    return {
      sql: `EXISTS (
        SELECT 1
        FROM membership_plans
        JOIN membership_plan_revisions
          ON membership_plan_revisions.id = ?
         AND membership_plan_revisions.membership_plan_id = membership_plans.id
         AND membership_plan_revisions.revision = membership_plans.current_revision
        WHERE membership_plans.id = ?
          AND membership_plans.current_revision = ?
          AND membership_plans.state IN ('draft', 'active')
          AND (
            membership_plan_revisions.access_plan_id IS NULL
            OR EXISTS (
              SELECT 1 FROM access_plans
              WHERE access_plans.id = membership_plan_revisions.access_plan_id
                AND access_plans.revision = membership_plan_revisions.access_plan_revision
                AND access_plans.state = 'active'
            )
          )
          AND (
            membership_plan_revisions.download_credits = 0
            AND NOT EXISTS (
              SELECT 1
              FROM access_plan_items AS download_item,
                   json_each(download_item.actions_json) AS download_action
              WHERE download_item.access_plan_id = membership_plan_revisions.access_plan_id
                AND download_action.value = 'download'
            )
            OR EXISTS (
              SELECT 1 FROM artist_modules
              WHERE module_key = 'downloads' AND active = 1
            )
          )
          AND (
            membership_plan_revisions.license_credits = 0
            OR EXISTS (
              SELECT 1 FROM artist_modules
              WHERE module_key = 'licensing' AND active = 1
            )
          )
      ) AND EXISTS (
        SELECT 1 FROM artist_modules
        WHERE module_key = 'memberships' AND active = 1
      )`,
      bindings: [
        intent.membership_plan_revision_id!,
        intent.membership_plan_id!,
        intent.membership_plan_revision!,
      ],
    };
  }
  if (intent.intent_kind === "license") {
    return {
      sql: `EXISTS (
        SELECT 1
        FROM tracks
        JOIN track_revisions
          ON track_revisions.id = ?
         AND track_revisions.track_id = tracks.id
         AND track_revisions.revision = ?
        JOIN license_terms
          ON license_terms.id = ?
        JOIN license_terms_versions
          ON license_terms_versions.id = ?
         AND license_terms_versions.license_terms_id = license_terms.id
         AND license_terms_versions.version = ?
        JOIN license_options
          ON license_options.id = ?
         AND license_options.license_terms_version_id = license_terms_versions.id
        WHERE tracks.id = ?
          AND tracks.publication_state = 'published'
          AND tracks.published_revision_id = track_revisions.id
          AND license_terms.current_version = license_terms_versions.version
          AND license_terms.state IN ('draft', 'active')
      ) AND EXISTS (
        SELECT 1 FROM artist_modules
        WHERE module_key = 'licensing' AND active = 1
      )`,
      bindings: [
        intent.track_revision_id!,
        intent.track_revision!,
        intent.license_terms_id!,
        intent.license_terms_version_id!,
        intent.license_terms_version!,
        intent.license_option_id!,
        intent.track_id!,
      ],
    };
  }
  return {
    sql: `EXISTS (
      SELECT 1
      FROM subscription_plans
      JOIN membership_plans
        ON membership_plans.id = subscription_plans.membership_plan_id
      JOIN membership_plan_revisions
        ON membership_plan_revisions.id = subscription_plans.membership_plan_revision_id
       AND membership_plan_revisions.membership_plan_id = membership_plans.id
       AND membership_plan_revisions.revision = subscription_plans.membership_plan_revision
      WHERE subscription_plans.id = ?
        AND subscription_plans.revision = ?
        AND subscription_plans.state IN ('draft', 'active')
        AND subscription_plans.billing_interval = ?
        AND subscription_plans.interval_count = ?
        AND membership_plans.current_revision = subscription_plans.membership_plan_revision
        AND membership_plans.state IN ('draft', 'active')
        AND (
          membership_plan_revisions.access_plan_id IS NULL
          OR EXISTS (
            SELECT 1 FROM access_plans
            WHERE access_plans.id = membership_plan_revisions.access_plan_id
              AND access_plans.revision = membership_plan_revisions.access_plan_revision
              AND access_plans.state = 'active'
          )
        )
        AND (
          membership_plan_revisions.download_credits = 0
          AND NOT EXISTS (
            SELECT 1
            FROM access_plan_items AS download_item,
                 json_each(download_item.actions_json) AS download_action
            WHERE download_item.access_plan_id = membership_plan_revisions.access_plan_id
              AND download_action.value = 'download'
          )
          OR EXISTS (
            SELECT 1 FROM artist_modules
            WHERE module_key = 'downloads' AND active = 1
          )
        )
        AND (
          membership_plan_revisions.license_credits = 0
          OR EXISTS (
            SELECT 1 FROM artist_modules
            WHERE module_key = 'licensing' AND active = 1
          )
        )
    ) AND EXISTS (
      SELECT 1 FROM artist_modules
      WHERE module_key = 'subscriptions' AND active = 1
    ) AND EXISTS (
      SELECT 1 FROM artist_modules
      WHERE module_key = 'memberships' AND active = 1
    )`,
    bindings: [
      intent.subscription_plan_id!,
      intent.subscription_plan_revision!,
      intent.billing_interval,
      intent.interval_count,
    ],
  };
}

async function readSubscriptionSubject(
  binding: D1Database,
  intent: BindingIntentRow,
): Promise<SubscriptionSubjectRow> {
  const row = await binding
    .prepare(
      `SELECT membership_plan_id, membership_plan_revision_id,
              membership_plan_revision
       FROM subscription_plans
       WHERE id = ? AND revision = ?
       LIMIT 1`,
    )
    .bind(intent.subscription_plan_id, intent.subscription_plan_revision)
    .first<SubscriptionSubjectRow>();
  if (!row) throw staleMutation("commerce binding intent");
  return row;
}

export async function bindCommerceIntent(
  binding: D1Database,
  rawIntentKey: string,
  rawStripePriceId: unknown,
  context: MutationContext,
): Promise<MutationResult<CommerceBindingMutationReceipt>> {
  await requireActiveOwner(binding, context.actorUserId);
  if (
    typeof rawIntentKey !== "string" ||
    rawIntentKey.length > 80 ||
    !SAFE_INTENT_KEY.test(rawIntentKey)
  ) {
    throw inputError("The binding key is not a safe product slug.");
  }
  if (
    typeof rawStripePriceId !== "string" ||
    !SAFE_STRIPE_TEST_PRICE.test(rawStripePriceId)
  ) {
    throw inputError("The Stripe price ID must begin with price_.");
  }

  const operation = "commerce.binding-intent.bind";
  const mutation = await prepareMutation<CommerceBindingMutationReceipt>(
    binding,
    operation,
    context,
    { intentKey: rawIntentKey, stripePriceId: rawStripePriceId },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const intent = await readIntent(binding, rawIntentKey);
  if (!intent) {
    throw new RuntimeError(
      "COMMERCE_BINDING_NOT_FOUND",
      "Commerce binding intent not found.",
      { status: 404, publicMessage: "That pending binding was not found." },
    );
  }
  if (intent.binding_state !== "pending") {
    throw new RuntimeError(
      "COMMERCE_BINDING_STATE_INVALID",
      `Commerce binding intent is ${intent.binding_state}.`,
      { status: 409, publicMessage: "This binding is no longer pending." },
    );
  }

  const duplicate = await binding
    .prepare(
      `SELECT COUNT(*) AS count FROM commerce_products WHERE slug = ?
       UNION ALL
       SELECT COUNT(*) AS count FROM commerce_prices WHERE stripe_price_id = ?`,
    )
    .bind(intent.intent_key, rawStripePriceId)
    .all<CountRow>();
  if (duplicate.results.some((row) => row.count > 0)) {
    throw new RuntimeError(
      "COMMERCE_PRODUCT_IDENTITY_TAKEN",
      "The binding slug or Stripe price is already registered.",
      { status: 409, publicMessage: "That test price is already connected." },
    );
  }

  const guard = planGuard(intent);
  const available = await binding
    .prepare(`SELECT COUNT(*) AS count WHERE ${guard.sql}`)
    .bind(...guard.bindings)
    .first<CountRow>();
  if (available?.count !== 1) throw staleMutation("commerce binding intent");

  const subscriptionSubject =
    intent.intent_kind === "subscription"
      ? await readSubscriptionSubject(binding, intent)
      : null;
  const productId = `commerce_product_${crypto.randomUUID()}`;
  const priceId = `commerce_price_${crypto.randomUUID()}`;
  const licenseOfferId =
    intent.intent_kind === "license"
      ? `license_offer_${crypto.randomUUID()}`
      : null;
  const revision = intent.revision + 1;
  const result: CommerceBindingMutationReceipt = Object.freeze({
    intentId: intent.id,
    intentKey: intent.intent_key,
    intentKind: intent.intent_kind,
    bindingState: "bound",
    commerceProductId: productId,
    commercePriceId: priceId,
    licenseOfferId,
    productState: "active",
    stripePriceId: rawStripePriceId,
    stripeEnvironment: "test",
    livemode: false,
    revision,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const statements: D1PreparedStatement[] = [];

  const membershipPlanId =
    intent.intent_kind === "membership"
      ? intent.membership_plan_id
      : (subscriptionSubject?.membership_plan_id ?? null);
  const membershipRevision =
    intent.intent_kind === "membership"
      ? intent.membership_plan_revision
      : (subscriptionSubject?.membership_plan_revision ?? null);
  if (
    intent.intent_kind === "membership" ||
    intent.intent_kind === "subscription"
  ) {
    statements.push(
      binding
        .prepare(
          `UPDATE membership_plans
           SET state = 'active', last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND current_revision = ?
             AND state IN ('draft', 'active')
             AND ${guard.sql} AND ${authority.sql}`,
        )
        .bind(
          mutation.namespacedKey,
          membershipPlanId,
          membershipRevision,
          ...guard.bindings,
          ...authority.bindings,
        ),
    );
  }
  if (intent.intent_kind === "subscription") {
    statements.push(
      binding
        .prepare(
          `UPDATE subscription_plans
           SET state = 'active', last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND revision = ?
             AND state IN ('draft', 'active')
             AND ${guard.sql} AND ${authority.sql}`,
        )
        .bind(
          mutation.namespacedKey,
          intent.subscription_plan_id,
          intent.subscription_plan_revision,
          ...guard.bindings,
          ...authority.bindings,
        ),
    );
  }
  if (intent.intent_kind === "license") {
    statements.push(
      binding
        .prepare(
          `UPDATE license_terms
           SET state = 'active', last_operation_key = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND current_version = ?
             AND state IN ('draft', 'active')
             AND ${guard.sql} AND ${authority.sql}`,
        )
        .bind(
          mutation.namespacedKey,
          intent.license_terms_id,
          intent.license_terms_version,
          ...guard.bindings,
          ...authority.bindings,
        ),
    );
  }
  statements.push(
    binding
      .prepare(
        `INSERT INTO commerce_products
          (id, slug, name, description, product_type, resource_type,
           resource_id, access_plan_id, access_plan_revision,
           membership_plan_id, membership_plan_revision_id,
           membership_plan_revision, subscription_plan_id, credit_kind,
           credit_quantity, state, revision, created_by_user_id,
           last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL, NULL,
                'active', 1, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM commerce_products WHERE slug = ?)
           AND NOT EXISTS (
             SELECT 1 FROM commerce_prices WHERE stripe_price_id = ?
           ) AND ${guard.sql} AND ${authority.sql}`,
      )
      .bind(
        productId,
        intent.intent_key,
        intent.name,
        intent.description,
        intent.intent_kind,
        intent.intent_kind === "license" ? "track" : null,
        intent.intent_kind === "license" ? intent.track_id : null,
        intent.intent_kind === "membership" ? membershipPlanId : null,
        intent.intent_kind === "membership"
          ? intent.membership_plan_revision_id
          : null,
        intent.intent_kind === "membership" ? membershipRevision : null,
        intent.intent_kind === "subscription"
          ? intent.subscription_plan_id
          : null,
        context.actorUserId,
        mutation.namespacedKey,
        intent.intent_key,
        rawStripePriceId,
        ...guard.bindings,
        ...authority.bindings,
      ),
    binding
      .prepare(
        `INSERT INTO commerce_prices
          (id, commerce_product_id, amount_minor, currency,
           billing_interval, interval_count, stripe_price_id, active,
           stripe_environment, livemode, revision, last_operation_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, 1, 'test', 0, 1, ?
         WHERE EXISTS (
           SELECT 1 FROM commerce_products
           WHERE id = ? AND state = 'active' AND revision = 1
             AND last_operation_key = ?
         ) AND ${authority.sql}`,
      )
      .bind(
        priceId,
        productId,
        intent.amount_minor,
        intent.currency,
        intent.billing_interval,
        intent.interval_count,
        rawStripePriceId,
        mutation.namespacedKey,
        productId,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  );
  if (intent.intent_kind === "license") {
    statements.push(
      binding
        .prepare(
          `INSERT INTO license_offers
            (id, slug, track_id, track_revision_id, license_terms_id,
             license_terms_version_id, license_terms_version,
             license_option_id, commerce_product_id, commerce_price_id,
             state, revision, created_by_user_id, last_operation_key)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM license_offers WHERE slug = ?)
             AND EXISTS (
               SELECT 1 FROM commerce_products
               WHERE id = ? AND product_type = 'license'
                 AND resource_type = 'track' AND resource_id = ?
                 AND state = 'active'
             )
             AND EXISTS (
               SELECT 1 FROM commerce_prices
               WHERE id = ? AND commerce_product_id = ? AND active = 1
                 AND billing_interval = 'one_time'
                 AND stripe_environment = 'test' AND livemode = 0
             ) AND ${guard.sql} AND ${authority.sql}`,
        )
        .bind(
          licenseOfferId,
          intent.intent_key,
          intent.track_id,
          intent.track_revision_id,
          intent.license_terms_id,
          intent.license_terms_version_id,
          intent.license_terms_version,
          intent.license_option_id,
          productId,
          priceId,
          context.actorUserId,
          mutation.namespacedKey,
          intent.intent_key,
          productId,
          intent.track_id,
          priceId,
          productId,
          ...guard.bindings,
          ...authority.bindings,
        ),
    );
  }
  statements.push(
    binding
      .prepare(
        `UPDATE commerce_binding_intents
         SET binding_state = 'bound', commerce_product_id = ?,
             commerce_price_id = ?, revision = revision + 1,
             last_operation_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND intent_key = ? AND binding_state = 'pending'
           AND revision = ?
           AND EXISTS (
             SELECT 1 FROM commerce_prices
             WHERE id = ? AND commerce_product_id = ?
               AND stripe_price_id = ? AND stripe_environment = 'test'
               AND livemode = 0
           )
           AND (? <> 'license' OR EXISTS (
             SELECT 1 FROM license_offers
             WHERE id = ? AND commerce_product_id = ?
               AND commerce_price_id = ? AND state = 'active'
           )) AND ${authority.sql}`,
      )
      .bind(
        productId,
        priceId,
        mutation.namespacedKey,
        intent.id,
        intent.intent_key,
        intent.revision,
        priceId,
        productId,
        rawStripePriceId,
        intent.intent_kind,
        licenseOfferId,
        productId,
        priceId,
        ...authority.bindings,
      ),
  );
  const requiredWriteCount = statements.length;
  const auditIndex = statements.length;
  statements.push(
    binding
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, action, subject_type, subject_id,
           idempotency_key, request_fingerprint, request_id, details_json,
           result_json)
         SELECT ?, ?, ?, 'commerce-binding-intent', ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM commerce_binding_intents
           WHERE id = ? AND binding_state = 'bound'
             AND commerce_product_id = ? AND commerce_price_id = ?
             AND revision = ? AND last_operation_key = ?
         ) AND ${authority.sql}`,
      )
      .bind(
        `audit_${crypto.randomUUID()}`,
        context.actorUserId,
        operation,
        intent.id,
        mutation.namespacedKey,
        mutation.fingerprint,
        context.requestId,
        JSON.stringify({
          intentKey: intent.intent_key,
          intentKind: intent.intent_kind,
          stripeEnvironment: "test",
          livemode: false,
        }),
        JSON.stringify(result),
        intent.id,
        productId,
        priceId,
        revision,
        mutation.namespacedKey,
        ...authority.bindings,
      ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      results
        .slice(0, requiredWriteCount)
        .some((write) => changedRows(write) !== 1) ||
      changedRows(results[auditIndex]) !== 1
    ) {
      throw staleMutation("commerce binding intent");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}
