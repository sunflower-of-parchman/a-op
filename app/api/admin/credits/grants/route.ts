import { env } from "cloudflare:workers";
import { grantCustomerCredits } from "@/db/credit-ledger-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "@/app/api/admin/mutation-input.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.credit_grant_failed", async (requestId) => {
    const input = requireMutationObject(
      await readJsonMutation(request),
      [
        "customerUserId",
        "creditKind",
        "quantity",
        "expiresAt",
        "expectedAccountRevision",
      ],
      "Owner credit grant",
    );
    const expectedAccountRevision = requireExpectedVersion(
      input.expectedAccountRevision,
      { allowZero: true },
    );
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await grantCustomerCredits(
      env.DB,
      {
        customerUserId: input.customerUserId,
        creditKind: input.creditKind,
        originType: "owner",
        originId: `owner:${idempotencyKey}`,
        quantity: input.quantity,
        expiresAt: input.expiresAt,
        fulfillmentEventId: null,
      },
      expectedAccountRevision,
      { actorUserId: owner.userId, idempotencyKey, requestId },
    );

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.replayed ? 200 : 201,
    );
  });
}
