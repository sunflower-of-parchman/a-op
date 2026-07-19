import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { deliverCourseLessonMedia } from "@/lib/courses/delivery.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

interface CourseMediaRouteContext {
  readonly params: Promise<{
    courseSlug: string;
    lessonSlug: string;
    itemKey: string;
  }>;
}

export async function GET(
  request: Request,
  context: CourseMediaRouteContext,
): Promise<Response> {
  return runApiRoute("course.lesson_media_failed", async (requestId) => {
    const [{ courseSlug, lessonSlug, itemKey }, identity] = await Promise.all([
      context.params,
      resolveApplicationIdentity(env.DB, await getChatGPTUser()),
    ]);
    return deliverCourseLessonMedia({
      binding: env.DB,
      bucket: env.MEDIA,
      request,
      requestId,
      courseSlug,
      lessonSlug,
      itemKey,
      courseRevisionId: new URL(request.url).searchParams.get("revision") ?? "",
      identity,
    });
  });
}
