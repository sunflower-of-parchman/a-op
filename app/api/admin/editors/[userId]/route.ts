import { env } from "cloudflare:workers";
import { revokeEditor } from "@/db/role-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireMutationObject,
  requireSafeUserId,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface EditorRouteContext {
  readonly params: Promise<{ userId: string }>;
}

export async function DELETE(
  request: Request,
  context: EditorRouteContext,
): Promise<Response> {
  return runApiRoute("admin.editor_revoke_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    requireMutationObject(requestInput, [], "Editor removal request");
    const userId = requireSafeUserId((await context.params).userId);
    const identity = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await revokeEditor(env.DB, userId, {
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
