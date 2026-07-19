import { env } from "cloudflare:workers";
import { approveLegalDocumentDraft } from "@/db/legal-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateLegalDocumentId } from "@/lib/legal/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  throwValidationIssues,
} from "../../../mutation-input.ts";

export const dynamic = "force-dynamic";

function requireDraftVersionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)
  ) {
    throwValidationIssues("Legal approval", [
      {
        code: "legal-version-id-invalid",
        field: "expectedDraftVersionId",
        message: "Expected draft version ID is invalid.",
      },
    ]);
  }
  return value;
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ documentId: string }> },
): Promise<Response> {
  return runApiRoute(
    "admin.legal_document_approval_failed",
    async (requestId) => {
      const requestInput = await readJsonMutation(request);
      const idempotencyKey = requireIdempotencyKey(request);
      const input = requireMutationObject(
        requestInput,
        ["expectedRevision", "expectedDraftVersionId"],
        "Legal approval request",
      );
      const expectedRevision = requireExpectedVersion(input.expectedRevision, {
        allowZero: false,
      });
      const expectedDraftVersionId = requireDraftVersionId(
        input.expectedDraftVersionId,
      );
      const documentIdResult = validateLegalDocumentId(
        (await context.params).documentId,
      );
      if (!documentIdResult.ok) {
        throwValidationIssues("Legal document", documentIdResult.issues);
      }
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const result = await approveLegalDocumentDraft(
        env.DB,
        documentIdResult.value,
        expectedDraftVersionId,
        expectedRevision,
        {
          actorUserId: owner.userId,
          idempotencyKey,
          requestId,
        },
      );
      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
