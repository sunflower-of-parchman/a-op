import { env } from "cloudflare:workers";
import {
  applyMembershipCancellation,
  applySubscriptionCancellation,
  clearMembershipCancellation,
  clearSubscriptionCancellation,
  expireMembership,
  expireSubscription,
  pauseMembership,
  pauseSubscription,
  renewSubscription,
  resumeMembership,
  resumeSubscription,
  scheduleMembershipCancellation,
  scheduleSubscriptionCancellation,
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
  requireMembershipEffectiveAt,
  requireMembershipRelationshipAction,
  requireMembershipRouteId,
  requireMembershipRouteKind,
  requireMembershipRouteModules,
} from "../../../../membership-input.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

export const dynamic = "force-dynamic";

interface MembershipRelationshipContext {
  readonly params: Promise<{
    kind: string;
    relationshipId: string;
    action: string;
  }>;
}

export async function POST(
  request: Request,
  context: MembershipRelationshipContext,
): Promise<Response> {
  return runApiRoute(
    "admin.membership_relationship_transition_failed",
    async (requestId) => {
      const params = await context.params;
      const kind = requireMembershipRouteKind(params.kind);
      const action = requireMembershipRelationshipAction(params.action, kind);
      const requiresEffectiveAt =
        action === "apply-cancellation" || action === "expire";
      const input = requireMutationObject(
        await readJsonMutation(request),
        requiresEffectiveAt
          ? ["effectiveAt", "expectedRevision"]
          : ["expectedRevision"],
        "Membership relationship transition",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const effectiveAt = requiresEffectiveAt
        ? requireMembershipEffectiveAt(input.effectiveAt)
        : null;
      const relationshipId = requireMembershipRouteId(
        params.relationshipId,
        "Relationship ID",
      );
      const idempotencyKey = requireIdempotencyKey(request);
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
          ? action === "pause"
            ? await pauseMembership(
                env.DB,
                relationshipId,
                expectedRevision,
                mutationContext,
              )
            : action === "resume"
              ? await resumeMembership(
                  env.DB,
                  relationshipId,
                  expectedRevision,
                  mutationContext,
                )
              : action === "schedule-cancellation"
                ? await scheduleMembershipCancellation(
                    env.DB,
                    relationshipId,
                    expectedRevision,
                    mutationContext,
                  )
                : action === "clear-cancellation"
                  ? await clearMembershipCancellation(
                      env.DB,
                      relationshipId,
                      expectedRevision,
                      mutationContext,
                    )
                  : action === "apply-cancellation"
                    ? await applyMembershipCancellation(
                        env.DB,
                        relationshipId,
                        expectedRevision,
                        effectiveAt!,
                        mutationContext,
                      )
                    : await expireMembership(
                        env.DB,
                        relationshipId,
                        expectedRevision,
                        effectiveAt!,
                        mutationContext,
                      )
          : action === "pause"
            ? await pauseSubscription(
                env.DB,
                relationshipId,
                expectedRevision,
                mutationContext,
              )
            : action === "resume"
              ? await resumeSubscription(
                  env.DB,
                  relationshipId,
                  expectedRevision,
                  mutationContext,
                )
              : action === "schedule-cancellation"
                ? await scheduleSubscriptionCancellation(
                    env.DB,
                    relationshipId,
                    expectedRevision,
                    mutationContext,
                  )
                : action === "clear-cancellation"
                  ? await clearSubscriptionCancellation(
                      env.DB,
                      relationshipId,
                      expectedRevision,
                      mutationContext,
                    )
                  : action === "apply-cancellation"
                    ? await applySubscriptionCancellation(
                        env.DB,
                        relationshipId,
                        expectedRevision,
                        effectiveAt!,
                        mutationContext,
                      )
                    : action === "expire"
                      ? await expireSubscription(
                          env.DB,
                          relationshipId,
                          expectedRevision,
                          effectiveAt!,
                          mutationContext,
                        )
                      : await renewSubscription(
                          env.DB,
                          relationshipId,
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
