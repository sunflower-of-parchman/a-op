import { env } from "cloudflare:workers";
import { bindCommerceIntent } from "@/db/commerce-binding-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { requireMutationObject } from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly intentKey: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return runApiRoute("admin.commerce_binding_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["stripePriceId"],
      "Commerce binding request",
    );
    const { intentKey } = await context.params;
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await bindCommerceIntent(
      env.DB,
      intentKey,
      input.stripePriceId,
      {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      },
    );

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.replayed ? 200 : 201,
    );
  });
}
