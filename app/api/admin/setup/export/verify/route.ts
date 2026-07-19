import { env } from "cloudflare:workers";
import { markPortableArtistExportVerified } from "@/db/portability-export.ts";
import {
  requireApplicationAuthority,
  requireIdempotencyKey,
  requireSameOrigin,
} from "@/lib/auth/authorize-application.ts";
import {
  PortabilityError,
  parseArtistExportArchiveBytes,
  verifyArtistExportArchive,
} from "@/lib/portability/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";

export const dynamic = "force-dynamic";

const MAXIMUM_ARCHIVE_BYTES = 50 * 1024 * 1024;
const ARCHIVE_MEDIA_TYPES = new Set([
  "application/json",
  "application/vnd.a-op.artist-export+json",
]);

function invalidArchive(message: string): RuntimeError {
  return new RuntimeError("PORTABILITY_FORMAT_INVALID", message, {
    status: 400,
    publicMessage: "Provide a valid a-op artist installation export.",
  });
}

async function readArchiveBytes(request: Request): Promise<Uint8Array> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0];
  if (!mediaType || !ARCHIVE_MEDIA_TYPES.has(mediaType)) {
    throw new RuntimeError(
      "PORTABILITY_CONTENT_TYPE_REQUIRED",
      "Artist export verification requires the versioned JSON media type.",
      {
        status: 415,
        publicMessage: "Submit an a-op artist installation export as JSON.",
      },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAXIMUM_ARCHIVE_BYTES) {
    throw new RuntimeError(
      "PORTABILITY_ARCHIVE_TOO_LARGE",
      "The artist export exceeds the in-memory verification boundary.",
      {
        status: 413,
        publicMessage: "That artist export is too large to verify.",
      },
    );
  }
  if (!request.body) throw invalidArchive("The artist export body is missing.");

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAXIMUM_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new RuntimeError(
          "PORTABILITY_ARCHIVE_TOO_LARGE",
          "The artist export exceeds the in-memory verification boundary.",
          {
            status: 413,
            publicMessage: "That artist export is too large to verify.",
          },
        );
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw invalidArchive("The artist export body could not be read.");
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function portabilityRuntimeError(error: unknown): never {
  if (error instanceof PortabilityError) {
    throw new RuntimeError(error.code, error.message, {
      status: 400,
      publicMessage: "Provide a valid a-op artist installation export.",
      details: { location: error.location },
    });
  }
  throw error;
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(
    "admin.portable_export_verification_failed",
    async (requestId) => {
      requireSameOrigin(request);
      const idempotencyKey = requireIdempotencyKey(request);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      let verified;
      try {
        verified = await verifyArtistExportArchive(
          parseArtistExportArchiveBytes(await readArchiveBytes(request)),
        );
      } catch (error) {
        return portabilityRuntimeError(error);
      }
      const result = await markPortableArtistExportVerified(env.DB, verified, {
        actorUserId: owner.userId,
        idempotencyKey,
      });
      return apiJson(
        {
          result: {
            status: "verified",
            exportKey: result.exportKey,
            archiveSha256: result.archiveSha256,
            semanticFingerprint: result.semanticFingerprint,
            fileCount: result.fileCount,
            mediaObjectCount: result.mediaObjectCount,
            byteCount: result.byteCount,
            verifiedAt: result.verifiedAt,
          },
          replayed: result.replayed,
        },
        requestId,
      );
    },
  );
}
