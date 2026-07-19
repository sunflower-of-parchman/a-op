import { env } from "cloudflare:workers";
import { readPublishedCourseLesson } from "@/db/course-read.ts";
import { saveCourseProgress } from "@/db/course-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateCourseProgressInput } from "@/lib/courses/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { telemetryMutationRequestContext } from "@/lib/telemetry/server-context.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  requireRouteSlug,
  throwValidationIssues,
} from "../../../../admin/mutation-input.ts";

export const dynamic = "force-dynamic";

interface CourseProgressRouteContext {
  readonly params: Promise<{ courseSlug: string; lessonSlug: string }>;
}

export async function PUT(
  request: Request,
  context: CourseProgressRouteContext,
): Promise<Response> {
  return runApiRoute("course.progress_failed", async (requestId) => {
    await requireActiveModule(env.DB, "courses");
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedProgressRevision", "progress"],
      "Course progress request",
    );
    const expectedProgressRevision = requireExpectedVersion(
      input.expectedProgressRevision,
      { allowZero: true },
    );
    const progress = validateCourseProgressInput(input.progress);
    if (!progress.ok) throwValidationIssues("Course progress", progress.issues);
    const { courseSlug: rawCourseSlug, lessonSlug: rawLessonSlug } =
      await context.params;
    const courseSlug = requireRouteSlug(rawCourseSlug);
    const lessonSlug = requireRouteSlug(rawLessonSlug);
    const identity = await requireApplicationAuthority(env.DB, ["customer"]);
    const lesson = await readPublishedCourseLesson(
      env.DB,
      courseSlug,
      lessonSlug,
      identity,
      new Date().toISOString(),
    );
    if (!lesson) {
      throw new RuntimeError(
        "COURSE_LESSON_NOT_FOUND",
        "The lesson does not exist.",
        {
          status: 404,
          publicMessage: "That lesson was not found.",
        },
      );
    }
    if (!lesson.access.allowed) {
      throw new RuntimeError(
        "COURSE_ACCESS_DENIED",
        "Lesson access was denied.",
        {
          status: 403,
          publicMessage: "This account cannot open that lesson.",
        },
      );
    }
    if (
      progress.value.courseId !== lesson.course.id ||
      progress.value.courseRevisionId !== lesson.course.revisionId ||
      progress.value.lessonKey !== lesson.lesson.lessonKey
    ) {
      throwValidationIssues("Course progress", [
        {
          field: "progress",
          message: "Progress must match the exact published lesson revision.",
        },
      ]);
    }
    const result = await saveCourseProgress(
      env.DB,
      progress.value,
      expectedProgressRevision,
      {
        actorUserId: identity.userId,
        idempotencyKey,
        requestId,
        telemetry: telemetryMutationRequestContext(request),
      },
    );
    return apiJson(
      { result: result.value, replayed: result.replayed },
      requestId,
      result.value.revision === 1 && !result.replayed ? 201 : 200,
    );
  });
}
