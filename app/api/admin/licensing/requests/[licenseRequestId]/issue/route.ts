import { env } from "cloudflare:workers";
import { issueLicense } from "@/db/licensing-write.ts";
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
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

export const dynamic = "force-dynamic";

interface LicenseRequestRouteContext {
  readonly params: Promise<{ licenseRequestId: string }>;
}

export async function POST(
  request: Request,
  context: LicenseRequestRouteContext,
): Promise<Response> {
  return runApiRoute(
    "admin.licensing_request_issue_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["expectedRevision"],
        "Owner-approved license issuance",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const idempotencyKey = requireIdempotencyKey(request);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireActiveModule(env.DB, "licensing");
      const licenseRequestId = (await context.params).licenseRequestId;
      const result = await issueLicense(
        env.DB,
        {
          source: "owner_approval",
          licenseRequestId,
          expectedRevision,
          issuedAt: new Date().toISOString(),
        },
        {
          actorUserId: owner.userId,
          idempotencyKey,
          requestId,
          telemetry: telemetryMutationRequestContext(request),
        },
      );

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
        result.replayed ? 200 : 201,
      );
    },
  );
}
