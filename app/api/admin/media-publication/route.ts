import { env } from "cloudflare:workers";
import {
  finalizeMediaPublication,
  requireAppliedMediaPublicationApproval,
} from "@/db/media-publication.ts";
import {
  requireApplicationAuthority,
  requireIdempotencyKey,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import {
  createR2ImmutablePublicationStore,
  ensureImmutablePublicationObject,
  readMediaPublicationRequest,
  resolveMediaPublicationByteCap,
} from "@/lib/media-preparation/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

function configuredPublicationByteCap(): number {
  const runtime = env as unknown as {
    readonly MEDIA_PUBLICATION_MAX_BYTES?: unknown;
  };
  return resolveMediaPublicationByteCap(runtime.MEDIA_PUBLICATION_MAX_BYTES);
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.media_publication_failed", async (requestId) => {
    requireSameOrigin(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const { publication, bytes } = await readMediaPublicationRequest(
      request,
      configuredPublicationByteCap(),
    );

    // Check the exact applied proposal before R2 can receive any bytes.
    await requireAppliedMediaPublicationApproval(
      env.DB,
      publication,
      owner.userId,
    );
    const object = await ensureImmutablePublicationObject(
      createR2ImmutablePublicationStore(env.MEDIA),
      publication,
      bytes,
    );
    const mutation = await finalizeMediaPublication(
      env.DB,
      publication,
      {
        privateObjectKey: object.privateObjectKey,
        etag: object.etag,
        byteLength: bytes.byteLength,
      },
      {
        actorUserId: owner.userId,
        idempotencyKey,
        requestId,
      },
    );

    return apiJson(
      {
        result: mutation.value,
        replayed: mutation.replayed,
        immutableObjectReused: object.reused,
        delivery: "central-access-contract",
      },
      requestId,
      mutation.replayed || object.reused ? 200 : 201,
    );
  });
}
