import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";
import { deliverHostedVideo } from "@/lib/video/delivery.ts";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ videoId: string }> },
): Promise<Response> {
  return runApiRoute("video.media_delivery_failed", async (requestId) => {
    const [authenticatedUser, { videoId }] = await Promise.all([
      getChatGPTUser(),
      context.params,
    ]);
    const identity = await resolveApplicationIdentity(
      env.DB,
      authenticatedUser,
    );
    return deliverHostedVideo({
      binding: env.DB,
      bucket: env.MEDIA,
      request,
      requestId,
      videoId,
      identity,
    });
  });
}
