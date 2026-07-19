import { env } from "cloudflare:workers";
import { readTelemetryPublicConfiguration } from "@/db/telemetry-read.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return runApiRoute("telemetry.configuration_failed", async (requestId) => {
    const configuration = await readTelemetryPublicConfiguration(
      env.DB,
      request.headers,
    );
    return apiJson({ configuration }, requestId);
  });
}
