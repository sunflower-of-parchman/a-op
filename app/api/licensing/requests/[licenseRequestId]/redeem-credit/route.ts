import { env } from "cloudflare:workers";
import { redeemLicenseRequestWithCredits } from "@/db/license-credit-redemption.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import { requireMutationObject } from "@/app/api/admin/mutation-input.ts";

export const dynamic = "force-dynamic";

interface LicenseCreditRouteContext {
  readonly params: Promise<{ licenseRequestId: string }>;
}

export async function POST(
  request: Request,
  context: LicenseCreditRouteContext,
): Promise<Response> {
  return runApiRoute(
    "licensing.credit_redemption_failed",
    async (requestId) => {
      requireMutationObject(
        await readJsonMutation(request),
        [],
        "License-credit redemption",
      );
      const idempotencyKey = requireIdempotencyKey(request);
      const customer = await requireApplicationAuthority(env.DB, ["customer"]);
      await requireActiveModule(env.DB, "licensing");
      const licenseRequestId = (await context.params).licenseRequestId;
      const result = await redeemLicenseRequestWithCredits(
        env.DB,
        licenseRequestId,
        {
          actorUserId: customer.userId,
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
