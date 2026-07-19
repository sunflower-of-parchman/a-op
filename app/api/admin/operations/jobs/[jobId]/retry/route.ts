import { env } from "cloudflare:workers";
import { retryMediaJob } from "@/db/operations-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireMediaJobRetryInput } from "@/lib/operations/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly jobId: string }> },
): Promise<Response> {
  return runApiRoute("admin.operations_job_retry_failed", async (requestId) => {
    const input = requireMediaJobRetryInput(
      (await context.params).jobId,
      await readJsonMutation(request),
    );
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await retryMediaJob(env.DB, input, {
      actorUserId: owner.userId,
      idempotencyKey,
      requestId,
    });
    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
