import { readPageHeroDelivery } from "@/db/page-presentation.ts";
import { createR2MediaStore } from "@/lib/media/r2-store.ts";
import { REQUEST_ID_HEADER, RuntimeError } from "@/lib/runtime/index.ts";
import type { PageHeroKey } from "@/lib/setup/types.ts";

function unavailable(): RuntimeError {
  return new RuntimeError(
    "PAGE_HERO_NOT_FOUND",
    "Page hero is not available.",
    {
      status: 404,
      publicMessage: "That page image is not available.",
    },
  );
}

export async function deliverPageHero(input: {
  readonly binding: D1Database;
  readonly bucket: R2Bucket;
  readonly pageKey: PageHeroKey;
  readonly requestId: string;
}): Promise<Response> {
  const record = await readPageHeroDelivery(input.binding, input.pageKey);
  if (!record) throw unavailable();
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
      "cache-control": "public, max-age=300",
      "content-length": String(record.byteLength),
      "content-type": record.contentType,
      [REQUEST_ID_HEADER]: input.requestId,
    },
  });
}
