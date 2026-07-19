import { env } from "cloudflare:workers";
import { pruneTelemetryEvents } from "@/db/telemetry-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { validateEmptyTelemetryInput } from "@/lib/telemetry/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.telemetry_prune_failed", async (requestId) => {
    validateEmptyTelemetryInput(await readJsonMutation(request));
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    await requireActiveModule(env.DB, "telemetry");
    const result = await pruneTelemetryEvents(env.DB, {
      actorUserId: owner.userId,
      idempotencyKey,
      requestId,
    });
    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.replayed ? 200 : 201,
    );
  });
}
