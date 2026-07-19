import { env } from "cloudflare:workers";
import { listActiveCommerceProducts } from "@/db/commerce-read.ts";
import { commerceTestStatus } from "@/lib/commerce/domain.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("commerce.products_read_failed", async (requestId) =>
    apiJson(
      {
        testMode: commerceTestStatus(),
        products: await listActiveCommerceProducts(env.DB),
      },
      requestId,
    ),
  );
}
