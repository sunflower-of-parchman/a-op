import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { deliverTrackDownload } from "@/lib/catalog/delivery.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";

export const dynamic = "force-dynamic";

interface TrackDownloadContext {
  readonly params: Promise<{ trackId: string }>;
}

export async function GET(
  request: Request,
  context: TrackDownloadContext,
): Promise<Response> {
  return runApiRoute("catalog.track_download_failed", async (requestId) => {
    const { trackId } = await context.params;
    const requestedRevisionId = new URL(request.url).searchParams.get(
      "revision",
    );
    const identity = await resolveApplicationIdentity(
      env.DB,
      await getChatGPTUser(),
    );
    return deliverTrackDownload({
      binding: env.DB,
      bucket: env.MEDIA,
      requestId,
      trackId,
      requestedRevisionId,
      identity,
      telemetry: telemetryMutationRequestContext(request),
    });
  });
}
