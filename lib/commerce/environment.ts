import { CommerceAdapterError } from "./errors.ts";

export const SITES_COMMERCE_ADAPTER = "stripe-test-simulation" as const;
export const STRIPE_TEST_ENVIRONMENT = "test" as const;

export interface StripeTestEnvironmentInput {
  readonly publishableKey: unknown;
  readonly secretKey: unknown;
  readonly webhookSecret: unknown;
}

export interface StripeTestEnvironmentStatus {
  readonly adapter: typeof SITES_COMMERCE_ADAPTER;
  readonly stripeEnvironment: typeof STRIPE_TEST_ENVIRONMENT;
  readonly livemode: false;
  readonly ready: true;
}

const LIVE_CREDENTIAL = /^[a-z][a-z0-9]{1,15}_live_/i;
const TEST_PUBLISHABLE_KEY = /^pk_test_[A-Za-z0-9]{8,}$/;
const TEST_SECRET_KEY = /^sk_test_[A-Za-z0-9]{8,}$/;
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9]{8,}$/;

function credentialText(
  value: unknown,
  label: "publishable key" | "secret key" | "webhook signing secret",
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CommerceAdapterError(
      "STRIPE_CONFIGURATION_MISSING",
      `The Stripe Test ${label} is required.`,
    );
  }

  const trimmed = value.trim();
  if (LIVE_CREDENTIAL.test(trimmed)) {
    throw new CommerceAdapterError(
      "STRIPE_LIVE_CREDENTIAL_REJECTED",
      "Live Stripe credentials are disabled for this Sites application.",
    );
  }

  if (trimmed !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CommerceAdapterError(
      "STRIPE_CONFIGURATION_INVALID",
      `The Stripe Test ${label} is invalid.`,
    );
  }

  return value;
}

export function assertStripeTestPublishableKey(
  value: unknown,
): asserts value is string {
  const key = credentialText(value, "publishable key");
  if (!TEST_PUBLISHABLE_KEY.test(key)) {
    throw new CommerceAdapterError(
      "STRIPE_CONFIGURATION_INVALID",
      "A pk_test_ Stripe publishable key is required.",
    );
  }
}

export function assertStripeTestSecretKey(
  value: unknown,
): asserts value is string {
  const key = credentialText(value, "secret key");
  if (!TEST_SECRET_KEY.test(key)) {
    throw new CommerceAdapterError(
      "STRIPE_CONFIGURATION_INVALID",
      "An sk_test_ Stripe secret key is required.",
    );
  }
}

export function assertStripeWebhookSecret(
  value: unknown,
): asserts value is string {
  const secret = credentialText(value, "webhook signing secret");
  if (!WEBHOOK_SECRET.test(secret)) {
    throw new CommerceAdapterError(
      "STRIPE_CONFIGURATION_INVALID",
      "A whsec_ Stripe webhook signing secret is required.",
    );
  }
}

/** Validates setup without returning or retaining any credential material. */
export function validateStripeTestEnvironment(
  input: StripeTestEnvironmentInput,
): StripeTestEnvironmentStatus {
  assertStripeTestPublishableKey(input.publishableKey);
  assertStripeTestSecretKey(input.secretKey);
  assertStripeWebhookSecret(input.webhookSecret);

  return Object.freeze({
    adapter: SITES_COMMERCE_ADAPTER,
    stripeEnvironment: STRIPE_TEST_ENVIRONMENT,
    livemode: false,
    ready: true,
  });
}
