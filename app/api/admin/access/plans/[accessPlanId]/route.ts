import { env } from "cloudflare:workers";
import {
  archiveAccessPlan,
  updateAccessPlan,
} from "@/db/access-admin-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface AccessPlanRouteContext {
  readonly params: Promise<{ accessPlanId: string }>;
}

export async function PUT(
  request: Request,
  context: AccessPlanRouteContext,
): Promise<Response> {
  return runApiRoute("admin.access_plan_update_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision", "plan"],
      "Access-plan update request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: false,
    });
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await updateAccessPlan(
      env.DB,
      (await context.params).accessPlanId,
      input.plan,
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

export async function DELETE(
  request: Request,
  context: AccessPlanRouteContext,
): Promise<Response> {
  return runApiRoute("admin.access_plan_archive_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision"],
      "Access-plan archive request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: false,
    });
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await archiveAccessPlan(
      env.DB,
      (await context.params).accessPlanId,
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
