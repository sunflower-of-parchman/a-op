import { env } from "cloudflare:workers";
import {
  createMembershipPlan,
  createSubscriptionPlan,
} from "@/db/membership-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { requireMutationObject } from "@/app/api/admin/mutation-input.ts";
import {
  requireMembershipRouteKind,
  requireMembershipRouteModules,
} from "../../membership-input.ts";

export const dynamic = "force-dynamic";

interface MembershipPlanCollectionContext {
  readonly params: Promise<{ kind: string }>;
}

export async function POST(
  request: Request,
  context: MembershipPlanCollectionContext,
): Promise<Response> {
  return runApiRoute(
    "admin.membership_plan_create_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["plan"],
        "Membership-plan creation request",
      );
      const idempotencyKey = requireIdempotencyKey(request);
      const kind = requireMembershipRouteKind((await context.params).kind);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireMembershipRouteModules(env.DB, kind);
      const mutationContext = {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      };
      const result =
        kind === "membership"
          ? await createMembershipPlan(env.DB, input.plan, mutationContext)
          : await createSubscriptionPlan(env.DB, input.plan, mutationContext);

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
        result.replayed ? 200 : 201,
      );
    },
  );
}
