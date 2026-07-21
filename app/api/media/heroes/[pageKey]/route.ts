import { env } from "cloudflare:workers";
import { deliverPageHero } from "@/lib/page-presentation/delivery.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";
import { PAGE_HERO_KEYS, type PageHeroKey } from "@/lib/setup/types.ts";

export const dynamic = "force-dynamic";

function pageKey(value: string): PageHeroKey | null {
  return PAGE_HERO_KEYS.includes(value as PageHeroKey)
    ? (value as PageHeroKey)
    : null;
}

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ pageKey: string }> },
): Promise<Response> {
  return runApiRoute("page.hero_delivery_failed", async (requestId) => {
    const key = pageKey((await context.params).pageKey);
    if (!key) return new Response("Not found", { status: 404 });
    return deliverPageHero({
      binding: env.DB,
      bucket: env.MEDIA,
      pageKey: key,
      requestId,
    });
  });
}
