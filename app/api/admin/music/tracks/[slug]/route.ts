import { env } from "cloudflare:workers";
import { saveTrackDraft } from "@/db/catalog-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateTrackDraftInput } from "@/lib/catalog/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface TrackRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function PUT(
  request: Request,
  context: TrackRouteContext,
): Promise<Response> {
  return runApiRoute("admin.track_draft_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion", "track"],
      "Track draft request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: true,
    });
    const track = validateTrackDraftInput(input.track);
    if (!track.ok) throwValidationIssues("Track draft", track.issues);

    const slug = requireRouteSlug((await context.params).slug);
    if (track.value.slug !== slug) {
      throwValidationIssues("Track draft", [
        {
          field: "track.slug",
          message: "Track slug must match the requested route.",
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
    const result = await saveTrackDraft(env.DB, track.value, expectedVersion, {
      actorUserId: identity.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.value.created && !result.replayed ? 201 : 200,
    );
  });
}
