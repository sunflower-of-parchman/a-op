import { env } from "cloudflare:workers";
import { archiveCommerceProduct } from "@/db/commerce-admin-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "../../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface CommerceProductRouteContext {
  readonly params: Promise<{ commerceProductId: string }>;
}

export async function POST(
  request: Request,
  context: CommerceProductRouteContext,
): Promise<Response> {
  return runApiRoute(
    "admin.commerce_product_archive_failed",
    async (requestId) => {
      const requestInput = await readJsonMutation(request);
      const idempotencyKey = requireIdempotencyKey(request);
      const input = requireMutationObject(
        requestInput,
        ["expectedRevision"],
        "Commerce-product archive request",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const result = await archiveCommerceProduct(
        env.DB,
        (await context.params).commerceProductId,
        expectedRevision,
        {
          actorUserId: owner.userId,
          idempotencyKey,
          requestId,
        },
      );

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
