import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeCustomerCondition } from "./authority-guards.ts";
import {
  readActiveCommerceProduct,
  readCheckoutSession,
  type ActiveCommerceProduct,
  type StoredCheckoutSession,
} from "./commerce-read.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
} from "./mutation.ts";
import {
  commerceTestStatus,
  type CommerceCheckoutReceipt,
  type CommerceCheckoutSelection,
} from "@/lib/commerce/domain.ts";
import type { StripeTestCheckoutSession } from "@/lib/commerce/stripe-checkout.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

interface CheckoutIntentAuditReceipt {
  readonly checkoutId: string;
  readonly productId: string;
  readonly productName: string;
}

export interface CheckoutIntentResult {
  readonly product: ActiveCommerceProduct;
  readonly checkout: StoredCheckoutSession;
  readonly replayed: boolean;
}

const SAFE_FAILURE_CATEGORY = /^[a-z][a-z0-9._-]{2,119}$/;
const RETURN_PATH = "/commerce/return";

function checkoutUnavailable(): RuntimeError {
  return new RuntimeError(
    "CHECKOUT_UNAVAILABLE",
    "The test checkout selection is not currently fulfillable.",
    {
      status: 409,
      publicMessage: "That test checkout cannot be started right now.",
    },
  );
}

async function requireCompatibleLicenseRequest(
  binding: D1Database,
  selection: CommerceCheckoutSelection,
  product: ActiveCommerceProduct,
  customerUserId: string,
): Promise<void> {
  if (product.productType !== "license") {
    if (selection.licenseRequestId !== null) throw checkoutUnavailable();
    return;
  }
  if (selection.licenseRequestId === null) throw checkoutUnavailable();

  const row = await binding
    .prepare(
      `SELECT 1 AS valid
       FROM license_requests
       JOIN license_offers
         ON license_offers.id = license_requests.license_offer_id
        AND license_offers.revision = license_requests.license_offer_revision
       WHERE license_requests.id = ?1
         AND license_requests.customer_user_id = ?2
         AND license_requests.state = 'approved'
         AND license_offers.state = 'active'
         AND license_offers.commerce_product_id = ?3
         AND license_offers.commerce_price_id = ?4
         AND NOT EXISTS (
           SELECT 1
           FROM credit_reservations
           WHERE purpose_type = 'license_request'
             AND purpose_id = license_requests.id
             AND customer_user_id = license_requests.customer_user_id
             AND credit_kind = 'license'
             AND state IN ('reserved', 'consumed')
             AND stripe_environment = 'test' AND livemode = 0
         )
         AND NOT EXISTS (
           SELECT 1
           FROM checkout_sessions AS existing_checkout
           WHERE existing_checkout.license_request_id = license_requests.id
             AND existing_checkout.status IN ('creating', 'open', 'completed')
             AND existing_checkout.stripe_environment = 'test'
             AND existing_checkout.livemode = 0
         )
       LIMIT 1`,
    )
    .bind(
      selection.licenseRequestId,
      customerUserId,
      product.id,
      product.priceId,
    )
    .first<{ valid: number }>();
  if (row?.valid !== 1) throw checkoutUnavailable();
}

async function replayIntent(
  binding: D1Database,
  product: ActiveCommerceProduct,
  receipt: CheckoutIntentAuditReceipt,
): Promise<CheckoutIntentResult> {
  const checkout = await readCheckoutSession(binding, receipt.checkoutId);
  if (
    !checkout ||
    checkout.commerceProductId !== product.id ||
    receipt.productId !== product.id ||
    receipt.productName !== product.name
  ) {
    throw new RuntimeError(
      "RECEIPT_INVALID",
      "The saved checkout receipt does not match durable checkout state.",
      {
        status: 500,
        publicMessage: "The saved test checkout could not be read.",
      },
    );
  }
  return Object.freeze({ product, checkout, replayed: true });
}

export async function createCheckoutIntent(
  binding: D1Database,
  selection: CommerceCheckoutSelection,
  context: MutationContext,
): Promise<CheckoutIntentResult> {
  const product = await readActiveCommerceProduct(binding, selection.productId);
  const operation = "commerce.checkout.create";
  const mutation = await prepareMutation<CheckoutIntentAuditReceipt>(
    binding,
    operation,
    context,
    selection,
  );
  if (mutation.replayValue) {
    return replayIntent(binding, product, mutation.replayValue);
  }
  await requireCompatibleLicenseRequest(
    binding,
    selection,
    product,
    context.actorUserId,
  );

  const checkoutId = `checkout_${crypto.randomUUID()}`;
  const result: CheckoutIntentAuditReceipt = Object.freeze({
    checkoutId,
    productId: product.id,
    productName: product.name,
  });
  const authority = activeCustomerCondition(context.actorUserId);
  const insert = binding
    .prepare(
      `INSERT INTO checkout_sessions
        (id, customer_user_id, commerce_product_id, commerce_price_id,
         license_request_id, mode, status, return_path, amount_minor,
         currency, stripe_environment, livemode, idempotency_key,
         request_fingerprint)
       SELECT ?, ?, ?, ?, ?, ?, 'creating', ?, ?, ?, 'test', 0, ?, ?
       WHERE ${authority.sql}
         AND EXISTS (
           SELECT 1
           FROM commerce_products
           JOIN commerce_prices
             ON commerce_prices.id = ?
            AND commerce_prices.commerce_product_id = commerce_products.id
            AND commerce_prices.active = 1
            AND commerce_prices.stripe_environment = 'test'
            AND commerce_prices.livemode = 0
           WHERE commerce_products.id = ?
             AND commerce_products.state = 'active'
             AND commerce_products.revision = ?
         )
         AND (
           (? IS NULL AND ? <> 'license')
           OR EXISTS (
             SELECT 1
             FROM license_requests
             JOIN license_offers
               ON license_offers.id = license_requests.license_offer_id
              AND license_offers.revision = license_requests.license_offer_revision
             WHERE license_requests.id = ?
               AND license_requests.customer_user_id = ?
               AND license_requests.state = 'approved'
               AND license_offers.state = 'active'
               AND license_offers.commerce_product_id = ?
               AND license_offers.commerce_price_id = ?
               AND NOT EXISTS (
                 SELECT 1
                 FROM credit_reservations
                 WHERE purpose_type = 'license_request'
                   AND purpose_id = license_requests.id
                   AND customer_user_id = license_requests.customer_user_id
                   AND credit_kind = 'license'
                   AND state IN ('reserved', 'consumed')
                   AND stripe_environment = 'test' AND livemode = 0
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM checkout_sessions AS existing_checkout
                 WHERE existing_checkout.license_request_id = license_requests.id
                   AND existing_checkout.status IN ('creating', 'open', 'completed')
                   AND existing_checkout.stripe_environment = 'test'
                   AND existing_checkout.livemode = 0
               )
           )
         )`,
    )
    .bind(
      checkoutId,
      context.actorUserId,
      product.id,
      product.priceId,
      selection.licenseRequestId,
      product.mode,
      RETURN_PATH,
      product.amountMinor,
      product.currency,
      mutation.namespacedKey,
      mutation.fingerprint,
      ...authority.bindings,
      product.priceId,
      product.id,
      product.revision,
      selection.licenseRequestId,
      product.productType,
      selection.licenseRequestId,
      context.actorUserId,
      product.id,
      product.priceId,
    );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "checkout",
      subjectId: checkoutId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        productId: product.id,
        productType: product.productType,
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...result },
    },
    `EXISTS (
       SELECT 1 FROM checkout_sessions
       WHERE id = ? AND customer_user_id = ?
         AND idempotency_key = ? AND request_fingerprint = ?
     )`,
    [
      checkoutId,
      context.actorUserId,
      mutation.namespacedKey,
      mutation.fingerprint,
    ],
  );

  try {
    const applied = await runAtomicBatch(binding, [insert, audit]);
    if (changedRows(applied[0]) !== 1 || changedRows(applied[1]) !== 1) {
      throw staleMutation("test checkout");
    }
    const checkout = await readCheckoutSession(binding, checkoutId);
    if (!checkout) throw staleMutation("test checkout");
    return Object.freeze({ product, checkout, replayed: false });
  } catch (error) {
    const replay = await replayAfterMutationFailure(binding, mutation, error);
    return replayIntent(binding, product, replay.value);
  }
}

export async function markCheckoutOpen(
  binding: D1Database,
  checkout: StoredCheckoutSession,
  session: StripeTestCheckoutSession,
): Promise<StoredCheckoutSession> {
  if (
    checkout.status !== "creating" ||
    session.stripeEnvironment !== "test" ||
    session.livemode !== false ||
    session.mode !== checkout.mode
  ) {
    throw staleMutation("test checkout");
  }
  const result = await binding
    .prepare(
      `UPDATE checkout_sessions
       SET status = 'open', stripe_checkout_session_id = ?1,
           stripe_checkout_url = ?2, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?3 AND customer_user_id = ?4
         AND status = 'creating'
         AND commerce_product_id = ?5 AND commerce_price_id = ?6
         AND mode = ?7 AND amount_minor = ?8 AND currency = ?9
         AND stripe_environment = 'test' AND livemode = 0`,
    )
    .bind(
      session.checkoutSessionId,
      session.checkoutUrl,
      checkout.id,
      checkout.customerUserId,
      checkout.commerceProductId,
      checkout.commercePriceId,
      checkout.mode,
      checkout.amountMinor,
      checkout.currency,
    )
    .run();
  if (changedRows(result) !== 1) {
    const current = await readCheckoutSession(binding, checkout.id);
    if (
      current?.status === "open" &&
      current.stripeCheckoutSessionId === session.checkoutSessionId &&
      current.stripeCheckoutUrl === session.checkoutUrl
    ) {
      return current;
    }
    throw staleMutation("test checkout");
  }
  const current = await readCheckoutSession(binding, checkout.id);
  if (!current) throw staleMutation("test checkout");
  return current;
}

export async function markCheckoutFailed(
  binding: D1Database,
  checkoutId: string,
  failureCategory: string,
): Promise<void> {
  if (!SAFE_FAILURE_CATEGORY.test(failureCategory)) {
    throw new TypeError("A safe checkout failure category is required.");
  }
  await binding
    .prepare(
      `UPDATE checkout_sessions
       SET status = 'failed', failure_category = ?1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?2 AND status = 'creating'
         AND stripe_checkout_session_id IS NULL
         AND stripe_checkout_url IS NULL
         AND stripe_environment = 'test' AND livemode = 0`,
    )
    .bind(failureCategory, checkoutId)
    .run();
}

export function checkoutReceipt(
  checkout: StoredCheckoutSession,
  productName: string,
  replayed: boolean,
): CommerceCheckoutReceipt {
  return Object.freeze({
    ...commerceTestStatus(),
    checkoutId: checkout.id,
    productId: checkout.commerceProductId,
    productName,
    mode: checkout.mode,
    status: checkout.status,
    amountMinor: checkout.amountMinor,
    currency: checkout.currency,
    checkoutUrl: checkout.stripeCheckoutUrl,
    returnPath: checkout.returnPath,
    replayed,
  });
}

export function checkoutProviderIdempotencyKey(checkoutId: string): string {
  return `aop_checkout_${checkoutId}`;
}
