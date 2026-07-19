import { env } from "cloudflare:workers";
import { deliverArtwork } from "@/lib/catalog/delivery.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

interface ArtworkContext {
  readonly params: Promise<{ derivativeId: string }>;
}

export async function GET(
  _request: Request,
  context: ArtworkContext,
): Promise<Response> {
  return runApiRoute("catalog.artwork_delivery_failed", async (requestId) => {
    const { derivativeId } = await context.params;
    return deliverArtwork({
      binding: env.DB,
      bucket: env.MEDIA,
      derivativeId,
      requestId,
    });
  });
}
