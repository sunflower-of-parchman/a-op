import { env } from "cloudflare:workers";
import { createCommerceProduct } from "@/db/commerce-admin-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { requireMutationObject } from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(
    "admin.commerce_product_create_failed",
    async (requestId) => {
      const requestInput = await readJsonMutation(request);
      const idempotencyKey = requireIdempotencyKey(request);
      const input = requireMutationObject(
        requestInput,
        ["product"],
        "Commerce-product creation request",
      );
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const result = await createCommerceProduct(env.DB, input.product, {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      });

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
        result.replayed ? 200 : 201,
      );
    },
  );
}
