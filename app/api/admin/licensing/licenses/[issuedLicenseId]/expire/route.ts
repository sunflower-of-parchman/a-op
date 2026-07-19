import { env } from "cloudflare:workers";
import { expireIssuedLicense } from "@/db/licensing-write.ts";
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

interface IssuedLicenseRouteContext {
  readonly params: Promise<{ issuedLicenseId: string }>;
}

export async function POST(
  request: Request,
  context: IssuedLicenseRouteContext,
): Promise<Response> {
  return runApiRoute(
    "admin.issued_license_expire_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["expectedRevision", "reason"],
        "License expiration",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const idempotencyKey = requireIdempotencyKey(request);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireActiveModule(env.DB, "licensing");
      const result = await expireIssuedLicense(
        env.DB,
        (await context.params).issuedLicenseId,
        {
          expectedRevision,
          reason: input.reason,
          effectiveAt: new Date().toISOString(),
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
