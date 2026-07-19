import { env } from "cloudflare:workers";
import { requireMutationObject } from "@/app/api/admin/mutation-input.ts";
import { redeemTrackDownloadWithCredit } from "@/db/download-credit-redemption.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

interface DownloadCreditRouteContext {
  readonly params: Promise<{ trackId: string }>;
}

export async function POST(
  request: Request,
  context: DownloadCreditRouteContext,
): Promise<Response> {
  return runApiRoute(
    "credits.download_redemption_failed",
    async (requestId) => {
      requireMutationObject(
        await readJsonMutation(request),
        [],
        "Download-credit redemption",
      );
      const idempotencyKey = requireIdempotencyKey(request);
      const customer = await requireApplicationAuthority(env.DB, ["customer"]);
      await requireActiveModule(env.DB, "downloads");
      const trackId = (await context.params).trackId;
      const result = await redeemTrackDownloadWithCredit(env.DB, trackId, {
        actorUserId: customer.userId,
        idempotencyKey,
        requestId,
      });

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
        result.replayed ? 200 : 201,
      );
    },
  );
}
