import { env } from "cloudflare:workers";
import {
  checkoutProviderIdempotencyKey,
  checkoutReceipt,
  createCheckoutIntent,
  markCheckoutFailed,
  markCheckoutOpen,
} from "@/db/commerce-checkout-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import {
  CommerceAdapterError,
  createStripeTestCheckoutSession,
  parseCommerceCheckoutSelection,
  validateStripeTestEnvironment,
} from "@/lib/commerce/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

function adapterFailure(error: CommerceAdapterError): RuntimeError {
  const setup =
    error.code === "STRIPE_CONFIGURATION_MISSING" ||
    error.code === "STRIPE_CONFIGURATION_INVALID" ||
    error.code === "STRIPE_LIVE_CREDENTIAL_REJECTED";
  return new RuntimeError(error.code, error.message, {
    status: setup ? 503 : 502,
    publicMessage: setup
      ? "Stripe Test Mode setup is incomplete or invalid."
      : "Stripe Test Checkout is temporarily unavailable.",
  });
}

function requireCheckoutOrigin(request: Request): URL {
  const url = new URL(request.url);
  const localDevelopment =
    env.AOP_RUNTIME_ENV === "development" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new RuntimeError(
      "STRIPE_CHECKOUT_HTTPS_REQUIRED",
      "Stripe-hosted Test Checkout requires an HTTPS application origin.",
      {
        status: 409,
        publicMessage:
          "Stripe Test Checkout is available from the hosted HTTPS Site.",
      },
    );
  }
  return url;
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("commerce.checkout_create_failed", async (requestId) => {
    const requestUrl = requireCheckoutOrigin(request);
    let selection;
    try {
      selection = parseCommerceCheckoutSelection(
        await readJsonMutation(request),
      );
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      throw new RuntimeError(
        "INVALID_INPUT",
        "The checkout selection did not satisfy its server contract.",
        {
          status: 400,
          publicMessage: "Choose an available test product and try again.",
        },
      );
    }
    const idempotencyKey = requireIdempotencyKey(request);
    const customer = await requireApplicationAuthority(env.DB, ["customer"]);

    try {
      validateStripeTestEnvironment({
        publishableKey: env.STRIPE_PUBLISHABLE_KEY,
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      });
    } catch (error) {
      if (error instanceof CommerceAdapterError) throw adapterFailure(error);
      throw error;
    }

    const intent = await createCheckoutIntent(env.DB, selection, {
      actorUserId: customer.userId,
      idempotencyKey,
      requestId,
    });
    let checkout = intent.checkout;
    if (checkout.status === "creating") {
      try {
        const returnUrl = new URL(checkout.returnPath, requestUrl.origin);
        returnUrl.searchParams.set("checkout", checkout.id);
        const cancelUrl = new URL(checkout.returnPath, requestUrl.origin);
        cancelUrl.searchParams.set("checkout", checkout.id);
        cancelUrl.searchParams.set("canceled", "1");
        const session = await createStripeTestCheckoutSession(
          {
            secretKey: env.STRIPE_SECRET_KEY,
            idempotencyKey: checkoutProviderIdempotencyKey(checkout.id),
            mode: checkout.mode,
            priceId: intent.product.stripePriceId,
            checkoutId: checkout.id,
            productId: checkout.commerceProductId,
            customerUserId: checkout.customerUserId,
            stripeCustomerId: checkout.stripeCustomerId,
            successUrl: returnUrl.toString(),
            cancelUrl: cancelUrl.toString(),
            allowHttpLoopback: env.AOP_RUNTIME_ENV === "development",
          },
          { fetch: globalThis.fetch },
        );
        checkout = await markCheckoutOpen(env.DB, checkout, session);
      } catch (error) {
        if (error instanceof CommerceAdapterError) {
          await markCheckoutFailed(
            env.DB,
            checkout.id,
            error.code.toLowerCase(),
          );
          throw adapterFailure(error);
        }
        throw error;
      }
    }

    return apiJson(
      {
        result: checkoutReceipt(checkout, intent.product.name, intent.replayed),
      },
      requestId,
      intent.replayed ? 200 : 201,
    );
  });
}
