import { env } from "cloudflare:workers";
import { readAdminAccessOverview } from "@/db/access-admin-read.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("admin.access_overview_failed", async (requestId) => {
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const overview = await readAdminAccessOverview(env.DB, owner.userId);
    return apiJson({ result: overview }, requestId);
  });
}
