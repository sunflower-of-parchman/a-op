import { env } from "cloudflare:workers";
import { reverseCreditGrantLot } from "@/db/credit-ledger-write.ts";
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

interface CreditLotRouteContext {
  readonly params: Promise<{ lotId: string }>;
}

export async function POST(
  request: Request,
  context: CreditLotRouteContext,
): Promise<Response> {
  return runApiRoute("admin.credit_lot_reverse_failed", async (requestId) => {
    const input = requireMutationObject(
      await readJsonMutation(request),
      ["expectedLotRevision", "expectedAccountRevision"],
      "Credit lot reversal",
    );
    const expectedLotRevision = requireExpectedVersion(
      input.expectedLotRevision,
      { allowZero: false },
    );
    const expectedAccountRevision = requireExpectedVersion(
      input.expectedAccountRevision,
      { allowZero: false },
    );
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await reverseCreditGrantLot(
      env.DB,
      (await context.params).lotId,
      expectedLotRevision,
      expectedAccountRevision,
      { actorUserId: owner.userId, idempotencyKey, requestId },
    );

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
