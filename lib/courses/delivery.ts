import { readCourseLessonMediaDelivery } from "@/db/course-media.ts";
import { decideCourseLessonAccess } from "@/lib/courses/access.ts";
import type { ApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { createR2MediaStore } from "@/lib/media/r2-store.ts";
import {
  createMediaResponse,
  createMediaResponsePlan,
  parseByteRange,
} from "@/lib/media/range.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { REQUEST_ID_HEADER, RuntimeError } from "@/lib/runtime/index.ts";

function unavailable(): RuntimeError {
  return new RuntimeError(
    "COURSE_MEDIA_NOT_FOUND",
    "Course media is not available.",
    { status: 404, publicMessage: "That lesson media is not available." },
  );
}

function denied(): RuntimeError {
  return new RuntimeError(
    "COURSE_MEDIA_ACCESS_DENIED",
    "Course media access was denied.",
    {
      status: 403,
      publicMessage: "This account cannot open that lesson media.",
    },
  );
}

export async function deliverCourseLessonMedia(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly request: Request;
  readonly requestId: string;
  readonly courseSlug: string;
  readonly lessonSlug: string;
  readonly itemKey: string;
  readonly courseRevisionId: string;
  readonly identity: ApplicationIdentity | null;
}): Promise<Response> {
  await requireActiveModule(input.binding, "courses");
  const record = await readCourseLessonMediaDelivery(input.binding, {
    courseSlug: input.courseSlug,
    lessonSlug: input.lessonSlug,
    itemKey: input.itemKey,
    courseRevisionId: input.courseRevisionId,
  });
  if (!record) throw unavailable();
  const action =
    record.itemType === "download"
      ? "download"
      : record.itemType === "audio" || record.itemType === "video"
        ? "stream"
        : "view";
  const decision = await decideCourseLessonAccess({
    binding: input.binding,
    identity: input.identity,
    courseId: record.courseId,
    courseSlug: record.courseSlug,
    courseAccessMode: record.courseAccessMode,
    lessonId: record.lessonId,
    lessonAccessMode: record.lessonAccessMode,
    action,
    now: new Date().toISOString(),
  });
  if (!decision.allowed) throw denied();

  const store = createR2MediaStore(input.bucket);
  const metadata = await store.head(record.objectKey);
  if (
    !metadata ||
    metadata.byteLength !== record.byteLength ||
    metadata.contentType !== record.contentType
  ) {
    throw unavailable();
  }
  if (record.itemType === "audio" || record.itemType === "video") {
    const range = parseByteRange(
      input.request.headers.get("range"),
      record.byteLength,
    );
    const plan = createMediaResponsePlan(range, {
      contentType: record.contentType,
    });
    plan.headers.set("cache-control", "no-store");
    plan.headers.set(REQUEST_ID_HEADER, input.requestId);
    plan.headers.set("x-aop-access-source", decision.source);
    if (plan.status === 416) return createMediaResponse(plan, null);
    const object = plan.readRange
      ? await store.getRange(record.objectKey, plan.readRange)
      : await store.get(record.objectKey);
    if (!object) throw unavailable();
    return createMediaResponse(plan, object.body);
  }
  const object = await store.get(record.objectKey);
  if (!object) throw unavailable();
  const headers = new Headers({
    "cache-control": "no-store",
    "content-length": String(record.byteLength),
    "content-type": record.contentType,
    [REQUEST_ID_HEADER]: input.requestId,
    "x-aop-access-source": decision.source,
  });
  if (record.itemType === "download") {
    headers.set(
      "content-disposition",
      `attachment; filename="${record.filename ?? "course-download"}"`,
    );
  }
  return new Response(object.body, { status: 200, headers });
}
