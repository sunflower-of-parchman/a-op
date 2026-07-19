import { env } from "cloudflare:workers";
import { readAdminLegalDocument } from "@/db/legal-read.ts";
import { saveLegalDocumentDraft } from "@/db/legal-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import {
  validateLegalDocumentId,
  validateLegalDraftInput,
} from "@/lib/legal/validation.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
  throwValidationIssues,
} from "../../mutation-input.ts";

export const dynamic = "force-dynamic";

async function routeDocumentId(context: {
  readonly params: Promise<{ documentId: string }>;
}) {
  const result = validateLegalDocumentId((await context.params).documentId);
  if (!result.ok) throwValidationIssues("Legal document", result.issues);
  return result.value;
}

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ documentId: string }> },
): Promise<Response> {
  return runApiRoute("admin.legal_document_read_failed", async (requestId) => {
    const documentId = await routeDocumentId(context);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const document = await readAdminLegalDocument(
      env.DB,
      documentId,
      owner.userId,
    );
    return apiJson({ document }, requestId, document ? 200 : 404);
  });
}

export async function PUT(
  request: Request,
  context: { readonly params: Promise<{ documentId: string }> },
): Promise<Response> {
  return runApiRoute("admin.legal_document_save_failed", async (requestId) => {
    const requestInput = await readJsonMutation(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = requireMutationObject(
      requestInput,
      ["expectedRevision", "document"],
      "Legal draft request",
    );
    const expectedRevision = requireExpectedVersion(input.expectedRevision, {
      allowZero: false,
    });
    const validated = validateLegalDraftInput(input.document);
    if (!validated.ok) {
      throwValidationIssues("Legal draft", validated.issues);
    }
    const documentId = await routeDocumentId(context);
    if (validated.value.documentId !== documentId) {
      throwValidationIssues("Legal draft", [
        {
          code: "legal-document-id-mismatch",
          field: "document.documentId",
          message: "Document ID must match the requested route.",
        },
      ]);
    }
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const result = await saveLegalDocumentDraft(
      env.DB,
      validated.value,
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
      result.replayed ? 200 : 201,
    );
  });
}
