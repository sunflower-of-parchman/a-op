import { env } from "cloudflare:workers";
import { saveVideoDraft } from "@/db/video-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { validateVideoDraftInput } from "@/lib/video/validation.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return runApiRoute("admin.video_draft_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision", "video"],
      "Video draft request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: true,
    });
    const validated = validateVideoDraftInput(input.video);
    if (!validated.ok) throwValidationIssues("Video draft", validated.issues);
    const slug = requireRouteSlug((await context.params).slug);
    if (validated.value.slug !== slug) {
      throwValidationIssues("Video draft", [
        {
          code: "video-slug-mismatch",
          field: "video.slug",
          message: "Video slug must match the requested route.",
        },
      ]);
    }
    const identity = await requireApplicationAuthority(
      env.DB,
      ["owner", "editor"],
      { permissionKey: "pages.write", scopeId: slug },
    );
    await requireActiveModule(env.DB, "video");
    const result = await saveVideoDraft(
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
