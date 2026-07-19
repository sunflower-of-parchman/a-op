import { env } from "cloudflare:workers";
import { issueAccessPlan } from "@/db/access-admin-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.access_plan_issue_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedPlanRevision", "grant"],
      "Access-plan issuance request",
    );
    const expectedPlanRevision = requireExpectedVersion(
      input.expectedPlanRevision,
      { allowZero: false },
    );
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await issueAccessPlan(
      env.DB,
      input.grant,
      expectedPlanRevision,
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
