import {
  readPublishedExternalVideoPosterSource,
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

const MAX_EXTERNAL_POSTER_BYTES = 5 * 1024 * 1024;

function providerId(
  provider: "youtube" | "vimeo",
  embedUrl: string,
): string | null {
  let url: URL;
  try {
    url = new URL(embedUrl);
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const value = segments.at(-1) ?? "";
  if (
    provider === "youtube" &&
    (url.hostname === "www.youtube-nocookie.com" ||
      url.hostname === "www.youtube.com") &&
    segments.at(-2) === "embed" &&
    /^[A-Za-z0-9_-]{6,32}$/.test(value)
  ) {
    return value;
  }
  if (
    provider === "vimeo" &&
    url.hostname === "player.vimeo.com" &&
    segments.at(-2) === "video" &&
    /^\d{6,12}$/.test(value)
  ) {
    return value;
  }
  return null;
}

async function externalPosterUrl(
  provider: "youtube" | "vimeo",
  embedUrl: string,
): Promise<string | null> {
  const id = providerId(provider, embedUrl);
  if (!id) return null;
  if (provider === "youtube") {
    return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  }

  const metadata = await fetch(
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`,
    { redirect: "manual" },
  );
  if (!metadata.ok) return null;
  const body: unknown = await metadata.json();
  if (body === null || typeof body !== "object") return null;
  const thumbnailUrl = (body as { thumbnail_url?: unknown }).thumbnail_url;
  if (typeof thumbnailUrl !== "string") return null;
  const url = new URL(thumbnailUrl);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "i.vimeocdn.com" ||
      url.hostname.endsWith(".vimeocdn.com")
    )
  ) {
    return null;
  }
  return url.toString();
}

async function fetchExternalPoster(
  provider: "youtube" | "vimeo",
  embedUrl: string,
): Promise<{
  readonly body: ArrayBuffer;
  readonly contentType: string;
} | null> {
  const url = await externalPosterUrl(provider, embedUrl);
  if (!url) return null;
  const response = await fetch(url, { redirect: "manual" });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";", 1)[0];
  if (!contentType?.startsWith("image/")) return null;
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_EXTERNAL_POSTER_BYTES
  ) {
    return null;
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_EXTERNAL_POSTER_BYTES) return null;
  return { body, contentType };
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
  const externalSource = record
    ? null
    : await readPublishedExternalVideoPosterSource(
        input.binding,
        input.videoId,
      );
  if (!record && !externalSource) throw unavailable();

  const decision = await publicVideoDecision(
    input.identity,
    record?.videoId ?? externalSource!.videoId,
    "view",
  );
  if (!decision.allowed) throw unavailable();

  if (externalSource) {
    const poster = await fetchExternalPoster(
      externalSource.provider,
      externalSource.embedUrl,
    );
    if (!poster) throw unavailable();
    return new Response(poster.body, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
        "content-length": String(poster.body.byteLength),
        "content-type": poster.contentType,
        [REQUEST_ID_HEADER]: input.requestId,
        "x-aop-access-source": decision.source,
      },
    });
  }

  const store = createR2MediaStore(input.bucket);
  const metadata = await store.head(record!.objectKey);
  if (
    !metadata ||
    metadata.byteLength !== record!.byteLength ||
    metadata.contentType !== record!.contentType
  ) {
    throw unavailable();
  }
  const object = await store.get(record!.objectKey);
  if (!object) throw unavailable();
  return new Response(object.body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-length": String(record!.byteLength),
      "content-type": record!.contentType,
      [REQUEST_ID_HEADER]: input.requestId,
      "x-aop-access-source": decision.source,
    },
  });
}
