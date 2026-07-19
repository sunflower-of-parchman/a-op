import { env } from "cloudflare:workers";
import { archiveUpdate } from "@/db/updates-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ slug: string }> },
): Promise<Response> {
  return runApiRoute("admin.update_archive_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision"],
      "Update archive request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: false,
    });
    const slug = requireRouteSlug((await context.params).slug);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    await requireActiveModule(env.DB, "whats-new");
    const result = await archiveUpdate(env.DB, slug, expectedRevision, {
      actorUserId: owner.userId,
      idempotencyKey,
      requestId,
    });
    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
