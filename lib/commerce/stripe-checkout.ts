import {
  SITES_COMMERCE_ADAPTER,
  STRIPE_TEST_ENVIRONMENT,
  assertStripeTestSecretKey,
} from "./environment.ts";
import { NO_REAL_PAYMENT_STATEMENT } from "./domain.ts";
import { CommerceAdapterError } from "./errors.ts";

export const STRIPE_CHECKOUT_SESSION_ENDPOINT =
  "https://api.stripe.com/v1/checkout/sessions";

export interface StripeTestCheckoutInput {
  readonly secretKey: unknown;
  readonly idempotencyKey: unknown;
  readonly mode: unknown;
  readonly priceId: unknown;
  readonly checkoutId: unknown;
  readonly productId: unknown;
  readonly customerUserId: unknown;
  readonly stripeCustomerId?: unknown;
  readonly successUrl: unknown;
  readonly cancelUrl: unknown;
}

export interface StripeTestCheckoutDependencies {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

export interface StripeTestCheckoutSession {
  readonly adapter: typeof SITES_COMMERCE_ADAPTER;
  readonly stripeEnvironment: typeof STRIPE_TEST_ENVIRONMENT;
  readonly livemode: false;
  readonly mode: "payment" | "subscription";
  readonly checkoutSessionId: string;
  readonly checkoutUrl: string;
}

const SAFE_APPLICATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const STRIPE_PRICE_ID = /^price_[A-Za-z0-9]{6,255}$/;
const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]{6,255}$/;
const STRIPE_TEST_CHECKOUT_ID = /^cs_test_[A-Za-z0-9]{6,255}$/;
const MAX_CHECKOUT_RESPONSE_BYTES = 65_536;

function invalidInput(): never {
  throw new CommerceAdapterError(
    "STRIPE_CHECKOUT_INPUT_INVALID",
    "The Stripe Test Checkout request is invalid.",
  );
}

function invalidResponse(): never {
  throw new CommerceAdapterError(
    "STRIPE_CHECKOUT_RESPONSE_INVALID",
    "Stripe returned an invalid Test Checkout response.",
  );
}

function safeApplicationId(value: unknown): string {
  return typeof value === "string" && SAFE_APPLICATION_ID.test(value)
    ? value
    : invalidInput();
}

function checkoutReturnUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2_048) invalidInput();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidInput();
  }

  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    invalidInput();
  }
  return url;
}

function optionalCustomerId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && STRIPE_CUSTOMER_ID.test(value)
    ? value
    : invalidInput();
}

function basicAuthorization(secretKey: string): string {
  return `Basic ${globalThis.btoa(`${secretKey}:`)}`;
}

function formBody(input: StripeTestCheckoutInput): {
  readonly mode: "payment" | "subscription";
  readonly body: URLSearchParams;
} {
  const mode =
    input.mode === "payment" || input.mode === "subscription"
      ? input.mode
      : invalidInput();
  const checkoutId = safeApplicationId(input.checkoutId);
  const productId = safeApplicationId(input.productId);
  const customerUserId = safeApplicationId(input.customerUserId);
  const customerId = optionalCustomerId(input.stripeCustomerId);
  const successUrl = checkoutReturnUrl(input.successUrl);
  const cancelUrl = checkoutReturnUrl(input.cancelUrl);

  if (successUrl.origin !== cancelUrl.origin) invalidInput();
  if (
    typeof input.priceId !== "string" ||
    !STRIPE_PRICE_ID.test(input.priceId)
  ) {
    invalidInput();
  }

  const body = new URLSearchParams();
  body.set("mode", mode);
  body.set("ui_mode", "hosted");
  body.set("client_reference_id", checkoutId);
  body.set("success_url", successUrl.toString());
  body.set("cancel_url", cancelUrl.toString());
  body.set("custom_text[submit][message]", NO_REAL_PAYMENT_STATEMENT);
  body.set("line_items[0][price]", input.priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[aop_checkout_id]", checkoutId);
  body.set("metadata[aop_product_id]", productId);
  body.set("metadata[aop_customer_id]", customerUserId);

  if (customerId !== null) body.set("customer", customerId);
  if (mode === "subscription") {
    body.set("subscription_data[metadata][aop_checkout_id]", checkoutId);
    body.set("subscription_data[metadata][aop_product_id]", productId);
    body.set("subscription_data[metadata][aop_customer_id]", customerUserId);
  }

  return Object.freeze({ mode, body });
}

function checkoutUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4_096) invalidResponse();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidResponse();
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.port !== "" ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    invalidResponse();
  }
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function safeResponseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new CommerceAdapterError(
      "STRIPE_CHECKOUT_REQUEST_FAILED",
      "Stripe Test Checkout could not be created.",
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return invalidResponse();
  }
  if (new TextEncoder().encode(text).byteLength > MAX_CHECKOUT_RESPONSE_BYTES) {
    invalidResponse();
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return invalidResponse();
  }
  return isRecord(value) ? value : invalidResponse();
}

/** Creates one server-owned, hosted Stripe Test Checkout session. */
export async function createStripeTestCheckoutSession(
  input: StripeTestCheckoutInput,
  dependencies: StripeTestCheckoutDependencies,
): Promise<StripeTestCheckoutSession> {
  assertStripeTestSecretKey(input.secretKey);
  if (
    typeof input.idempotencyKey !== "string" ||
    !SAFE_IDEMPOTENCY_KEY.test(input.idempotencyKey)
  ) {
    invalidInput();
  }
  if (typeof dependencies.fetch !== "function") invalidInput();

  const { mode, body } = formBody(input);
  let response: Response;
  try {
    response = await dependencies.fetch(STRIPE_CHECKOUT_SESSION_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: basicAuthorization(input.secretKey),
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": input.idempotencyKey,
      },
      body: body.toString(),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new CommerceAdapterError(
      "STRIPE_CHECKOUT_REQUEST_FAILED",
      "Stripe Test Checkout could not be created.",
    );
  }

  const value = await safeResponseJson(response);
  if (
    value.object !== "checkout.session" ||
    value.livemode !== false ||
    value.ui_mode !== "hosted" ||
    value.mode !== mode ||
    typeof value.id !== "string" ||
    !STRIPE_TEST_CHECKOUT_ID.test(value.id)
  ) {
    invalidResponse();
  }

  return Object.freeze({
    adapter: SITES_COMMERCE_ADAPTER,
    stripeEnvironment: STRIPE_TEST_ENVIRONMENT,
    livemode: false,
    mode,
    checkoutSessionId: value.id,
    checkoutUrl: checkoutUrl(value.url),
  });
}
