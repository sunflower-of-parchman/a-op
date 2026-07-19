import { env } from "cloudflare:workers";
import { readOperationsOverview } from "@/db/operations-read.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("admin.operations_read_failed", async (requestId) => {
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await readOperationsOverview(
      env.DB,
      env.MEDIA,
      owner.userId,
    );
    return apiJson({ result }, requestId);
  });
}
