import { env } from "cloudflare:workers";
import { grantEditor } from "@/db/role-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { validateEditorAssignmentInput } from "@/lib/site/validation.ts";
import {
  requireMutationObject,
  throwValidationIssues,
} from "../mutation-input.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.editor_grant_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["editor"],
      "Editor assignment request",
    );
    const editor = validateEditorAssignmentInput(input.editor);
    if (!editor.ok) {
      throwValidationIssues("Editor assignment", editor.issues);
    }

    const identity = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await grantEditor(env.DB, editor.value, {
      actorUserId: identity.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.replayed ? 200 : 201,
    );
  });
}
