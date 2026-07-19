import { env } from "cloudflare:workers";
import { expireAccessGrantSet } from "@/db/access-admin-write.ts";
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

interface GrantSetRouteContext {
  readonly params: Promise<{ grantSetId: string }>;
}

export async function POST(
  request: Request,
  context: GrantSetRouteContext,
): Promise<Response> {
  return runApiRoute("admin.access_grant_expire_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision"],
      "Access-grant expiration request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: false,
    });
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await expireAccessGrantSet(
      env.DB,
      (await context.params).grantSetId,
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
  });
}
