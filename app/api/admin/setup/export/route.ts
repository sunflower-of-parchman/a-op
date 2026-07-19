import { env } from "cloudflare:workers";
import { createPortableArtistExport } from "@/db/portability-export.ts";
import {
  requireApplicationAuthority,
  requireIdempotencyKey,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import { CURRENT_OPERATIONAL_SCHEMA_VERSION } from "@/lib/operations/schema-version.ts";
import { REQUEST_ID_HEADER } from "@/lib/runtime/index.ts";
import { runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute("admin.portable_export_failed", async (requestId) => {
    requireSameOrigin(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await createPortableArtistExport(env.DB, {
      applicationSchemaVersion: CURRENT_OPERATIONAL_SCHEMA_VERSION,
      actorUserId: owner.userId,
      idempotencyKey,
    });
    const body = new ArrayBuffer(result.bytes.byteLength);
    new Uint8Array(body).set(result.bytes);

    return new Response(body, {
      status: result.replayed ? 200 : 201,
      headers: {
        "cache-control": "no-store",
        "content-disposition":
          'attachment; filename="a-op-artist-installation.export.json"',
        "content-type": "application/vnd.a-op.artist-export+json",
        [REQUEST_ID_HEADER]: requestId,
        "x-a-op-export-sha256": result.archiveSha256,
        "x-a-op-export-replayed": String(result.replayed),
      },
    });
  });
}
