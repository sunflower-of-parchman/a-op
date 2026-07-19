import { env } from "cloudflare:workers";
import { saveReleaseDraft } from "@/db/catalog-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateReleaseDraftInput } from "@/lib/catalog/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface ReleaseRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function PUT(
  request: Request,
  context: ReleaseRouteContext,
): Promise<Response> {
  return runApiRoute("admin.release_draft_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion", "release"],
      "Release draft request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: true,
    });
    const release = validateReleaseDraftInput(input.release);
    if (!release.ok) throwValidationIssues("Release draft", release.issues);

    const slug = requireRouteSlug((await context.params).slug);
    if (release.value.slug !== slug) {
      throwValidationIssues("Release draft", [
        {
          field: "release.slug",
          message: "Release slug must match the requested route.",
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
    const result = await saveReleaseDraft(
      env.DB,
      release.value,
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
