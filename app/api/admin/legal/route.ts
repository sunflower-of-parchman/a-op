import { env } from "cloudflare:workers";
import { readLegalAdminWorkspace } from "@/db/legal-read.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("admin.legal_read_failed", async (requestId) => {
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const workspace = await readLegalAdminWorkspace(env.DB, owner.userId);
    return apiJson({ workspace }, requestId);
  });
}
