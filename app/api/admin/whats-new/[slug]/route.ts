import { env } from "cloudflare:workers";
import { saveUpdateDraft } from "@/db/updates-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { validateUpdateDraftInput } from "@/lib/updates/validation.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { readonly params: Promise<{ slug: string }> },
): Promise<Response> {
  return runApiRoute("admin.update_draft_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision", "update"],
      "Update draft request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: true,
    });
    const validated = validateUpdateDraftInput(input.update);
    if (!validated.ok) throwValidationIssues("Update draft", validated.issues);
    const slug = requireRouteSlug((await context.params).slug);
    if (validated.value.slug !== slug) {
      throwValidationIssues("Update draft", [
        {
          code: "update-slug-mismatch",
          field: "update.slug",
          message: "Update slug must match the requested route.",
        },
      ]);
    }
    const identity = await requireApplicationAuthority(
      env.DB,
      ["owner", "editor"],
      { permissionKey: "pages.write", scopeId: slug },
    );
    await requireActiveModule(env.DB, "whats-new");
    const result = await saveUpdateDraft(
      env.DB,
      validated.value,
      expectedRevision,
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
