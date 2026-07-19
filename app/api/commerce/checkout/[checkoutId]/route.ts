import { env } from "cloudflare:workers";
import { checkoutReceipt } from "@/db/commerce-checkout-write.ts";
import {
  readCommerceProductName,
  readCustomerCheckoutSession,
} from "@/db/commerce-read.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

interface CheckoutContext {
  readonly params: Promise<{ checkoutId: string }>;
}

export async function GET(
  _request: Request,
  context: CheckoutContext,
): Promise<Response> {
  return runApiRoute("commerce.checkout_read_failed", async (requestId) => {
    const customer = await requireApplicationAuthority(env.DB, ["customer"]);
    const { checkoutId } = await context.params;
    const checkout = await readCustomerCheckoutSession(
      env.DB,
      checkoutId,
      customer.userId,
    );
    if (!checkout) {
      throw new RuntimeError("CHECKOUT_NOT_FOUND", "Checkout not found.", {
        status: 404,
        publicMessage: "That test checkout was not found.",
      });
    }
    const productName = await readCommerceProductName(
      env.DB,
      checkout.commerceProductId,
    );
    if (!productName) {
      throw new RuntimeError(
        "COMMERCE_INTEGRITY",
        "The checkout product relationship is incomplete.",
        {
          status: 500,
          publicMessage: "That test checkout is temporarily unavailable.",
        },
      );
    }
    return apiJson(
      { result: checkoutReceipt(checkout, productName, true) },
      requestId,
    );
  });
}
