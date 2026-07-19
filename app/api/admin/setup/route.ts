import { env } from "cloudflare:workers";
import { readSetupSourceState } from "@/db/setup-source-state.ts";
import { readSetupWorkspace } from "@/db/setup-state.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute("admin.setup_read_failed", async (requestId) => {
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const [workspace, source] = await Promise.all([
      readSetupWorkspace(env.DB, owner.userId),
      readSetupSourceState(env.DB),
    ]);
    return apiJson(
      {
        workspace,
        source: {
          fingerprint: source.fingerprint,
          d1SchemaVersion: source.snapshot.d1SchemaVersion,
          setupRevision: source.snapshot.setupRevision,
          resourceCount: source.snapshot.resources.length,
        },
      },
      requestId,
    );
  });
}
