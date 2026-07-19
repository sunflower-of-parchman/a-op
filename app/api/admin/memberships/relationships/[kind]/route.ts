import { env } from "cloudflare:workers";
import {
  activateMembership,
  activateSubscription,
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
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

export const dynamic = "force-dynamic";

interface MembershipRelationshipCollectionContext {
  readonly params: Promise<{ kind: string }>;
}

export async function POST(
  request: Request,
  context: MembershipRelationshipCollectionContext,
): Promise<Response> {
  return runApiRoute(
    "admin.membership_relationship_activate_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["activation"],
        "Membership activation request",
      );
      const idempotencyKey = requireIdempotencyKey(request);
      const kind = requireMembershipRouteKind((await context.params).kind);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireMembershipRouteModules(env.DB, kind);
      const mutationContext = {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
        telemetry: telemetryMutationRequestContext(request),
      };
      const result =
        kind === "membership"
          ? await activateMembership(env.DB, input.activation, mutationContext)
          : await activateSubscription(
              env.DB,
              input.activation,
              mutationContext,
            );

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
        result.replayed ? 200 : 201,
      );
    },
  );
}
