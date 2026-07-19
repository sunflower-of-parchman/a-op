import { env } from "cloudflare:workers";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { generateLicenseDocument } from "@/lib/licensing/document-generation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "@/app/api/admin/mutation-input.ts";

export const dynamic = "force-dynamic";

interface LicenseDocumentRouteContext {
  readonly params: Promise<{ licenseDocumentId: string }>;
}

export async function POST(
  request: Request,
  context: LicenseDocumentRouteContext,
): Promise<Response> {
  return runApiRoute(
    "admin.license_document_generate_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["expectedRevision"],
        "License document generation",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const idempotencyKey = requireIdempotencyKey(request);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      await requireActiveModule(env.DB, "licensing");
      const licenseDocumentId = (await context.params).licenseDocumentId;
      const result = await generateLicenseDocument(
        env.DB,
        env.MEDIA,
        { licenseDocumentId, expectedRevision },
        { actorUserId: owner.userId, idempotencyKey, requestId },
      );
      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
        result.replayed ? 200 : 201,
      );
    },
  );
}
