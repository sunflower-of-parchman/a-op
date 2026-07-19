import { env } from "cloudflare:workers";
import { saveCollectionDraft } from "@/db/catalog-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateCollectionDraftInput } from "@/lib/catalog/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface CollectionRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function PUT(
  request: Request,
  context: CollectionRouteContext,
): Promise<Response> {
  return runApiRoute("admin.collection_draft_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion", "collection"],
      "Collection draft request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: true,
    });
    const collection = validateCollectionDraftInput(input.collection);
    if (!collection.ok) {
      throwValidationIssues("Collection draft", collection.issues);
    }

    const slug = requireRouteSlug((await context.params).slug);
    if (collection.value.slug !== slug) {
      throwValidationIssues("Collection draft", [
        {
          field: "collection.slug",
          message: "Collection slug must match the requested route.",
        },
      ]);
    }

    const identity = await requireApplicationAuthority(
      env.DB,
      ["owner", "editor"],
      {
        permissionKey: "catalog.write",
        scopeId: expectedVersion === 0 ? "*" : slug,
      },
    );
    const result = await saveCollectionDraft(
      env.DB,
      collection.value,
      expectedVersion,
      {
        actorUserId: identity.userId,
        idempotencyKey,
        requestId,
      },
    );

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.value.created && !result.replayed ? 201 : 200,
    );
  });
}
