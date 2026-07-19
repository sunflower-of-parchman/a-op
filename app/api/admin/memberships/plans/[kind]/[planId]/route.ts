import { env } from "cloudflare:workers";
import {
  reviseMembershipPlan,
  reviseSubscriptionPlan,
} from "@/db/membership-write.ts";
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
import {
  requireMembershipRouteId,
  requireMembershipRouteKind,
  requireMembershipRouteModules,
} from "../../../membership-input.ts";

export const dynamic = "force-dynamic";

interface MembershipPlanContext {
  readonly params: Promise<{ kind: string; planId: string }>;
}

export async function PUT(
  request: Request,
  context: MembershipPlanContext,
): Promise<Response> {
  return runApiRoute(
    "admin.membership_plan_revise_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["expectedRevision", "plan"],
        "Membership-plan revision request",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const idempotencyKey = requireIdempotencyKey(request);
      const params = await context.params;
      const kind = requireMembershipRouteKind(params.kind);
      const planId = requireMembershipRouteId(params.planId, "Plan ID");
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireMembershipRouteModules(env.DB, kind);
      const mutationContext = {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      };
      const result =
        kind === "membership"
          ? await reviseMembershipPlan(
              env.DB,
              planId,
              input.plan,
              expectedRevision,
              mutationContext,
            )
          : await reviseSubscriptionPlan(
              env.DB,
              planId,
              input.plan,
              expectedRevision,
              mutationContext,
            );

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
