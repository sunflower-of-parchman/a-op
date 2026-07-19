import { env } from "cloudflare:workers";
import { readContentSectionAdminWorkspace } from "@/db/content-section-read.ts";
import { requireApplicationAuthority } from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute(
    "admin.content_sections_read_failed",
    async (requestId) => {
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const { sections, publishedOptions } =
        await readContentSectionAdminWorkspace(env.DB, owner.userId);
      return apiJson({ sections, publishedOptions }, requestId);
    },
  );
}
