import { env } from "cloudflare:workers";
import { markUpdateRead } from "@/db/updates-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { requireMutationObject } from "../../../admin/mutation-input.ts";

export const dynamic = "force-dynamic";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ updateId: string }> },
): Promise<Response> {
  return runApiRoute("update.read_receipt_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    requireMutationObject(requestInput, [], "Update read receipt request");
    const idempotencyKey = requireIdempotencyKey(request);
    const { updateId } = await context.params;
    if (!SAFE_ID.test(updateId)) {
      throw new RuntimeError("INVALID_INPUT", "Update ID is invalid.", {
        status: 400,
        publicMessage: "That update cannot be marked read.",
      });
    }
    const customer = await requireApplicationAuthority(env.DB, ["customer"]);
    await requireActiveModule(env.DB, "whats-new");
    const result = await markUpdateRead(env.DB, updateId, {
      actorUserId: customer.userId,
      idempotencyKey,
      requestId,
      telemetry: telemetryMutationRequestContext(request),
    });
    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
