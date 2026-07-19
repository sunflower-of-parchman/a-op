import { env } from "cloudflare:workers";
import { unpublishCourse } from "@/db/course-write.ts";
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

interface CourseUnpublishRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function POST(
  request: Request,
  context: CourseUnpublishRouteContext,
): Promise<Response> {
  return runApiRoute("admin.course_unpublish_failed", async (requestId) => {
    await requireActiveModule(env.DB, "courses");
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion"],
      "Course publication request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: false,
    });
    const slug = requireRouteSlug((await context.params).slug);
    const identity = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await unpublishCourse(env.DB, slug, expectedVersion, {
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
