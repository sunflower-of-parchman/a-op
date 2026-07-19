import { env } from "cloudflare:workers";
import { rejectLicenseRequest } from "@/db/licensing-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "@/app/api/admin/mutation-input.ts";

export const dynamic = "force-dynamic";

interface LicenseRequestRouteContext {
  readonly params: Promise<{ licenseRequestId: string }>;
}

export async function POST(
  request: Request,
  context: LicenseRequestRouteContext,
): Promise<Response> {
  return runApiRoute(
    "admin.licensing_request_reject_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["expectedRevision", "reason"],
        "License rejection",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const idempotencyKey = requireIdempotencyKey(request);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireActiveModule(env.DB, "licensing");
      const result = await rejectLicenseRequest(
        env.DB,
        (await context.params).licenseRequestId,
        {
          expectedRevision,
          reason: input.reason,
          decidedAt: new Date().toISOString(),
        },
        { actorUserId: owner.userId, idempotencyKey, requestId },
      );

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
