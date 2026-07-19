import { env } from "cloudflare:workers";
import { processVerifiedCheckoutEvent } from "@/db/commerce-fulfillment.ts";
import {
  processVerifiedInvoiceEvent,
  processVerifiedSubscriptionEvent,
} from "@/db/commerce-recurring-fulfillment.ts";
import {
  CommerceAdapterError,
  digestVerifiedStripeTestEvent,
  validateStripeTestEnvironment,
  verifyAndParseStripeTestEvent,
} from "@/lib/commerce/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 262_144;

function adapterFailure(error: CommerceAdapterError): RuntimeError {
  const setup =
    error.code === "STRIPE_CONFIGURATION_MISSING" ||
    error.code === "STRIPE_CONFIGURATION_INVALID" ||
    error.code === "STRIPE_LIVE_CREDENTIAL_REJECTED";
  const signature =
    error.code === "STRIPE_WEBHOOK_SIGNATURE_INVALID" ||
    error.code === "STRIPE_WEBHOOK_TIMESTAMP_INVALID";
  return new RuntimeError(error.code, error.message, {
    status: setup ? 503 : signature ? 400 : 422,
    publicMessage: setup
      ? "Stripe Test Mode setup is incomplete or invalid."
      : signature
        ? "The Stripe webhook signature is invalid."
        : "The Stripe Test event was rejected.",
  });
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0];
  if (mediaType !== "application/json") {
    throw new RuntimeError(
      "STRIPE_WEBHOOK_CONTENT_TYPE_REQUIRED",
      "Stripe webhook requests require application/json.",
      {
        status: 415,
        publicMessage: "The Stripe webhook content type is invalid.",
      },
    );
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (/^[0-9]+$/.test(declaredLength) === false ||
      Number(declaredLength) > MAX_WEBHOOK_BYTES)
  ) {
    throw new RuntimeError(
      "STRIPE_WEBHOOK_BODY_TOO_LARGE",
      "The Stripe webhook body exceeded its byte limit.",
      { status: 413, publicMessage: "The Stripe webhook body is too large." },
    );
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new RuntimeError(
          "STRIPE_WEBHOOK_BODY_TOO_LARGE",
          "The Stripe webhook body exceeded its byte limit.",
          {
            status: 413,
            publicMessage: "The Stripe webhook body is too large.",
          },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("commerce.stripe_webhook_failed", async (requestId) => {
    try {
      validateStripeTestEnvironment({
        publishableKey: env.STRIPE_PUBLISHABLE_KEY,
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      });

      const rawBody = await readBoundedBody(request);
      const event = await verifyAndParseStripeTestEvent({
        rawBody,
        signatureHeader: request.headers.get("stripe-signature"),
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      });
      const digests = await digestVerifiedStripeTestEvent(rawBody, event);
      const processedAt = new Date().toISOString();
      const input = { ...digests, requestId, processedAt };
      const result =
        event.objectKind === "checkout-session"
          ? await processVerifiedCheckoutEvent(env.DB, { event, ...input })
          : event.objectKind === "invoice"
            ? await processVerifiedInvoiceEvent(env.DB, { event, ...input })
            : await processVerifiedSubscriptionEvent(env.DB, {
                event,
                ...input,
              });
      return apiJson({ received: true, result }, requestId);
    } catch (error) {
      if (error instanceof CommerceAdapterError) throw adapterFailure(error);
      throw error;
    }
  });
}
