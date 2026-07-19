import { env } from "cloudflare:workers";
import { saveCourseDraft } from "@/db/course-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateCourseDraftInput } from "@/lib/courses/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

interface CourseRouteContext {
  readonly params: Promise<{ slug: string }>;
}

export async function PUT(
  request: Request,
  context: CourseRouteContext,
): Promise<Response> {
  return runApiRoute("admin.course_draft_failed", async (requestId) => {
    await requireActiveModule(env.DB, "courses");
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedVersion", "course"],
      "Course draft request",
    );
    const expectedVersion = requireExpectedVersion(input.expectedVersion, {
      allowZero: true,
    });
    const course = validateCourseDraftInput(input.course);
    if (!course.ok) throwValidationIssues("Course draft", course.issues);
    const slug = requireRouteSlug((await context.params).slug);
    if (course.value.slug !== slug) {
      throwValidationIssues("Course draft", [
        {
          field: "course.slug",
          message: "Course slug must match the requested route.",
        },
      ]);
    }
    const identity = await requireApplicationAuthority(
      env.DB,
      ["owner", "editor"],
      {
        permissionKey: "pages.write",
        scopeId: expectedVersion === 0 ? "*" : slug,
      },
    );
    const result = await saveCourseDraft(
      env.DB,
      course.value,
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
