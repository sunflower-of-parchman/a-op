import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";
import { deliverVideoPoster } from "@/lib/video/delivery.ts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ videoId: string }> },
): Promise<Response> {
  return runApiRoute("video.poster_delivery_failed", async (requestId) => {
    const [authenticatedUser, { videoId }] = await Promise.all([
      getChatGPTUser(),
      context.params,
    ]);
    const identity = await resolveApplicationIdentity(
      env.DB,
      authenticatedUser,
    );
    return deliverVideoPoster({
      binding: env.DB,
      bucket: env.MEDIA,
      requestId,
      videoId,
      identity,
    });
  });
}
