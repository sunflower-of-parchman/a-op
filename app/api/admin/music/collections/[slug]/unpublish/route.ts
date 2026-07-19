import { env } from "cloudflare:workers";
import { unpublishCollection } from "@/db/catalog-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
} from "../../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface CollectionUnpublishRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function POST(
  request: Request,
  context: CollectionUnpublishRouteContext,
): Promise<Response> {
  return runApiRoute("admin.collection_unpublish_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion"],
      "Collection unpublication request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: false,
    });
    const slug = requireRouteSlug((await context.params).slug);
    const identity = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await unpublishCollection(env.DB, slug, expectedVersion, {
      actorUserId: identity.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
    );
  });
}
