import { env } from "cloudflare:workers";
import { saveContentSectionDraft } from "@/db/content-section-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateContentSectionDraftInput } from "@/lib/content-sections/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  throwValidationIssues,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { readonly params: Promise<{ sectionKey: string }> },
): Promise<Response> {
  return runApiRoute("admin.content_section_save_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion", "section"],
      "Content section draft request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: true,
    });
    const validated = validateContentSectionDraftInput(input.section);
    if (!validated.ok) {
      throwValidationIssues("Content section draft", validated.issues);
    }
    const { sectionKey } = await context.params;
    if (validated.value.sectionKey !== sectionKey) {
      throwValidationIssues("Content section draft", [
        {
          code: "content-section-key-mismatch",
          field: "section.sectionKey",
          message: "Section key must match the requested route.",
        },
      ]);
    }
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await saveContentSectionDraft(
      env.DB,
      validated.value,
      expectedVersion,
      {
        actorUserId: owner.userId,
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
