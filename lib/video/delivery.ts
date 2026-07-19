import {
  readPublishedHostedVideoDelivery,
  readPublishedVideoPosterDelivery,
} from "@/db/video-media.ts";
import { decideAccess } from "@/lib/access/decide-access.ts";
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
    "VIDEO_MEDIA_NOT_FOUND",
    "Video media is not available.",
    {
      status: 404,
      publicMessage: "That video media is not available.",
    },
  );
}

async function publicVideoDecision(
  identity: ApplicationIdentity | null,
  videoId: string,
  action: "view" | "stream",
) {
  return decideAccess({
    identity: identity
      ? { userId: identity.userId, roles: identity.roles }
      : null,
    resourceType: "video",
    resourceId: videoId,
    action,
    now: new Date().toISOString(),
    facts: { publicActions: [action] },
  });
}

export async function deliverHostedVideo(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly request: Request;
  readonly requestId: string;
  readonly videoId: string;
  readonly identity: ApplicationIdentity | null;
}): Promise<Response> {
  await requireActiveModule(input.binding, "video");
  const record = await readPublishedHostedVideoDelivery(
    input.binding,
    input.videoId,
  );
  if (!record) throw unavailable();

  const decision = await publicVideoDecision(
    input.identity,
    record.videoId,
    "stream",
  );
  if (!decision.allowed) throw unavailable();

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

  const store = createR2MediaStore(input.bucket);
  const metadata = await store.head(record.objectKey);
  if (
    !metadata ||
    metadata.byteLength !== record.byteLength ||
    metadata.contentType !== record.contentType
  ) {
    throw unavailable();
  }
  const object = plan.readRange
    ? await store.getRange(record.objectKey, plan.readRange)
    : await store.get(record.objectKey);
  if (!object) throw unavailable();
  return createMediaResponse(plan, object.body);
}

export async function deliverVideoPoster(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly requestId: string;
  readonly videoId: string;
  readonly identity: ApplicationIdentity | null;
}): Promise<Response> {
  await requireActiveModule(input.binding, "video");
  const record = await readPublishedVideoPosterDelivery(
    input.binding,
    input.videoId,
  );
  if (!record) throw unavailable();

  const decision = await publicVideoDecision(
    input.identity,
    record.videoId,
    "view",
  );
  if (!decision.allowed) throw unavailable();

  const store = createR2MediaStore(input.bucket);
  const metadata = await store.head(record.objectKey);
  if (
    !metadata ||
    metadata.byteLength !== record.byteLength ||
    metadata.contentType !== record.contentType
  ) {
    throw unavailable();
  }
  const object = await store.get(record.objectKey);
  if (!object) throw unavailable();
  return new Response(object.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-length": String(record.byteLength),
      "content-type": record.contentType,
      [REQUEST_ID_HEADER]: input.requestId,
      "x-aop-access-source": decision.source,
    },
  });
}
