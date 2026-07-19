import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { deliverTrackStream } from "@/lib/catalog/delivery.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

interface TrackStreamContext {
  readonly params: Promise<{ trackId: string }>;
}

export async function GET(
  request: Request,
  context: TrackStreamContext,
): Promise<Response> {
  return runApiRoute("catalog.track_stream_failed", async (requestId) => {
    const { trackId } = await context.params;
    const requestedRevisionId = new URL(request.url).searchParams.get(
      "revision",
    );
    const identity = await resolveApplicationIdentity(
      env.DB,
      await getChatGPTUser(),
    );
    return deliverTrackStream({
      binding: env.DB,
      bucket: env.MEDIA,
      request,
      requestId,
      trackId,
      requestedRevisionId,
      identity,
    });
  });
}
