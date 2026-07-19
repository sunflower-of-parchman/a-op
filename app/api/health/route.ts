import { env } from "cloudflare:workers";
import { REQUEST_ID_HEADER, createRequestId } from "@/lib/runtime/index.ts";
import { runtimeLogger } from "@/lib/runtime/server-logger.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = createRequestId();
  const [database, media] = await Promise.allSettled([
    env.DB.prepare("SELECT COUNT(*) AS role_count FROM roles").first<{
      role_count: number;
    }>(),
    env.MEDIA.head("runtime/health-binding-probe"),
  ]);
  const databaseHealthy =
    database.status === "fulfilled" && database.value?.role_count === 3;
  const mediaHealthy = media.status === "fulfilled";
  const healthy = databaseHealthy && mediaHealthy;

  for (const [service, result] of [
    ["database", database],
    ["media", media],
  ] as const) {
    if (result.status === "rejected") {
      runtimeLogger.write({
        level: "error",
        event: "runtime.health_failed",
        requestId,
        context: { service },
        error: result.reason,
      });
    }
  }

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      services: {
        application: "ok",
        database: databaseHealthy ? "ok" : "unavailable",
        media: mediaHealthy ? "ok" : "unavailable",
      },
      requestId,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "cache-control": "no-store",
        [REQUEST_ID_HEADER]: requestId,
      },
    },
  );
}
